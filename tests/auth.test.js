// Вхід на сайт: middleware.js і server/session.js. Запуск: npm test
// Тести використовують вигадані пароль і секрет; справжні значення сюди не потрапляють.

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import middleware from "../middleware.js";
import { createSession, sameOrigin, verifySession } from "../server/session.js";

const SITE = "https://hermes.example";
const PASSWORD = "test-password";

function setEnv() {
  process.env.SITE_PASSWORD = PASSWORD;
  process.env.SESSION_SECRET = "s".repeat(40);
}

const loginForm = (password, next = "/", headers = { origin: SITE }) =>
  new Request(`${SITE}/login`, { method: "POST", body: new URLSearchParams({ password, next }), headers });

async function sessionCookie() {
  const response = await middleware(loginForm(PASSWORD));
  return response.headers.get("set-cookie").split(";")[0];
}

describe("без налаштувань", () => {
  test("сайт нікого не пускає (fail closed)", async () => {
    process.env.SITE_PASSWORD = "";
    process.env.SESSION_SECRET = "";
    const login = await middleware(new Request(`${SITE}/login`));
    assert.match(await login.text(), /nie jest skonfigurowany/);
    const page = await middleware(new Request(`${SITE}/`));
    assert.equal(page.status, 303);
  });
});

describe("сторінка входу", () => {
  beforeEach(setEnv);

  test("без сесії сторінки ведуть на /login, API повертає 401", async () => {
    const page = await middleware(new Request(`${SITE}/assets/index.js`));
    assert.equal(page.status, 303);
    assert.equal(page.headers.get("location"), "/login?next=%2Fassets%2Findex.js");
    const api = await middleware(new Request(`${SITE}/api/sheet`));
    assert.equal(api.status, 401);
  });

  test("польська за замовчуванням, перемикання на українську запам'ятовується", async () => {
    const pl = await middleware(new Request(`${SITE}/login`));
    assert.match(await pl.text(), /lang="pl"[\s\S]*Zaloguj/);
    const uk = await middleware(new Request(`${SITE}/login?lang=uk`));
    assert.match(await uk.text(), /lang="uk"/);
    assert.match(uk.headers.get("set-cookie"), /hermes_lang=uk/);
  });

  test("іконка вкладки доступна без входу, решта — ні", async () => {
    assert.equal((await middleware(new Request(`${SITE}/favicon.svg`))).headers.get("x-middleware-next"), "1");
    assert.equal((await middleware(new Request(`${SITE}/favicon.svg.js`))).status, 303);
  });

  test("адреса повернення екранується", async () => {
    const response = await middleware(new Request(`${SITE}/login?next=${encodeURIComponent('/"><script>')}`));
    assert.doesNotMatch(await response.text(), /<script>/);
  });
});

describe("вхід і вихід", () => {
  beforeEach(setEnv);

  test("правильний пароль: cookie HttpOnly + Secure + SameSite і перехід на сторінку", async () => {
    const response = await middleware(loginForm(PASSWORD, "/scripts?a=1"));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/scripts?a=1");
    assert.match(response.headers.get("set-cookie"), /HttpOnly.*SameSite=Lax.*Secure/);
  });

  test("неправильний пароль: 401 і затримка", async () => {
    const started = Date.now();
    const response = await middleware(loginForm("wrong"));
    assert.equal(response.status, 401);
    assert.ok(Date.now() - started >= 700);
    assert.match(await response.text(), /Nieprawidłowe hasło/);
  });

  test("відкритий редирект заблоковано", async () => {
    const response = await middleware(loginForm(PASSWORD, "//evil.example"));
    assert.equal(response.headers.get("location"), "/");
  });

  test("вхід з чужого сайту заблоковано", async () => {
    const response = await middleware(loginForm(PASSWORD, "/", { origin: "https://evil.example" }));
    assert.equal(response.status, 403);
  });

  test("з сесією запит іде далі", async () => {
    const response = await middleware(new Request(`${SITE}/`, { headers: { cookie: await sessionCookie() } }));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });

  test("підроблена cookie не працює", async () => {
    const cookie = (await sessionCookie()).slice(0, -2) + "xx";
    const response = await middleware(new Request(`${SITE}/`, { headers: { cookie } }));
    assert.equal(response.status, 303);
  });

  test("зміна пароля розлогінює всіх", async () => {
    const cookie = await sessionCookie();
    process.env.SITE_PASSWORD = "new-password";
    const response = await middleware(new Request(`${SITE}/`, { headers: { cookie } }));
    assert.equal(response.status, 303);
  });

  test("вихід очищає cookie", async () => {
    const response = await middleware(new Request(`${SITE}/logout`, { method: "POST", headers: { origin: SITE } }));
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  });

  test("сесія закінчується через 12 годин", async () => {
    const token = await createSession(process.env, 0);
    assert.equal(await verifySession(process.env, token, 11 * 3600 * 1000), true);
    assert.equal(await verifySession(process.env, token, 13 * 3600 * 1000), false);
  });
});

describe("Vercel: внутрішня адреса http://, браузер на https://", () => {
  beforeEach(setEnv);
  const HOST = "hermes-test.vercel.app";
  const request = (origin) =>
    new Request(`http://${HOST}/login`, {
      method: "POST",
      body: new URLSearchParams({ password: PASSWORD, next: "/" }),
      headers: { origin, host: HOST, "x-forwarded-host": HOST, "x-forwarded-proto": "https" },
    });

  test("вхід працює", async () => {
    const response = await middleware(request(`https://${HOST}`));
    assert.equal(response.status, 303);
    assert.match(response.headers.get("set-cookie"), /hermes_session=v1\./);
  });

  test("чужий і схожий домени заблоковано", async () => {
    assert.equal((await middleware(request("https://evil.example"))).status, 403);
    assert.equal((await middleware(request(`https://${HOST}.evil.example`))).status, 403);
  });

  test("Origin: null (браузер з no-referrer) не приймається", () => {
    const req = new Request(`${SITE}/login`, { method: "POST", headers: { origin: "null" } });
    assert.equal(sameOrigin(req), false);
  });
});

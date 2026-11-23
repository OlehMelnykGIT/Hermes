// Vercel Routing Middleware: закриває паролем увесь сайт, включно з /api/*.
//
//   GET  /login   — сторінка входу (або назад на сайт, якщо вже увійшли)
//   POST /login   — перевірка пароля, cookie сесії
//   POST /logout  — вихід
//   /favicon.svg  — публічно
//   усе інше      — пропускаємо далі з дійсною сесією; інакше /login (сторінки) або 401 (API)
//
// Працює в Node.js-середовищі Vercel без збирання, тому імпорт JSON має «with { type: "json" }».

import { next as continueRequest } from "@vercel/functions/middleware";
import { NO_STORE } from "./server/http.js";
import { LOGIN_HEADERS, renderLoginPage } from "./server/loginPage.js";
import {
  authConfigured,
  createSession,
  isAuthenticated,
  langCookie,
  passwordMatches,
  sameOrigin,
  sessionCookie,
} from "./server/session.js";

export const config = { runtime: "nodejs", matcher: "/:path*" };

const FAILED_LOGIN_DELAY_MS = 800; // ускладнює перебір паролів

// Ліміт невдалих спроб входу з однієї IP-адреси: після MAX_FAILURES за вікно — 429 до кінця вікна.
// Лічильник у пам'яті функції: не ідеальний (кілька екземплярів, перезапуск), але разом
// із затримкою робить перебір пароля дуже повільним.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // ip → { count, resetAt }

function clientIp(request) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
}

function isLockedOut(ip, now = Date.now()) {
  const entry = failures.get(ip);
  if (entry && entry.resetAt <= now) failures.delete(ip);
  return (failures.get(ip)?.count ?? 0) >= MAX_FAILURES;
}

function recordFailure(ip, now = Date.now()) {
  if (failures.size > 5000) failures.clear(); // захист пам'яті від тисяч адрес
  const entry = failures.get(ip);
  if (entry && entry.resetAt > now) entry.count++;
  else failures.set(ip, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
}

// Для тестів.
export const resetLoginLimits = () => failures.clear();

// ===================== Допоміжне =====================

const validLang = (value) => (value === "pl" || value === "uk" ? value : null);

function cookieLang(request) {
  return /(?:^|;\s*)hermes_lang=(pl|uk)\b/.exec(request.headers.get("cookie") || "")?.[1] || "pl";
}

// Куди повернутися після входу: лише внутрішні шляхи (захист від відкритого редиректу).
function safeNextPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\") || value.startsWith("/login")) return "/";
  return value;
}

// Відносний Location: браузер лишається на своєму домені й https, хоч би яку
// внутрішню адресу (http://…) бачив сервер.
function redirect(path, headers = {}) {
  return new Response(null, { status: 303, headers: { Location: path, ...NO_STORE, ...headers } });
}

function loginResponse({ lang, nextPath, errorKey = null, status = 200, headers = {} }) {
  return new Response(renderLoginPage({ lang, nextPath, errorKey }), {
    status,
    headers: { ...LOGIN_HEADERS, ...headers },
  });
}

const forbidden = () => new Response("Forbidden", { status: 403, headers: NO_STORE });

// ===================== Обробники =====================

async function showLogin(request, env, url) {
  const nextPath = safeNextPath(url.searchParams.get("next"));
  if (await isAuthenticated(request, env)) return redirect(nextPath);
  const chosenLang = validLang(url.searchParams.get("lang"));
  return loginResponse({
    lang: chosenLang || cookieLang(request),
    nextPath,
    errorKey: authConfigured(env) ? null : "login.notConfigured",
    headers: chosenLang ? { "Set-Cookie": langCookie(request, chosenLang) } : {},
  });
}

async function submitLogin(request, env) {
  if (!sameOrigin(request)) return forbidden();
  const form = await request.formData().catch(() => null);
  const nextPath = safeNextPath(form?.get("next"));
  const lang = validLang(form?.get("lang")) || cookieLang(request);

  if (!authConfigured(env)) {
    return loginResponse({ lang, nextPath, errorKey: "login.notConfigured", status: 500 });
  }
  const ip = clientIp(request);
  if (isLockedOut(ip)) {
    return loginResponse({ lang, nextPath, errorKey: "login.tooMany", status: 429, headers: { "Retry-After": "900" } });
  }
  if (await passwordMatches(env, form?.get("password"))) {
    failures.delete(ip);
    return redirect(nextPath, { "Set-Cookie": sessionCookie(request, await createSession(env)) });
  }
  recordFailure(ip);
  await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
  return loginResponse({ lang, nextPath, errorKey: "login.error", status: 401 });
}

function logout(request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!sameOrigin(request)) return forbidden();
  return redirect("/login", { "Set-Cookie": sessionCookie(request, "", 0) });
}

async function handle(request) {
  const env = process.env;
  const url = new URL(request.url);

  if (url.pathname === "/login") {
    return request.method === "POST" ? submitLogin(request, env) : showLogin(request, env, url);
  }
  if (url.pathname === "/logout") return logout(request);
  // Іконка вкладки — публічна (потрібна й на сторінці входу, даних не містить).
  if (url.pathname === "/favicon.svg") return continueRequest();

  if (await isAuthenticated(request, env)) return continueRequest();

  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
}

// Будь-яка неочікувана помилка — загальна відповідь 500 без подробиць
// (подробиці лише в Vercel → Logs, щоб не показувати внутрішню будову стороннім).
export default async function middleware(request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("[hermes middleware]", error);
    return new Response("Hermes: internal error. Details are in Vercel → Logs.\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE },
    });
  }
}

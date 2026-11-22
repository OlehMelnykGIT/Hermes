// Vercel Routing Middleware: закриває паролем увесь сайт, включно з /api/*.
// Без дійсної сесії сторінки перенаправляються на /login, а API повертає 401.

import pl from "./src/i18n/pl.json";
import uk from "./src/i18n/uk.json";
import {
  authConfigured,
  createSession,
  isAuthenticated,
  langCookie,
  passwordMatches,
  sameOrigin,
  sessionCookie,
} from "./server/session.js";

export const config = { matcher: "/:path*" };

const dictionaries = { pl, uk };
const FAILED_LOGIN_DELAY_MS = 800;

const LOGIN_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

function pickLang(value) {
  return value === "uk" ? "uk" : value === "pl" ? "pl" : null;
}

function cookieLang(request) {
  const match = /(?:^|;\s*)hermes_lang=(pl|uk)\b/.exec(request.headers.get("cookie") || "");
  return match ? match[1] : "pl";
}

// Дозволяємо лише внутрішні шляхи, щоб не було відкритого редиректу.
function safeNext(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\") || value.startsWith("/login")) return "/";
  return value;
}

function redirect(url, location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: { Location: new URL(location, url).toString(), "Cache-Control": "no-store", ...headers },
  });
}

function loginPage({ lang, next, error, status = 200, headers = {} }) {
  const t = (key) => dictionaries[lang][key] ?? pl[key] ?? "";
  const langLink = (code, label) =>
    code === lang
      ? `<span aria-current="true">${label}</span>`
      : `<a href="/login?lang=${code}&amp;next=${encodeURIComponent(next)}" hreflang="${code}">${label}</a>`;
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(t("login.pageTitle"))}</title>
<style>
:root{--bg:#f5f6f2;--card:#fff;--text:#202b29;--muted:#64706a;--line:#dce1d8;--accent:#317659;--error:#b3261e;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#141a18;--card:#1c2421;--text:#e6ebe7;--muted:#9aa69f;--line:#2e3a35;--accent:#5fb38c;--error:#f2b8b5}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(380px,100%);background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.brand{font-weight:750;font-size:21px;color:var(--accent)}.brand span{color:var(--text)}
.lang{display:flex;gap:4px;font-size:13px;font-weight:600}
.lang a,.lang span{padding:6px 9px;border-radius:8px;color:var(--muted);text-decoration:none}
.lang span{background:var(--bg);color:var(--text)}
h1{font-size:24px;margin:0 0 8px}p{color:var(--muted);margin:0 0 20px;line-height:1.45}
label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}
input{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{width:100%;margin-top:16px;font:inherit;font-weight:650;padding:12px;border:0;border-radius:10px;background:var(--accent);color:#fff;cursor:pointer}
.error{color:var(--error);font-weight:600;margin:12px 0 0}
.hint{font-size:13px;margin:20px 0 0}
</style>
</head>
<body>
<main>
<div class="top"><div class="brand">H<span>ermes</span></div><nav class="lang" aria-label="Język / Мова">${langLink("pl", "PL")}${langLink("uk", "UA")}</nav></div>
<h1>${escapeHtml(t("login.heading"))}</h1>
<p>${escapeHtml(t("login.lead"))}</p>
<form method="post" action="/login">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<input type="hidden" name="lang" value="${lang}">
<label for="password">${escapeHtml(t("login.password"))}</label>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
${error ? `<p class="error" role="alert">${escapeHtml(t(error))}</p>` : ""}
<button type="submit">${escapeHtml(t("login.submit"))}</button>
</form>
<p class="hint">${escapeHtml(t("login.hint"))}</p>
</main>
</body>
</html>`;
  return new Response(html, { status, headers: { ...LOGIN_HEADERS, ...headers } });
}

async function handleLogin(request, env) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next"));
  const lang = pickLang(form?.get("lang")) || cookieLang(request);

  if (!authConfigured(env)) {
    return loginPage({ lang, next, error: "login.notConfigured", status: 500 });
  }
  if (await passwordMatches(env, form?.get("password"))) {
    return redirect(request.url, next, {
      "Set-Cookie": sessionCookie(request, await createSession(env)),
    });
  }
  // Невелика затримка ускладнює перебір паролів.
  await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
  return loginPage({ lang, next, error: "login.error", status: 401 });
}

export default async function middleware(request) {
  const env = process.env;
  const url = new URL(request.url);

  if (url.pathname === "/login") {
    if (request.method === "POST") return handleLogin(request, env);
    const next = safeNext(url.searchParams.get("next"));
    if (await isAuthenticated(request, env)) return redirect(url, next);
    const chosen = pickLang(url.searchParams.get("lang"));
    return loginPage({
      lang: chosen || cookieLang(request),
      next,
      error: authConfigured(env) ? null : "login.notConfigured",
      headers: chosen ? { "Set-Cookie": langCookie(request, chosen) } : {},
    });
  }

  if (url.pathname === "/logout") {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
    return redirect(url, "/login", { "Set-Cookie": sessionCookie(request, "", 0) });
  }

  if (await isAuthenticated(request, env)) return; // пропускаємо далі

  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return redirect(url, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
}

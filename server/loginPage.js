// Сторінка входу. Рендериться в middleware (до входу статичні файли сайту недоступні),
// тому стилі вбудовані, а скриптів немає зовсім.

import pl from "../src/i18n/pl.json" with { type: "json" };
import uk from "../src/i18n/uk.json" with { type: "json" };
import { html, raw } from "../src/lib/html.js";

const dictionaries = { pl, uk };

export const LOGIN_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  // same-origin, а не no-referrer: інакше Chrome шле у формі «Origin: null» і вхід блокується.
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
};

const STYLES = raw(`
:root{--neon-from:#12b8b0;--neon-to:#2e9a63;--neon-glow:rgb(20 190 160/45%);--bg:#f4f5f1;--card:#fff;--text:#1f2a27;--muted:#667269;--line:#dde2da;--accent:#2f7457;--on-accent:#fff;--error:#a3332a;--error-bg:#fbe4e2;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--neon-from:#2fe0c8;--neon-to:#5bb389;--neon-glow:rgb(60 225 185/55%);--bg:#111715;--card:#19211e;--text:#e5ebe7;--muted:#98a59e;--line:#2b3732;--accent:#5bb389;--on-accent:#0d1a14;--error:#f2aaa4;--error-bg:#3c1c1a}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{width:min(380px,100%);background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px;box-shadow:0 10px 40px rgb(0 0 0 / 8%)}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.brand{display:inline-flex;align-items:stretch;padding:2px;border-radius:11px;background:linear-gradient(135deg,var(--neon-from),var(--neon-to));box-shadow:0 0 14px var(--neon-glow)}
.brand-name{display:grid;place-items:center;height:30px;padding:0 12px;border-radius:9px;background:var(--card);color:var(--text);font-weight:750;font-size:17px}
.mark{display:grid;place-items:center;padding:0 9px;color:#fff;font-size:13px;font-weight:800;letter-spacing:1px;text-shadow:0 0 6px rgb(255 255 255/55%)}
.lang{display:flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:999px;font-size:12px;font-weight:650}
.lang a,.lang span{padding:5px 10px;border-radius:999px;color:var(--muted);text-decoration:none}
.lang span{background:var(--accent);color:var(--on-accent)}
h1{font-size:24px;margin:0 0 8px}
p{color:var(--muted);margin:0 0 22px;line-height:1.5}
label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}
input{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{width:100%;margin-top:16px;font:inherit;font-weight:650;padding:12px;border:0;border-radius:10px;background:var(--accent);color:var(--on-accent);cursor:pointer}
.error{margin:12px 0 0;padding:10px 12px;border-radius:8px;background:var(--error-bg);color:var(--error);font-weight:600}
.hint{font-size:13px;margin:22px 0 0}
`);

// lang: "pl" | "uk"; nextPath: куди повернутися після входу; errorKey: ключ перекладу або null.
export function renderLoginPage({ lang, nextPath, errorKey }) {
  const t = (key) => dictionaries[lang][key] ?? pl[key] ?? "";
  const langLink = (code, label) =>
    code === lang
      ? html`<span aria-current="true">${label}</span>`
      : html`<a href="/login?lang=${code}&amp;next=${encodeURIComponent(nextPath)}" hreflang="${code}">${label}</a>`;

  return html`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>${t("login.pageTitle")}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <div class="top">
    <div class="brand"><span class="mark">INB</span><span class="brand-name">Hermes</span></div>
    <nav class="lang" aria-label="Język / Мова">${langLink("pl", "PL")}${langLink("uk", "UA")}</nav>
  </div>
  <h1>${t("login.heading")}</h1>
  <p>${t("login.lead")}</p>
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${nextPath}">
    <input type="hidden" name="lang" value="${lang}">
    <label for="password">${t("login.password")}</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    ${errorKey && html`<p class="error" role="alert">${t(errorKey)}</p>`}
    <button type="submit">${t("login.submit")}</button>
  </form>
  <p class="hint">${t("login.hint")}</p>
</main>
</body>
</html>`.toString();
}

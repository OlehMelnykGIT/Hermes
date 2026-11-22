import "./style.css";
import { LANGUAGES, escapeHtml, getLang, setLang, t } from "./i18n/index.js";
import { files, mountScripts } from "./scripts/view.js";
import { configReady } from "./config.js";
import { mountTeam } from "./team/view.js";
import { mountTrucks } from "./trucks/view.js";

// Маршрути: #/trucks, #/team, #/scripts, #/scripts/<файл>. Старі посилання #<файл> теж працюють.
function parseRoute() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith("/team")) return { page: "team" };
  if (hash.startsWith("/scripts")) return { page: "scripts", file: hash.split("/")[2] || null };
  if (files.some((file) => file.name === hash)) return { page: "scripts", file: hash };
  return { page: "trucks" };
}

let config = null; // відповідь /api/config
let unmount = () => {};

function renderShell() {
  const route = parseRoute();
  document.documentElement.lang = getLang();
  document.title = t("app.title");
  const navLink = (page, key) =>
    `<a href="#/${page}"${route.page === page ? ' aria-current="page"' : ""}>${escapeHtml(t(key))}</a>`;
  const langButton = ({ code, label }) =>
    `<button type="button" data-lang="${code}" aria-pressed="${code === getLang()}">${label}</button>`;

  document.querySelector("#app").innerHTML = `
    <header>
      <a class="brand" href="#/trucks">H<span>Hermes</span></a>
      <nav class="main-nav" aria-label="${escapeHtml(t("nav.label"))}">${navLink("trucks", "nav.trucks")}${navLink("team", "nav.team")}${navLink("scripts", "nav.scripts")}</nav>
      <div class="header-actions">
        <div class="lang-switch" role="group" aria-label="${escapeHtml(t("header.language"))}">${LANGUAGES.map(langButton).join("")}</div>
        <a id="sheet-link" class="header-button" target="_blank" rel="noopener noreferrer" hidden>${escapeHtml(t("header.sheet"))} ↗</a>
        <form id="logout" method="post" action="/logout" hidden><button class="header-button" type="submit">${escapeHtml(t("header.logout"))}</button></form>
      </div>
    </header>
    <main id="view"></main>
    <footer>Hermes<span>Excel VBA · Google Sheets</span></footer>`;

  document.querySelectorAll("[data-lang]").forEach((button) =>
    button.addEventListener("click", () => {
      setLang(button.dataset.lang);
      renderShell();
    }),
  );
  unmount();
  const view = document.querySelector("#view");
  const mounts = { scripts: () => mountScripts(view, route.file), team: () => mountTeam(view), trucks: () => mountTrucks(view) };
  unmount = mounts[route.page]();
  applyConfig();
}

// Посилання і кнопка виходу з'являються, коли сервер віддав налаштування (лише після входу).
function applyConfig() {
  if (!config) return;
  document.querySelector("#logout").hidden = false;
  const link = document.querySelector("#sheet-link");
  if (config.sheetUrl) {
    link.href = config.sheetUrl;
    link.hidden = false;
  }
}

let lastPage = null;
window.addEventListener("hashchange", () => {
  const route = parseRoute();
  // Перемикання файлів у межах макросів не перезавантажує сторінку фур.
  if (route.page !== lastPage || route.page === "scripts") renderShell();
  lastPage = route.page;
});

lastPage = parseRoute().page;
renderShell();
configReady.then((value) => {
  config = value;
  applyConfig();
});

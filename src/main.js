// Точка входу: шапка сайту, перемикач мови і маршрути між сторінками.
//
// Маршрути (hash): #/trucks (за замовчуванням), #/team, #/scripts, #/scripts/<файл>.
// Старі посилання виду #StolPaletB3.txt теж працюють.
// Код кожної сторінки завантажується лише тоді, коли її відкривають.

import "./styles/index.css";
import { LANGUAGES, getLang, setLang, t } from "./i18n/index.js";
import { configReady } from "./lib/config.js";
import { html } from "./lib/html.js";
import { icon, skeleton } from "./lib/ui.js";
import { files } from "./pages/scripts/files.js";

// load() повертає функцію mount(view, route) → unmount.
const PAGES = [
  {
    id: "trucks",
    labelKey: "nav.trucks",
    load: () => import("./pages/trucks/view.js").then((m) => (view) => m.mountTrucks(view)),
  },
  {
    id: "team",
    labelKey: "nav.team",
    load: () => import("./pages/team/view.js").then((m) => (view) => m.mountTeam(view)),
  },
  {
    id: "scripts",
    labelKey: "nav.scripts",
    load: () => import("./pages/scripts/view.js").then((m) => (view, route) => m.mountScripts(view, route.file)),
  },
];

function parseRoute() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (files.some((file) => file.name === hash)) return { page: "scripts", file: hash };
  const [, page, file = null] = hash.split("/");
  return PAGES.some((p) => p.id === page) ? { page, file } : { page: "trucks", file: null };
}

// ===================== Шапка =====================

let config = null; // /api/config: посилання на таблицю; null — поки не завантажено або без входу

// Назва Google Таблиці — це дані (власна назва), тому не перекладається.
const SHEET_NAME = { lead: "Replenishment", tail: "SLA" };

function sheetLink(url) {
  return html`<a class="sheet-link" href="${url}" target="_blank" rel="noopener noreferrer"
      title="${t("header.sheetTitle")}" aria-label="${t("header.sheetTitle")}">
    <span class="sheet-icon" aria-hidden="true">${icon("sheet")}</span>
    <span class="sheet-text">
      <strong><span class="sheet-lead">${SHEET_NAME.lead} </span>${SHEET_NAME.tail}</strong>
      <small>Google Sheets</small>
    </span>
    ${icon("external", "icon sheet-ext")}
  </a>`;
}

function header(route) {
  return html`<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#/trucks" aria-label="INB Hermes"><span class="brand-mark">INB</span><span class="brand-name">Hermes</span></a>
      <nav class="main-nav" aria-label="${t("nav.label")}">
        ${PAGES.map(
          (page) => html`<a href="#/${page.id}" ${route.page === page.id ? html`aria-current="page"` : ""}>
            ${icon(page.id)}<span>${t(page.labelKey)}</span>
          </a>`,
        )}
      </nav>
      <div class="header-actions">
        <div class="lang-switch" role="group" aria-label="${t("header.language")}">
          ${LANGUAGES.map(
            ({ code, label }) => html`<button type="button" data-lang="${code}" aria-pressed="${code === getLang()}">${label}</button>`,
          )}
        </div>
        ${config?.sheetUrl && sheetLink(config.sheetUrl)}
        ${config && html`<form method="post" action="/logout"><button class="button" type="submit">${t("header.logout")}</button></form>`}
      </div>
    </div>
  </header>`;
}

// ===================== Рендер і маршрути =====================

const app = document.querySelector("#app");
let unmount = () => {};
let currentPage = null;
let renderId = 0; // щоб повільне завантаження старої сторінки не перекрило нову

async function renderApp() {
  const id = ++renderId;
  const route = parseRoute();
  const page = PAGES.find((p) => p.id === route.page);
  document.documentElement.lang = getLang();
  document.title = `${t(page.labelKey)} · Hermes`;
  currentPage = route.page;

  unmount();
  unmount = () => {};
  app.innerHTML = html`${header(route)}<main id="view" class="container">${skeleton(4)}</main>`;

  const mount = await page.load();
  if (id !== renderId) return;
  unmount = mount(app.querySelector("#view"), route) || (() => {});
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-lang]");
  if (!button) return;
  setLang(button.dataset.lang);
  renderApp();
});

window.addEventListener("hashchange", () => {
  const route = parseRoute();
  // Перемикання файлів макросів перемальовує сторінку; інші сторінки — лише при зміні.
  if (route.page !== currentPage || route.page === "scripts") {
    renderApp();
    window.scrollTo({ top: 0 });
  }
});

renderApp();
configReady.then((value) => {
  config = value;
  // Показати «Arkusz» і «Wyloguj» — оновлюємо лише шапку, сторінка не перезавантажується.
  if (config) app.querySelector(".site-header").outerHTML = header(parseRoute()).toString();
});

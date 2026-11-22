// Блок «Linki» на сторінці макросів: список з аркуша Linki і редагування (лише після входу,
// запис іде через /api/links; токен для запису є лише на сервері).

import { api, errorMessage } from "../api.js";
import { configReady } from "../config.js";
import { escapeHtml, t } from "../i18n/index.js";

const MAX_LINKS = 50;
let cachedLinks = null; // щоб перемикання між макросами не завантажувало список знову

// Публічні посилання (без робочих даних), тому можуть жити в коді.
const FONTS = [
  { name: "Libre Barcode 39 Text", url: "https://fonts.google.com/specimen/Libre+Barcode+39+Text", hintKey: "scripts.link.fontTextHint" },
  { name: "Libre Barcode 39", url: "https://fonts.google.com/specimen/Libre+Barcode+39", hintKey: "scripts.link.fontPlainHint" },
];

const isHttps = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

function linkCard({ type, name, url, hint }) {
  return `<a class="link-card" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
    <span class="type">${escapeHtml(type)}</span>
    <strong>${escapeHtml(name)} ↗</strong>
    ${hint ? `<span class="muted">${escapeHtml(hint)}</span>` : ""}
  </a>`;
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "LINK";
  }
}

export function mountLinks(container) {
  let links = cachedLinks; // null = API ще не віддає аркуш Linki
  let config = null;
  let editing = false;
  let alive = true;
  const controller = new AbortController();

  container.innerHTML = `
    <div class="links-head">
      <h2 id="links-title" class="section-title">${escapeHtml(t("scripts.links"))}</h2>
      <button id="links-edit" class="header-button" type="button" hidden>${escapeHtml(t("links.edit"))}</button>
    </div>
    <p id="links-message" class="message" role="status" aria-live="polite"></p>
    <div id="links-body"></div>
    <div class="link-list link-list--fonts">${FONTS.map((font) =>
      linkCard({ type: `${t("scripts.link.fontType")} · CODE 39`, name: font.name, url: font.url, hint: t(font.hintKey) }),
    ).join("")}</div>
    <p class="muted small">${escapeHtml(t("scripts.link.fontInstall"))}</p>`;

  const $ = (selector) => container.querySelector(selector);
  const message = (text, isError = false) => {
    $("#links-message").textContent = text;
    $("#links-message").classList.toggle("message--error", isError);
  };

  function renderList() {
    $("#links-edit").hidden = !(config?.canEditLinks && links !== null) || editing;
    if (links === null) {
      // Запасний варіант, поки аркуш Linki не підключено: посилання з EXCEL_URL.
      $("#links-body").innerHTML = config?.excelUrl
        ? `<div class="link-list">${linkCard({ type: "EXCEL · SHAREPOINT", name: t("scripts.link.excel"), url: config.excelUrl, hint: t("scripts.link.excelHint") })}</div>`
        : "";
      return;
    }
    $("#links-body").innerHTML = links.length
      ? `<p class="muted small">${escapeHtml(t("links.fromSheet"))}</p>
         <div class="link-list">${links.map((link) => linkCard({ type: hostLabel(link.url), name: link.name, url: link.url })).join("")}</div>`
      : `<p class="muted">${escapeHtml(t("links.empty"))}</p>`;
  }

  function editorRow(link = { name: "", url: "" }) {
    return `<div class="link-row">
      <input type="text" name="name" maxlength="100" required placeholder="${escapeHtml(t("links.name"))}" aria-label="${escapeHtml(t("links.name"))}" value="${escapeHtml(link.name)}">
      <input type="url" name="url" maxlength="2000" required placeholder="${escapeHtml(t("links.url"))}" aria-label="${escapeHtml(t("links.url"))}" value="${escapeHtml(link.url)}">
      <button type="button" data-remove>${escapeHtml(t("links.remove"))}</button>
    </div>`;
  }

  function renderEditor() {
    editing = true;
    $("#links-edit").hidden = true;
    message("");
    $("#links-body").innerHTML = `
      <form id="links-form" class="links-editor" novalidate>
        <p class="muted small">${escapeHtml(t("links.editHint"))}</p>
        <div id="links-rows">${(links.length ? links : [undefined]).map(editorRow).join("")}</div>
        <div class="actions">
          <button id="links-add" type="button">${escapeHtml(t("links.add"))}</button>
          <span class="spacer"></span>
          <button id="links-cancel" type="button">${escapeHtml(t("links.cancel"))}</button>
          <button id="links-save" class="button" type="submit">${escapeHtml(t("links.save"))}</button>
        </div>
      </form>`;

    const rows = $("#links-rows");
    rows.addEventListener("click", (event) => {
      if (event.target.matches("[data-remove]")) event.target.closest(".link-row").remove();
    });
    $("#links-add").addEventListener("click", () => {
      if (rows.children.length >= MAX_LINKS) return message(t("error.too_many_links"), true);
      rows.insertAdjacentHTML("beforeend", editorRow());
      rows.lastElementChild.querySelector("input").focus();
    });
    $("#links-cancel").addEventListener("click", () => {
      editing = false;
      message("");
      renderList();
    });
    $("#links-form").addEventListener("submit", save);
  }

  async function save(event) {
    event.preventDefault();
    const next = [...$("#links-rows").children].map((row) => ({
      name: row.querySelector('[name="name"]').value.trim(),
      url: row.querySelector('[name="url"]').value.trim(),
    }));
    const filled = next.filter((link) => link.name || link.url);
    if (filled.some((link) => !link.name || !isHttps(link.url))) return message(t("error.invalid_links"), true);
    if (filled.length > MAX_LINKS) return message(t("error.too_many_links"), true);

    const saveButton = $("#links-save");
    saveButton.disabled = true;
    message(t("links.saving"));
    try {
      const result = await api("/api/links", { method: "POST", body: { links: filled }, signal: controller.signal });
      links = cachedLinks = result.links;
      editing = false;
      renderList();
      message(t("links.saved", { n: result.count }));
    } catch (error) {
      if (error.name !== "AbortError" && error.code !== "unauthorized") message(errorMessage(error), true);
      if (alive) saveButton.disabled = false;
    }
  }

  $("#links-edit").addEventListener("click", renderEditor);

  (async () => {
    config = await configReady;
    if (!alive) return;
    renderList();
    if (!config?.liveData) return;
    try {
      const result = await api("/api/links", { signal: controller.signal });
      if (!alive || editing) return;
      links = cachedLinks = result.links;
      renderList();
    } catch (error) {
      if (error.name !== "AbortError" && error.code !== "unauthorized") message(errorMessage(error), true);
    }
  })();

  return () => {
    alive = false;
    controller.abort();
  };
}

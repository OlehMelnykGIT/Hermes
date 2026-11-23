// Розділ «Linki» (вкладка «Notatki i makra»): посилання лише з аркуша Linki і їх редагування.
// Запис іде через /api/links (токен для запису є тільки на сервері).

import { t } from "../../i18n/index.js";
import { api, errorMessage, isSilentError } from "../../lib/api.js";
import { configReady } from "../../lib/config.js";
import { html } from "../../lib/html.js";
import { refresh, subscribe } from "../../lib/sheet.js";
import { emptyState, errorBox, icon, liveBadge, pageHead, skeleton } from "../../lib/ui.js";
import { workspaceTabs } from "../workspaceTabs.js";

const MAX_LINKS = 50;

const isHttps = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// ===================== Розмітка =====================

function linkCard(link) {
  const host = hostOf(link.url);
  return html`<a class="link-card" href="${link.url}" target="_blank" rel="noopener noreferrer">
    <span class="avatar avatar--square" aria-hidden="true">${host.charAt(0).toUpperCase() || "?"}</span>
    <span class="link-text"><strong>${link.name}</strong><span class="muted">${host}</span></span>
    ${icon("external")}
  </a>`;
}

function editorRow(link = { name: "", url: "" }) {
  return html`<div class="link-row">
    <input type="text" name="name" maxlength="100" placeholder="${t("links.name")}" aria-label="${t("links.name")}" value="${link.name}">
    <input type="url" name="url" maxlength="2000" placeholder="${t("links.url")}" aria-label="${t("links.url")}" value="${link.url}">
    <button type="button" class="button" data-remove>${t("links.remove")}</button>
  </div>`;
}

function editor(links) {
  return html`<form class="panel links-editor" data-editor novalidate>
    <p class="muted small">${t("links.editHint")}</p>
    <div data-rows>${(links.length ? links : [undefined]).map((link) => editorRow(link))}</div>
    <div class="actions">
      <button type="button" class="button" data-add>${t("links.add")}</button>
      <span class="spacer"></span>
      <button type="button" class="button" data-cancel>${t("links.cancel")}</button>
      <button type="submit" class="button button--primary" data-save>${t("links.save")}</button>
    </div>
  </form>`;
}

// ===================== Блок =====================

export function mountLinks(container) {
  let sheet = { data: null, error: null, loading: false };
  let config = null;
  let editing = false;
  let notice = null; // { text, isError }
  let alive = true;

  const links = () => (Array.isArray(sheet.data?.links) ? sheet.data.links : null);

  function body() {
    if (editing) return editor(links() || []);
    if (!sheet.data) return sheet.error ? emptyState(t("links.unavailable"), "link") : skeleton(2);
    const list = links();
    if (list === null) return emptyState(t("links.unavailable"), "link");
    if (list.length === 0) return emptyState(t("links.empty"), "link");
    return html`<div class="card-grid">${list.map(linkCard)}</div>`;
  }

  function render() {
    const canEdit = config?.canEditLinks && links() !== null && !editing;
    container.innerHTML = html`
      ${workspaceTabs("links")}
      ${pageHead({
        title: t("links.title"),
        lead: t("links.lead"),
        iconName: "link",
        actions: html`${liveBadge(sheet)}${
          canEdit && html`<button type="button" class="button button--primary" data-edit>${icon("edit")}${t("links.edit")}</button>`
        }`,
      })}
      ${notice && html`<p class="message ${notice.isError ? "message--error" : "message--ok"}" role="status">${notice.text}</p>`}
      ${!editing && errorBox(sheet.error)}
      ${body()}`;
  }

  // Поточні значення форми (порожні рядки пропускаються).
  function readForm() {
    return [...container.querySelectorAll(".link-row")]
      .map((row) => ({
        name: row.querySelector('[name="name"]').value.trim(),
        url: row.querySelector('[name="url"]').value.trim(),
      }))
      .filter((link) => link.name || link.url);
  }

  async function saveLinks() {
    const list = readForm();
    if (list.some((link) => !link.name || !isHttps(link.url))) {
      notice = { text: t("error.invalid_links"), isError: true };
      return showNotice();
    }
    if (list.length > MAX_LINKS) {
      notice = { text: t("error.too_many_links"), isError: true };
      return showNotice();
    }
    container.querySelector("[data-save]").disabled = true;
    notice = { text: t("links.saving") };
    showNotice();
    try {
      const result = await api("/api/links", { method: "POST", body: { links: list } });
      if (!alive) return;
      editing = false;
      notice = { text: t("links.saved", { n: result.count }) };
      render();
      refresh({ fresh: true }); // підтягнути збережений список з таблиці, оминаючи кеш
    } catch (error) {
      if (!alive || isSilentError(error)) return;
      notice = { text: errorMessage(error), isError: true };
      showNotice();
      container.querySelector("[data-save]").disabled = false;
    }
  }

  // Повідомлення в режимі редагування — без повного перемальовування, щоб не втратити введене.
  function showNotice() {
    container.querySelector(".message")?.remove();
    container.querySelector(".page-head").insertAdjacentHTML(
      "afterend",
      html`<p class="message ${notice.isError ? "message--error" : ""}" role="status">${notice.text}</p>`.toString(),
    );
  }

  function onClick(event) {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.matches("[data-edit]")) {
      editing = true;
      notice = null;
      render();
    } else if (target.matches("[data-cancel]")) {
      editing = false;
      notice = null;
      render();
    } else if (target.matches("[data-add]")) {
      const rows = container.querySelector("[data-rows]");
      if (rows.children.length >= MAX_LINKS) return;
      rows.insertAdjacentHTML("beforeend", editorRow().toString());
      rows.lastElementChild.querySelector("input").focus();
    } else if (target.matches("[data-remove]")) {
      target.closest(".link-row").remove();
    }
  }

  function onSubmit(event) {
    if (!event.target.matches("[data-editor]")) return;
    event.preventDefault();
    saveLinks();
  }

  container.addEventListener("click", onClick);
  container.addEventListener("submit", onSubmit);
  configReady.then((value) => {
    config = value;
    if (alive && !editing) render();
  });
  const unsubscribe = subscribe((state) => {
    sheet = state;
    if (!editing) render(); // не перемальовуємо форму під час редагування
  });

  return () => {
    alive = false;
    unsubscribe();
    container.removeEventListener("click", onClick);
    container.removeEventListener("submit", onSubmit);
  };
}

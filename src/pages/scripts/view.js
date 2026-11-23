// Розділ «Makra VBA»: файли макросів (перегляд, копіювання, завантаження).
// Код файлу завантажується лише при відкритті й запам'ятовується до перезавантаження сторінки.

import { t } from "../../i18n/index.js";
import { html } from "../../lib/html.js";
import { emptyState, icon, pageHead, skeleton } from "../../lib/ui.js";
import { workspaceTabs } from "../workspaceTabs.js";
import { files } from "./files.js";

const loaded = new Map(); // назва файлу → текст

const lineCount = (text) => text.trimEnd().split("\n").length;

function fileCard(file, selected) {
  return html`<a class="file-card" href="#/scripts/${encodeURIComponent(file.name)}" ${file === selected ? html`aria-current="true"` : ""}>
    <span class="avatar avatar--square" aria-hidden="true">${icon("scripts")}</span>
    <span class="link-text">
      <span class="eyebrow">EXCEL · VBA</span>
      <strong>${file.name}</strong>
      <span class="muted">${t(file.descKey)}</span>
    </span>
  </a>`;
}

// content === null — ще завантажується.
function viewer(file, content) {
  return html`<section class="panel viewer" aria-labelledby="viewer-title">
    <div class="viewer-head">
      <div>
        <h2 id="viewer-title">${file.name}</h2>
        <p class="muted small">${content !== null && t("scripts.lines", { n: lineCount(content) })}</p>
      </div>
      <div class="actions">
        <button type="button" class="button" data-copy ${content === null ? html`disabled` : ""}>${icon("copy")}${t("scripts.copy")}</button>
        <a class="button button--primary" href="${file.url}" download="${file.name}">${icon("download")}${t("scripts.download")}</a>
      </div>
    </div>
    ${content === null
      ? html`<div class="viewer-loading">${skeleton(3)}</div>`
      : html`<pre tabindex="0" aria-label="${t("scripts.codeLabel")}"><code>${content}</code></pre>`}
    <div class="viewer-foot muted small">
      <span>${t("scripts.viewerNote")}</span>
      <span data-copy-status role="status" aria-live="polite"></span>
    </div>
  </section>`;
}

// selectedName — назва файлу з адреси (#/scripts/<назва>) або null.
export function mountScripts(container, selectedName) {
  const selected = files.find((file) => file.name === selectedName) || null;
  let alive = true;

  container.innerHTML = html`
    ${workspaceTabs("scripts")}
    ${pageHead({ title: t("scripts.title"), lead: t("scripts.lead"), iconName: "scripts" })}
    <nav class="card-grid card-grid--wide" aria-label="${t("scripts.navLabel")}">${files.map((file) => fileCard(file, selected))}</nav>
    <div data-viewer>${selected ? viewer(selected, loaded.get(selected.name) ?? null) : emptyState(t("scripts.empty"), "scripts")}</div>
`;

  if (selected && !loaded.has(selected.name)) {
    selected
      .load()
      .then((text) => {
        loaded.set(selected.name, text);
        if (alive) container.querySelector("[data-viewer]").innerHTML = viewer(selected, text);
      })
      .catch(() => {
        if (alive) container.querySelector("[data-viewer]").innerHTML = emptyState(t("scripts.loadFailed"), "alert");
      });
  }

  async function onClick(event) {
    if (!event.target.closest("[data-copy]") || !selected || !loaded.has(selected.name)) return;
    const status = container.querySelector("[data-copy-status]");
    try {
      await navigator.clipboard.writeText(loaded.get(selected.name));
      status.textContent = t("scripts.copied");
    } catch {
      status.textContent = t("scripts.copyFailed");
    }
  }

  container.addEventListener("click", onClick);

  return () => {
    alive = false;
    container.removeEventListener("click", onClick);
  };
}

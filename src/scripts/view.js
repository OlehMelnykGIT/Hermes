import stol from "../../StolPaletB3.txt?raw";
import replen from "../../ReplenPrint.txt?raw";
import stolUrl from "../../StolPaletB3.txt?url";
import replenUrl from "../../ReplenPrint.txt?url";
import { escapeHtml, t } from "../i18n/index.js";
import { mountLinks } from "./links.js";

export const files = [
  { name: "StolPaletB3.txt", descKey: "scripts.desc.stol", content: stol, url: stolUrl },
  { name: "ReplenPrint.txt", descKey: "scripts.desc.replen", content: replen, url: replenUrl },
];

// selectedName: назва файлу з адреси (#/scripts/<назва>) або null
export function mountScripts(container, selectedName) {
  const selected = files.find((file) => file.name === selectedName) || null;

  container.innerHTML = `
    <section class="intro">
      <p class="eyebrow">${escapeHtml(t("scripts.eyebrow"))}</p>
      <h1>${escapeHtml(t("scripts.title1"))}<br><span>${escapeHtml(t("scripts.title2"))}</span></h1>
      <p>${escapeHtml(t("scripts.lead"))}</p>
    </section>
    <nav class="files" aria-label="${escapeHtml(t("scripts.navLabel"))}">${files
      .map(
        (file) => `<a class="file" href="#/scripts/${encodeURIComponent(file.name)}"${file === selected ? ' aria-current="true"' : ""}>
          <span class="icon" aria-hidden="true">&lt;/&gt;</span>
          <div><span class="type">EXCEL · VBA</span><h2>${escapeHtml(file.name)}</h2><p>${escapeHtml(t(file.descKey))}</p></div>
          <span class="arrow" aria-hidden="true">↗</span></a>`,
      )
      .join("")}</nav>
    <section id="viewer" aria-labelledby="filename" ${selected ? "" : "hidden"}>
      <div class="toolbar">
        <div><h2 id="filename"></h2><p id="info"></p></div>
        <div class="actions">
          <button id="copy" type="button">${escapeHtml(t("scripts.copy"))}</button>
          <a id="download">${escapeHtml(t("scripts.download"))}</a>
        </div>
      </div>
      <pre tabindex="0" aria-label="${escapeHtml(t("scripts.codeLabel"))}"><code id="code"></code></pre>
      <div class="viewer-footer"><span>${escapeHtml(t("scripts.viewerNote"))}</span><span id="status" role="status" aria-live="polite"></span></div>
    </section>
    <div id="empty" ${selected ? "hidden" : ""}>${escapeHtml(t("scripts.empty"))}</div>
    <section id="links" class="links" aria-labelledby="links-title"></section>`;

  const unmountLinks = mountLinks(container.querySelector("#links"));
  if (!selected) return unmountLinks;

  const $ = (selector) => container.querySelector(selector);
  $("#filename").textContent = selected.name;
  $("#info").textContent = t("scripts.lines", { n: selected.content.trimEnd().split("\n").length });
  $("#code").textContent = selected.content;
  $("#download").href = selected.url;
  $("#download").download = selected.name;

  let active = true;
  $("#copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(selected.content);
      if (active) $("#status").textContent = t("scripts.copied");
    } catch {
      if (active) $("#status").textContent = t("scripts.copyFailed");
    }
  });
  return () => {
    active = false;
    unmountLinks();
  };
}

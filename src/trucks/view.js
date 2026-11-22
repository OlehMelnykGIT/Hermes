import { api, errorMessage } from "../api.js";
import { escapeHtml, formatDateTime, t } from "../i18n/index.js";
import {
  EXTRA_STATUSES,
  STATUS_FLOW,
  isOverdue,
  normalizeTable,
  parseEuroCount,
  summarize,
} from "./model.js";

const REFRESH_MS = 60_000;
const SORT_KEY = "hermes.trucks.sort";

let cache = null; // останні дані, щоб після зміни мови не чекати на мережу

const FBO_COLUMNS = ["wab", "gate", "deadline", "priority", "status", "buffer", "finalStatus", "info"];
const NCG_COLUMNS = ["gate", "date", "status", "buffer", "finalStatus", "info"];

function readSort() {
  try {
    return localStorage.getItem(SORT_KEY) === "deadline" ? "deadline" : "sheet";
  } catch {
    return "sheet";
  }
}

function writeSort(value) {
  try {
    localStorage.setItem(SORT_KEY, value);
  } catch {
    /* localStorage недоступний */
  }
}

function statusCell(item) {
  const key = item.status || "none";
  const steps = STATUS_FLOW.filter((s) => item.done.has(s)).map((s) => t(`status.${s}`));
  const progress = STATUS_FLOW.map((s) => `<i class="${item.done.has(s) ? "on" : ""}"></i>`).join("");
  const unknown = item.unknownStatus.length
    ? `<span class="raw">${escapeHtml(item.unknownStatus.join(", "))}</span>`
    : "";
  return `<span class="status status--${key}">${escapeHtml(t(`status.${key}`))}</span>
    <span class="steps" title="${escapeHtml(t("trucks.progress", { steps: steps.join(" → ") || "—" }))}">${progress}</span>${unknown}`;
}

function cell(item, column, now) {
  switch (column) {
    case "wab":
      return `<strong>${escapeHtml(item.wab)}</strong>`;
    case "deadline":
    case "date":
      return `${escapeHtml(item.deadlineText)}${
        isOverdue(item, now) ? ` <span class="overdue-badge">${escapeHtml(t("trucks.overdueBadge"))}</span>` : ""
      }`;
    case "status":
      return statusCell(item);
    default:
      return escapeHtml(item[column]);
  }
}

function sortItems(items, sort) {
  if (sort !== "deadline") return items;
  return [...items].sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
}

function renderTable(items, columns, sort) {
  if (!items.length) return `<p class="muted">${escapeHtml(t("trucks.empty"))}</p>`;
  const now = new Date();
  const head = columns.map((c) => `<th scope="col">${escapeHtml(t(`col.${c}`))}</th>`).join("");
  const body = sortItems(items, sort)
    .map((item) => {
      const classes = [`row--${item.status || "none"}`, isOverdue(item, now) ? "overdue" : ""].join(" ");
      const tds = columns
        .map((c) => `<td data-label="${escapeHtml(t(`col.${c}`))}" class="col-${c}">${cell(item, c, now)}</td>`)
        .join("");
      return `<tr class="${classes}" data-color="${escapeHtml(item.color || "")}">${tds}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="trucks"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderSummary(fbo, euro) {
  const { total, byStatus, overdue } = summarize(fbo);
  const chip = (label, value, cls = "") =>
    `<div class="chip ${cls}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
  const statuses = [...STATUS_FLOW, ...EXTRA_STATUSES, "none"]
    .filter((s) => STATUS_FLOW.includes(s) || byStatus[s] > 0)
    .map((s) => chip(t(`status.${s}`), byStatus[s], `chip--status status--${s}`));
  return [
    chip(t("trucks.total"), total),
    euro !== null ? chip(t("trucks.euro"), euro) : "",
    chip(t("trucks.overdue"), overdue, overdue ? "chip--alert" : ""),
    ...statuses,
  ].join("");
}

// Колір дня з таблиці задаємо через CSSOM: CSP забороняє inline style в HTML.
function applyRowColors(root) {
  root.querySelectorAll("tr[data-color]").forEach((row) => {
    const color = row.dataset.color;
    if (/^#[0-9a-f]{6}$/i.test(color)) row.style.setProperty("--day", color);
  });
}

export function mountTrucks(container) {
  let sort = readSort();
  let timer = null;
  let controller = null;

  container.innerHTML = `
    <section class="page-head">
      <div>
        <h1>${escapeHtml(t("trucks.title"))}</h1>
        <p class="muted">${escapeHtml(t("trucks.lead"))}</p>
      </div>
      <div class="page-actions">
        <span id="trucks-updated" class="muted"></span>
        <label class="select">
          <span>${escapeHtml(t("trucks.sort"))}</span>
          <select id="trucks-sort">
            <option value="sheet">${escapeHtml(t("trucks.sort.sheet"))}</option>
            <option value="deadline">${escapeHtml(t("trucks.sort.deadline"))}</option>
          </select>
        </label>
        <button id="trucks-refresh" class="button" type="button">${escapeHtml(t("common.refresh"))}</button>
      </div>
    </section>
    <p id="trucks-message" class="message" role="status" aria-live="polite"></p>
    <section id="trucks-summary" class="summary" aria-label="${escapeHtml(t("trucks.title"))}"></section>
    <h2 class="section-title">${escapeHtml(t("trucks.fbo"))}</h2>
    <div id="trucks-fbo"></div>
    <div id="trucks-ncg-wrap" hidden>
      <h2 class="section-title">${escapeHtml(t("trucks.ncg"))}</h2>
      <div id="trucks-ncg"></div>
    </div>`;

  const $ = (selector) => container.querySelector(selector);
  const message = (text, isError = false) => {
    $("#trucks-message").textContent = text;
    $("#trucks-message").classList.toggle("message--error", isError);
  };

  function render() {
    if (!cache) return;
    const fbo = normalizeTable(cache.fbo, cache.fboColors);
    const ncg = cache.ncg ? normalizeTable(cache.ncg, cache.ncgColors) : [];
    $("#trucks-summary").innerHTML = renderSummary(fbo, parseEuroCount(cache.euro));
    $("#trucks-fbo").innerHTML = renderTable(fbo, FBO_COLUMNS, sort);
    $("#trucks-ncg-wrap").hidden = !cache.ncg;
    $("#trucks-ncg").innerHTML = renderTable(ncg, NCG_COLUMNS, sort);
    applyRowColors(container);
    const updated = cache.updated ? new Date(cache.updated) : null;
    $("#trucks-updated").textContent = updated ? t("common.updated", { time: formatDateTime(updated) }) : "";
  }

  async function load() {
    controller?.abort();
    controller = new AbortController();
    const button = $("#trucks-refresh");
    button.disabled = true;
    if (!cache) message(t("common.loading"));
    try {
      cache = await api("/api/sheet", { signal: controller.signal });
      message("");
      render();
    } catch (error) {
      if (error.name !== "AbortError" && error.code !== "unauthorized") message(errorMessage(error), true);
    } finally {
      button.disabled = false;
    }
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
  }

  const onVisible = () => {
    if (document.visibilityState === "visible") load();
  };

  $("#trucks-sort").value = sort;
  $("#trucks-sort").addEventListener("change", (event) => {
    sort = event.target.value;
    writeSort(sort);
    render();
  });
  $("#trucks-refresh").addEventListener("click", load);
  document.addEventListener("visibilitychange", onVisible);

  render();
  load();
  schedule();

  return () => {
    clearInterval(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onVisible);
  };
}

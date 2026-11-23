// Блок «NCG» на сторінці «Rozładunek»: підсумки доставок і таблиця (лише читання).

import { t } from "../../i18n/index.js";
import { html } from "../../lib/html.js";
import { emptyState, icon } from "../../lib/ui.js";
import { normalizeNcg, sortNcg, summarizeNcg } from "./ncg.js";

// Порядок колонок; показуємо лише ті, що є в заголовку аркуша.
// «place» — брама для Rozładunek, bufor для Przyjęcie (брами там немає).
const COLUMNS = ["type", "place", "date", "status", "pallets", "emptyPallets", "finalStatus", "info", "lu"];
const SOURCE = { place: ["gate", "buffer"], emptyPallets: ["emptyPallets"], lu: ["lu"] };

const hasColumn = (column, present) => (SOURCE[column] ?? [column]).some((field) => present.has(field));

function typeBadge(item) {
  if (!item.type) return item.typeText ? html`<span class="badge">${item.typeText}</span>` : "—";
  return html`<span class="badge ncg-type--${item.type}">${t(`ncg.type.${item.type}`)}</span>`;
}

// Статус: перекладена плашка за ключем; невідомий текст — як у таблиці.
function statusBadge({ key, text }) {
  if (key) return html`<span class="badge status--${key}" title="${text}">${t(`status.${key}`)}</span>`;
  return text ? html`<span class="raw">${text}</span>` : "";
}

function place(item) {
  if (item.type === "receipt") return item.buffer || "—";
  return html`<span class="ncg-place">${item.gate ? html`<strong>${item.gate}</strong>` : "—"}${
    item.buffer && html`<span class="ncg-sub">${item.buffer}</span>`
  }</span>`;
}

function cell(item, column) {
  switch (column) {
    case "type":
      return typeBadge(item);
    case "place":
      return place(item);
    case "date":
      return item.dateText;
    case "status":
      return statusBadge(item.status);
    case "finalStatus":
      return statusBadge(item.finalStatus);
    case "pallets":
      return html`<strong>${item.palletsText}</strong>`;
    case "emptyPallets":
      return item.emptyPalletsText || html`<span class="muted" title="${t("ncg.noExchange")}">—</span>`;
    case "lu":
      return item.passedToLu
        ? html`<span class="badge status--stowed">${icon("check")}LU</span>`
        : html`<span class="badge ncg-nolu">${icon("alert")}${t("ncg.notInLu")}</span>`;
    default:
      return item[column];
  }
}

function placeHeader(item) {
  return item?.type === "receipt" ? t("col.buffer") : t("col.gate");
}

function table(items, columns) {
  return html`<div class="table-wrap">
    <table class="data-table ncg-table">
      <thead><tr>${columns.map((c) => html`<th scope="col">${t(`ncg.col.${c}`)}</th>`)}</tr></thead>
      <tbody>
        ${items.map(
          (item) => html`<tr class="${item.passedToLu ? "" : "row--nolu"}">
            ${columns.map(
              (c) => html`<td class="col-${c}" data-label="${c === "place" ? placeHeader(item) : t(`ncg.col.${c}`)}">${cell(item, c)}</td>`,
            )}
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

function kpis(summary) {
  const { byType } = summary;
  const typeKpi = (type) => html`<article class="kpi">
    <span class="kpi-label"><span class="dot ncg-type--${type}" aria-hidden="true"></span>${t("ncg.kpi.pallets")} · ${t(`ncg.type.${type}`)}</span>
    <strong class="kpi-value">${byType[type].pallets}</strong>
    <span class="kpi-sub">${t("ncg.kpi.deliveries", { n: byType[type].deliveries })}</span>
  </article>`;

  return html`<section class="kpis kpis--compact">
    <article class="kpi">
      <span class="kpi-label">${icon("trucks")}${t("ncg.kpi.total")}</span>
      <strong class="kpi-value">${summary.deliveries}</strong>
      <span class="kpi-sub">
        ${t("ncg.type.unloading")}: ${byType.unloading.deliveries} · ${t("ncg.type.receipt")}: ${byType.receipt.deliveries}
      </span>
    </article>
    ${typeKpi("unloading")}
    ${typeKpi("receipt")}
    <article class="kpi">
      <span class="kpi-label">${t("ncg.kpi.empty")}</span>
      <strong class="kpi-value">${summary.emptyPallets}</strong>
      <span class="kpi-sub">${t("ncg.kpi.exchanges", { n: summary.exchanges })}</span>
    </article>
    <article class="kpi ${summary.notInLu > 0 ? "kpi--overdue" : ""}">
      <span class="kpi-label">${icon(summary.notInLu > 0 ? "alert" : "check")}${t("ncg.notInLu")}</span>
      <strong class="kpi-value">${summary.notInLu}</strong>
      <span class="kpi-sub">${summary.notInLu > 0 ? t("ncg.kpi.notInLuHint") : t("ncg.kpi.allInLu")}</span>
    </article>
  </section>`;
}

// rows — поле ncg з API (перший рядок — заголовки) або null, якщо Api.gs його не віддає.
export function ncgSection(rows, sort) {
  if (!rows) return "";
  const { items, columns: present } = normalizeNcg(rows);
  const columns = COLUMNS.filter((column) => hasColumn(column, present));
  return html`<div class="section-bar">
      <h2>${t("trucks.ncg")}</h2>
      <span class="muted small">${t("ncg.lead")}</span>
    </div>
    ${items.length === 0
      ? emptyState(t("ncg.empty"), "trucks")
      : html`${kpis(summarizeNcg(items))}${table(sortNcg(items, sort), columns)}`}`;
}

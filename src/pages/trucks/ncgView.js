// Блок «NCG» на сторінці «Rozładunek»: доставки, згруповані за датою з колонки Data,
// з підсумками кожної дати (лише читання).

import { t } from "../../i18n/index.js";
import { html } from "../../lib/html.js";
import { emptyState, icon } from "../../lib/ui.js";
import { groupNcgByDate, normalizeNcg, sortNcg } from "./ncg.js";

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

// «Pon 23.11» — короткий день тижня з перекладів (ncg.weekdays: від неділі).
function dateTitle(group) {
  if (!group.date) return t("ncg.noDate");
  const weekdays = t("ncg.weekdays").split(",");
  const d = group.date;
  return `${weekdays[d.getDay()] ?? ""} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Підсумки дати — плашки в заголовку секції.
function dateSummary({ byType, emptyPallets, notInLu }) {
  const typePill = (type) => html`<span class="pill" title="${t("ncg.kpi.pallets")} · ${t(`ncg.type.${type}`)}">
    <span class="dot ncg-type--${type}" aria-hidden="true"></span>${t(`ncg.type.${type}`)}: <strong>${t("ncg.day.pallets", { n: byType[type].pallets })}</strong>
  </span>`;
  return html`<span class="ncg-pills">
    ${typePill("unloading")}
    ${typePill("receipt")}
    <span class="pill">${t("ncg.kpi.empty")}: <strong>${emptyPallets}</strong></span>
    ${notInLu > 0
      ? html`<span class="pill pill--alert">${icon("alert")}${t("ncg.notInLu")}: <strong>${notInLu}</strong></span>`
      : html`<span class="pill pill--ok">${icon("check")}${t("ncg.day.allInLu")}</span>`}
  </span>`;
}

// openState — Map(ключ дати → true/false): що користувач сам розгорнув чи згорнув.
function dateSection(group, columns, sort, openState) {
  const id = group.key ?? "none";
  const open = openState.get(id) ?? group.current;
  return html`<details class="panel day ncg-day" data-ncg-day="${id}" ${open ? html`open` : ""}>
    <summary>
      <strong>${dateTitle(group)}</strong>
      <span class="muted">${t("ncg.day.deliveries", { n: group.items.length })}</span>
      ${dateSummary(group.summary)}
    </summary>
    <div class="day-body">${table(sortNcg(group.items, sort), columns)}</div>
  </details>`;
}

// rows — поле ncg з API (перший рядок — заголовки) або null, якщо Api.gs його не віддає.
export function ncgSection(rows, sort, openState = new Map()) {
  if (!rows) return "";
  const { items, columns: present } = normalizeNcg(rows);
  const columns = COLUMNS.filter((column) => hasColumn(column, present));
  return html`<div class="section-bar">
      <h2>${t("trucks.ncg")}</h2>
      <span class="muted small">${t("ncg.lead")}</span>
    </div>
    ${items.length === 0
      ? emptyState(t("ncg.empty"), "trucks")
      : html`<div class="days">${groupNcgByDate(items).map((g) => dateSection(g, columns, sort, openState))}</div>`}`;
}

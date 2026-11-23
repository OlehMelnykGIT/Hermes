// Сторінка «Zespół»: хто на зміні, у якому процесі, розподіл перерв і картки людей.
// Тільки читання — сайт нічого не змінює в аркуші Zespół.

import { t } from "../../i18n/index.js";
import { html } from "../../lib/html.js";
import { refresh, subscribe } from "../../lib/sheet.js";
import { load, save } from "../../lib/storage.js";
import {
  applyDynamicStyles,
  emptyState,
  errorBox,
  icon,
  liveBadge,
  pageHead,
  refreshButton,
  skeleton,
  updateTimeAgo,
} from "../../lib/ui.js";
import {
  BREAKS,
  PROCESSES,
  SHIFTS,
  breakPlan,
  filterPeople,
  groupByProcess,
  initials,
  normalizePeople,
} from "./model.js";

// ===================== Дрібні елементи =====================

const processLabel = (key) => t(`process.${key}`);

const udtBadge = () => html`<span class="badge badge--udt" title="${t("team.udtHint")}">${t("team.udt")}</span>`;

const nameChip = (person) => html`<span class="name-chip">${person.person}${person.udt && udtBadge()}</span>`;

// ===================== Блоки сторінки =====================

function filters(shift, udtOnly) {
  return html`<div class="toolbar">
    <div class="segmented" role="group" aria-label="${t("team.shift")}">
      <span class="segmented-label">${t("team.shift")}</span>
      ${["all", ...SHIFTS].map(
        (s) => html`<button type="button" data-shift="${s}" aria-pressed="${s === shift}">
          ${s === "all" ? t("team.shift.all") : s}
        </button>`,
      )}
    </div>
    <label class="toggle"><input type="checkbox" data-udt ${udtOnly ? html`checked` : ""}> ${t("team.udtOnly")}</label>
  </div>`;
}

function summary(people) {
  const groups = groupByProcess(people);
  const count = (key) => groups.find((g) => g.key === key)?.people.length ?? 0;
  const keys = [...PROCESSES, ...(count("other") > 0 ? ["other"] : [])];
  return html`<section class="kpis kpis--compact" aria-label="${t("team.summary")}">
    <article class="kpi"><span class="kpi-label">${t("team.total")}</span><strong class="kpi-value">${people.length}</strong></article>
    <article class="kpi"><span class="kpi-label">${t("team.udt")}</span><strong class="kpi-value">${people.filter((p) => p.udt).length}</strong></article>
    ${keys.map(
      (key) => html`<article class="kpi proc--${key}">
        <span class="kpi-label">${icon(key)}${processLabel(key)}</span>
        <strong class="kpi-value">${count(key)}</strong>
      </article>`,
    )}
  </section>`;
}

// Скільки людей лишається в процесі під час перерви; 0 — процес без людей, підсвічуємо.
const staysNote = (n) =>
  html`<div class="stays ${n === 0 ? "stays--zero" : ""}">${n === 0 && icon("alert")}${t("team.stays", { n })}</div>`;

function breaks(people) {
  const plan = breakPlan(people);
  if (plan.rows.length === 0) return "";
  const showNone = plan.totals.none > 0;
  const columns = [...BREAKS, ...(showNone ? ["none"] : [])];
  const balanced = plan.difference <= 1;

  const breakCell = (row, key) => html`<td data-label="${t(`team.break.${key}`)}">
    <div class="name-list">${row[key].length ? row[key].map(nameChip) : "—"}</div>
    ${key !== "none" && staysNote(row.total - row[key].length)}
  </td>`;

  return html`<div class="section-bar">
      <h2>${t("team.breaks")}</h2>
      <span class="balance balance--${balanced ? "ok" : "bad"}">
        ${icon(balanced ? "check" : "alert")}${balanced ? t("team.balanced") : t("team.unbalanced", { n: plan.difference })}
      </span>
    </div>
    <div class="table-wrap">
      <table class="data-table breaks">
        <thead><tr>
          <th scope="col">${t("team.process")}</th>
          ${columns.map((key) => html`<th scope="col">${t(`team.break.${key}`)}</th>`)}
        </tr></thead>
        <tbody>
          ${plan.rows.map(
            (row) => html`<tr class="proc--${row.key}">
              <th scope="row">${icon(row.key)} ${processLabel(row.key)} <span class="muted">(${row.total})</span></th>
              ${columns.map((key) => breakCell(row, key))}
            </tr>`,
          )}
        </tbody>
        <tfoot><tr>
          <th scope="row">${t("team.breakTotal")}</th>
          ${columns.map((key) => html`<td data-label="${t(`team.break.${key}`)}"><strong>${plan.totals[key]}</strong></td>`)}
        </tr></tfoot>
      </table>
    </div>`;
}

function personCard(person, groupKey) {
  const breakText = person.breakKey ? t(`team.break.${person.breakKey}`) : person.break;
  return html`<article class="person-card">
    <span class="avatar" aria-hidden="true">${initials(person.person)}</span>
    <div class="person-body">
      <div class="person-top"><strong>${person.person}</strong>${person.udt && udtBadge()}</div>
      <div class="person-tags">
        ${groupKey === "other" && person.process && html`<span class="tag">${person.process}</span>`}
        ${person.shiftKey && html`<span class="tag">${t("team.shiftBadge", { shift: person.shiftKey })}</span>`}
        ${breakText && html`<span class="tag">${breakText}</span>`}
      </div>
      ${person.notes && html`<p class="person-notes">${person.notes}</p>`}
    </div>
  </article>`;
}

function groups(people) {
  return groupByProcess(people).map(
    ({ key, people: list }) => html`<section class="proc-group proc--${key}">
      <h3 class="proc-title">${icon(key)} ${processLabel(key)} <span class="muted">(${list.length})</span></h3>
      <div class="card-grid">${list.map((person) => personCard(person, key))}</div>
    </section>`,
  );
}

// ===================== Сторінка =====================

export function mountTeam(container) {
  let sheet = { data: null, error: null, loading: false };
  let shift = load("team.shift", "all");
  if (shift !== "all" && !SHIFTS.includes(shift)) shift = "all";
  let udtOnly = load("team.udt", "0") === "1";
  let animate = true;

  function content() {
    if (!sheet.data) return sheet.error ? "" : skeleton(6);
    if (!Array.isArray(sheet.data.team)) return html`<p class="message">${t("team.noData")}</p>`;
    const people = filterPeople(normalizePeople(sheet.data.team), { shift, udtOnly });
    return html`<div class="${animate ? "appear" : ""}">
      ${summary(people)}
      ${people.length
        ? html`${breaks(people)}${groups(people)}`
        : emptyState(t("team.empty"), "team")}
    </div>`;
  }

  function render() {
    container.innerHTML = html`
      ${pageHead({
        title: t("team.title"),
        lead: t("team.lead"),
        iconName: "team",
        actions: html`${liveBadge(sheet)}${refreshButton("team-refresh", sheet.loading)}`,
      })}
      ${filters(shift, udtOnly)}
      ${errorBox(sheet.error)}
      ${content()}`;
    applyDynamicStyles(container);
    if (sheet.data) animate = false;
  }

  function onClick(event) {
    if (event.target.closest("#team-refresh")) return refresh({ fresh: true });
    const button = event.target.closest("[data-shift]");
    if (button) {
      shift = button.dataset.shift;
      save("team.shift", shift);
      render();
    }
  }

  function onChange(event) {
    if (!event.target.matches("[data-udt]")) return;
    udtOnly = event.target.checked;
    save("team.udt", udtOnly ? "1" : "0");
    render();
  }

  container.addEventListener("click", onClick);
  container.addEventListener("change", onChange);
  const tick = setInterval(() => updateTimeAgo(container), 30_000); // «… temu» без перемальовування
  const unsubscribe = subscribe((state) => {
    sheet = state;
    render();
  });

  return () => {
    unsubscribe();
    clearInterval(tick);
    container.removeEventListener("click", onClick);
    container.removeEventListener("change", onChange);
  };
}

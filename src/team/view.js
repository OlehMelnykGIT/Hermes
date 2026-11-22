import { api, errorMessage } from "../api.js";
import { escapeHtml, formatDateTime, t } from "../i18n/index.js";
import { BREAKS, PROCESSES, SHIFTS, breakPlan, filterPeople, groupByProcess, normalizePeople } from "./model.js";

const REFRESH_MS = 3 * 60_000;
const SHIFT_KEY = "hermes.team.shift";
const UDT_KEY = "hermes.team.udt";

let cache = null;

// Іконки вбудовані (CSP не дозволяє зовнішні ресурси).
const ICONS = {
  unloading: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  stowing: '<path d="M4 3v18M20 3v18M4 9h16M4 15h16"/><path d="M7 12h4v3H7zM13 6h4v3h-4z"/>',
  replenishment: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  leader: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>',
  other: '<circle cx="12" cy="12" r="3.5"/>',
};

const icon = (key) =>
  `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[key] || ICONS.other}</svg>`;

function read(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage недоступний */
  }
}

const udtBadge = () => `<span class="badge-udt" title="${escapeHtml(t("team.udtHint"))}">${escapeHtml(t("team.udt"))}</span>`;
const nameChip = (p) => `<span class="name-chip">${escapeHtml(p.person)}${p.udt ? " " + udtBadge() : ""}</span>`;

function renderSummary(people) {
  const chip = (label, value, cls = "", iconKey = "") =>
    `<div class="chip ${cls}">${iconKey ? icon(iconKey) : ""}<span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
  const counts = groupByProcess(people);
  return [
    chip(t("team.total"), people.length),
    chip(t("team.udt"), people.filter((p) => p.udt).length),
    ...PROCESSES.map((key) =>
      chip(t(`process.${key}`), counts.find((g) => g.key === key)?.people.length ?? 0, `chip--status proc--${key}`, key),
    ),
    ...(counts.some((g) => g.key === "other")
      ? [chip(t("process.other"), counts.find((g) => g.key === "other").people.length, "chip--status proc--other", "other")]
      : []),
  ].join("");
}

function renderBreaks(people) {
  const plan = breakPlan(people);
  if (!plan.rows.length) return "";
  const cell = (row, key) => {
    const list = row[key];
    const stays = row.total - list.length;
    return `<td data-label="${escapeHtml(t(`team.break.${key}`))}">
      <div class="name-list">${list.map(nameChip).join("") || "—"}</div>
      <div class="stays">${escapeHtml(t("team.stays", { n: stays }))}</div>
    </td>`;
  };
  const showNone = plan.totals.none > 0;
  const rows = plan.rows
    .map(
      (row) => `<tr class="proc--${row.key}">
        <th scope="row">${icon(row.key)} ${escapeHtml(t(`process.${row.key}`))} <span class="muted">(${row.total})</span></th>
        ${BREAKS.map((key) => cell(row, key)).join("")}
        ${showNone ? `<td data-label="${escapeHtml(t("team.break.none"))}"><div class="name-list">${row.none.map(nameChip).join("") || "—"}</div></td>` : ""}
      </tr>`,
    )
    .join("");
  const balance = plan.difference <= 1
    ? `<span class="balance balance--ok">${escapeHtml(t("team.balanced"))}</span>`
    : `<span class="balance balance--bad">${escapeHtml(t("team.unbalanced", { n: plan.difference }))}</span>`;
  return `<div class="table-wrap"><table class="breaks">
    <thead><tr><th scope="col">${escapeHtml(t("team.process"))}</th>${BREAKS.map((k) => `<th scope="col">${escapeHtml(t(`team.break.${k}`))}</th>`).join("")}${showNone ? `<th scope="col">${escapeHtml(t("team.break.none"))}</th>` : ""}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th scope="row">${escapeHtml(t("team.breakTotal"))}</th><td data-label="${escapeHtml(t("team.break.break1"))}"><strong>${plan.totals.break1}</strong></td><td data-label="${escapeHtml(t("team.break.break2"))}"><strong>${plan.totals.break2}</strong> ${balance}</td>${showNone ? `<td data-label="${escapeHtml(t("team.break.none"))}"><strong>${plan.totals.none}</strong></td>` : ""}</tr></tfoot>
  </table></div>`;
}

function renderGroups(people) {
  return groupByProcess(people)
    .map(
      ({ key, people: list }) => `<section class="proc-group proc--${key}">
        <h3 class="proc-title">${icon(key)} ${escapeHtml(t(`process.${key}`))} <span class="muted">(${list.length})</span></h3>
        <div class="person-grid">${list
          .map(
            (p) => `<article class="person-card">
              <div class="person-top"><strong>${escapeHtml(p.person)}</strong>${p.udt ? udtBadge() : ""}</div>
              <div class="person-tags">
                ${key === "other" && p.process ? `<span class="tag">${escapeHtml(p.process)}</span>` : ""}
                ${p.shiftKey ? `<span class="tag">${escapeHtml(t("team.shiftBadge", { shift: p.shiftKey }))}</span>` : ""}
                ${p.breakKey ? `<span class="tag">${escapeHtml(t(`team.break.${p.breakKey}`))}</span>` : p.break ? `<span class="tag">${escapeHtml(p.break)}</span>` : ""}
              </div>
              ${p.notes ? `<p class="person-notes">${escapeHtml(p.notes)}</p>` : ""}
            </article>`,
          )
          .join("")}</div>
      </section>`,
    )
    .join("");
}

export function mountTeam(container) {
  let shift = read(SHIFT_KEY, "all");
  if (shift !== "all" && !SHIFTS.includes(shift)) shift = "all";
  let udtOnly = read(UDT_KEY, "0") === "1";
  let timer = null;
  let controller = null;

  container.innerHTML = `
    <section class="page-head">
      <div>
        <h1>${escapeHtml(t("team.title"))}</h1>
        <p class="muted">${escapeHtml(t("team.lead"))}</p>
      </div>
      <div class="page-actions">
        <span id="team-updated" class="muted"></span>
        <button id="team-refresh" class="button" type="button">${escapeHtml(t("common.refresh"))}</button>
      </div>
    </section>
    <div class="filters">
      <div class="segmented" role="group" aria-label="${escapeHtml(t("team.shift"))}">
        <span class="segmented-label">${escapeHtml(t("team.shift"))}</span>
        ${["all", ...SHIFTS].map((s) => `<button type="button" data-shift="${s}">${escapeHtml(s === "all" ? t("team.shift.all") : s)}</button>`).join("")}
      </div>
      <label class="toggle"><input id="team-udt" type="checkbox"> ${escapeHtml(t("team.udtOnly"))}</label>
    </div>
    <p id="team-message" class="message" role="status" aria-live="polite"></p>
    <section id="team-summary" class="summary" aria-label="${escapeHtml(t("team.summary"))}"></section>
    <h2 class="section-title">${escapeHtml(t("team.breaks"))}</h2>
    <div id="team-breaks"></div>
    <div id="team-groups"></div>`;

  const $ = (selector) => container.querySelector(selector);
  const message = (text, isError = false) => {
    $("#team-message").textContent = text;
    $("#team-message").classList.toggle("message--error", isError);
  };

  function render() {
    container.querySelectorAll("[data-shift]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.shift === shift)));
    $("#team-udt").checked = udtOnly;
    if (!cache) return;
    const updated = cache.updated ? new Date(cache.updated) : null;
    $("#team-updated").textContent = updated ? t("common.updated", { time: formatDateTime(updated) }) : "";
    if (!Array.isArray(cache.team)) {
      message(t("team.noData"), true);
      return;
    }
    const people = filterPeople(normalizePeople(cache.team), { shift, udtOnly });
    $("#team-summary").innerHTML = renderSummary(people);
    $("#team-breaks").innerHTML = renderBreaks(people);
    $("#team-groups").innerHTML = people.length ? renderGroups(people) : `<p class="muted">${escapeHtml(t("team.empty"))}</p>`;
  }

  async function load() {
    controller?.abort();
    controller = new AbortController();
    const button = $("#team-refresh");
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

  const onVisible = () => {
    if (document.visibilityState === "visible") load();
  };

  container.querySelectorAll("[data-shift]").forEach((button) =>
    button.addEventListener("click", () => {
      shift = button.dataset.shift;
      write(SHIFT_KEY, shift);
      render();
    }),
  );
  $("#team-udt").addEventListener("change", (event) => {
    udtOnly = event.target.checked;
    write(UDT_KEY, udtOnly ? "1" : "0");
    render();
  });
  $("#team-refresh").addEventListener("click", load);
  document.addEventListener("visibilitychange", onVisible);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") load();
  }, REFRESH_MS);

  render();
  load();

  return () => {
    clearInterval(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onVisible);
  };
}

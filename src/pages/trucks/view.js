// Сторінка «Rozładunek»: показники дня, фільтр статусів, таблиця FBO і блок NCG (ncgView.js).

import { formatDuration, formatTime, t } from "../../i18n/index.js";
import { barChart } from "../../lib/barChart.js";
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
  EXTRA_STATUSES,
  FLAGS,
  SOON_MINUTES,
  STATUS_FLOW,
  WORK_STEPS,
  deadlineInfo,
  matchesFilter,
  nextDeadline,
  nextStep,
  normalizeTable,
  parseEuroCount,
  sortItems,
  summarize,
} from "./model.js";
import {
  currentDayStats,
  formatSheetDateTime,
  formatShortDay,
  formatShortDayTime,
  groupByDays,
  recentStats,
  statsForDay,
  visibleClosedDays,
} from "./days.js";
import { ncgSection } from "./ncgView.js";

// Раз на 30 с оновлюємо лише відліки часу й «… temu» (без перемальовування сторінки);
// дані таблиці й решта показників оновлюються щохвилини разом із запитом.
const TICK_MS = 30_000;
const ALL_STATUSES = [...STATUS_FLOW, ...EXTRA_STATUSES, "none"];
const FBO_COLUMNS = ["wab", "gate", "deadline", "priority", "status", "buffer", "finalStatus", "info"];

// ===================== Дрібні елементи =====================

const statusKey = (item) => item.status || "none";
const statusLabel = (key) => t(`status.${key}`);

// ===================== Відлік до дедлайну =====================

const minutesLeft = (deadlineMs, now) => Math.round((deadlineMs - now) / 60000);
const dueKind = (minutes) => (minutes < 0 ? "overdue" : minutes <= SOON_MINUTES ? "soon" : "ok");
const dueText = (minutes) =>
  minutes < 0 ? t("time.over", { d: formatDuration(minutes) }) : t("time.in", { d: formatDuration(minutes) });

// data-deadline — момент дедлайну (мс), щоб updateCountdowns() міг оновити текст на місці.
function dueLabel(info, deadline) {
  if (!info) return null;
  if (info.kind === "done") return html`<span class="due due--done">${icon("check")}</span>`;
  return html`<span class="due due--${info.kind}" data-deadline="${deadline.getTime()}">${dueText(info.minutes)}</span>`;
}

// Оновити відліки й позначки рядків без перемальовування сторінки.
function updateCountdowns(root, now = Date.now()) {
  root.querySelectorAll("[data-deadline]").forEach((el) => {
    const minutes = minutesLeft(Number(el.dataset.deadline), now);
    const kind = dueKind(minutes);
    el.className = `due due--${kind}`;
    el.textContent = dueText(minutes);
    const row = el.closest("tr");
    if (row) {
      row.classList.remove("row--overdue", "row--soon", "row--ok");
      row.classList.add(`row--${kind}`);
    }
  });
  root.querySelectorAll("[data-countdown]").forEach((el) => {
    el.textContent = dueText(minutesLeft(Number(el.dataset.countdown), now));
  });
}

// Смужка з 4 етапів роботи: суцільні — наші, світлі — виконані попередньою зміною.
function stepsBar(item) {
  const list = (filter) => WORK_STEPS.filter(filter).map(statusLabel).join(" → ");
  const ours = list((s) => item.done.has(s) && !item.inherited.has(s));
  const previous = list((s) => item.inherited.has(s));
  const title = [ours && t("trucks.progress", { steps: ours }), previous && t("trucks.progressInherited", { steps: previous })]
    .filter(Boolean)
    .join("\n");
  return html`<span class="steps" title="${title || t("trucks.progress", { steps: "—" })}">
    ${WORK_STEPS.map((s) => html`<i class="${item.inherited.has(s) ? "prev" : item.done.has(s) ? "on" : ""}"></i>`)}
  </span>`;
}

// WAB від попередньої зміни: позначка і наступний крок, за яким треба стежити.
// Якщо вписано лише «Pozostawione…» без кроків, плашка статусу вже це каже, а наступний
// крок невідомий (не знаємо, що встигла попередня зміна) — тоді нічого не додаємо.
function inheritedNote(item) {
  if (!item.fromOtherShift || item.status === "left_shift") return null;
  const next = nextStep(item);
  return html`<span class="handover">${icon("handover")}${t("trucks.inherited")}${
    next && ` · ${t("trucks.nextStep", { step: statusLabel(next) })}`
  }</span>`;
}

function statusCell(item) {
  return html`<span class="badge status--${statusKey(item)}">${statusLabel(statusKey(item))}</span>
    ${stepsBar(item)}
    ${inheritedNote(item)}
    ${item.unknownStatus.length > 0 && html`<span class="raw">${item.unknownStatus.join(", ")}</span>`}`;
}

function cell(item, column, now) {
  switch (column) {
    case "wab":
      return html`<strong>${item.wab}</strong>`;
    case "deadline":
      return html`<span class="date">${item.deadlineText}</span>${dueLabel(deadlineInfo(item, now), item.deadline)}`;
    case "status":
      return statusCell(item);
    case "finalStatus":
      return item.closed
        ? html`<span class="badge status--closed">${icon("check")}${statusLabel("closed")}</span>`
        : item.finalStatus;
    default:
      return item[column];
  }
}

// ===================== Блоки сторінки =====================

// Смуга з частками статусів (ширина задається після рендеру через data-width).
function statusBar(summary) {
  return html`<div class="stack" aria-hidden="true">
    ${ALL_STATUSES.filter((s) => summary.byStatus[s] > 0).map(
      (s) => html`<span class="status--${s}" data-width="${(summary.byStatus[s] / summary.total) * 100}"></span>`,
    )}
  </div>`;
}

function kpis(items, euro, now) {
  const summary = summarize(items, now);
  const percent = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const next = nextDeadline(items, now);
  const nextInfo = next && deadlineInfo(next, now);

  return html`<section class="kpis">
    <article class="kpi kpi--wide">
      <span class="kpi-label">${t("trucks.kpi.progress")}</span>
      <strong class="kpi-value">${percent}%</strong>
      <span class="kpi-sub">${t("trucks.kpi.progressValue", { done: summary.done, total: summary.total })}</span>
      ${summary.total > 0 && statusBar(summary)}
    </article>
    <article class="kpi ${nextInfo ? `kpi--${nextInfo.kind}` : ""}">
      <span class="kpi-label">${icon("clock")}${t("trucks.kpi.next")}</span>
      ${next
        ? html`<strong class="kpi-value">${next.wab}</strong>
            <span class="kpi-sub">
              ${formatTime(next.deadline)} · <span data-countdown="${next.deadline.getTime()}">${dueText(nextInfo.minutes)}</span>
            </span>`
        : html`<span class="kpi-sub">${t("trucks.kpi.nextNone")}</span>`}
    </article>
    <article class="kpi ${summary.overdue > 0 ? "kpi--overdue" : ""}">
      <span class="kpi-label">${summary.overdue > 0 && icon("alert")}${t("trucks.kpi.overdue")}</span>
      <strong class="kpi-value">${summary.overdue}</strong>
    </article>
    <article class="kpi">
      <span class="kpi-label">${t("trucks.kpi.toAccept")}</span>
      <strong class="kpi-value">${summary.toAccept}</strong>
      <span class="kpi-sub">
        ${t("trucks.kpi.inProgress", { n: summary.open })}${euro !== null && ` · ${t("trucks.kpi.euro")}: ${euro}`}
      </span>
    </article>
  </section>`;
}

// Картки «Wydrukowane palety» і «Przypisane LU»: значення за поточний день + графік останніх днів.
const CHART_DAYS = 14;

function statsCards(stats, days) {
  const today = currentDayStats(stats, days);
  if (!today) return ""; // Api.gs ще не віддає stats
  const points = recentStats(stats, CHART_DAYS);

  const card = (key, iconName, title) => html`<article class="kpi kpi--chart">
    <span class="kpi-label">${icon(iconName)}${title}</span>
    <strong class="kpi-value">${today[key]}</strong>
    <span class="kpi-sub">${t(`trucks.stats.${key}Unit`)}</span>
    <span class="kpi-sub">
      ${today.dayId ? t("trucks.stats.since", { date: formatShortDayTime(today.dayId) }) : t("trucks.stats.noneToday")}
    </span>
    ${points.length > 1 &&
    barChart(
      points.map((point) => ({
        label: formatShortDayTime(point.dayId),
        value: point[key],
        current: point.dayId === today.dayId, // виділяємо саме поточний день (за id), а не останній стовпчик
      })),
      {
        title,
        firstLabel: formatShortDay(points[0].dayId),
        lastLabel: formatShortDay(points[points.length - 1].dayId),
      },
    )}
  </article>`;

  return html`<section class="kpis kpis--stats">
    ${card("druk", "print", t("trucks.stats.druk"))}
    ${card("lu", "pin", t("trucks.stats.lu"))}
  </section>`;
}

// Закриті дні: згорнуті блоки з підсумком; розгорнуті запам'ятовуються (openDays).
function closedDays(groups, stats, openDays, now) {
  const shown = visibleClosedDays(groups, stats);
  const blocks = shown.map(({ day, items }) => {
    const summary = summarize(items, now);
    const dayStats = statsForDay(stats, day);
    return html`<details class="panel day" data-day="${day.nr}" ${openDays.has(String(day.nr)) ? html`open` : ""}>
      <summary>
        <strong>${t("trucks.day.title", { nr: day.nr })}</strong>
        ${day.closedAt && html`<span class="muted">${t("trucks.day.closedAt", { time: formatSheetDateTime(day.closedAt) })}</span>`}
        <span class="day-summary ${summary.overdue > 0 ? "day-summary--alert" : ""}">
          ${t("trucks.day.summary", { total: summary.total, done: summary.done, overdue: summary.overdue })}
          ${dayStats && ` · ${t("trucks.day.stats", { druk: dayStats.druk, lu: dayStats.lu })}`}
        </span>
      </summary>
      <div class="day-body">${table(items, FBO_COLUMNS, now)}</div>
    </details>`;
  });
  if (groups.outside.length > 0) {
    blocks.push(html`<details class="panel day" data-day="outside" ${openDays.has("outside") ? html`open` : ""}>
      <summary><strong>${t("trucks.day.outside")}</strong><span class="muted">WAB: ${groups.outside.length}</span></summary>
      <div class="day-body">${table(groups.outside, FBO_COLUMNS, now)}</div>
    </details>`);
  }
  if (blocks.length === 0) return "";
  // «Zakończone dni» — лише якщо закриті дні справді є; інакше тут тільки рядки поза днями.
  const title = shown.length > 0 ? t("trucks.day.closedTitle") : t("trucks.day.outsideTitle");
  return html`<div class="section-bar"><h2>${title}</h2></div><div class="days">${blocks}</div>`;
}

// Пояснення статусів і правила 24 годин (розгортається кліком).
const LEGEND_ORDER = ["yard", "unloaded", "advice", "masterdata", "stowed", "closed", "no_advice", "left_shift", "suspended"];

function legend(open) {
  return html`<details class="panel legend" data-legend ${open ? html`open` : ""}>
    <summary>${icon("info")}${t("trucks.legend.title")}</summary>
    <div class="legend-body">
      <p class="legend-rule">${icon("clock")}<span>${t("trucks.legend.deadline")}</span></p>
      <p class="muted small legend-note">${t("trucks.legend.counts")}</p>
      <dl>
        ${LEGEND_ORDER.map(
          (key) => html`<div>
            <dt><span class="badge status--${key}">${statusLabel(key)}</span></dt>
            <dd>${t(`status.desc.${key}`)}</dd>
          </div>`,
        )}
      </dl>
    </div>
  </details>`;
}

// Чипи: етапи показують, скільки WAB їх пройшли (воронка), позначки — скільки WAB їх мають.
function statusFilter(items, active) {
  const { total, counts } = summarize(items);
  const chip = (key, label, count) => html`<button type="button" class="chip ${key !== "all" ? `status--${key}` : ""}"
      data-filter="${key}" aria-pressed="${key === active}">${label}<strong>${count}</strong></button>`;
  return html`<div class="chips" role="group" aria-label="${t("trucks.filter.label")}">
    ${chip("all", t("trucks.filter.all"), total)}
    ${STATUS_FLOW.map((key) => chip(key, statusLabel(key), counts[key]))}
    ${FLAGS.filter((key) => counts[key] > 0).map((key) => chip(key, statusLabel(key), counts[key]))}
  </div>`;
}

function table(items, columns, now, emptyText = t("trucks.empty")) {
  if (items.length === 0) return emptyState(emptyText, "trucks");
  return html`<div class="table-wrap">
    <table class="data-table">
      <thead><tr>${columns.map((c) => html`<th scope="col">${t(`col.${c}`)}</th>`)}</tr></thead>
      <tbody>
        ${items.map((item) => {
          const due = deadlineInfo(item, now)?.kind || "";
          return html`<tr class="row--${statusKey(item)} ${due ? `row--${due}` : ""}" data-color="${item.color || ""}">
            ${columns.map((c) => html`<td class="col-${c}" data-label="${t(`col.${c}`)}">${cell(item, c, now)}</td>`)}
          </tr>`;
        })}
      </tbody>
    </table>
  </div>`;
}

// ===================== Сторінка =====================

export function mountTrucks(container) {
  let sheet = { data: null, error: null, loading: false };
  let sort = load("trucks.sort", "sheet") === "deadline" ? "deadline" : "sheet";
  let filter = "all";
  let legendOpen = load("trucks.legend", "0") === "1";
  const openDays = new Set(); // розгорнуті закриті дні (у межах відкритої сторінки)
  const ncgOpen = new Map(); // дата NCG → розгорнута чи ні (якщо користувач змінив)
  let animate = true; // плавна поява лише при першому показі даних

  function content() {
    if (!sheet.data) return sheet.error ? "" : skeleton(6);
    const now = new Date();
    const fbo = normalizeTable(sheet.data.fbo, sheet.data.fboColors);

    // Межі днів — лише з поля days. Без нього (старий Api.gs) показуємо всі WAB, як раніше.
    const groups = groupByDays(fbo, sheet.data.days);
    const today = groups ? groups.current?.items ?? [] : fbo;
    const todayTitle = groups?.current ? t("trucks.day.current", { nr: groups.current.day.nr }) : t("trucks.fbo");
    const visible = today.filter((item) => matchesFilter(item, filter));
    const emptyText = groups && today.length === 0 ? t("trucks.day.empty") : t("trucks.empty");

    return html`<div class="${animate ? "appear" : ""}">
      ${kpis(today, parseEuroCount(sheet.data.euro), now)}
      ${statsCards(sheet.data.stats, sheet.data.days)}
      ${statusFilter(today, filter)}
      ${legend(legendOpen)}
      <div class="section-bar">
        <h2>${todayTitle}</h2>
        <label class="select">
          <span>${t("trucks.sort")}</span>
          <select data-sort>
            <option value="sheet" ${sort === "sheet" ? html`selected` : ""}>${t("trucks.sort.sheet")}</option>
            <option value="deadline" ${sort === "deadline" ? html`selected` : ""}>${t("trucks.sort.deadline")}</option>
          </select>
        </label>
      </div>
      ${table(sortItems(visible, sort), FBO_COLUMNS, now, emptyText)}
      ${groups && closedDays(groups, sheet.data.stats, openDays, now)}
      ${ncgSection(sheet.data.ncg, sort, ncgOpen)}
    </div>`;
  }

  function render() {
    container.innerHTML = html`
      ${pageHead({
        title: t("trucks.title"),
        lead: t("trucks.lead"),
        iconName: "trucks",
        actions: html`${liveBadge(sheet)}${refreshButton("trucks-refresh", sheet.loading)}`,
      })}
      ${errorBox(sheet.error)}
      ${content()}`;
    applyDynamicStyles(container);
    if (sheet.data) animate = false;
  }

  // Один обробник на всю сторінку — не треба перепідписуватися після кожного рендеру.
  function onClick(event) {
    if (event.target.closest("#trucks-refresh")) return refresh({ fresh: true });
    const chip = event.target.closest("[data-filter]");
    if (chip) {
      filter = chip.dataset.filter === filter ? "all" : chip.dataset.filter;
      render();
    }
  }

  function onChange(event) {
    if (!event.target.matches("[data-sort]")) return;
    sort = event.target.value;
    save("trucks.sort", sort);
    render();
  }

  // Пам'ятаємо, чи розгорнуто пояснення, щоб автооновлення його не згортало.
  // Подія toggle не спливає, тому слухаємо у фазі перехоплення.
  function onToggle(event) {
    const details = event.target;
    if (details.matches("[data-legend]")) {
      legendOpen = details.open;
      save("trucks.legend", legendOpen ? "1" : "0");
    } else if (details.matches("[data-day]")) {
      if (details.open) openDays.add(details.dataset.day);
      else openDays.delete(details.dataset.day);
    } else if (details.matches("[data-ncg-day]")) {
      ncgOpen.set(details.dataset.ncgDay, details.open);
    }
  }

  container.addEventListener("click", onClick);
  container.addEventListener("change", onChange);
  container.addEventListener("toggle", onToggle, true);
  const tick = setInterval(() => {
    updateCountdowns(container);
    updateTimeAgo(container);
  }, TICK_MS);
  const unsubscribe = subscribe((state) => {
    sheet = state;
    render();
  });

  return () => {
    unsubscribe();
    clearInterval(tick);
    container.removeEventListener("click", onClick);
    container.removeEventListener("change", onChange);
    container.removeEventListener("toggle", onToggle, true);
  };
}

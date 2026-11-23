// Дані аркуша Rozładunek → об'єкти для сторінки «Fury / Bramy».
// Чисті функції без DOM, тож їх перевіряють тести (tests/pages.test.js).
//
// Дані (WAB, брама, Info…) показуються як у таблиці. Статуси отримують незмінні ключі,
// щоб зміна мови не впливала на логіку.

// ===================== Статуси =====================

// Plac — не етап роботи, а очікування на парковці: водій чекає, поки його покличуть
// на розвантаження або звільниться брама.
// Етапи роботи з WAB: Rozładowane → Advice → Master Data → Stol.
export const WORK_STEPS = ["unloaded", "advice", "masterdata", "stowed"];
// Усі статуси процесу в природному порядку (для чипів і пояснень).
export const STATUS_FLOW = ["yard", ...WORK_STEPS];

// Особливі значення клітинки статусу:
//   no_advice  — «NO ADVICE»: немає даних для прийняття; переважає над кроками;
//   suspended  — «Zawieszone»: роботу призупинено; переважає над кроками;
//   left_shift — «Pozostawione inną zmianę»: WAB прийнято від попередньої зміни.
//                Це позначка, а не стан: кроки ДО першого вписаного зробила попередня зміна,
//                вписані кроки — ми. Окремим статусом показується лише без жодного кроку.
export const EXTRA_STATUSES = ["no_advice", "left_shift", "suspended"];

const SHEET_STATUS = {
  plac: "yard",
  "rozładowane": "unloaded",
  rozladowane: "unloaded",
  advice: "advice",
  "master data": "masterdata",
  masterdata: "masterdata",
  stol: "stowed",
  "pozostawione inną zmianę": "left_shift",
  "pozostawione inna zmiane": "left_shift",
  zawieszone: "suspended",
  "no advice": "no_advice",
  "no-advice": "no_advice",
};

const clean = (value) => String(value ?? "").trim();
const normalize = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

// Клітинка статусу може містити кілька значень: «Plac, Rozładowane, Advice».
// done — усе, що вписано в клітинку; unknown — значення, яких сайт не знає (показуються як є).
export function parseStatus(text) {
  const done = new Set();
  const unknown = [];
  for (const part of clean(text).split(/[,;]/)) {
    if (!clean(part)) continue;
    const key = SHEET_STATUS[normalize(part)];
    if (key) done.add(key);
    else unknown.push(clean(part));
  }
  return { done, unknown };
}

// Кроки, які виконала попередня зміна: усі кроки до першого вписаного.
// «Pozostawione inną zmianę, Master Data, Stol» → Plac, Rozładowane, Advice.
export function inheritedSteps(done) {
  if (!done.has("left_shift")) return new Set();
  const first = WORK_STEPS.findIndex((step) => done.has(step));
  return new Set(first > 0 ? WORK_STEPS.slice(0, first) : []);
}

// Поточний статус: NO ADVICE / Zawieszone, інакше найдальший етап роботи, інакше Plac
// (чекає на парковці), інакше «Pozostawione…» (від попередньої зміни, ми ще нічого не вписали).
export function currentStatus(done) {
  if (done.has("no_advice")) return "no_advice";
  if (done.has("suspended")) return "suspended";
  for (let i = WORK_STEPS.length - 1; i >= 0; i--) if (done.has(WORK_STEPS[i])) return WORK_STEPS[i];
  if (done.has("yard")) return "yard";
  return done.has("left_shift") ? "left_shift" : null;
}

// Наступний етап роботи (null — усе завершено).
export const nextStep = (item) => WORK_STEPS.find((step) => !item.done.has(step)) || null;

// ===================== Дата і дедлайн =====================

// «23.11.2026 04:30» → Date (місцевий час) або null
export function parseSheetDate(text) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(clean(text));
  if (!match) return null;
  const [, d, m, y, hh = "0", mm = "0"] = match;
  const date = new Date(+y, +m - 1, +d, +hh, +mm);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const SOON_MINUTES = 120; // «скоро дедлайн» — менше двох годин

// Термін (Last Data) = приїзд + 24 год на розвантаження і прийняття в систему.
// Прийнято = WAB закрито («WAB do odstawienia») або є Advice чи пізніший крок і немає NO ADVICE.
// Після прийняття термін виконано; далі Master Data і Stol на термін не впливають.
const ACCEPTED_STEPS = ["advice", "masterdata", "stowed"];

export function isAccepted(item) {
  if (item.closed) return true;
  return !item.done.has("no_advice") && ACCEPTED_STEPS.some((step) => item.done.has(step));
}

// Скільки лишилося до дедлайну: { minutes, kind: "overdue" | "soon" | "ok" | "done" } або null.
export function deadlineInfo(item, now = new Date()) {
  if (!item.deadline) return null;
  if (isAccepted(item)) return { minutes: 0, kind: "done" };
  const minutes = Math.round((item.deadline.getTime() - now.getTime()) / 60000);
  if (minutes < 0) return { minutes, kind: "overdue" };
  return { minutes, kind: minutes <= SOON_MINUTES ? "soon" : "ok" };
}

export const isOverdue = (item, now) => deadlineInfo(item, now)?.kind === "overdue";

// Найближчий дедлайн серед ще не прийнятих фур (прострочені не враховуються).
export function nextDeadline(items, now = new Date()) {
  return items
    .filter((item) => ["soon", "ok"].includes(deadlineInfo(item, now)?.kind))
    .sort((a, b) => a.deadline - b.deadline)[0] || null;
}

// ===================== Final Status =====================

// «WAB do odstawienia» — WAB розвантажено, прийнято й Advice перевірено в системі:
// він закритий, а браму можна звільнити під новий WAB. (У NCG — «Do odstawienia».)
const CLOSED_FINAL_STATUSES = ["wab do odstawienia", "do odstawienia"];
const CLOSED_IMPLIES = ["unloaded", "advice"];

export const isClosedFinalStatus = (text) => CLOSED_FINAL_STATUSES.includes(normalize(text));

// ===================== Таблиця =====================

// Колонки шукаються за заголовком, тож порядок у таблиці може змінюватися.
const COLUMNS = {
  wab: ["wab"],
  gate: ["brama"],
  deadline: ["last data", "data"],
  priority: ["priorytet"],
  status: ["status"],
  buffer: ["bufor"],
  finalStatus: ["final status"],
  info: ["info"],
};

function columnIndex(header) {
  const names = header.map(normalize);
  return Object.fromEntries(
    Object.entries(COLUMNS).map(([field, aliases]) => [field, names.findIndex((name) => aliases.includes(name))]),
  );
}

// Колір дня з таблиці: перший не білий фон у рядку.
function rowColor(rowColors) {
  if (!Array.isArray(rowColors)) return null;
  return rowColors.find((c) => /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== "#ffffff") || null;
}

// rows: перший рядок — заголовки; colors (необов'язково) — фон клітинок з getBackgrounds().
export function normalizeTable(rows, colors = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const index = columnIndex(rows[0]);
  const cell = (row, field) => (index[field] >= 0 ? clean(row[index[field]]) : "");

  return rows.slice(1).flatMap((row, i) => {
    if (!Array.isArray(row) || row.every((value) => !clean(value))) return [];
    const { done: written, unknown } = parseStatus(cell(row, "status"));
    const inherited = inheritedSteps(written);
    const closed = isClosedFinalStatus(cell(row, "finalStatus"));
    // Наші кроки + кроки попередньої зміни + те, що випливає із закритого WAB.
    const done = new Set([...written, ...inherited, ...(closed ? CLOSED_IMPLIES : [])]);
    const deadlineText = cell(row, "deadline");
    return [
      {
        row: i + 2, // номер рядка в аркуші (рядок 1 — заголовки) — для меж днів
        wab: cell(row, "wab"),
        gate: cell(row, "gate"),
        deadlineText,
        deadline: parseSheetDate(deadlineText),
        priority: cell(row, "priority"),
        done,
        inherited,
        fromOtherShift: written.has("left_shift"),
        unknownStatus: unknown,
        status: currentStatus(done),
        buffer: cell(row, "buffer"),
        finalStatus: cell(row, "finalStatus"),
        closed,
        info: cell(row, "info"),
        color: rowColor(colors[i + 1]),
      },
    ];
  });
}

// ===================== Зведення і фільтри =====================

// Найдальший пройдений етап роботи (індекс у WORK_STEPS) або -1.
export function reachedIndex(item) {
  for (let i = WORK_STEPS.length - 1; i >= 0; i--) if (item.done.has(WORK_STEPS[i])) return i;
  return -1;
}

// Позначки, що можуть стояти поруч з етапами; кожна — окремий чип-фільтр.
export const FLAGS = ["closed", "no_advice", "left_shift", "suspended", "none"];

function hasFlag(item, flag) {
  switch (flag) {
    case "closed":
      return item.closed;
    case "left_shift":
      return item.fromOtherShift;
    case "none":
      return item.status === null && !item.closed; // клітинка статусу порожня
    default:
      return item.done.has(flag);
  }
}

// Чип-фільтр:
//   Plac — WAB, які зараз чекають на парковці;
//   етап роботи (Rozładowane … Stol) — усі WAB, що його пройшли (воронка);
//   позначка — WAB з нею.
export function matchesFilter(item, filter) {
  if (filter === "all") return true;
  if (filter === "yard") return item.status === "yard";
  const step = WORK_STEPS.indexOf(filter);
  return step >= 0 ? reachedIndex(item) >= step : hasFlag(item, filter);
}

// total — усі WAB; done — на Stol; open — ще не на Stol;
// toAccept — ще не прийняті; overdue — прострочені;
// byStatus — розподіл за поточним статусом (смуга прогресу);
// counts — для чипів: скільки WAB пройшли кожен етап і скільки мають кожну позначку.
export function summarize(items, now = new Date()) {
  const byStatus = Object.fromEntries([...STATUS_FLOW, ...EXTRA_STATUSES, "none"].map((s) => [s, 0]));
  const counts = Object.fromEntries([...STATUS_FLOW, ...FLAGS].map((key) => [key, 0]));
  let overdue = 0;
  let accepted = 0;
  for (const item of items) {
    byStatus[item.status || "none"]++;
    for (const key of Object.keys(counts)) if (matchesFilter(item, key)) counts[key]++;
    if (isOverdue(item, now)) overdue++;
    if (isAccepted(item)) accepted++;
  }
  const total = items.length;
  const done = counts.stowed;
  return { total, done, open: total - done, toAccept: total - accepted, overdue, byStatus, counts };
}

export function sortItems(items, sort) {
  if (sort !== "deadline") return items;
  return [...items].sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
}

// «EURO\n13» або «13» → 13
export function parseEuroCount(text) {
  const match = /(\d+)/.exec(clean(text));
  return match ? Number(match[1]) : null;
}

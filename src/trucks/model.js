// Перетворення рядків аркуша Rozładunek на об'єкти для сайту. Без DOM, щоб тестувати в Node.
// Дані (WAB, брама, Info тощо) не перекладаються; статуси зберігаються як незмінні ключі.

export const STATUS_FLOW = ["yard", "unloaded", "advice", "masterdata", "stowed"];
export const EXTRA_STATUSES = ["left_shift", "suspended"];

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
  zawieszone: "suspended", // таблиця NCG
};

const clean = (value) => String(value ?? "").trim();
const key = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

// "Plac, Rozładowane, Advice" → { done: Set(...), unknown: [] }
export function parseStatus(text) {
  const done = new Set();
  const unknown = [];
  for (const part of clean(text).split(/[,;]/)) {
    if (!clean(part)) continue;
    const mapped = SHEET_STATUS[key(part)];
    if (mapped) done.add(mapped);
    else unknown.push(clean(part));
  }
  return { done, unknown };
}

// Поточний статус: найдальший крок у послідовності.
export function currentStatus(done) {
  for (const extra of EXTRA_STATUSES) if (done.has(extra)) return extra;
  for (let i = STATUS_FLOW.length - 1; i >= 0; i--) if (done.has(STATUS_FLOW[i])) return STATUS_FLOW[i];
  return null;
}

// "23.11.2026 04:30" → Date (місцевий час) або null
export function parseSheetDate(text) {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(clean(text));
  if (!match) return null;
  const [, d, m, y, hh = "0", mm = "0"] = match;
  const date = new Date(+y, +m - 1, +d, +hh, +mm);
  return Number.isNaN(date.getTime()) ? null : date;
}

const FBO_COLUMNS = {
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
  const names = header.map(key);
  const index = {};
  for (const [field, aliases] of Object.entries(FBO_COLUMNS)) {
    index[field] = names.findIndex((name) => aliases.includes(name));
  }
  return index;
}

// rows: перший рядок — заголовки. colors: фон клітинок (getBackgrounds), необов'язково.
export function normalizeTable(rows, colors = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const index = columnIndex(rows[0]);
  const get = (row, field) => (index[field] >= 0 ? clean(row[index[field]]) : "");
  const result = [];
  rows.slice(1).forEach((row, i) => {
    if (!Array.isArray(row) || row.every((cell) => !clean(cell))) return;
    const { done, unknown } = parseStatus(get(row, "status"));
    const deadlineText = get(row, "deadline");
    result.push({
      sheetRow: i + 2,
      wab: get(row, "wab"),
      gate: get(row, "gate"),
      deadlineText,
      deadline: parseSheetDate(deadlineText),
      priority: get(row, "priority"),
      statusText: get(row, "status"),
      done,
      unknownStatus: unknown,
      status: currentStatus(done),
      buffer: get(row, "buffer"),
      finalStatus: get(row, "finalStatus"),
      info: get(row, "info"),
      color: rowColor(colors[i + 1]),
    });
  });
  return result;
}

// Колір дня з таблиці: перший нетиповий фон у рядку.
function rowColor(rowColors) {
  if (!Array.isArray(rowColors)) return null;
  const color = rowColors.find((c) => /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== "#ffffff");
  return color || null;
}

export function isOverdue(item, now = new Date()) {
  return Boolean(item.deadline) && item.deadline < now && item.status !== "stowed";
}

export function summarize(items, now = new Date()) {
  const byStatus = Object.fromEntries([...STATUS_FLOW, ...EXTRA_STATUSES, "none"].map((s) => [s, 0]));
  let overdue = 0;
  for (const item of items) {
    byStatus[item.status || "none"]++;
    if (isOverdue(item, now)) overdue++;
  }
  return { total: items.length, byStatus, overdue };
}

// "EURO\n13" або "13" → 13
export function parseEuroCount(text) {
  const match = /(\d+)/.exec(clean(text));
  return match ? Number(match[1]) : null;
}

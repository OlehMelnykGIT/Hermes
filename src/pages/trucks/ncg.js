// Дані аркуша NCG → об'єкти для блоку «NCG» на сторінці «Rozładunek».
// Чисті функції без DOM (перевіряються в tests/pages.test.js). Лише читання.
//
// Колонки шукаються за назвами, тож порядок у таблиці може змінюватися.
// Typ:  «Rozładunek» — розвантажили ми (є брама);
//       «Przyjęcie»  — розвантажив хтось інший, ми лише приймаємо (брами немає, важливий Bufor).
// Puste palety: скільки порожніх палет віддано водієві; порожньо — обміну не було.
// Do LU: TRUE — доставку звірено й передано в LU.

import { parseSheetDate } from "./model.js";

const clean = (value) => String(value ?? "").trim();
const normalize = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

const COLUMNS = {
  type: ["typ"],
  gate: ["brama"],
  date: ["data"],
  status: ["status"],
  pallets: ["palety"],
  buffer: ["bufor"],
  emptyPallets: ["puste palety"],
  finalStatus: ["final status"],
  info: ["info"],
  lu: ["do lu"],
};

// Типи доставки → незмінні ключі (переклад і колір — за ключем).
export const NCG_TYPES = ["unloading", "receipt"];
const TYPE_KEYS = { "rozładunek": "unloading", "przyjęcie": "receipt" };

// Статуси NCG → ключі. Більшість збігається зі статусами FBO; «Przyjęte» — окремий ключ.
const STATUS_KEYS = {
  plac: "yard",
  "rozładowano": "unloaded",
  "rozładowane": "unloaded",
  "rozładowany": "unloaded",
  "przyjęte": "accepted",
  "przyjęto": "accepted",
  "przyjęty": "accepted",
  advice: "advice",
  "no advice": "no_advice",
  "master data": "masterdata",
  stol: "stowed",
  "do odstawienia": "closed",
  "wab do odstawienia": "closed",
  zawieszone: "suspended",
  "pozostawione inną zmianę": "left_shift",
};

// «Plac, Rozładowano» → { key: "unloaded", text } — останній відомий статус у клітинці
// (статуси дописуються по черзі). Невідомий текст лишається як є (key: null).
export function parseNcgStatus(value) {
  const text = clean(value);
  const keys = text.split(",").map((part) => STATUS_KEYS[normalize(part)]).filter(Boolean);
  return { key: keys.at(-1) ?? null, text };
}

const TRUE_VALUES = ["true", "prawda", "tak", "1"];
export const isPassedToLu = (value) => value === true || TRUE_VALUES.includes(normalize(value));

// «32» → 32; порожньо або не число → null
export function parseCount(value) {
  const text = clean(value);
  return /^\d+$/.test(text) ? Number(text) : null;
}

function columnIndex(header) {
  const names = header.map(normalize);
  return Object.fromEntries(
    Object.entries(COLUMNS).map(([field, aliases]) => [field, names.findIndex((name) => aliases.includes(name))]),
  );
}

// rows: перший рядок — заголовки, далі доставки. Повертає { items, columns },
// де columns — поля, які справді є в заголовку (відсутні колонки не показуємо).
export function normalizeNcg(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) return { items: [], columns: new Set() };
  const index = columnIndex(rows[0]);
  const columns = new Set(Object.keys(index).filter((field) => index[field] >= 0));
  const cell = (row, field) => (index[field] >= 0 ? row[index[field]] : "");

  const items = rows.slice(1).flatMap((row, i) => {
    if (!Array.isArray(row) || row.every((value) => !clean(value))) return [];
    const typeText = clean(cell(row, "type"));
    const dateText = clean(cell(row, "date"));
    return [
      {
        row: i + 2,
        type: TYPE_KEYS[normalize(typeText)] ?? null,
        typeText,
        gate: clean(cell(row, "gate")),
        buffer: clean(cell(row, "buffer")),
        dateText,
        date: parseSheetDate(dateText),
        status: parseNcgStatus(cell(row, "status")),
        finalStatus: parseNcgStatus(cell(row, "finalStatus")),
        palletsText: clean(cell(row, "pallets")),
        pallets: parseCount(cell(row, "pallets")),
        emptyPalletsText: clean(cell(row, "emptyPallets")),
        emptyPallets: parseCount(cell(row, "emptyPallets")),
        info: clean(cell(row, "info")),
        passedToLu: isPassedToLu(cell(row, "lu")),
      },
    ];
  });
  return { items, columns };
}

// Підсумки: доставки, палети окремо для кожного типу, порожні палети, не передані в LU.
export function summarizeNcg(items) {
  const byType = Object.fromEntries(NCG_TYPES.map((type) => [type, { deliveries: 0, pallets: 0 }]));
  let emptyPallets = 0;
  let exchanges = 0;
  let notInLu = 0;
  for (const item of items) {
    if (item.type) {
      byType[item.type].deliveries++;
      byType[item.type].pallets += item.pallets ?? 0;
    }
    if (item.emptyPallets !== null) {
      emptyPallets += item.emptyPallets;
      exchanges++;
    }
    if (!item.passedToLu) notInLu++;
  }
  return { deliveries: items.length, byType, emptyPallets, exchanges, notInLu };
}

export function sortNcg(items, sort) {
  if (sort !== "deadline") return items;
  return [...items].sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
}

// ===================== Групи за датою =====================
// NCG групуємо за календарною датою з колонки Data, а не за days / «Zakończ dzień»
// (кнопка завершення дня для NCG не використовується).

const pad = (n) => String(n).padStart(2, "0");
export const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// → [{ key: "2026-11-23" | null, date, items, summary, current }]
// Найновіша дата зверху, «Bez daty» (key: null) — в кінці.
// current — сьогоднішня дата (або новіша); якщо такої немає — найновіша група з датою.
export function groupNcgByDate(items, now = new Date()) {
  const groups = new Map();
  for (const item of items) {
    const key = item.date ? dateKey(item.date) : null;
    if (!groups.has(key)) groups.set(key, { key, date: item.date, items: [] });
    groups.get(key).items.push(item);
  }
  const dated = [...groups.values()].filter((g) => g.key !== null).sort((a, b) => b.key.localeCompare(a.key));
  const today = dateKey(now);
  const hasCurrent = dated.some((g) => g.key >= today);
  const result = dated.map((g, i) => ({
    ...g,
    summary: summarizeNcg(g.items),
    current: hasCurrent ? g.key >= today : i === 0,
  }));
  if (groups.has(null)) {
    const g = groups.get(null);
    result.push({ ...g, date: null, summary: summarizeNcg(g.items), current: false });
  }
  return result;
}

// Дані аркуша Zespół → групи для сторінки «Zespół». Чисті функції, перевіряються тестами.
//
// Сервер уже віддає лише дозволені поля: { person, shift, process, break, udt, notes }.
// Імена й примітки показуються як у таблиці; процес, перерва і зміна отримують ключі.

export const PROCESSES = ["unloading", "stowing", "replenishment", "leader"];
export const SHIFTS = ["I", "II", "III", "IV"];
export const BREAKS = ["break1", "break2"];

const PROCESS_BY_NAME = {
  "rozładunek": "unloading",
  rozladunek: "unloading",
  stol: "stowing",
  replen: "replenishment",
  replenishment: "replenishment",
  lider: "leader",
};

const normalize = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// «Stol» → stowing; невідомий процес → other (показується з назвою з таблиці).
export const processKey = (text) => PROCESS_BY_NAME[normalize(text)] || "other";

// «I przerwa» → break1, «II przerwa» → break2, інше → null
export function breakKey(text) {
  const key = normalize(text).replace(/przerwa|перерва/g, "").replace(/[\s.]/g, "");
  if (key === "i" || key === "1") return "break1";
  if (key === "ii" || key === "2") return "break2";
  return null;
}

// «II» або «2» → «II»
export function shiftKey(text) {
  const value = String(text ?? "").trim().toUpperCase();
  return { 1: "I", 2: "II", 3: "III", 4: "IV" }[value] || (SHIFTS.includes(value) ? value : "");
}

// «Oleh M.» → «OM»
export function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function normalizePeople(team) {
  if (!Array.isArray(team)) return [];
  return team.map((person) => ({
    ...person,
    processKey: processKey(person.process),
    breakKey: breakKey(person.break),
    shiftKey: shiftKey(person.shift),
  }));
}

export function filterPeople(people, { shift = "all", udtOnly = false } = {}) {
  return people.filter((p) => (shift === "all" || p.shiftKey === shift) && (!udtOnly || p.udt));
}

const byName = (a, b) => a.person.localeCompare(b.person, "pl");

// [{ key, people }] у сталому порядку процесів; «other» — в кінці; порожні групи пропускаються.
export function groupByProcess(people) {
  return [...PROCESSES, "other"]
    .map((key) => ({ key, people: people.filter((p) => p.processKey === key).sort(byName) }))
    .filter((group) => group.people.length > 0);
}

// Розподіл перерв: хто йде на кожну перерву, хто лишається в процесі і чи рівні групи.
export function breakPlan(people) {
  const rows = groupByProcess(people).map(({ key, people: list }) => {
    const row = { key, total: list.length, break1: [], break2: [], none: [] };
    for (const p of list) row[p.breakKey || "none"].push(p);
    return row;
  });
  const count = (field) => rows.reduce((n, row) => n + row[field].length, 0);
  const totals = { break1: count("break1"), break2: count("break2"), none: count("none") };
  return { rows, totals, difference: Math.abs(totals.break1 - totals.break2) };
}

// Дані аркуша Zespół → ключі для сайту. Тексти з таблиці (імена, примітки) не змінюються;
// процес, перерва і зміна отримують незмінні ключі для перекладу та групування.

export const PROCESSES = ["unloading", "stowing", "replenishment", "leader"];
export const SHIFTS = ["I", "II", "III", "IV"];
export const BREAKS = ["break1", "break2"];

const PROCESS_MAP = {
  "rozładunek": "unloading",
  rozladunek: "unloading",
  stol: "stowing",
  replen: "replenishment",
  replenishment: "replenishment",
  lider: "leader",
};

const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function processKey(text) {
  return PROCESS_MAP[norm(text)] || "other";
}

// «I przerwa» → break1, «II przerwa» → break2
export function breakKey(text) {
  const key = norm(text).replace(/przerwa|перерва/g, "").replace(/[\s.]/g, "");
  if (key === "i" || key === "1") return "break1";
  if (key === "ii" || key === "2") return "break2";
  return null;
}

export function shiftKey(text) {
  const value = String(text ?? "").trim().toUpperCase();
  const arabic = { 1: "I", 2: "II", 3: "III", 4: "IV" }[value];
  return arabic || (SHIFTS.includes(value) ? value : "");
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

// [{ key, people }] у сталому порядку процесів; «other» в кінці.
export function groupByProcess(people) {
  return [...PROCESSES, "other"]
    .map((key) => ({ key, people: people.filter((p) => p.processKey === key).sort(byName) }))
    .filter((group) => group.people.length > 0);
}

// Розподіл перерв: хто йде на кожну перерву і хто лишається в процесі.
export function breakPlan(people) {
  const rows = groupByProcess(people).map(({ key, people: list }) => {
    const row = { key, total: list.length, break1: [], break2: [], none: [] };
    for (const p of list) row[p.breakKey || "none"].push(p);
    return row;
  });
  const totals = {
    break1: rows.reduce((n, r) => n + r.break1.length, 0),
    break2: rows.reduce((n, r) => n + r.break2.length, 0),
    none: rows.reduce((n, r) => n + r.none.length, 0),
  };
  return { rows, totals, difference: Math.abs(totals.break1 - totals.break2) };
}

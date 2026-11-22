// Звернення до Apps Script Web App і перевірка даних, які звідти приходять.
// Токени (SHEET_API_TOKEN, SHEET_API_WRITE_TOKEN) лише тут, на сервері.

const TIMEOUT_MS = 20000;
const MAX_ROWS = 2000;
const MAX_COLS = 30;
export const MAX_LINKS = 50;

function baseUrl(env) {
  try {
    const url = new URL(env.SHEET_API_URL);
    return url.protocol === "https:" && url.hostname === "script.google.com" ? url : null;
  } catch {
    return null;
  }
}

export function readConfigured(env) {
  return Boolean(baseUrl(env) && env.SHEET_API_TOKEN);
}

export function writeConfigured(env) {
  return Boolean(baseUrl(env) && env.SHEET_API_WRITE_TOKEN);
}

async function call(url, init) {
  let response;
  try {
    // Apps Script відповідає перенаправленням на googleusercontent.com — ідемо за ним.
    response = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    return { error: error?.name === "TimeoutError" ? "upstream_timeout" : "upstream_error" };
  }
  if (!response.ok) return { error: "upstream_error" };
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") return { error: "upstream_error" };
  if (data.error) return { error: data.error === "unauthorized" ? "upstream_unauthorized" : "upstream_error" };
  return { data };
}

export function getSheet(env) {
  const url = baseUrl(env);
  if (!url || !env.SHEET_API_TOKEN) return Promise.resolve({ error: "not_configured" });
  url.searchParams.set("token", env.SHEET_API_TOKEN);
  return call(url);
}

export function saveLinks(env, links) {
  const url = baseUrl(env);
  if (!url || !env.SHEET_API_WRITE_TOKEN) return Promise.resolve({ error: "not_configured" });
  return call(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: env.SHEET_API_WRITE_TOKEN, action: "saveLinks", links }),
  });
}

export function errorStatus(error) {
  return error === "not_configured" ? 503 : 502;
}

// ===================== Перевірка даних =====================

const text = (value, max) => String(value ?? "").trim().slice(0, max);

export function table(value) {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, MAX_ROWS)
    .map((row) => (Array.isArray(row) ? row.slice(0, MAX_COLS).map((cell) => String(cell ?? "")) : []));
}

export function safeHttpsUrl(value) {
  try {
    const url = new URL(text(value, 2000));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// [{name, url}] — лише https, без порожніх назв.
export function normalizeLinks(value) {
  if (!Array.isArray(value)) return undefined;
  const links = [];
  for (const item of value.slice(0, MAX_LINKS)) {
    const name = text(item?.name, 100);
    const url = safeHttpsUrl(item?.url);
    if (name && url) links.push({ name, url });
  }
  return links;
}

// Перевірка списку з форми «Edytuj». Повертає { links } або { error }.
export function validateLinksInput(value) {
  if (!Array.isArray(value)) return { error: "invalid_links" };
  if (value.length > MAX_LINKS) return { error: "too_many_links" };
  const links = [];
  for (const item of value) {
    const name = text(item?.name, 101);
    const url = safeHttpsUrl(item?.url);
    if (!name || name.length > 100 || !url) return { error: "invalid_links" };
    links.push({ name, url });
  }
  return { links };
}

// ---------- Zespół: лише дозволені поля ----------

const TEAM_FIELDS = {
  person: ["osoba", "person", "name", "imie"],
  shift: ["zmiana", "shift"],
  process: ["procesteraz", "proces", "process"],
  break: ["przerwa", "break"],
  udt: ["udtvna", "udt", "vna"],
  notes: ["uwagi", "notes"],
};

const fieldKey = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g, "");

function fieldFor(name) {
  const key = fieldKey(name);
  return Object.keys(TEAM_FIELDS).find((field) => TEAM_FIELDS[field].includes(key)) || null;
}

// Лише ім'я та ініціал: «Oleh Melnyk» → «Oleh M.»
export function shortName(value) {
  const parts = text(value, 80).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 30);
  return `${parts[0].slice(0, 30)} ${parts[1].charAt(0).toUpperCase()}.`;
}

function parseUdt(value) {
  if (value === true) return true;
  return ["true", "tak", "x", "1", "yes", "✓", "✔", "☑"].includes(String(value ?? "").trim().toLowerCase());
}

function toPerson(fields) {
  const person = shortName(fields.person);
  if (!person) return null;
  return {
    person,
    shift: text(fields.shift, 10),
    process: text(fields.process, 40),
    break: text(fields.break, 30),
    udt: parseUdt(fields.udt),
    notes: text(fields.notes, 200),
  };
}

// Приймає масив об'єктів або таблицю з рядком заголовків. Інші колонки відкидаються.
export function normalizeTeam(value) {
  if (!Array.isArray(value)) return undefined;
  const rows = value.slice(0, 500);
  let people;
  if (rows.length && Array.isArray(rows[0])) {
    const header = rows[0].map(fieldFor);
    people = rows.slice(1).map((row) => {
      const fields = {};
      header.forEach((field, i) => {
        if (field && Array.isArray(row)) fields[field] = row[i];
      });
      return toPerson(fields);
    });
  } else {
    people = rows.map((item) => {
      if (!item || typeof item !== "object") return null;
      const fields = {};
      for (const [key, val] of Object.entries(item)) {
        const field = fieldFor(key);
        if (field && !(field in fields)) fields[field] = val;
      }
      return toPerson(fields);
    });
  }
  return people.filter(Boolean);
}

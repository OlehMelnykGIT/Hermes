// Звернення до Apps Script Web App і перевірка даних, які звідти приходять.
// Токени (SHEET_API_TOKEN, SHEET_API_WRITE_TOKEN) лише тут, на сервері.

const TIMEOUT_MS = 20000;
const MAX_ROWS = 2000;
const MAX_COLS = 30;
export const MAX_LINKS = 50;

// ===================== Запити до Apps Script =====================

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

// ---------- Дні (кнопки «Zakończ dzień» / «Nowy tydzień») ----------
// [{ id, nr, fromRow, toRow, open, closedAt }] — номери рядків аркуша Rozładunek.
// id — унікальний ID робочого дня (момент відкриття, yyyy-MM-ddTHH:mm:ss, час Варшави).
// Межі днів беруться лише звідси, не з кольорів чи ліній.

const isInt = (value) => Number.isInteger(value);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDays(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(-500).flatMap((day) => {
    if (!day || !isInt(day.nr) || !isInt(day.fromRow) || !isInt(day.toRow) || day.fromRow < 2) return [];
    const dateTime = (value) => (typeof value === "string" && DATE_TIME.test(value) ? value : null);
    return [
      {
        id: dateTime(day.id),
        nr: day.nr,
        fromRow: day.fromRow,
        toRow: day.toRow,
        open: day.open === true,
        closedAt: dateTime(day.closedAt),
      },
    ];
  });
}

// ---------- Статистика днів ----------
// [{ dayId, day, druk, lu }], найновіші першими, максимум 60.
// dayId — точно дорівнює days[i].id; старі записи мають dayId лише з датою (з днями не збігаються).
// day — дата відкриття робочого дня; druk — унікальні палети через Druk Replen; lu — LU з місцем.

const count = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value)) : 0);

export function normalizeStats(value) {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, 60)
    .filter((entry) => entry && typeof entry.day === "string" && DATE.test(entry.day))
    .map((entry) => ({
      dayId: typeof entry.dayId === "string" && (DATE_TIME.test(entry.dayId) || DATE.test(entry.dayId)) ? entry.dayId : null,
      day: entry.day,
      druk: count(entry.druk),
      lu: count(entry.lu),
    }));
}

// ---------- Zespół ----------
// Api.gs віддає [{ osoba, zmiana, proces, przerwa, udt, uwagi }]. Беремо лише ці поля:
// навіть якщо в аркуші з'явиться інша колонка (телефон тощо), на сайт вона не потрапить.

// Лише ім'я та ініціал: «Oleh Melnyk» → «Oleh M.»
export function shortName(value) {
  const parts = text(value, 80).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 30);
  return `${parts[0].slice(0, 30)} ${parts[1].charAt(0).toUpperCase()}.`;
}

export function normalizeTeam(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 500).flatMap((item) => {
    const person = shortName(item?.osoba);
    if (!person) return [];
    return [
      {
        person,
        shift: text(item.zmiana, 10),
        process: text(item.proces, 40),
        break: text(item.przerwa, 30),
        udt: item.udt === true || String(item.udt).toLowerCase() === "true",
        notes: text(item.uwagi, 200),
      },
    ];
  });
}

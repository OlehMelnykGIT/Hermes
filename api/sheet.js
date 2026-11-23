// GET /api/sheet — дані таблиці для всіх сторінок (FBO, дні, статистика, Zespół, Linki, Notatki).
// Токен читання лишається на сервері; у браузер ідуть лише перевірені поля.
//
// Короткий кеш у пам'яті сервера: Apps Script відповідає 3–4 с, а сторінку одночасно
// відкривають кілька ПК і щохвилини оновлюють. Перший запит іде в таблицю, наступні
// протягом CACHE_MS отримують ту саму відповідь миттєво; одночасні запити чекають
// одну спільну відповідь. ?fresh=1 (кнопка «Odśwież») завжди бере свіжі дані.
// Кеш лише в пам'яті функції — ні в браузері, ні на диску.

import { fail, json } from "../server/http.js";
import { isAuthenticated } from "../server/session.js";
import {
  errorStatus,
  getSheet,
  normalizeDays,
  normalizeLinks,
  normalizeNotes,
  normalizeStats,
  normalizeTeam,
  table,
} from "../server/sheetApi.js";

const CACHE_MS = 25_000;

let cached = null; // { at, body }
let inflight = null; // спільний запит до Apps Script, поки він триває

function toBody(data) {
  return {
    updated: typeof data.updated === "string" ? data.updated : null,
    fbo: table(data.fbo) ?? [],
    team: normalizeTeam(data.team),
    links: normalizeLinks(data.links),
    days: normalizeDays(data.days),
    stats: normalizeStats(data.stats),
    notes: normalizeNotes(data.notes),
    // Необов'язкові поля: з'являться на сайті, щойно Api.gs почне їх віддавати.
    euro: typeof data.euro === "string" ? data.euro : null,
    fboColors: table(data.fboColors),
    ncg: table(data.ncg),
  };
}

function loadFromSheet() {
  inflight ??= getSheet(process.env).finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function GET(request) {
  if (!(await isAuthenticated(request))) return fail("unauthorized", 401);

  const fresh = new URL(request.url).searchParams.has("fresh");
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return json(cached.body);

  const { data, error } = await loadFromSheet();
  if (error) return fail(error, errorStatus(error));

  cached = { at: Date.now(), body: toBody(data) };
  return json(cached.body);
}

// Для тестів: очистити кеш між перевірками.
export function resetCache() {
  cached = null;
  inflight = null;
}

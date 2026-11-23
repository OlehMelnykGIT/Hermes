// POST /api/notes — збереження або видалення ОДНІЄЇ нотатки на сторінці «Notatki».
//
// Api.gs (saveNotes) замінює весь список. Щоб два ПК не затирали зміни одне одного,
// сервер спершу бере свіжий список з таблиці, застосовує до нього одну зміну
// і лише тоді записує повний список. Токен запису є тільки тут, у змінних середовища.
//
// Тіло: { op: "save", note: { id, title, text, color, pinned } } (порожній id — нова нотатка)
//    або { op: "delete", id }.
// Відповідь: { ok: true, count, notes } — актуальний список з Api.gs.

import { fail, json } from "../server/http.js";
import { isAuthenticated, sameOrigin } from "../server/session.js";
import { applyNoteChange, errorStatus, getSheet, normalizeNotes, saveNotes } from "../server/sheetApi.js";

export async function POST(request) {
  if (!(await isAuthenticated(request))) return fail("unauthorized", 401);
  // Лише з нашого сайту і лише JSON — захист від підробки запиту з чужої сторінки.
  if (!request.headers.get("origin") || !sameOrigin(request)) return fail("forbidden", 403);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return fail("bad_request", 415);

  const change = await request.json().catch(() => null);
  // Перевірка до звернення в таблицю: погані дані не варті запиту в Google.
  // (порожній список: «не знайдено» тут нормально, реальна перевірка — нижче, на свіжих даних)
  const precheck = applyNoteChange([], change);
  if (precheck.error && precheck.error !== "note_not_found") return fail(precheck.error, 400);

  const current = await getSheet(process.env);
  if (current.error) return fail(current.error, errorStatus(current.error));
  const notes = normalizeNotes(current.data.notes);
  if (!notes) return fail("notes_unavailable", 502); // Api.gs ще не віддає notes

  const { notes: next, error: changeError } = applyNoteChange(notes, change);
  if (changeError) return fail(changeError, changeError === "note_not_found" ? 409 : 400);

  const { data, error } = await saveNotes(process.env, next);
  if (error) return fail(error, errorStatus(error));
  if (data.ok !== true) return fail("upstream_error", 502);
  const saved = normalizeNotes(data.notes) ?? [];
  return json({ ok: true, count: Number(data.count) || saved.length, notes: saved });
}

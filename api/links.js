// POST /api/links — кнопка «Edytuj»: замінює весь список в аркуші Linki.
// Токен для запису (SHEET_API_WRITE_TOKEN) є лише тут, у змінних середовища.
// Читання посилань іде разом з рештою даних через /api/sheet.

import { fail, json } from "../server/http.js";
import { isAuthenticated, sameOrigin } from "../server/session.js";
import { errorStatus, saveLinks, validateLinksInput } from "../server/sheetApi.js";

export async function POST(request) {
  if (!(await isAuthenticated(request))) return fail("unauthorized", 401);
  // Лише з нашого сайту і лише JSON — захист від підробки запиту з чужої сторінки.
  if (!request.headers.get("origin") || !sameOrigin(request)) return fail("forbidden", 403);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return fail("bad_request", 415);

  const body = await request.json().catch(() => null);
  const { links, error: inputError } = validateLinksInput(body?.links);
  if (inputError) return fail(inputError, 400);

  const { data, error } = await saveLinks(process.env, links);
  if (error) return fail(error, errorStatus(error));
  if (data.ok !== true) return fail("upstream_error", 502);
  return json({ ok: true, count: Number(data.count) || links.length });
}

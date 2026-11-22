// Посилання з аркуша Linki: читання (GET) і заміна всього списку (POST, кнопка «Edytuj»).
// Токен для запису (SHEET_API_WRITE_TOKEN) є лише тут, у змінних середовища.

import { isAuthenticated, sameOrigin } from "../server/session.js";
import { errorStatus, getSheet, normalizeLinks, saveLinks, validateLinksInput } from "../server/sheetApi.js";

const headers = { "Cache-Control": "no-store" };
const fail = (error, status) => Response.json({ error }, { status, headers });

export async function GET(request) {
  if (!(await isAuthenticated(request))) return fail("unauthorized", 401);
  const { data, error } = await getSheet(process.env);
  if (error) return fail(error, errorStatus(error));
  return Response.json({ links: normalizeLinks(data.links) ?? null }, { headers });
}

export async function POST(request) {
  if (!(await isAuthenticated(request))) return fail("unauthorized", 401);
  // Лише з нашого сайту і лише JSON — захист від підробки запиту з чужої сторінки.
  if (!sameOrigin(request) || !request.headers.get("origin")) return fail("forbidden", 403);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return fail("bad_request", 415);

  const body = await request.json().catch(() => null);
  const { links, error: inputError } = validateLinksInput(body?.links);
  if (inputError) return fail(inputError, 400);

  const { data, error } = await saveLinks(process.env, links);
  if (error) return fail(error, errorStatus(error));
  if (data.ok !== true) return fail("upstream_error", 502);
  return Response.json({ ok: true, count: Number(data.count) || links.length, links }, { headers });
}

// GET /api/config — налаштування для фронтенду. Секретів тут немає:
// лише посилання на Google Таблицю (кнопка «Arkusz») і що ввімкнено.

import { fail, json } from "../server/http.js";
import { isAuthenticated } from "../server/session.js";
import { readConfigured, writeConfigured } from "../server/sheetApi.js";

function googleSheetUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  // Middleware вже перевіряє сесію; тут — друга лінія захисту.
  if (!(await isAuthenticated(request))) return fail("unauthorized", 401);
  return json({
    sheetUrl: googleSheetUrl(process.env.SHEET_URL),
    liveData: readConfigured(process.env),
    canEditLinks: writeConfigured(process.env),
  });
}

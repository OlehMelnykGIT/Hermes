// Налаштування для фронтенду після входу. Секрети сюди не потрапляють:
// лише посилання і прапорці, що ввімкнено.

import { isAuthenticated } from "../server/session.js";
import { readConfigured, writeConfigured } from "../server/sheetApi.js";

function safeUrl(value, allowedHost) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

const sheetUrl = (value) => safeUrl(value, (host) => host === "docs.google.com");
const excelUrl = (value) => safeUrl(value, (host) => host.endsWith(".sharepoint.com"));

export async function GET(request) {
  const headers = { "Cache-Control": "no-store" };
  // Middleware уже перевіряє сесію; повторна перевірка на випадок помилки в matcher.
  if (!(await isAuthenticated(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  return Response.json(
    {
      sheetUrl: sheetUrl(process.env.SHEET_URL),
      excelUrl: excelUrl(process.env.EXCEL_URL),
      liveData: readConfigured(process.env),
      canEditLinks: writeConfigured(process.env),
    },
    { headers },
  );
}

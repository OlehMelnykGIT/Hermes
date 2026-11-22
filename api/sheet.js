// Читання таблиці для сторінок «Fury / Bramy» і «Zespół». Токен лише на сервері.

import { isAuthenticated } from "../server/session.js";
import { errorStatus, getSheet, normalizeLinks, normalizeTeam, table } from "../server/sheetApi.js";

export async function GET(request) {
  const headers = { "Cache-Control": "no-store" };
  if (!(await isAuthenticated(request))) return Response.json({ error: "unauthorized" }, { status: 401, headers });

  const { data, error } = await getSheet(process.env);
  if (error) return Response.json({ error }, { status: errorStatus(error), headers });

  return Response.json(
    {
      updated: typeof data.updated === "string" ? data.updated : null,
      euro: typeof data.euro === "string" ? data.euro : null,
      fbo: table(data.fbo) ?? [],
      fboColors: table(data.fboColors),
      ncg: table(data.ncg),
      ncgColors: table(data.ncgColors),
      team: normalizeTeam(data.team),
      links: normalizeLinks(data.links),
    },
    { headers },
  );
}

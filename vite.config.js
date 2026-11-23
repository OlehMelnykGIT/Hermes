import { randomBytes } from "node:crypto";
import { defineConfig, loadEnv } from "vite";

const SERVER_ENV = [
  "SITE_PASSWORD",
  "SESSION_SECRET",
  "SHEET_URL",
  "SHEET_API_URL",
  "SHEET_API_TOKEN",
  "SHEET_API_WRITE_TOKEN",
];
const API_ROUTES = { "/api/config": "/api/config.js", "/api/sheet": "/api/sheet.js", "/api/links": "/api/links.js", "/api/notes": "/api/notes.js" };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Лише для `npm run dev`: запускає функції з api/ локально зі змінними з .env.local.
// Вхід паролем тут не емулюється (його робить middleware.js на Vercel).
// Змінні потрапляють лише в process.env сервера розробки, не в браузер.
function devApi(env) {
  return {
    name: "hermes-dev-api",
    apply: "serve",
    configureServer(server) {
      for (const key of SERVER_ENV) if (env[key]) process.env[key] = env[key];
      process.env.SITE_PASSWORD ||= "dev";
      if ((process.env.SESSION_SECRET || "").length < 32) process.env.SESSION_SECRET = randomBytes(32).toString("hex");

      server.middlewares.use(async (req, res, next) => {
        const route = API_ROUTES[req.url.split("?")[0]];
        if (!route) return next();
        try {
          const { createSession, SESSION_COOKIE } = await server.ssrLoadModule("/server/session.js");
          const handler = (await server.ssrLoadModule(route))[req.method];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const origin = `http://${req.headers.host}`;
          const headers = { cookie: `${SESSION_COOKIE}=${await createSession(process.env)}` };
          for (const key of ["content-type", "origin"]) if (req.headers[key]) headers[key] = req.headers[key];
          const hasBody = req.method !== "GET" && req.method !== "HEAD";
          const response = await handler(
            new Request(origin + req.url, { method: req.method, headers, body: hasBody ? await readBody(req) : undefined }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [devApi(loadEnv(mode, process.cwd(), ""))],
}));

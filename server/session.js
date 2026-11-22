// Сесія входу на сайт. Працює і в Vercel Middleware (Edge), і в API-функціях (Node).
// Секрети беруться лише зі змінних середовища: SITE_PASSWORD, SESSION_SECRET.

const encoder = new TextEncoder();

export const SESSION_COOKIE = "hermes_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // одна зміна

function base64url(buffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authConfigured(env) {
  return Boolean(env.SITE_PASSWORD) && (env.SESSION_SECRET || "").length >= 32;
}

// Ключ залежить і від секрету, і від пароля: зміна будь-якого з них розлогінює всіх.
async function sign(env, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${env.SESSION_SECRET}\u0000${env.SITE_PASSWORD}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

export async function createSession(env, now = Date.now()) {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_TTL_SECONDS}`;
  return `${payload}.${await sign(env, payload)}`;
}

export async function verifySession(env, token, now = Date.now()) {
  if (!authConfigured(env) || typeof token !== "string") return false;
  const [version, exp, signature, extra] = token.split(".");
  if (version !== "v1" || extra !== undefined || !signature) return false;
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires * 1000 <= now) return false;
  return timingSafeEqual(await sign(env, `v1.${expires}`), signature);
}

async function digest(text) {
  return base64url(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export async function passwordMatches(env, input) {
  if (typeof input !== "string" || !env.SITE_PASSWORD) return false;
  const [given, expected] = await Promise.all([digest(input), digest(env.SITE_PASSWORD)]);
  return timingSafeEqual(given, expected);
}

export function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function secureFlag(request) {
  return new URL(request.url).hostname === "localhost" ? "" : "; Secure";
}

export function sessionCookie(request, value, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag(request)}`;
}

export function langCookie(request, lang) {
  return `hermes_lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000${secureFlag(request)}`;
}

export function isAuthenticated(request, env = process.env) {
  return verifySession(env, readCookie(request, SESSION_COOKIE));
}

// Захист від підробки запитів з чужих сайтів для POST.
// Порівнюємо домен з Origin браузера з доменом, на який прийшов запит. На Vercel request.url
// всередині може мати іншу схему (http://), тому беремо заголовки проксі і не дивимося на схему.
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    new URL(request.url).host,
  ];
  return hosts.some((host) => host && host.split(",")[0].trim().toLowerCase() === originHost);
}

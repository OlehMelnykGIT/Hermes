// Запити до нашого /api/*. Сесія — HttpOnly cookie, тож токенів у браузері немає.

import { t } from "../i18n/index.js";

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// Коди помилок, для яких є окремий текст у перекладах (error.<код>).
const KNOWN_ERRORS = new Set([
  "not_configured",
  "upstream_unauthorized",
  "upstream_timeout",
  "no_api",
  "network",
  "invalid_links",
  "too_many_links",
]);

export function errorMessage(error) {
  return t(`error.${KNOWN_ERRORS.has(error?.code) ? error.code : "generic"}`);
}

export const isSilentError = (error) => error?.name === "AbortError" || error?.code === "unauthorized";

function goToLogin() {
  location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`;
}

export async function api(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("network", 0);
  }

  // Сесія закінчилася — назад на сторінку входу.
  if (response.status === 401) {
    goToLogin();
    throw new ApiError("unauthorized", 401);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    // 404 — API немає взагалі (наприклад, статичний перегляд без сервера).
    throw new ApiError(response.status === 404 ? "no_api" : data?.error || "generic", response.status);
  }
  return data;
}

import { t } from "./i18n/index.js";

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function goToLogin() {
  location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`;
}

// Запит до нашого /api/*. Сесія — HttpOnly cookie, токенів у браузері немає.
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
  if (response.status === 401) {
    goToLogin();
    throw new ApiError("unauthorized", 401);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new ApiError(response.status === 404 ? "no_api" : data?.error || "generic", response.status);
  }
  return data;
}

const KNOWN = [
  "not_configured",
  "upstream_unauthorized",
  "upstream_timeout",
  "no_api",
  "network",
  "invalid_links",
  "too_many_links",
];

export function errorMessage(error) {
  return t(`error.${KNOWN.includes(error?.code) ? error.code : "generic"}`);
}

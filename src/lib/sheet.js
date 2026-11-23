// Одне джерело даних таблиці для всіх сторінок.
//
// «Rozładunek», «Zespół» і посилання читають ту саму відповідь /api/sheet, тож запит один,
// а перемикання між сторінками миттєве. Поки хтось підписаний, дані оновлюються
// щохвилини (лише коли вкладка видима) і відразу після повернення на вкладку.

import { api } from "./api.js";

const REFRESH_MS = 60_000;

let state = { data: null, error: null, loading: false };
const listeners = new Set();
let timer = null;
let controller = null;

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

// fresh: true — оминути короткий кеш сервера (кнопка «Odśwież», після збереження посилань).
export async function refresh({ fresh = false } = {}) {
  controller?.abort();
  controller = new AbortController();
  setState({ loading: true });
  try {
    const data = await api(fresh ? "/api/sheet?fresh=1" : "/api/sheet", { signal: controller.signal });
    setState({ data, error: null, loading: false });
  } catch (error) {
    if (error.name === "AbortError") return;
    setState({ error, loading: false });
  }
}

const isVisible = () => document.visibilityState === "visible";

function onVisibilityChange() {
  if (isVisible()) refresh();
}

function start() {
  if (timer) return;
  timer = setInterval(() => isVisible() && refresh(), REFRESH_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function stop() {
  clearInterval(timer);
  timer = null;
  controller?.abort();
  state = { ...state, loading: false }; // скасований запит не повинен «зависнути» в стані завантаження
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

// Підписка: listener отримує стан одразу і після кожної зміни. Повертає функцію відписки.
export function subscribe(listener) {
  listeners.add(listener);
  listener(state);
  start();
  if (!state.data && !state.loading) refresh();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

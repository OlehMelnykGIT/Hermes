// Налаштування користувача в localStorage (мова, фільтри, сортування).
// Сховище буває недоступне (приватне вікно, заблоковані дані сайтів) — тоді просто
// повертаємо значення за замовчуванням і нічого не зберігаємо.

const PREFIX = "hermes.";

export function load(key, fallback) {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    /* сховище недоступне — не страшно */
  }
}

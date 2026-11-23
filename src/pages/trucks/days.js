// Робочі дні (кнопки «Zakończ dzień» / «Nowy tydzień») і статистика днів.
// Чисті функції без DOM, перевіряються тестами (tests/pages.test.js).
//
// days:  [{ id, nr, fromRow, toRow, open, closedAt }] — межі в номерах рядків аркуша Rozładunek.
//        id — унікальний ID дня (момент відкриття, yyyy-MM-ddTHH:mm:ss, час Варшави).
//        Останній елемент — поточний день (open: true); якщо в ньому ще нема WAB, toRow < fromRow.
//        Межі беруться ЛИШЕ звідси — не з кольорів і не з ліній у таблиці.
// stats: [{ dayId, day, druk, lu }], найновіші першими.
//        Зіставлення з днем — ТІЛЬКИ за stats.dayId === days.id (жодних правил за датою).
//        Старі записи мають dayId лише з датою (2026-11-23) — з днями не збігаються, ігноруються.

const inDay = (item, day) => item.row >= day.fromRow && item.row <= day.toRow;

// Залишки після очищення аркуша: закритий день, на рядки якого вже «зайшов» пізніший день
// (таблицю почали з початку, а старий запис лишився в аркуші Dni). Рядки належать пізнішому дню.
const isStale = (day, index, days) => days.slice(index + 1).some((later) => later.fromRow <= day.toRow);

// WAB, розкладені по днях:
//   current — поточний (відкритий) день або null;
//   closed  — закриті дні, найновіші першими;
//   outside — рядки, що не потрапили в жоден день.
// Без days (старий Api.gs) — null: сторінка показує всі WAB, як раніше.
export function groupByDays(items, allDays) {
  if (!Array.isArray(allDays) || allDays.length === 0) return null;
  const days = allDays.filter((day, index) => !isStale(day, index, allDays));
  const last = days[days.length - 1];
  const currentDay = last.open ? last : null;
  const closedDays = days.filter((day) => day !== currentDay);

  return {
    current: currentDay ? { day: currentDay, items: items.filter((item) => inDay(item, currentDay)) } : null,
    closed: closedDays
      .map((day) => ({ day, items: items.filter((item) => inDay(item, day)) }))
      .reverse(),
    outside: items.filter((item) => !days.some((day) => inDay(item, day))),
  };
}

// Закриті дні, які варто показувати: є WAB або статистика.
// Після очищення аркуша (новий тиждень) Api.gs ще може віддавати старі дні —
// їхні рядки вже порожні, тож такі дні нічого не показують і ховаються.
export function visibleClosedDays(groups, stats) {
  return groups.closed.filter(({ day, items }) => items.length > 0 || statsForDay(stats, day) !== null);
}

// Статистика конкретного дня: запис, у якого dayId === day.id, або null.
export function statsForDay(stats, day) {
  if (!Array.isArray(stats) || !day?.id) return null;
  return stats.find((entry) => entry.dayId === day.id) || null;
}

// Статистика поточного дня для карток. null — Api.gs ще не віддає stats (картки не показуються);
// якщо для поточного дня запису ще немає — нулі.
export function currentDayStats(stats, days) {
  if (!Array.isArray(stats)) return null;
  const current = Array.isArray(days) ? days.find((day) => day.open) : null;
  return statsForDay(stats, current) || { dayId: null, day: null, druk: 0, lu: 0 };
}

// Записи з повним dayId (момент відкриття) — останні n днів у хронологічному порядку
// (для графіка: старші ліворуч). Старі записи лише з датою не беруться.
const FULL_ID = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function recentStats(stats, n = 14) {
  if (!Array.isArray(stats)) return [];
  return stats.filter((entry) => FULL_ID.test(entry.dayId || "")).slice(0, n).reverse();
}

// «2026-11-24T06:02:00» → «24.11.2026 06:02» (час Варшави, як у таблиці — без перерахунку поясів).
export function formatSheetDateTime(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text || "");
  return match ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}` : "";
}

// «2026-11-24» або «2026-11-24T06:02:00» → «24.11»
export function formatShortDay(text) {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(text || "");
  return match ? `${match[2]}.${match[1]}` : "";
}

// «2026-11-24T06:02:00» → «24.11 06:02» (підказка на графіку: два дні можуть мати одну дату)
export function formatShortDayTime(text) {
  const match = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text || "");
  return match ? `${match[2]}.${match[1]} ${match[3]}:${match[4]}` : formatShortDay(text);
}

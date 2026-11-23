// Нотатки: сортування, пошук, дати. Чисті функції без DOM (tests/pages.test.js).
// Дані приходять з /api/sheet (поле notes) уже перевірені сервером.

export const NOTE_COLORS = ["yellow", "green", "blue", "pink", "gray"];
export const MAX_TITLE = 120;
export const MAX_TEXT = 10000;
export const MAX_NOTES = 300;

const time = (value) => (value ? Date.parse(value) || 0 : 0);

// Закріплені першими, далі найсвіжіші.
export function sortNotes(notes) {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || time(b.updated || b.created) - time(a.updated || a.created),
  );
}

// Пошук за заголовком і текстом: без різниці великих/малих літер і польських/українських діакритиків.
const fold = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");

export function filterNotes(notes, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return notes;
  return notes.filter((note) => {
    const haystack = fold(`${note.title}\n${note.text}`);
    return words.every((word) => haystack.includes(word));
  });
}

// Дата з Api.gs (ISO або «yyyy-MM-ddTHH:mm:ss») → «23.11.2026 14:05» за місцевим часом.
export function formatNoteDate(value) {
  const ms = time(value);
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const isEmptyNote = (note) => !note.title.trim() && !note.text.trim();

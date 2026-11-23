// /api/* і server/sheetApi.js: перевірка даних з таблиці, токени лише на сервері.
// fetch до Apps Script підміняється — справжня таблиця в тестах не використовується.

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { POST as saveLinksRoute } from "../api/links.js";
import { POST as saveNoteRoute } from "../api/notes.js";
import { resetCache, GET as sheetRoute } from "../api/sheet.js";
import { createSession } from "../server/session.js";
import {
  applyNoteChange,
  normalizeDays,
  normalizeNotes,
  normalizeLinks,
  normalizeStats,
  normalizeTeam,
  shortName,
  validateLinksInput,
} from "../server/sheetApi.js";

const SITE = "https://hermes.example";
const realFetch = globalThis.fetch;
let cookie;
let lastUpstream;

function mockUpstream(body) {
  globalThis.fetch = async (url, init = {}) => {
    lastUpstream = { url: String(url), ...init };
    return new Response(typeof body === "string" ? body : JSON.stringify(body));
  };
}

beforeEach(async () => {
  resetCache();
  Object.assign(process.env, {
    SITE_PASSWORD: "test-password",
    SESSION_SECRET: "s".repeat(40),
    SHEET_API_URL: "https://script.google.com/macros/s/TEST/exec",
    SHEET_API_TOKEN: "READ-TOKEN",
    SHEET_API_WRITE_TOKEN: "WRITE-TOKEN",
  });
  cookie = `hermes_session=${await createSession(process.env)}`;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Zespół: лише дозволені дані", () => {
  test("зайві колонки відкидаються, прізвище скорочується", () => {
    const team = normalizeTeam([
      { osoba: "Oleh Melnyk", zmiana: "II", proces: "Stol", przerwa: "I przerwa", udt: true, uwagi: "B4", telefon: "+48 600" },
    ]);
    assert.deepEqual(team, [
      { person: "Oleh M.", shift: "II", process: "Stol", break: "I przerwa", udt: true, notes: "B4" },
    ]);
  });

  test("рядки без імені пропускаються; немає поля — undefined", () => {
    assert.deepEqual(normalizeTeam([{ osoba: "  " }]), []);
    assert.equal(normalizeTeam(undefined), undefined);
  });

  test("shortName", () => {
    assert.equal(shortName("Anna"), "Anna");
    assert.equal(shortName("anna kowalska"), "anna K.");
  });
});

describe("Linki: лише https", () => {
  test("з таблиці показуються тільки https-посилання з назвою", () => {
    const links = normalizeLinks([
      { name: "OK", url: "https://example.com/a" },
      { name: "JS", url: "javascript:alert(1)" },
      { name: "", url: "https://example.com" },
      { name: "HTTP", url: "http://example.com" },
    ]);
    assert.deepEqual(links, [{ name: "OK", url: "https://example.com/a" }]);
  });

  test("форма «Edytuj» перевіряється перед записом", () => {
    assert.equal(validateLinksInput([{ name: "A", url: "http://x" }]).error, "invalid_links");
    assert.equal(validateLinksInput(Array(51).fill({ name: "a", url: "https://a" })).error, "too_many_links");
    assert.equal(validateLinksInput([{ name: "A", url: "https://a.example" }]).links.length, 1);
  });
});

describe("Дні і статистика: перевірка даних", () => {
  test("days: лише коректні записи", () => {
    const result = normalizeDays([
      { id: "2026-11-22T22:05:00", nr: 1, fromRow: 2, toRow: 9, open: false, closedAt: "2026-11-23T06:02:00" },
      { id: "bad", nr: 2, fromRow: 10, toRow: 9, open: true, closedAt: null, extra: "x" },
      { nr: "3", fromRow: 2, toRow: 3 },
      { nr: 4, fromRow: 1, toRow: 3 },
    ]);
    assert.deepEqual(result, [
      { id: "2026-11-22T22:05:00", nr: 1, fromRow: 2, toRow: 9, open: false, closedAt: "2026-11-23T06:02:00" },
      { id: null, nr: 2, fromRow: 10, toRow: 9, open: true, closedAt: null },
    ]);
    assert.equal(normalizeDays(undefined), undefined);
  });

  test("stats: формат дати, невід'ємні цілі, максимум 60", () => {
    const result = normalizeStats([
      { dayId: "2026-11-23T06:10:00", day: "2026-11-23", druk: 41, lu: "37" },
      { day: "23.11.2026", druk: 1, lu: 1 },
      { dayId: "2026-11-22", day: "2026-11-22", druk: -5, lu: null },
    ]);
    assert.deepEqual(result, [
      { dayId: "2026-11-23T06:10:00", day: "2026-11-23", druk: 41, lu: 37 },
      { dayId: "2026-11-22", day: "2026-11-22", druk: 0, lu: 0 },
    ]);
    assert.equal(normalizeStats(Array(80).fill({ day: "2026-11-23", druk: 1, lu: 1 })).length, 60);
  });
});

describe("GET /api/sheet", () => {
  test("потрібна сесія", async () => {
    assert.equal((await sheetRoute(new Request(`${SITE}/api/sheet`))).status, 401);
  });

  test("токен читання — лише в запиті до Google, не у відповіді", async () => {
    mockUpstream({ updated: "x", fbo: [["Wab"]], team: [{ osoba: "Jan Kowalski", adres: "ul. X" }], links: [] });
    const response = await sheetRoute(new Request(`${SITE}/api/sheet`, { headers: { cookie } }));
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(lastUpstream.url, /token=READ-TOKEN/);
    assert.doesNotMatch(text, /READ-TOKEN|ul\. X/);
    assert.equal(JSON.parse(text).team[0].person, "Jan K.");
  });

  test("помилки Google перекладаються в зрозумілі коди", async () => {
    mockUpstream({ error: "unauthorized" });
    const bad = await sheetRoute(new Request(`${SITE}/api/sheet`, { headers: { cookie } }));
    assert.deepEqual([bad.status, (await bad.json()).error], [502, "upstream_unauthorized"]);
    mockUpstream("<html>");
    assert.equal((await sheetRoute(new Request(`${SITE}/api/sheet`, { headers: { cookie } }))).status, 502);
  });

  test("кеш: повторний запит не йде в Google, ?fresh=1 — іде", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ updated: String(calls), fbo: [] }));
    };
    const get = (query = "") => sheetRoute(new Request(`${SITE}/api/sheet${query}`, { headers: { cookie } }));
    assert.equal((await (await get()).json()).updated, "1");
    assert.equal((await (await get()).json()).updated, "1"); // з кешу
    assert.equal(calls, 1);
    assert.equal((await (await get("?fresh=1")).json()).updated, "2");
    assert.equal(calls, 2);
    // Одночасні запити чекають одну відповідь
    resetCache();
    await Promise.all([get(), get(), get()]);
    assert.equal(calls, 3);
  });

  test("кеш не обходить перевірку сесії", async () => {
    mockUpstream({ updated: "x", fbo: [] });
    await sheetRoute(new Request(`${SITE}/api/sheet`, { headers: { cookie } }));
    assert.equal((await sheetRoute(new Request(`${SITE}/api/sheet`))).status, 401);
  });

  test("адреса Apps Script має бути на script.google.com", async () => {
    process.env.SHEET_API_URL = "https://evil.example/exec";
    const response = await sheetRoute(new Request(`${SITE}/api/sheet`, { headers: { cookie } }));
    assert.equal(response.status, 503);
  });
});

describe("POST /api/links", () => {
  const save = (body, headers = {}) =>
    saveLinksRoute(
      new Request(`${SITE}/api/links`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { cookie, origin: SITE, "content-type": "application/json", ...headers },
      }),
    );

  test("запис іде з токеном запису в тілі, не в адресі", async () => {
    mockUpstream({ ok: true, count: 1 });
    const response = await save({ links: [{ name: "A", url: "https://a.example" }] });
    assert.deepEqual(await response.json(), { ok: true, count: 1 });
    const sent = JSON.parse(lastUpstream.body);
    assert.equal(sent.token, "WRITE-TOKEN");
    assert.equal(sent.action, "saveLinks");
    assert.equal(lastUpstream.redirect, "follow"); // Apps Script відповідає 302
    assert.doesNotMatch(lastUpstream.url, /TOKEN/);
  });

  test("захист: чужий сайт, без Origin, не JSON, без сесії, погані дані", async () => {
    assert.equal((await save({ links: [] }, { origin: "https://evil.example" })).status, 403);
    const noOrigin = new Request(`${SITE}/api/links`, {
      method: "POST",
      body: "{}",
      headers: { cookie, "content-type": "application/json" },
    });
    assert.equal((await saveLinksRoute(noOrigin)).status, 403);
    assert.equal((await save({ links: [] }, { "content-type": "text/plain" })).status, 415);
    assert.equal((await save({ links: [] }, { cookie: "" })).status, 401);
    assert.equal((await save({ links: [{ name: "A", url: "ftp://a" }] })).status, 400);
  });

  test("без токена запису — 503", async () => {
    delete process.env.SHEET_API_WRITE_TOKEN;
    assert.equal((await save({ links: [] })).status, 503);
  });
});

describe("Notatki: перевірка даних", () => {
  const note = (extra = {}) => ({ id: "n1", title: "A", text: "x", color: "blue", pinned: false, ...extra });

  test("з таблиці: закріплені першими, далі найсвіжіші; порожні й без id відкидаються; чужий колір → жовтий", () => {
    const notes = normalizeNotes([
      { id: "old", title: "Old", text: "", color: "blue", pinned: false, updated: "2026-11-20T10:00:00" },
      { id: "new", title: "New", text: "", color: "red", pinned: "FALSE", updated: "2026-11-23T10:00:00" },
      { id: "pin", title: "", text: "Pinned", color: "pink", pinned: true, updated: "2026-11-01T10:00:00" },
      { id: "", title: "No id", text: "" },
      { id: "empty", title: " ", text: "  " },
    ]);
    assert.deepEqual(notes.map((n) => n.id), ["pin", "new", "old"]);
    assert.equal(notes[1].color, "yellow");
    assert.equal(notes[1].pinned, false);
    assert.equal(normalizeNotes(undefined), undefined);
  });

  test("зміна застосовується до свіжого списку і не чіпає інші нотатки", () => {
    const current = [note(), note({ id: "n2", title: "B" })];
    const edited = applyNoteChange(current, { op: "save", note: note({ title: "A2" }) }).notes;
    assert.deepEqual(edited.map((n) => n.title), ["A2", "B"]);
    const added = applyNoteChange(current, { op: "save", note: note({ id: "", title: "C" }) }).notes;
    assert.equal(added.length, 3);
    assert.equal(added[2].id, "");
    assert.deepEqual(applyNoteChange(current, { op: "delete", id: "n1" }).notes.map((n) => n.id), ["n2"]);
  });

  test("ліміти й помилки", () => {
    assert.equal(applyNoteChange([], { op: "save", note: note({ id: "", title: "x".repeat(121) }) }).error, "note_too_long");
    assert.equal(applyNoteChange([], { op: "save", note: note({ id: "", text: "x".repeat(10001) }) }).error, "note_too_long");
    assert.equal(applyNoteChange([], { op: "save", note: note({ id: "", title: "", text: "  " }) }).error, "note_empty");
    assert.equal(applyNoteChange([], { op: "save", note: note({ color: "red" }) }).error, "invalid_note");
    assert.equal(applyNoteChange([], { op: "save", note: note() }).error, "note_not_found");
    assert.equal(applyNoteChange([], { op: "delete", id: "n1" }).error, "note_not_found");
    assert.equal(applyNoteChange([], { op: "drop" }).error, "invalid_note");
    const full = Array.from({ length: 300 }, (_, i) => note({ id: `n${i}` }));
    assert.equal(applyNoteChange(full, { op: "save", note: note({ id: "" }) }).error, "too_many_notes");
  });
});

describe("POST /api/notes", () => {
  let calls;
  const sheetNotes = [
    { id: "n1", title: "Mine", text: "a", color: "yellow", pinned: false, created: "2026-11-23T08:00:00", updated: "2026-11-23T08:00:00" },
    { id: "n2", title: "Someone else's", text: "b", color: "green", pinned: true, created: "2026-11-23T09:00:00", updated: "2026-11-23T09:00:00" },
  ];

  // GET → список з таблиці, POST → Api.gs повертає збережений список з виданими id.
  function mockSheet() {
    calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), ...init });
      if ((init.method || "GET") === "GET") return new Response(JSON.stringify({ notes: sheetNotes }));
      const body = JSON.parse(init.body);
      const notes = body.notes.map((n, i) => ({ ...n, id: n.id || `new-${i}`, updated: "2026-11-23T12:00:00" }));
      return new Response(JSON.stringify({ ok: true, count: notes.length, notes }));
    };
  }

  const save = (body, headers = {}) =>
    saveNoteRoute(
      new Request(`${SITE}/api/notes`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { origin: SITE, cookie, "content-type": "application/json", ...headers },
      }),
    );

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("нова нотатка додається до свіжого списку; токен запису в тілі, не в адресі", async () => {
    mockSheet();
    const response = await save({ op: "save", note: { id: "", title: "Nowa", text: "t", color: "pink", pinned: false } });
    assert.equal(response.status, 200);
    const result = await response.json();
    const post = calls.find((c) => c.method === "POST");
    const sent = JSON.parse(post.body);
    assert.equal(sent.action, "saveNotes");
    assert.equal(sent.token, "WRITE-TOKEN");
    assert.doesNotMatch(post.url, /WRITE-TOKEN/);
    assert.deepEqual(sent.notes.map((n) => n.title), ["Someone else's", "Mine", "Nowa"]); // чужі нотатки збережено
    assert.equal(result.count, 3);
    assert.ok(result.notes.some((n) => n.id === "new-2" && n.title === "Nowa"));
    assert.equal(result.notes[0].pinned, true); // закріплена першою
  });

  test("видалення і нотатка, яку вже видалив хтось інший", async () => {
    mockSheet();
    const removed = await (await save({ op: "delete", id: "n1" })).json();
    assert.deepEqual(removed.notes.map((n) => n.id), ["n2"]);
    mockSheet();
    assert.equal((await save({ op: "delete", id: "gone" })).status, 409);
  });

  test("захист і перевірка до звернення в таблицю", async () => {
    mockSheet();
    const valid = { op: "save", note: { id: "", title: "A", text: "", color: "blue", pinned: false } };
    assert.equal((await save(valid, { origin: "https://evil.example" })).status, 403);
    assert.equal((await save(valid, { cookie: "" })).status, 401);
    assert.equal((await save(valid, { "content-type": "text/plain" })).status, 415);
    assert.equal((await save({ op: "save", note: { ...valid.note, title: "", text: "" } })).status, 400);
    assert.equal(calls.length, 0); // погані запити не дійшли до Google
  });
});


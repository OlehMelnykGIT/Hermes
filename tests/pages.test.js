// Логіка сторінок без DOM: «Fury / Bramy», «Zespół» і безпечний HTML.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { html, raw } from "../src/lib/html.js";
import * as team from "../src/pages/team/model.js";
import * as days from "../src/pages/trucks/days.js";
import * as ncg from "../src/pages/trucks/ncg.js";
import * as trucks from "../src/pages/trucks/model.js";

describe("html``", () => {
  test("дані екрануються, raw() — ні", () => {
    const value = '<img src=x onerror="alert(1)">';
    assert.equal(html`<p>${value}</p>`.toString(), "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
    assert.equal(html`<p>${raw("<b>ok</b>")}</p>`.toString(), "<p><b>ok</b></p>");
  });

  test("масиви склеюються, false/null не виводяться", () => {
    assert.equal(html`<ul>${["a", "b"].map((x) => html`<li>${x}</li>`)}</ul>`.toString(), "<ul><li>a</li><li>b</li></ul>");
    assert.equal(html`${false}${null}${undefined}${0}`.toString(), "0");
  });
});

describe("Fury / Bramy", () => {
  const rows = [
    ["Wab ", "Brama", "Last Data ", "Priorytet", "Status", "Bufor", "Final Status", "Info"],
    ["240398", "", "23.11.2026 04:30", "", "Plac, Rozładowane, Advice, Master Data, Stol", "", "", ""],
    ["431318", "12", "23.11.2026 05:53", "", "", "B4", "", "test"],
    ["419277", "", "23.11.2026 09:00", "", "Plac, Rozładowane", "", "", ""],
    ["", "", "", "", "", "", "", ""],
  ];
  const items = trucks.normalizeTable(rows);
  const now = new Date(2026, 10, 23, 6, 0);

  test("рядки з заголовками, порожні пропускаються", () => {
    assert.equal(items.length, 3);
    assert.equal(items[1].gate, "12");
    assert.equal(items[1].buffer, "B4");
  });

  test("накопичувальний статус → найдальший крок", () => {
    assert.equal(items[0].status, "stowed");
    assert.equal(items[1].status, null);
    assert.equal(items[2].status, "unloaded");
    const { done } = trucks.parseStatus("Zawieszone, Advice");
    assert.equal(trucks.currentStatus(done), "suspended");
  });

  test("Pozostawione inną zmianę: кроки до першого вписаного — від попередньої зміни", () => {
    const row = (status) => trucks.normalizeTable([rows[0], ["1", "", "23.11.2026 05:00", "", status, "", "", ""]])[0];
    const late = new Date(2026, 10, 24, 12, 0);

    const stol = row("Pozostawione inną zmianę, Master Data, Stol");
    assert.equal(stol.status, "stowed");
    assert.equal(stol.fromOtherShift, true);
    assert.deepEqual([...stol.inherited], ["unloaded", "advice"]); // Plac — не етап роботи
    assert.equal(trucks.deadlineInfo(stol, late).kind, "done"); // Advice зробила попередня зміна
    assert.equal(trucks.nextStep(stol), null);

    const md = row("Pozostawione inną zmianę, Master Data");
    assert.equal(md.status, "masterdata");
    assert.equal(trucks.nextStep(md), "stowed");

    // Лише позначка, без кроків: ми ще нічого не зробили, що зроблено раніше — невідомо
    const onlyMark = row("Pozostawione inną zmianę");
    assert.equal(onlyMark.status, "left_shift");
    assert.equal(onlyMark.inherited.size, 0);

    // Без позначки нічого не домислюємо
    assert.equal(row("Master Data").inherited.size, 0);

    // Фільтр «Pozostawione…» показує всі WAB від попередньої зміни
    const all = [stol, md, onlyMark, row("Plac")];
    assert.equal(all.filter((i) => trucks.matchesFilter(i, "left_shift")).length, 3);
    assert.equal(trucks.summarize(all).counts.left_shift, 3);
  });

  test("чипи: Plac — скільки чекає зараз; етапи — воронка (як у таблиці: Advice 5 з 6)", () => {
    const live = trucks.normalizeTable([
      rows[0],
      ["1", "", "23.11.2026 05:00", "", "Rozładowane, Advice, Master Data", "", " WAB do odstawienia ", ""],
      ["2", "", "23.11.2026 05:00", "", "Rozładowane, Advice, Master Data", "", " WAB do odstawienia ", ""],
      ["3", "", "23.11.2026 05:00", "", "Rozładowane, Advice, Master Data", "", "W trakcie", ""],
      ["4", "", "23.11.2026 05:00", "", "Pozostawione inną zmianę, Master Data, Stol", "", " WAB do odstawienia ", ""],
      ["5", "", "23.11.2026 05:00", "", "Rozładowane, Advice, Master Data, Stol", "", "W trakcie", ""],
      ["6", "", "23.11.2026 05:00", "", "Plac", "", "W trakcie", ""],
    ]);
    const { counts, toAccept } = trucks.summarize(live);
    assert.deepEqual(
      [counts.yard, counts.unloaded, counts.advice, counts.masterdata, counts.stowed],
      [1, 5, 5, 5, 2],
    );
    assert.equal(counts.closed, 3);
    assert.equal(counts.left_shift, 1);
    assert.equal(toAccept, 1);
    assert.equal(live.filter((i) => trucks.matchesFilter(i, "advice")).length, 5);
  });

  test("WAB do odstawienia: закрито — прийнято й термін виконано навіть без статусу", () => {
    const late = new Date(2026, 10, 24, 12, 0);
    const [item] = trucks.normalizeTable([rows[0], ["7", "", "23.11.2026 05:00", "", "", "", " WAB do odstawienia ", ""]]);
    assert.equal(item.closed, true);
    assert.equal(item.status, "advice");
    assert.equal(trucks.deadlineInfo(item, late).kind, "done");
    assert.equal(trucks.isClosedFinalStatus("Do odstawienia "), true); // варіант з NCG
    assert.equal(trucks.isClosedFinalStatus("W trakcie"), false);
  });

  test("NO ADVICE розпізнається і переважає над кроками", () => {
    const { done, unknown } = trucks.parseStatus("Plac, Rozładowane, NO ADVICE");
    assert.deepEqual(unknown, []);
    assert.equal(trucks.currentStatus(done), "no_advice");
    assert.equal(trucks.currentStatus(trucks.parseStatus("no advice").done), "no_advice");
  });

  test("Plac — очікування на парковці, а не етап роботи", () => {
    const [waiting] = trucks.normalizeTable([rows[0], ["8", "", "23.11.2026 05:00", "", "Plac", "", "", ""]]);
    assert.equal(waiting.status, "yard");
    assert.equal(trucks.reachedIndex(waiting), -1);
    assert.equal(trucks.nextStep(waiting), "unloaded");
    assert.equal(trucks.matchesFilter(waiting, "yard"), true);
    // Після розвантаження WAB уже не на парковці
    assert.equal(trucks.matchesFilter(items[2], "yard"), false);
  });

  test("невідомі значення статусу зберігаються як є", () => {
    assert.deepEqual(trucks.parseStatus("Advice, Cośtam").unknown, ["Cośtam"]);
  });

  test("відлік до дедлайну", () => {
    assert.deepEqual(trucks.deadlineInfo(items[0], now), { minutes: 0, kind: "done" });
    assert.equal(trucks.deadlineInfo(items[1], now).kind, "overdue");
    assert.deepEqual(trucks.deadlineInfo(items[2], now), { minutes: 180, kind: "ok" });
    assert.equal(trucks.deadlineInfo(items[2], new Date(2026, 10, 23, 8, 0)).kind, "soon");
  });

  test("термін 24 год виконано з моменту Advice (і пізніших кроків)", () => {
    const late = new Date(2026, 10, 24, 12, 0); // через добу після дедлайнів
    const row = (status) => trucks.normalizeTable([rows[0], ["1", "", "23.11.2026 05:00", "", status, "", "", ""]])[0];
    assert.equal(trucks.deadlineInfo(row("Plac, Rozładowane, Advice"), late).kind, "done");
    assert.equal(trucks.deadlineInfo(row("Plac, Rozładowane, Advice, Master Data"), late).kind, "done");
    assert.equal(trucks.deadlineInfo(row("Plac, Rozładowane"), late).kind, "overdue");
    // NO ADVICE — прийняти не вдалося, термін далі спливає
    assert.equal(trucks.deadlineInfo(row("Plac, Rozładowane, NO ADVICE"), late).kind, "overdue");
    assert.equal(trucks.deadlineInfo(row("Plac, Rozładowane, Advice, NO ADVICE"), late).kind, "overdue");
  });

  test("найближчий дедлайн і зведення", () => {
    assert.equal(trucks.nextDeadline(items, now).wab, "419277");
    const summary = trucks.summarize(items, now);
    assert.equal(summary.total, 3);
    assert.equal(summary.done, 1);
    assert.equal(summary.open, 2);
    assert.equal(summary.toAccept, 2);
    assert.equal(summary.overdue, 1);
  });

  test("сортування за дедлайном і колір дня", () => {
    assert.deepEqual(trucks.sortItems(items, "deadline").map((i) => i.wab), ["240398", "431318", "419277"]);
    const colored = trucks.normalizeTable(rows.slice(0, 2), [[], ["#ffffff", "#d9ead3"]]);
    assert.equal(colored[0].color, "#d9ead3");
  });

  test("EURO з I1", () => {
    assert.equal(trucks.parseEuroCount("EURO\n13"), 13);
  });
});

describe("Zespół", () => {
  const people = team.normalizePeople([
    { person: "Anna K.", shift: "II", process: "Stol", break: "I przerwa", udt: true },
    { person: "Bartek B.", shift: "II", process: "Stol", break: "II przerwa", udt: false },
    { person: "Celina C.", shift: "2", process: "Rozładunek", break: "I przerwa", udt: false },
    { person: "Darek D.", shift: "I", process: "Sprzątanie", break: "", udt: false },
    { person: "Ewa E.", shift: "II", process: "replen", break: "II", udt: true },
  ]);

  test("ключі процесу, перерви і зміни", () => {
    assert.equal(people[2].shiftKey, "II");
    assert.equal(people[3].processKey, "other");
    assert.equal(people[4].processKey, "replenishment");
    assert.equal(people[4].breakKey, "break2");
  });

  test("фільтри зміни і UDT", () => {
    assert.equal(team.filterPeople(people, { shift: "II" }).length, 4);
    assert.equal(team.filterPeople(people, { udtOnly: true }).length, 2);
  });

  test("групи у сталому порядку, «Inne» в кінці", () => {
    assert.deepEqual(team.groupByProcess(people).map((g) => g.key), ["unloading", "stowing", "replenishment", "other"]);
  });

  test("розподіл перерв і баланс груп", () => {
    const plan = team.breakPlan(team.filterPeople(people, { shift: "II" }));
    assert.deepEqual(plan.totals, { break1: 2, break2: 2, none: 0 });
    assert.equal(plan.difference, 0);
  });

  test("ініціали для аватара", () => {
    assert.equal(team.initials("Oleh M."), "OM");
  });
});

describe("Робочі дні і статистика", () => {
  const header = ["Wab", "Brama", "Last Data", "Priorytet", "Status", "Bufor", "Final Status", "Info"];
  const wab = (nr) => [String(nr), "", "23.11.2026 10:00", "", "Plac", "", "", ""];
  // Рядки аркуша 2–6: день 1 = рядки 2–3, день 2 = рядки 4–6 (поточний)
  const items = trucks.normalizeTable([header, wab(1), wab(2), wab(3), wab(4), wab(5)]);
  const dayList = [
    { id: "2026-11-22T22:05:00", nr: 1, fromRow: 2, toRow: 3, open: false, closedAt: "2026-11-23T06:02:00" },
    { id: "2026-11-23T06:10:00", nr: 2, fromRow: 4, toRow: 6, open: true, closedAt: null },
  ];

  test("WAB розкладаються по днях за номерами рядків", () => {
    const groups = days.groupByDays(items, dayList);
    assert.deepEqual(groups.current.items.map((i) => i.wab), ["3", "4", "5"]);
    assert.deepEqual(groups.closed.map((g) => g.day.nr), [1]);
    assert.deepEqual(groups.closed[0].items.map((i) => i.wab), ["1", "2"]);
    assert.equal(groups.outside.length, 0);
  });

  test("порожній поточний день (toRow < fromRow) і старий Api.gs без days", () => {
    const empty = [...dayList.slice(0, 1), { nr: 2, fromRow: 4, toRow: 3, open: true, closedAt: null }];
    const groups = days.groupByDays(items.slice(0, 2), empty);
    assert.equal(groups.current.items.length, 0);
    assert.equal(days.groupByDays(items, undefined), null);
  });

  test("статистика зіставляється з днем лише за dayId === id", () => {
    const stats = [
      { dayId: "2026-11-23T06:10:00", day: "2026-11-23", druk: 19, lu: 18 },
      { dayId: "2026-11-22T22:05:00", day: "2026-11-22", druk: 16, lu: 69 },
      { dayId: "2026-11-23", day: "2026-11-23", druk: 2, lu: 2 }, // старий запис лише з датою
    ];
    assert.equal(days.currentDayStats(stats, dayList).druk, 19);
    assert.equal(days.statsForDay(stats, dayList[0]).druk, 16);
    // Два дні, відкриті в одну дату, не плутаються
    const sameDate = [
      { ...dayList[0], id: "2026-11-23T00:30:00" },
      { ...dayList[1], id: "2026-11-23T08:02:00" },
    ];
    assert.deepEqual(days.currentDayStats(stats, sameDate), { dayId: null, day: null, druk: 0, lu: 0 });
    // День без id (старий Api.gs) — без збігів, жодних правил за датою
    assert.equal(days.statsForDay(stats, { ...dayList[1], id: null }), null);
    assert.equal(days.currentDayStats(undefined, dayList), null);
  });

  test("графік: лише записи з повним dayId, у хронологічному порядку", () => {
    const stats = [
      { dayId: "2026-11-23T06:10:00", day: "2026-11-23", druk: 1, lu: 1 },
      { dayId: "2026-11-22T22:05:00", day: "2026-11-22", druk: 2, lu: 2 },
      { dayId: "2026-11-21", day: "2026-11-21", druk: 3, lu: 3 },
    ];
    assert.deepEqual(days.recentStats(stats).map((s) => s.dayId), ["2026-11-22T22:05:00", "2026-11-23T06:10:00"]);
  });

  test("формати дат", () => {
    assert.equal(days.formatShortDayTime("2026-11-24T06:02:00"), "24.11 06:02");
    assert.equal(days.formatSheetDateTime("2026-11-24T06:02:00"), "24.11.2026 06:02");
    assert.equal(days.formatShortDay("2026-11-24"), "24.11");
  });
});

describe("NCG", () => {
  // Колонки навмисно не в тому порядку, що в аркуші: шукаються за назвами.
  const rows = [
    ["Typ", "Brama", "Data ", "Status", "Palety", "Bufor", "Puste palety", "Final Status", "Info", "Do LU"],
    ["Rozładunek", "120", "22.11.2026 12:00", "Plac, Rozładowano", "32", "Bufor Hera", "32", "Przyjęte", "N5", "FALSE"],
    ["Przyjęcie", "", "23.11.2026 08:00", "", "18", "Bufor Zeus", "", "Stol", "", "TRUE"],
    [" przyjęcie ", "", "23.11.2026 10:00", "", "20", "18", "0", "Cośtam", "", "true"],
    ["Rozładunek", "121", "23.11.2026 14:00", "", "", "21", "", "Rozładowano", "", ""],
    ["", "", "", "", "", "", "", "", "", ""],
  ];
  const { items, columns } = ncg.normalizeNcg(rows);

  test("колонки за назвами, порожні рядки пропускаються", () => {
    assert.equal(items.length, 4);
    assert.equal(columns.has("lu"), true);
    assert.deepEqual([items[0].gate, items[0].buffer, items[0].pallets], ["120", "Bufor Hera", 32]);
    assert.equal(ncg.normalizeNcg([["Typ", "Palety"]]).columns.has("status"), false);
  });

  test("тип і статуси → ключі, невідомий статус лишається текстом", () => {
    assert.deepEqual(items.map((i) => i.type), ["unloading", "receipt", "receipt", "unloading"]);
    assert.equal(items[0].status.key, "unloaded"); // останній статус у клітинці
    assert.equal(items[0].finalStatus.key, "accepted");
    assert.equal(items[1].finalStatus.key, "stowed");
    assert.deepEqual(items[2].finalStatus, { key: null, text: "Cośtam" });
  });

  test("Do LU: лише TRUE означає «передано»", () => {
    assert.deepEqual(items.map((i) => i.passedToLu), [false, true, true, false]);
  });

  test("підсумки окремо для Rozładunek і Przyjęcie; порожні Puste palety — без обміну", () => {
    const summary = ncg.summarizeNcg(items);
    assert.equal(summary.deliveries, 4);
    assert.deepEqual(summary.byType.unloading, { deliveries: 2, pallets: 32 });
    assert.deepEqual(summary.byType.receipt, { deliveries: 2, pallets: 38 });
    assert.equal(summary.emptyPallets, 32);
    assert.equal(summary.exchanges, 2); // «32» і «0»
    assert.equal(summary.notInLu, 2);
  });

  test("без поля ncg або з порожнім аркушем — нічого не ламається", () => {
    assert.deepEqual(ncg.normalizeNcg(undefined).items, []);
    assert.deepEqual(ncg.normalizeNcg([]).items, []);
  });
});

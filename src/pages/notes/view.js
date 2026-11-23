// Сторінка «Notatki»: кольорові картки з таблиці, пошук, створення й редагування у вікні.
//
// Дані — поле notes у /api/sheet. Запис іде через /api/notes по одній нотатці
// (сервер зливає зміну зі свіжим списком з таблиці, тож чужі зміни не затираються).
// Редагувати можна, лише якщо на сервері є токен запису (config.canEditNotes).
//
// Сторінка складається з незмінного каркаса (пошук, вікно редагування) і частин,
// які перемальовуються при оновленні даних: шапка з індикатором і сітка карток.
// Так оновлення раз на хвилину не збиває курсор у пошуку і не закриває відкрите вікно.

import { t } from "../../i18n/index.js";
import { api, errorMessage, isSilentError } from "../../lib/api.js";
import { configReady } from "../../lib/config.js";
import { html } from "../../lib/html.js";
import { refresh, setNotes, subscribe } from "../../lib/sheet.js";
import { emptyState, errorBox, icon, liveBadge, pageHead, skeleton, updateTimeAgo } from "../../lib/ui.js";
import { workspaceTabs } from "../workspaceTabs.js";
import { MAX_NOTES, MAX_TEXT, MAX_TITLE, NOTE_COLORS, filterNotes, formatNoteDate, isEmptyNote, sortNotes } from "./model.js";

// ===================== Розмітка =====================

function noteCard(note, canEdit) {
  const changed = formatNoteDate(note.updated || note.created);
  return html`<article class="note-card note--${note.color} ${note.pinned ? "note-card--pinned" : ""}">
    <button type="button" class="note-open" data-open="${note.id}" aria-label="${note.title || t("notes.untitled")}"></button>
    <header class="note-head">
      <h3 class="${note.title ? "" : "muted"}">${note.title || t("notes.untitled")}</h3>
      ${canEdit
        ? html`<button type="button" class="note-pin" data-pin="${note.id}" aria-pressed="${note.pinned}"
            title="${note.pinned ? t("notes.unpin") : t("notes.pin")}" aria-label="${note.pinned ? t("notes.unpin") : t("notes.pin")}">
            ${icon("pushpin")}</button>`
        : note.pinned && html`<span class="note-pin note-pin--static" title="${t("notes.pinned")}">${icon("pushpin")}</span>`}
    </header>
    ${note.text && html`<p class="note-text">${note.text}</p>`}
    ${changed && html`<footer class="note-foot">${t("notes.changed", { date: changed })}</footer>`}
  </article>`;
}

function colorPicker(selected, disabled) {
  return html`<fieldset class="note-colors" ${disabled ? html`disabled` : ""}>
    <legend class="sr-only">${t("notes.color")}</legend>
    ${NOTE_COLORS.map(
      (color) => html`<label class="swatch note--${color}" title="${t(`notes.colors.${color}`)}">
        <input type="radio" name="color" value="${color}" ${color === selected ? html`checked` : ""}>
        <span class="sr-only">${t(`notes.colors.${color}`)}</span>
      </label>`,
    )}
  </fieldset>`;
}

// note === null — нова нотатка. canEdit === false — лише перегляд.
function editorForm(note, canEdit) {
  const value = note || { id: "", title: "", text: "", color: "yellow", pinned: false };
  const changed = note && formatNoteDate(note.updated || note.created);
  return html`<form method="dialog" class="note-form note--${value.color}" data-form novalidate>
    <div class="note-form-head">
      <input name="title" class="note-title-input" maxlength="${MAX_TITLE}" value="${value.title}"
        placeholder="${t("notes.titlePlaceholder")}" aria-label="${t("notes.title")}" ${canEdit ? "" : html`readonly`}>
      ${canEdit &&
      html`<button type="button" class="note-pin" data-toggle-pin aria-pressed="${value.pinned}"
          title="${t("notes.pin")}" aria-label="${t("notes.pin")}">${icon("pushpin")}</button>`}
      <button type="button" class="icon-button" data-close title="${t("notes.close")}" aria-label="${t("notes.close")}">${icon("close")}</button>
    </div>
    <textarea name="text" class="note-text-input" maxlength="${MAX_TEXT}" placeholder="${t("notes.textPlaceholder")}"
      aria-label="${t("notes.text")}" ${canEdit ? "" : html`readonly`}>${value.text}</textarea>
    <div class="note-form-meta muted small">
      <span>${changed && t("notes.changed", { date: changed })}</span>
      ${canEdit && html`<span data-counter>${value.text.length} / ${MAX_TEXT}</span>`}
    </div>
    ${canEdit &&
    html`<p class="message message--error" data-form-error role="alert" hidden></p>
      <div class="note-form-actions" data-actions>
        ${colorPicker(value.color, false)}
        <span class="spacer"></span>
        ${note && html`<button type="button" class="button button--danger-ghost" data-delete>${icon("trash")}${t("notes.delete")}</button>`}
        <button type="button" class="button" data-close>${t("notes.cancel")}</button>
        <button type="submit" class="button button--primary" data-save>${t("notes.save")}</button>
      </div>
      <div class="note-confirm" data-confirm hidden>
        <span>${icon("alert")}${t("notes.confirmDelete")}</span>
        <span class="spacer"></span>
        <button type="button" class="button" data-confirm-no>${t("notes.cancel")}</button>
        <button type="button" class="button button--danger" data-confirm-yes>${t("notes.deleteYes")}</button>
      </div>`}
  </form>`;
}

// ===================== Сторінка =====================

export function mountNotes(container) {
  let sheet = { data: null, error: null, loading: false };
  let config = null;
  let query = "";
  let notice = null; // { text, isError }
  let noticeTimer = null;
  let editing = null; // { note | null, original } — що відкрито у вікні
  let busy = false;
  let alive = true;

  const canEdit = () => Boolean(config?.canEditNotes) && Array.isArray(sheet.data?.notes);
  const notes = () => (Array.isArray(sheet.data?.notes) ? sortNotes(sheet.data.notes) : null);
  const findNote = (id) => notes()?.find((note) => note.id === id) || null;

  container.innerHTML = html`
    ${workspaceTabs("notes")}
    <div data-head></div>
    <div class="notes-toolbar">
      <label class="notes-search">
        ${icon("search")}
        <input type="search" data-search placeholder="${t("notes.search")}" aria-label="${t("notes.search")}" autocomplete="off">
      </label>
      <span class="muted small" data-count></span>
    </div>
    <div data-notice></div>
    <div data-list></div>
    <dialog class="note-dialog" data-dialog aria-label="${t("notes.title")}"></dialog>`;

  const dialog = container.querySelector("[data-dialog]");

  // ---------- Перемальовування ----------

  function renderHead() {
    container.querySelector("[data-head]").innerHTML = pageHead({
      title: t("notes.pageTitle"),
      lead: t("notes.lead"),
      iconName: "notes",
      actions: html`${liveBadge(sheet)}${
        canEdit() && html`<button type="button" class="button button--primary" data-new>${icon("plus")}${t("notes.new")}</button>`
      }`,
    });
  }

  function renderList() {
    const all = notes();
    const list = container.querySelector("[data-list]");
    const count = container.querySelector("[data-count]");
    container.querySelector("[data-notice]").innerHTML = html`${
      notice && html`<p class="message ${notice.isError ? "message--error" : "message--ok"}" role="status">${notice.text}</p>`
    }${errorBox(sheet.error)}`;

    if (!sheet.data) {
      count.textContent = "";
      list.innerHTML = sheet.error ? "" : skeleton(3);
      return;
    }
    if (all === null) {
      count.textContent = "";
      list.innerHTML = emptyState(t("notes.unavailable"), "notes");
      return;
    }
    const shown = filterNotes(all, query);
    count.textContent = query ? t("notes.found", { n: shown.length, total: all.length }) : t("notes.count", { n: all.length });
    if (all.length === 0) {
      list.innerHTML = emptyState(canEdit() ? t("notes.emptyEditable") : t("notes.empty"), "notes");
    } else if (shown.length === 0) {
      list.innerHTML = emptyState(t("notes.noResults"), "search");
    } else {
      list.innerHTML = html`<div class="notes-grid">${shown.map((note) => noteCard(note, canEdit()))}</div>`;
    }
  }

  function render() {
    renderHead();
    renderList();
  }

  // ---------- Вікно редагування ----------

  const form = () => dialog.querySelector("[data-form]");

  function readForm() {
    const f = form();
    return {
      id: editing.note?.id || "",
      title: f.elements.title.value.trim(),
      text: f.elements.text.value.replace(/\s+$/, ""),
      color: f.querySelector('input[name="color"]:checked')?.value || "yellow",
      pinned: f.querySelector("[data-toggle-pin]")?.getAttribute("aria-pressed") === "true",
    };
  }

  const snapshot = (note) => JSON.stringify([note.title, note.text, note.color, note.pinned]);
  const isDirty = () => editing && canEdit() && snapshot(readForm()) !== editing.original;

  function openEditor(note) {
    const editable = canEdit();
    editing = { note, original: null };
    dialog.innerHTML = editorForm(note, editable);
    if (editable) editing.original = snapshot(readForm());
    dialog.showModal();
    const field = note ? form().elements.text : form().elements.title;
    if (editable) field.focus();
  }

  function closeEditor({ force = false } = {}) {
    if (!force && isDirty() && !window.confirm(t("notes.discard"))) return;
    editing = null;
    if (dialog.open) dialog.close();
    dialog.innerHTML = "";
  }

  function formError(text) {
    const box = dialog.querySelector("[data-form-error]");
    if (!box) return;
    box.hidden = !text;
    box.textContent = text || "";
  }

  function setBusy(value) {
    busy = value;
    dialog.querySelectorAll("button, input, textarea").forEach((el) => {
      if (!el.matches("[data-close]")) el.disabled = value;
    });
    const save = dialog.querySelector("[data-save]");
    if (save) save.textContent = value ? t("notes.saving") : t("notes.save");
  }

  // Одна зміна → сервер → актуальний список у сховище даних.
  async function send(change, doneText) {
    const result = await api("/api/notes", { method: "POST", body: change });
    if (!alive) return false;
    setNotes(result.notes);
    showNotice({ text: doneText });
    refresh({ fresh: true }); // оновити кеш сервера, щоб інші ПК теж побачили зміну
    return true;
  }

  async function saveFromForm() {
    if (busy) return;
    const note = readForm();
    if (isEmptyNote(note)) return formError(t("error.note_empty"));
    if (!note.id && (notes()?.length ?? 0) >= MAX_NOTES) return formError(t("error.too_many_notes"));
    formError(null);
    setBusy(true);
    try {
      if (await send({ op: "save", note }, note.id ? t("notes.saved") : t("notes.created"))) closeEditor({ force: true });
    } catch (error) {
      if (!alive || isSilentError(error)) return;
      formError(errorMessage(error));
    } finally {
      if (alive && editing) setBusy(false);
      busy = false;
    }
  }

  async function deleteFromForm() {
    if (busy || !editing?.note) return;
    setBusy(true);
    try {
      if (await send({ op: "delete", id: editing.note.id }, t("notes.deleted"))) closeEditor({ force: true });
    } catch (error) {
      if (!alive || isSilentError(error)) return;
      formError(errorMessage(error));
      showConfirm(false);
    } finally {
      if (alive && editing) setBusy(false);
      busy = false;
    }
  }

  function showConfirm(show) {
    dialog.querySelector("[data-actions]").hidden = show;
    dialog.querySelector("[data-confirm]").hidden = !show;
    if (show) dialog.querySelector("[data-confirm-no]").focus();
  }

  // Шпилька на картці — збереження без відкриття вікна.
  async function togglePin(id) {
    const note = findNote(id);
    if (!note || busy) return;
    busy = true;
    const { title, text, color, pinned } = note;
    try {
      await send({ op: "save", note: { id, title, text, color, pinned: !pinned } }, pinned ? t("notes.unpinned") : t("notes.pinnedDone"));
    } catch (error) {
      if (!alive || isSilentError(error)) return;
      showNotice({ text: errorMessage(error), isError: true });
    } finally {
      busy = false;
    }
  }

  // Повідомлення над сіткою; успішне зникає саме за кілька секунд.
  function showNotice(value) {
    notice = value;
    clearTimeout(noticeTimer);
    if (!value.isError) {
      noticeTimer = setTimeout(() => {
        notice = null;
        if (alive) renderList();
      }, 4000);
    }
    renderList();
  }

  // ---------- Події ----------

  function onClick(event) {
    const target = event.target;
    if (target.closest("[data-new]")) return openEditor(null);
    const pin = target.closest("[data-pin]");
    if (pin) return togglePin(pin.dataset.pin);
    const open = target.closest("[data-open]");
    if (open) {
      const note = findNote(open.dataset.open);
      if (note) openEditor(note);
    }
  }

  function onDialogClick(event) {
    const target = event.target;
    if (event.target === dialog) return closeEditor(); // клік по затемненню
    if (target.closest("[data-close]")) return closeEditor();
    if (target.closest("[data-delete]")) return showConfirm(true);
    if (target.closest("[data-confirm-no]")) return showConfirm(false);
    if (target.closest("[data-confirm-yes]")) return deleteFromForm();
    const pin = target.closest("[data-toggle-pin]");
    if (pin) pin.setAttribute("aria-pressed", String(pin.getAttribute("aria-pressed") !== "true"));
  }

  function onDialogInput(event) {
    const f = form();
    if (!f) return;
    if (event.target.name === "color") {
      f.className = `note-form note--${event.target.value}`;
    } else if (event.target.name === "text") {
      const counter = dialog.querySelector("[data-counter]");
      if (counter) counter.textContent = `${event.target.value.length} / ${MAX_TEXT}`;
    }
    formError(null);
  }

  function onDialogSubmit(event) {
    event.preventDefault();
    saveFromForm();
  }

  // Esc: не закривати мовчки, якщо є незбережені зміни.
  function onDialogCancel(event) {
    event.preventDefault();
    if (!busy) closeEditor();
  }

  function onSearch(event) {
    if (!event.target.matches("[data-search]")) return;
    query = event.target.value;
    renderList();
  }

  container.addEventListener("click", onClick);
  container.addEventListener("input", onSearch);
  dialog.addEventListener("click", onDialogClick);
  dialog.addEventListener("input", onDialogInput);
  dialog.addEventListener("change", onDialogInput);
  dialog.addEventListener("submit", onDialogSubmit);
  dialog.addEventListener("cancel", onDialogCancel);

  configReady.then((value) => {
    config = value;
    if (alive) render();
  });
  const tick = setInterval(() => updateTimeAgo(container), 30_000);
  const unsubscribe = subscribe((state) => {
    sheet = state;
    render();
  });

  return () => {
    alive = false;
    unsubscribe();
    clearInterval(tick);
    clearTimeout(noticeTimer);
    if (dialog.open) dialog.close();
    container.removeEventListener("click", onClick);
    container.removeEventListener("input", onSearch);
  };
}

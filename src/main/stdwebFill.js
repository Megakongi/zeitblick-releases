/**
 * Erzeugt das Füll-Skript für das eingebettete StdWeb-Fenster.
 *
 * StdWeb (IntraWeb) hat keine schreibbare API: Alle Eingabefelder sind
 * `DISABLED`-<input> in einem `<div id="EDIT…{tag}_FRAME">`. Bedient wird
 * ausschließlich durch:
 *   1. Klick auf das Feld-Frame  → öffnet den Zeit-Picker (#EDITZEIT_FRAME)
 *   2. Klick auf Stunde + Minute im Picker → setzt den Wert (OnSelect)
 *   3. Klick auf „Beenden" (#BTNZEITBEENDEN_FRAME) → schließt den Picker
 *
 * Wir spielen diese echten Klicks per dispatchEvent nach – so läuft die
 * IntraWeb-Logik (Session/TrackID/Server-Status) ganz normal mit.
 *
 * Tag-Index: 1 = Montag … 7 = Sonntag.
 *
 * @param {Array<{tag:number, von?:string, bis?:string, pause?:string}>} days
 *        Zeiten als "HH:MM".
 * @returns {string} JavaScript, das im StdWeb-Fenster ausgeführt wird und
 *          ein Report-Array zurückgibt.
 */
function buildStdWebFillScript(days) {
  const payload = JSON.stringify(days || []);
  return `(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const until = async (fn, timeout = 4000, step = 80) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) { try { if (fn()) return true; } catch (_) {} await sleep(step); }
      return false;
    };
    function clickEl(el) {
      if (!el) return false;
      const o = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
      el.dispatchEvent(new MouseEvent('click', o));
      return true;
    }

    // Voraussetzungen prüfen (Seiten-Globals von IntraWeb / jQuery)
    if (typeof window.$ !== 'function' || typeof window.executeAjaxEvent !== 'function'
        || typeof window.AddChangedControl !== 'function' || typeof window.EDITZEIT_FRAMEIWCL === 'undefined') {
      return [{ tag: 0, ok: false, log: ['Seiten-Funktionen fehlen – ist eine Woche geöffnet & eingeloggt? ($='
        + (typeof window.$) + ', executeAjaxEvent=' + (typeof window.executeAjaxEvent)
        + ', AddChangedControl=' + (typeof window.AddChangedControl)
        + ', EDITZEIT_FRAMEIWCL=' + (typeof window.EDITZEIT_FRAMEIWCL) + ')'] }];
    }

    // Feuert das Server-Fokus-Event eines Feldes (wie die Seite es bei focus tut).
    function focusField(base) {
      const iwcl = window[base + '_FRAMEIWCL'];
      if (typeof iwcl === 'undefined') return 'IWCL fehlt (' + base + ')';
      window.executeAjaxEvent('&ajaxevent=JQEvents.OnFocus', iwcl, base + '_FRAME.DoAjaxRequest', true, null, true);
      return true;
    }

    // Klickt „Beenden" → schließt den Zeit-Picker (wie in den Mitschnitten).
    function closePicker() {
      const iwcl = window['BTNZEITBEENDEN_FRAMEIWCL'];
      if (typeof iwcl === 'undefined') return false;
      window.executeAjaxEvent('&ajaxevent=JQButtonOptions.OnClick', iwcl, 'BTNZEITBEENDEN_FRAME.DoAjaxRequest', true, null, true);
      return true;
    }

    // Bildet den Picker-onSelect exakt nach (commit der Zeit ans aktuell fokussierte Feld).
    function commitTime(timeText) {
      const $t = window.$('input[name="EDITZEIT_FRAME_TIM"]');
      if (!$t.length) return 'kein EDITZEIT_FRAME_TIM';
      $t.val(timeText);
      window.AddChangedControl('EDITZEIT_FRAME_TIM');
      window.executeAjaxEvent('&ajaxevent=JQTimePickerOptions.OnSelect', window.EDITZEIT_FRAMEIWCL, 'EDITZEIT_FRAME.DoAjaxRequest', true, null, true);
      return true;
    }

    // base = z.B. "EDITBEGINN1"; innerId = base+"INNER_EINGABEFRAME"
    async function setTime(base, value, log) {
      if (!value) return true;
      const m = /^(\\d{1,2}):(\\d{2})$/.exec(value.trim());
      if (!m) { log.push(base + ': ungültige Zeit ' + value); return false; }
      const time = String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2];
      const innerId = base + 'INNER_EINGABEFRAME';

      // 1) Server-Fokus → Server merkt sich "dieses Feld wird editiert"
      const f = focusField(base);
      if (f !== true) { log.push(f); return false; }
      await sleep(850);
      // 2) Zeit committen (wie Picker-onSelect)
      const c = commitTime(time);
      if (c !== true) { log.push(base + ': commit (' + c + ')'); return false; }
      // 3) warten bis der Wert (mit Ziffern) im Feld erscheint
      const hasDigits = () => /\\d/.test(((document.getElementById(innerId) || {}).value) || '');
      await until(hasDigits, 4500);
      await sleep(300);
      const got = (document.getElementById(innerId) || {}).value || '';
      log.push(base + ' = "' + got + '" (gesendet ' + time + ')');
      return /\\d/.test(got);
    }

    // Textfeld (Bemerkung/Reisezeit): Fokus → Wert setzen → AddChangedControl
    // → Flush über erneutes Event (postet den geänderten Wert mit).
    async function setText(base, value, log) {
      if (value == null || String(value).trim() === '') return true;
      const innerId = base + 'INNER_EINGABEFRAME';
      const f = focusField(base);
      if (f !== true) { log.push(f); return false; }
      await sleep(750);
      const inp = document.getElementById(innerId);
      if (!inp) { log.push('Feld fehlt: ' + innerId); return false; }
      inp.value = String(value);
      try { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      window.AddChangedControl(innerId);
      await sleep(150);
      focusField(base); // Flush: postet den geänderten Wert
      await sleep(900);
      const got = (document.getElementById(innerId) || {}).value || '';
      log.push(base + ' = "' + got + '" (gesendet "' + value + '")');
      return true;
    }

    const days = ${payload};
    const report = [];
    for (const d of days) {
      const log = [];
      let ok = true;
      ok = (await setTime('EDITBEGINN' + d.tag, d.von, log)) && ok;
      ok = (await setTime('EDITENDE' + d.tag, d.bis, log)) && ok;
      ok = (await setTime('EDITPAUSE' + d.tag, d.pause, log)) && ok;
      ok = (await setText('EDITBEMERK' + d.tag, d.bemerkung, log)) && ok;
      ok = (await setText('EDITREISE' + d.tag, d.reise, log)) && ok;
      report.push({ tag: d.tag, ok, log });
    }
    // Picker am Ende schließen
    await sleep(200);
    closePicker();
    await sleep(400);
    return report;
  })();`;
}

/**
 * Diagnose-Skript: klickt das „von"-Feld von Montag und meldet zurück, was
 * im DOM passiert (ob/welcher Picker erscheint, welche neuen Elemente, …).
 * Dient nur dazu, die echte Picker-Struktur zu verstehen.
 */
function buildStdWebDiagnoseScript() {
  return `(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const visible = (el) => !!(el && el.offsetParent !== null);
    const desc = (el) => ({ tag: el.tagName, id: el.id || '', cls: (el.className || '').toString().slice(0, 50), txt: (el.textContent || '').trim().slice(0, 16) });
    const info = {};

    const frame = document.getElementById('EDITBEGINN1_FRAME');
    info.frameExists = !!frame;
    info.frameVisible = visible(frame);
    info.frameHTML = frame ? frame.outerHTML.slice(0, 400) : null;

    const p0 = document.getElementById('EDITZEIT_FRAME');
    info.pickerExists = !!p0;
    info.pickerVisibleBeforeClick = visible(p0);

    const beforeVisible = new Set(Array.from(document.querySelectorAll('*')).filter(visible));

    // Klick auf das Frame (+ ein eventuelles inneres klickbares Element)
    function fireClick(el){ if(!el) return; ['mousedown','mouseup','click'].forEach(t => el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))); }
    fireClick(frame);
    if (frame) { const inner = frame.querySelector('input,div,span,a'); if (inner && inner !== frame) fireClick(inner); }
    await sleep(1500);

    const p1 = document.getElementById('EDITZEIT_FRAME');
    info.pickerVisibleAfterClick = visible(p1);
    info.pickerHTMLAfter = p1 ? p1.outerHTML.slice(0, 1200) : null;

    const afterVisible = Array.from(document.querySelectorAll('*')).filter(visible);
    const newEls = afterVisible.filter(el => !beforeVisible.has(el));
    info.newVisibleCount = newEls.length;
    info.newVisibleSample = newEls.slice(0, 20).map(desc);

    // Kandidaten für Zeit-Picker-Container
    info.pickerLike = Array.from(document.querySelectorAll('[id*="ZEIT" i],[class*="time" i],[class*="picker" i],[class*="clock" i]'))
      .filter(visible).slice(0, 12).map(desc);

    // Sichtbare Elemente, deren Text genau eine 2-stellige Zahl ist (mögliche Picker-Zellen)
    info.numericCells = afterVisible
      .filter(el => /^\\d{2}$/.test((el.textContent || '').trim()) && el.children.length === 0)
      .slice(0, 24).map(el => ({ ...desc(el), txt: el.textContent.trim() }));

    return info;
  })();`;
}

/**
 * Steuert in StdWeb die Woche an, deren Montag = `mondayDate` ("DD.MM.YYYY").
 * Wählt eine vorhandene Woche aus der linken Liste (BROWSE_FRAME) oder legt
 * sie über „Neu" (BTNNEU → KW-Dialog BROWSE_KWAUSWAHL → OK) an.
 * Gibt einen Report mit den gelesenen Grid-Zeilen zurück (auch fürs Debugging).
 */
function buildStdWebNavigateScript(mondayDate) {
  const target = JSON.stringify(String(mondayDate || ''));
  return `(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const until = async (fn, t = 6000, s = 120) => { const t0 = Date.now(); while (Date.now()-t0 < t) { try { if (fn()) return true; } catch(_){} await sleep(s); } return false; };
    const target = ${target};
    const rep = { target, prereq: {}, browseRows: [], kwRows: [], action: '', ok: false, note: '' };

    rep.prereq = {
      executeAjaxEvent: typeof window.executeAjaxEvent,
      CGSetHiddenInputVal: typeof window.CGSetHiddenInputVal,
      BROWSE_FRAMEIWCL: typeof window.BROWSE_FRAMEIWCL,
      BTNNEU_FRAMEIWCL: typeof window.BTNNEU_FRAMEIWCL,
    };
    if (typeof window.executeAjaxEvent !== 'function' || typeof window.CGSetHiddenInputVal !== 'function') {
      rep.note = 'Seiten-Funktionen fehlen – eingeloggt & Woche offen?'; return rep;
    }
    if (!target) { rep.note = 'Kein Zieldatum'; return rep; }

    // Liest die Datenzeilen eines jqGrids: [{id, cells:[...]}]
    function readRows(containerId) {
      const c = document.getElementById(containerId);
      if (!c) return [];
      return Array.from(c.querySelectorAll('tr.jqgrow'))
        .filter(tr => tr.id)
        .map(tr => ({ id: tr.id, cells: Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').trim()).filter(Boolean) }));
    }
    const rowMatches = (row) => row.cells.some(c => c === target);

    // 1) Vorhandene Woche in der linken Liste?
    rep.browseRows = readRows('BROWSE_FRAME');
    let hit = rep.browseRows.find(rowMatches);
    if (hit) {
      window.CGSetHiddenInputVal('BROWSE_FRAME_SELROW', hit.id);
      window.executeAjaxEvent('&ajaxevent=JQGridOptions.OnSelectRow', window.BROWSE_FRAMEIWCL, 'BROWSE_FRAME.DoAjaxRequest', true, null, true);
      await sleep(1200);
      rep.action = 'selected-existing'; rep.ok = true; rep.note = 'Vorhandene Woche gewählt (' + hit.id + ')';
      return rep;
    }

    // 2) Neue Woche anlegen
    if (typeof window.BTNNEU_FRAMEIWCL === 'undefined') { rep.note = 'BTNNEU_FRAMEIWCL fehlt'; return rep; }
    window.executeAjaxEvent('&ajaxevent=JQButtonOptions.OnClick', window.BTNNEU_FRAMEIWCL, 'BTNNEU_FRAME.DoAjaxRequest', true, null, true);
    await until(() => readRows('BROWSE_KWAUSWAHL').length > 0, 6000);
    await sleep(400);
    rep.kwRows = readRows('BROWSE_KWAUSWAHL');
    hit = rep.kwRows.find(rowMatches);
    if (!hit) { rep.action = 'kw-not-available'; rep.note = 'KW nicht im Dialog (zu alt/zu weit in der Zukunft?)'; return rep; }

    window.CGSetHiddenInputVal('BROWSE_KWAUSWAHL_SELROW', hit.id);
    const kwIWCL = window['BROWSE_KWAUSWAHLIWCL'];
    if (typeof kwIWCL === 'undefined') { rep.note = 'BROWSE_KWAUSWAHLIWCL fehlt'; return rep; }
    window.executeAjaxEvent('&ajaxevent=JQGridOptions.OnSelectRow', kwIWCL, 'BROWSE_KWAUSWAHL.DoAjaxRequest', true, null, true);
    await sleep(700);
    const dlgIWCL = window['IWFRAMEREGION_KWAUSWAHLIWCL'];
    if (typeof dlgIWCL === 'undefined') { rep.note = 'IWFRAMEREGION_KWAUSWAHLIWCL fehlt'; return rep; }
    window.executeAjaxEvent('&ajaxevent=JQDialogOptions.Buttons.Items[1].OnClick', dlgIWCL, 'IWFRAMEREGION_KWAUSWAHL.DoAjaxRequest', true, null, true);
    await sleep(1400);
    rep.action = 'created'; rep.ok = true; rep.note = 'Neue Woche angelegt (' + hit.id + ')';
    return rep;
  })();`;
}

module.exports = { buildStdWebFillScript, buildStdWebDiagnoseScript, buildStdWebNavigateScript };

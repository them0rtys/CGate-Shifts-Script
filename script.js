// ==UserScript==
// @name         CGate Shifts Grabber
// @match        https://www.cgate.cz/mod/page/view.php?id=148*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  document.getElementById('fs-panel')?.remove();

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ymd2d = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const d2ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mondayOf = s => { const d = ymd2d(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  const weeksDiff = (a, b) => Math.round((b - a) / (7 * 864e5));
  const firstDate = () => $('#week-calendar .day-click')?.dataset.date;

  const info = b => ({
    time: $('.shift-head strong', b)?.textContent.trim() || '',
    pos: $('.shift-pos', b)?.textContent.trim() || '',
    note: $('.shift-note-inline', b)?.textContent.trim() || ''
  });
  const keyOf = b => { const i = info(b); return `${i.time}|${i.pos}|${i.note}`; };
  const imgSrc = b => $('img.icon-button', b)?.getAttribute('src') || '';
  const isFree = b => imgSrc(b).endsWith('/book.png');
  const isLocked = b => imgSrc(b).includes('book-blocked') || b.textContent.includes('🔒');

  const parseUnlock = b => {
    const t = $('span[title*="odemčena"]', b)?.title || '';
    const m = t.match(/(\d{2})\. (\d{2})\. (\d{4}) (\d{2}):(\d{2})/);
    return m ? new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]).getTime() : 0;
  };

  // Kandidát při skenování: volná směna, nebo zamčená, která se teprve odemkne (budoucí čas)
  const isCand = b => isFree(b) || (isLocked(b) && parseUnlock(b) > Date.now());
  // Volnější kritérium pro hledání směny při přihlašování (po odemčení už nemusí mít budoucí čas)
  const isCandLoose = b => isFree(b) || isLocked(b);

  const dayCol = date => $$('#week-calendar .day-column').find(c => $('.day-click', c)?.dataset.date === date);
  const findBox = s => {
    const c = dayCol(s.date);
    return c && $$('.shift-box', c).find(b => isCandLoose(b) && keyOf(b) === s.key);
  };
  const fmtDay = date => ymd2d(date).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const waitChange = async cur => { for (let i = 0; i < 50 && firstDate() === cur; i++) await sleep(100); };

  async function gotoWeek(date) {
    const target = mondayOf(date);
    for (let g = 0; g < 80; g++) {
      const cur = firstDate();
      if (!cur) { await sleep(500); continue; }
      const n = weeksDiff(mondayOf(cur), target);
      if (n === 0) return;
      $(n > 0 ? '.next-week' : '.prev-week').click();
      await waitChange(cur);
      await sleep(700);
    }
  }

  async function refresh() {
    let d = firstDate(); $('.next-week').click(); await waitChange(d); await sleep(400);
    d = firstDate(); $('.prev-week').click(); await waitChange(d); await sleep(400);
  }

  // Skenuje "weeks" × 7 dní počínaje datem startDate
  async function scan(weeks, startDate) {
    const found = [];
    const start = startDate || d2ymd(new Date());
    const endD = ymd2d(start);
    endD.setDate(endD.getDate() + weeks * 7);
    const end = d2ymd(endD);                       // konec je vyloučený
    const lastDay = new Date(endD); lastDay.setDate(lastDay.getDate() - 1);
    const pages = weeksDiff(mondayOf(start), mondayOf(d2ymd(lastDay))) + 1;

    await gotoWeek(start);
    for (let w = 0; w < pages; w++) {
      $$('#week-calendar .day-column').forEach(col => {
        const date = $('.day-click', col)?.dataset.date;
        if (!date || date < start || date >= end) return;   // mimo zvolené období
        $$('.shift-box', col).forEach(b => {
          if (isCand(b)) found.push({ date, ...info(b), key: keyOf(b), locked: !isFree(b), unlock: parseUnlock(b) });
        });
      });
      if (w < pages - 1) { const cur = firstDate(); $('.next-week').click(); await waitChange(cur); await sleep(700); }
    }
    await gotoWeek(start);
    found.forEach((f, i) => f.id = i);
    return found;
  }

  const P = document.createElement('div');
  P.id = 'fs-panel';
  P.style.cssText = 'position:fixed;top:70px;right:16px;width:420px;max-height:85vh;overflow:auto;z-index:99999;background:#fff;color:#111;border:1px solid #888;border-radius:12px;padding:12px;box-shadow:0 6px 28px #0008;font:13px/1.4 -apple-system,sans-serif';
  P.innerHTML = [
    '<div style="display:flex;justify-content:space-between;align-items:center">',
      '<b style="font-size:15px">Volné směny</b><span id="fs-close" style="cursor:pointer;font-size:16px">✕</span>',
    '</div>',
    '<div style="margin:8px 0">',
      'Od: <input id="fs-start" type="date" style="width:115px"> ',
      'Týdnů: <input id="fs-weeks" type="number" min="1" max="26" value="8" style="width:40px">',
      '<button id="fs-scan" style="margin-left:4px">🔍 Načíst</button>',
    '</div>',
    '<div id="fs-filters" style="display:none;margin-bottom:6px">',
      '<div id="fs-wd"></div><div id="fs-pos" style="margin-top:4px"></div>',
      '<div style="margin-top:6px"><button id="fs-all">Vybrat vše viditelné</button> <button id="fs-none">Zrušit výběr</button></div>',
    '</div>',
    '<div id="fs-list"></div>',
    '<div id="fs-book" style="display:none;margin-top:8px;border-top:1px solid #ccc;padding-top:8px">',
      '<label><input id="fs-dry" type="checkbox" checked> Zkušební běh (nic nepřihlásí)</label><br>',
      'Začít v: <input id="fs-at" type="datetime-local" step="1"> <small>(vyplní se samo, prázdné = hned)</small><br>',
      'Zkoušet po dobu (min): <input id="fs-dur" type="number" min="1" value="2" style="width:50px">',
      '· Max. směn: <input id="fs-max" type="number" min="1" value="5" style="width:50px"><br>',
      '<button id="fs-go" style="margin-top:6px;font-weight:bold">✅ Spustit (0)</button>',
      '<button id="fs-stop" style="display:none;margin-top:6px">⏹ Zastavit</button>',
      '<div id="fs-cd" style="margin-top:4px;font-weight:bold;color:#c60"></div>',
    '</div>',
    '<div id="fs-log" style="margin-top:8px;font-size:12px;color:#333;white-space:pre-wrap"></div>'
  ].join('');

  document.body.appendChild(P);
  const $p = s => $(s, P);
  $p('#fs-start').value = d2ymd(new Date());

  const log = t => { $p('#fs-log').textContent += t + '\n'; };

  let found = [], stop = false;
  const sel = new Set();
  $p('#fs-close').onclick = () => { stop = true; P.remove(); };
  $p('#fs-stop').onclick = () => { stop = true; };

  function buildFilters() {
    const wd = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    $p('#fs-wd').innerHTML = 'Dny: ' + wd.map((n, i) =>
      `<label style="margin-right:6px"><input type="checkbox" class="fs-wd" value="${(i + 1) % 7}" checked>${n}</label>`).join('');
    const poss = [...new Set(found.map(f => f.pos))];
    $p('#fs-pos').innerHTML = 'Pozice: ' + poss.map(p =>
      `<label style="margin-right:6px"><input type="checkbox" class="fs-pos" value="${p}" checked>${p}</label>`).join('');
    $p('#fs-filters').style.display = 'block';
    $p('#fs-book').style.display = 'block';
    $$('.fs-wd,.fs-pos', P).forEach(c => c.onchange = render);
  }

  const visible = () => {
    const wds = new Set($$('.fs-wd:checked', P).map(c => +c.value));
    const poss = new Set($$('.fs-pos:checked', P).map(c => c.value));
    return found.filter(f => wds.has(ymd2d(f.date).getDay()) && poss.has(f.pos));
  };

  function render() {
    const byDay = {};
    visible().forEach(f => (byDay[f.date] ||= []).push(f));
    $p('#fs-list').innerHTML = Object.keys(byDay).sort().map(d => `
      <div style="margin-top:6px"><label><b><input type="checkbox" class="fs-day" data-d="${d}"> ${fmtDay(d)}</b></label>
      ${byDay[d].map(f => `<div style="margin-left:22px"><label><input type="checkbox" class="fs-sh" data-id="${f.id}" ${sel.has(f.id) ? 'checked' : ''}>${f.locked ? '🔒 ' : ''}${f.time} · ${f.pos} <span style="color:#777">${f.note}</span>${f.unlock ? ` <small style="color:#c60">(odemkne ${new Date(f.unlock).toLocaleString('cs-CZ')})</small>` : ''}</label></div>`).join('')}</div>`).join('')
      || '<i>Žádné směny pro tento filtr.</i>';
    $$('.fs-sh', P).forEach(c => c.onchange = () => { c.checked ? sel.add(+c.dataset.id) : sel.delete(+c.dataset.id); updateCount(); });
    $$('.fs-day', P).forEach(c => c.onchange = () => { byDay[c.dataset.d].forEach(f => c.checked ? sel.add(f.id) : sel.delete(f.id)); render(); });
    updateCount();
  }

  const updateCount = () => {
    $p('#fs-go').textContent = `✅ Spustit (${sel.size})`;
    const u = found.filter(f => sel.has(f.id) && f.unlock).map(f => f.unlock);
    if (u.length) {
      const d = new Date(Math.min(...u) - 5000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      $p('#fs-at').value = d.toISOString().slice(0, 19);
    }
  };

  $p('#fs-all').onclick = () => { visible().forEach(f => sel.add(f.id)); render(); };
  $p('#fs-none').onclick = () => { sel.clear(); render(); };

  $p('#fs-scan').onclick = async () => {
    $p('#fs-scan').disabled = true; $p('#fs-log').textContent = ''; log('Načítám týdny…');
    try {
      const weeks = +$p('#fs-weeks').value || 8;
      const startDate = $p('#fs-start').value || d2ymd(new Date());
      found = await scan(weeks, startDate);
      sel.clear(); buildFilters(); render();
      log(`Nalezeno směn: ${found.length} (z toho zamčených: ${found.filter(f => f.locked).length})`);
    } catch (e) { log('Chyba: ' + e.message); }
    $p('#fs-scan').disabled = false;
  };

  $p('#fs-go').onclick = async () => {
    const list = found.filter(f => sel.has(f.id)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    if (!list.length) return log('Nic nevybráno.');
    const dry = $p('#fs-dry').checked;
    const max = +$p('#fs-max').value || 5;
    const atVal = $p('#fs-at').value;
    const at = atVal ? new Date(atVal).getTime() : 0;
    if (atVal && at < Date.now() - 1000) return log('Zadaný čas už uplynul.');
    if (!dry && !window.confirm(`Opravdu ${at ? 'v ' + new Date(at).toLocaleString('cs-CZ') : 'hned'} přihlásit až ${Math.min(max, list.length)} směn?`)) return;

    stop = false;
    $p('#fs-go').disabled = true; $p('#fs-stop').style.display = '';
    const origConfirm = window.confirm;
    let ok = 0;
    try {
      if (!dry) window.confirm = () => true;
      if (at) {
        log(`Čekám na ${new Date(at).toLocaleTimeString('cs-CZ')}… (nech tuto kartu otevřenou v popředí)`);
        await gotoWeek(list[0].date);
        while (Date.now() < at - 20 && !stop) {
          const left = Math.max(0, Math.round((at - Date.now()) / 1000));
          $p('#fs-cd').textContent = `⏱ Start za ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
          await sleep(left > 5 ? 250 : 20);
        }
        $p('#fs-cd').textContent = '';
        if (!stop) { log('START'); await refresh(); }
      }
      const deadline = (at || Date.now()) + (+$p('#fs-dur').value || 2) * 60000;
      let pending = [...list];
      while (pending.length && ok < max && Date.now() < deadline && !stop) {
        for (const s of [...pending]) {
          if (ok >= max || stop) break;
          const label = `${fmtDay(s.date)} ${s.time} ${s.pos}`;
          await gotoWeek(s.date);
          const box = findBox(s);
          if (!box) continue;
          if (dry) {
            log(`(test) kliknul bych: ${label}${isLocked(box) ? ' [zatím zamčeno]' : ''}`);
            ok++; pending = pending.filter(x => x !== s); continue;
          }
          if (!isFree(box)) continue;
          const before = $$('.shift-box', dayCol(s.date)).filter(b => isFree(b) && keyOf(b) === s.key).length;
          $('img.icon-button', box).click();
          await sleep(1500);
          const c = dayCol(s.date);
          const after = c ? $$('.shift-box', c).filter(b => isFree(b) && keyOf(b) === s.key).length : 0;
          if (after < before) { log(`✔ ${label}: přihlášeno`); ok++; pending = pending.filter(x => x !== s); }
          else log(`… ${label}: zatím nepřihlášeno, zkouším dál`);
        }
        if (pending.length && ok < max && !dry && !stop) await refresh();
        else if (dry) break;
      }
      if (pending.length && !dry) pending.forEach(s => log(`✖ ${fmtDay(s.date)} ${s.time} ${s.pos}: nepřihlášeno`));
    } finally { window.confirm = origConfirm; }
    log(stop ? 'Zastaveno.' : dry ? `Zkušební běh hotov (${ok}).` : `Hotovo, přihlášeno: ${ok}.`);
    $p('#fs-go').disabled = false; $p('#fs-stop').style.display = 'none';
    updateCount();
  };
})();
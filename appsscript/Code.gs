/**
 * PM sync endpoint — Apps Script bound to a PM spreadsheet (one per instance).
 *
 * doPost (secret-protected):
 *   default            full-state sync from sync.mjs — writes whatever `tabs`
 *                      the payload carries ({name, headers, rows, append?}), so
 *                      schema changes are sync-side only and this script rarely
 *                      needs updating. Clears acknowledged rows from the
 *                      Pending tab (body.appliedIds).
 *   action:'setField'  dashboard edit (e.g. status/urgency or a task change) —
 *                      updates the sheet cell immediately and queues the change
 *                      in the Pending tab; the next sync run applies it to the
 *                      markdown (source of truth). 'setStatus' is a legacy alias.
 * doGet (token-protected): tabs as JSON for the dashboard + the pending queue.
 *
 * SETUP (first time; afterwards deploy updates via clasp — see README)
 * 1. Replace the two constants below with "secret" and "readToken" from your local
 *    config.<instance>.json (never commit those values anywhere).
 * 2. Deploy > New deployment > type: Web app > Execute as: Me > Who has access: Anyone.
 * 3. Copy the /exec URL into the config as "webhookUrl".
 */

const SECRET = 'REPLACE_WITH_secret_FROM_CONFIG';
const READ_TOKEN = 'REPLACE_WITH_readToken_FROM_CONFIG';

const PENDING_HEADERS = ['Id', 'Requested', 'Project', 'Field', 'Value'];
const TASK_STATES = ['open', 'wip', 'done'];
// Dashboard-editable project fields; the matching column is found by header name,
// and values are only sanity-checked here — sync.mjs re-validates when applying.
const EDITABLE_FIELDS = ['status', 'urgency'];
const VALUE_RE = /^[a-z0-9-]{1,30}$/;

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ ok: false, error: 'invalid JSON' });
  }
  if (!body || body.secret !== SECRET) return jsonOut({ ok: false, error: 'bad secret' });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (body.action === 'setStatus') {
      body.action = 'setField';
      body.field = 'status';
      body.value = body.status;
    }
    if (body.action === 'setField') return handleSetField(body);
    if (body.action) return jsonOut({ ok: false, error: 'unknown action: ' + body.action });

    const tabs = body.tabs || [];
    let written = 0;
    let appended = 0;
    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i];
      if (!t || !t.name || !t.headers || !t.rows) continue;
      if (t.append) appended += appendTab(t);
      else {
        writeTab(t);
        written += t.rows.length;
      }
    }
    writeSummary(body.brief || null, body.generatedAt || '', body.actionsGenerated || '');
    if (body.appliedIds && body.appliedIds.length) clearPending(body.appliedIds);
    return jsonOut({ ok: true, rows: written, newUpdates: appended });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  if (!e.parameter || e.parameter.token !== READ_TOKEN) return jsonOut({ ok: false, error: 'bad token' });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = ss.getSheetByName('Summary');
  return jsonOut({
    ok: true,
    projects: readTab(ss, 'Projects'),
    updates: readTab(ss, 'Updates'),
    tasks: readTab(ss, 'Tasks'),
    actions: readTab(ss, 'Actions'),
    pending: readTab(ss, 'Pending'),
    brief: summary
      ? { generated: summary.getRange('B1').getDisplayValue(), markdown: summary.getRange('A5').getDisplayValue() }
      : null,
    lastSync: summary ? summary.getRange('B2').getDisplayValue() : '',
    actionsGenerated: summary ? summary.getRange('B3').getDisplayValue() : '',
  });
}

/** Column number (1-based) whose header matches `name` case-insensitively, or -1. */
function colByHeader(sheet, name) {
  if (sheet.getLastRow() < 1) return -1;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase() === String(name).toLowerCase()) return i + 1;
  }
  return -1;
}

function handleSetField(body) {
  const project = String(body.projectId || '');
  const field = String(body.field || '');
  const value = String(body.value || '');
  if (!project) return jsonOut({ ok: false, error: 'missing projectId' });
  if (field === 'task_state' || field === 'task_delete') return handleTaskChange(project, field, value);
  if (EDITABLE_FIELDS.indexOf(field) === -1) return jsonOut({ ok: false, error: 'field not editable: ' + field });
  if (!VALUE_RE.test(value)) return jsonOut({ ok: false, error: 'bad value for ' + field });

  const sheet = ensureSheet('Pending', PENDING_HEADERS);
  const id = Utilities.getUuid();
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, PENDING_HEADERS.length);
  range.setNumberFormat('@'); // keep the Requested timestamp as text
  range.setValues([[id, nowString(), project, field, value]]);

  // Reflect immediately in the Projects tab so every reader sees it before the next sync.
  const projects = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Projects');
  if (projects) {
    const col = colByHeader(projects, field);
    const last = projects.getLastRow();
    if (col !== -1 && last > 1) {
      const ids = projects.getRange(2, 1, last - 1, 1).getDisplayValues();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === project) {
          projects.getRange(i + 2, col).setValue(value);
          break;
        }
      }
    }
  }
  return jsonOut({ ok: true, id: id });
}

/** Queue a task edit (state change or delete) and reflect it in the Tasks tab immediately.
 *  The sync applies it to project.md, keeping markdown the source of truth. */
function handleTaskChange(project, field, value) {
  let payload;
  try {
    payload = JSON.parse(value);
  } catch (err) {
    return jsonOut({ ok: false, error: 'bad task payload' });
  }
  const text = String(payload.text || '').trim();
  if (!text) return jsonOut({ ok: false, error: 'missing task text' });
  if (field === 'task_state' && TASK_STATES.indexOf(String(payload.state)) === -1) {
    return jsonOut({ ok: false, error: 'bad task state' });
  }

  const sheet = ensureSheet('Pending', PENDING_HEADERS);
  const id = Utilities.getUuid();
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, PENDING_HEADERS.length);
  range.setNumberFormat('@');
  range.setValues([[id, nowString(), project, field, value]]);

  const tasks = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tasks');
  if (tasks) {
    const projCol = colByHeader(tasks, 'Project');
    const doneCol = colByHeader(tasks, 'Done');
    const taskCol = colByHeader(tasks, 'Task');
    const last = tasks.getLastRow();
    if (projCol !== -1 && doneCol !== -1 && taskCol !== -1 && last > 1) {
      const rows = tasks.getRange(2, 1, last - 1, tasks.getLastColumn()).getDisplayValues();
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][projCol - 1] === project && rows[i][taskCol - 1] === text) {
          if (field === 'task_delete') tasks.deleteRow(i + 2);
          else tasks.getRange(i + 2, doneCol).setValue(String(payload.state));
          break;
        }
      }
    }
  }
  return jsonOut({ ok: true, id: id });
}

function clearPending(ids) {
  const sheet = ensureSheet('Pending', PENDING_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return;
  const rows = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (ids.indexOf(rows[i][0]) !== -1) sheet.deleteRow(i + 2);
  }
}

function nowString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

/** Replace a tab's contents with the payload's headers + rows. */
function writeTab(t) {
  const sheet = ensureSheet(t.name, t.headers);
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), t.headers.length);
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (!t.rows.length) return;
  const rows = t.rows.map((r) => padRow(r, t.headers.length));
  const range = sheet.getRange(2, 1, rows.length, t.headers.length);
  range.setNumberFormat('@'); // keep "2/9" and timestamps as text, not auto-dates
  range.setValues(rows);
}

/** Append only rows not already present (keyed on truncated cell values). */
function appendTab(t) {
  const sheet = ensureSheet(t.name, t.headers);
  const existing = {};
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet
      .getRange(2, 1, lastRow - 1, t.headers.length)
      .getDisplayValues()
      .forEach(function (r) {
        existing[rowKey(r)] = true;
      });
  }
  const fresh = t.rows.map((r) => padRow(r, t.headers.length)).filter((r) => !existing[rowKey(r)]);
  if (!fresh.length) return 0;
  fresh.sort(); // oldest first when col 0 is a timestamp
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, t.headers.length);
  range.setNumberFormat('@');
  range.setValues(fresh);
  return fresh.length;
}

function padRow(r, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(r[i] === undefined || r[i] === null ? '' : r[i]);
  return out;
}

function rowKey(r) {
  return r
    .map(function (c) {
      return String(c).slice(0, 40);
    })
    .join('|');
}

function writeSummary(brief, generatedAt, actionsGenerated) {
  const sheet = ensureSheet('Summary', null);
  sheet.clearContents();
  sheet.getRange('A1').setValue('Brief generated');
  sheet.getRange('B1').setNumberFormat('@').setValue(brief ? brief.generated : '');
  sheet.getRange('A2').setValue('Last sync');
  sheet.getRange('B2').setNumberFormat('@').setValue(generatedAt);
  sheet.getRange('A3').setValue('Actions generated');
  sheet.getRange('B3').setNumberFormat('@').setValue(actionsGenerated || '');
  const md = sheet.getRange('A5');
  md.setValue(brief ? brief.markdown : '');
  md.setWrap(true);
  sheet.setColumnWidth(1, 700);
}

function ensureSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers) {
    const head = sheet.getRange(1, 1, 1, headers.length);
    head.setValues([headers]);
    head.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readTab(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map((h) => String(h).toLowerCase().replace(/\s+/g, '_'));
  return values
    .slice(1)
    .filter((r) => r[0] !== '')
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = r[i]));
      return obj;
    });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

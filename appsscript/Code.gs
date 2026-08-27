/**
 * PM sync endpoint — Apps Script bound to the Work PM spreadsheet.
 *
 * doPost (secret-protected):
 *   default            full-state sync from sync.mjs — rewrites the tabs, clears
 *                      acknowledged rows from the Pending tab (body.appliedIds)
 *   action:'setField'  dashboard edit (status or urgency) — updates the Projects
 *                      tab cell immediately and queues the change in the Pending
 *                      tab; the next sync run applies it to the markdown
 *                      (source of truth). 'setStatus' is a legacy alias.
 * doGet (token-protected): tabs as JSON for the dashboard + the pending queue.
 *
 * SETUP
 * 1. Replace the two constants below with "secret" and "readToken" from your local
 *    config.work.json (never commit those values anywhere).
 * 2. Deploy > New deployment > type: Web app > Execute as: Me > Who has access: Anyone.
 * 3. Copy the /exec URL into config.work.json as "webhookUrl".
 *
 * After editing this file later: Deploy > Manage deployments > pencil icon > Version: New
 * version > Deploy (the URL stays the same). Just saving does NOT update the live deployment.
 */

const SECRET = 'REPLACE_WITH_secret_FROM_CONFIG';
const READ_TOKEN = 'REPLACE_WITH_readToken_FROM_CONFIG';

const PROJECT_HEADERS = ['ID', 'Name', 'Status', 'Horizon', 'Urgency', 'Progress', 'Summary', 'Last Update', 'Issues', 'Repo'];
const UPDATE_HEADERS = ['Timestamp', 'Project', 'Entry'];
const TASK_HEADERS = ['Project', 'Done', 'Task'];
const ACTION_HEADERS = ['Project', 'Label', 'Type', 'Payload'];
const PENDING_HEADERS = ['Id', 'Requested', 'Project', 'Field', 'Value'];
const STATUS_VALUES = ['active', 'blocked', 'backlog', 'done'];
const URGENCY_VALUES = ['high', 'medium', 'low'];
// Editable fields: allowed values + their column in the Projects tab.
const EDITABLE_FIELDS = {
  status: { values: STATUS_VALUES, col: 3 },
  urgency: { values: URGENCY_VALUES, col: 5 },
};

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
    writeProjects(body.projects || []);
    const appended = appendUpdates(body.updates || []);
    writeTasks(body.tasks || []);
    writeActions(body.actions || null);
    writeSummary(body.brief || null, body.generatedAt || '', body.actions ? body.actions.generated : '');
    if (body.appliedIds && body.appliedIds.length) clearPending(body.appliedIds);
    return jsonOut({ ok: true, projects: (body.projects || []).length, newUpdates: appended });
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

function handleSetField(body) {
  const project = String(body.projectId || '');
  const field = String(body.field || '');
  const value = String(body.value || '');
  const spec = EDITABLE_FIELDS[field];
  if (!project) return jsonOut({ ok: false, error: 'missing projectId' });
  if (!spec) return jsonOut({ ok: false, error: 'field not editable: ' + field });
  if (spec.values.indexOf(value) === -1) return jsonOut({ ok: false, error: 'bad value for ' + field });

  const sheet = ensureSheet('Pending', PENDING_HEADERS);
  const id = Utilities.getUuid();
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, PENDING_HEADERS.length);
  range.setNumberFormat('@'); // keep the Requested timestamp as text
  range.setValues([[id, nowString(), project, field, value]]);

  // Reflect immediately in the Projects tab so every reader sees it before the next sync.
  const projects = ensureSheet('Projects', PROJECT_HEADERS);
  const last = projects.getLastRow();
  if (last > 1) {
    const ids = projects.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === project) {
        projects.getRange(i + 2, spec.col).setValue(value);
        break;
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

function writeProjects(projects) {
  const sheet = ensureSheet('Projects', PROJECT_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, PROJECT_HEADERS.length).clearContent();
  if (!projects.length) return;
  const rows = projects.map((p) => [
    p.id,
    p.name,
    p.status,
    p.horizon,
    p.urgency,
    p.progressTotal ? p.progressDone + '/' + p.progressTotal : '',
    p.summary,
    p.lastUpdate,
    (p.issues || []).join('; '),
    p.repo || '',
  ]);
  const range = sheet.getRange(2, 1, rows.length, PROJECT_HEADERS.length);
  range.setNumberFormat('@'); // keep "2/9" and timestamps as text, not auto-dates
  range.setValues(rows);
}

function appendUpdates(updates) {
  const sheet = ensureSheet('Updates', UPDATE_HEADERS);
  const existing = {};
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, UPDATE_HEADERS.length).getDisplayValues().forEach((r) => {
      existing[updateKey(r[0], r[1], r[2])] = true;
    });
  }
  const fresh = updates.filter((u) => !existing[updateKey(u.timestamp, u.projectId, u.entry)]);
  if (!fresh.length) return 0;
  fresh.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  const rows = fresh.map((u) => [u.timestamp, u.projectId, u.entry]);
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, UPDATE_HEADERS.length);
  range.setNumberFormat('@');
  range.setValues(rows);
  return rows.length;
}

function updateKey(ts, projectId, entry) {
  return ts + '|' + projectId + '|' + String(entry).slice(0, 40);
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

function writeTasks(tasks) {
  const sheet = ensureSheet('Tasks', TASK_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, TASK_HEADERS.length).clearContent();
  if (!tasks.length) return;
  const rows = tasks.map((t) => [t.project, t.done ? 'done' : 'open', t.task]);
  const range = sheet.getRange(2, 1, rows.length, TASK_HEADERS.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function writeActions(actions) {
  const sheet = ensureSheet('Actions', ACTION_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, ACTION_HEADERS.length).clearContent();
  const items = actions && actions.items ? actions.items : [];
  if (!items.length) return;
  const rows = items.map((a) => [a.project, a.label, a.type, a.payload]);
  const range = sheet.getRange(2, 1, rows.length, ACTION_HEADERS.length);
  range.setNumberFormat('@');
  range.setValues(rows);
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

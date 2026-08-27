/**
 * PM sync endpoint — Apps Script bound to the Work PM spreadsheet.
 *
 * doPost: receives full state from sync.mjs (secret-protected), rewrites the tabs.
 * doGet:  returns the tabs as JSON (token-protected) for the web dashboard.
 *
 * SETUP
 * 1. Replace the two constants below with "secret" and "readToken" from your local
 *    config.work.json (never commit those values anywhere).
 * 2. Deploy > New deployment > type: Web app > Execute as: Me > Who has access: Anyone.
 * 3. Copy the /exec URL into config.work.json as "webhookUrl".
 *
 * After editing this file later: Deploy > Manage deployments > pencil icon > Version: New
 * version > Deploy (the URL stays the same). Just saving the file does NOT update the
 * live deployment.
 */

const SECRET = 'REPLACE_WITH_secret_FROM_CONFIG';
const READ_TOKEN = 'REPLACE_WITH_readToken_FROM_CONFIG';

const PROJECT_HEADERS = ['ID', 'Name', 'Status', 'Horizon', 'Urgency', 'Progress', 'Summary', 'Last Update', 'Issues'];
const UPDATE_HEADERS = ['Timestamp', 'Project', 'Entry'];

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
    writeProjects(body.projects || []);
    const appended = appendUpdates(body.updates || []);
    writeSummary(body.brief || null, body.generatedAt || '');
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
    brief: summary
      ? { generated: summary.getRange('B1').getDisplayValue(), markdown: summary.getRange('A4').getDisplayValue() }
      : null,
    lastSync: summary ? summary.getRange('B2').getDisplayValue() : '',
  });
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

function writeSummary(brief, generatedAt) {
  const sheet = ensureSheet('Summary', null);
  sheet.clearContents();
  sheet.getRange('A1').setValue('Brief generated');
  sheet.getRange('B1').setNumberFormat('@').setValue(brief ? brief.generated : '');
  sheet.getRange('A2').setValue('Last sync');
  sheet.getRange('B2').setNumberFormat('@').setValue(generatedAt);
  const md = sheet.getRange('A4');
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

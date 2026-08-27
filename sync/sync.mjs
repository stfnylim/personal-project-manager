#!/usr/bin/env node
/**
 * PM sync — scans the projects folder and POSTs the full state to the Apps Script webhook.
 * Zero dependencies; Node 18+.
 *
 * Usage:
 *   node sync/sync.mjs                       sync using config.work.json at the repo root
 *   node sync/sync.mjs --dry-run             parse + validate + print payload, no POST
 *   node sync/sync.mjs --config <path>       use another config (e.g. config.life.json)
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const configArg = argv.includes('--config') ? argv[argv.indexOf('--config') + 1] : null;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(configArg || join(repoRoot, 'config.work.json'));

if (!existsSync(configPath)) fail(`config not found: ${configPath}`);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
for (const key of ['projectsDir', 'webhookUrl', 'secret']) {
  if (!config[key]) fail(`config missing "${key}"`);
}
const root = config.projectsDir;
if (!existsSync(root)) fail(`projects dir not found: ${root}`);

const STATUS = ['active', 'blocked', 'backlog', 'done'];
const HORIZON = ['short', 'long'];
const URGENCY = ['high', 'medium', 'low'];
const EDITABLE_FIELDS = { status: STATUS, urgency: URGENCY }; // dashboard-editable

// ---- apply pending dashboard changes to the markdown ---------------------
// The dashboard queues edits (e.g. a status change) in the sheet's Pending tab.
// The markdown stays the source of truth: we apply each change to project.md,
// log it, commit, and acknowledge with appliedIds so the queue row is cleared.
const appliedIds = [];
if (!DRY && !config.webhookUrl.startsWith('PASTE') && config.readToken) {
  let pendingList = [];
  try {
    const res = await fetch(`${config.webhookUrl}?token=${encodeURIComponent(config.readToken)}`);
    const remote = await res.json();
    if (remote.ok && Array.isArray(remote.pending)) pendingList = remote.pending;
  } catch {
    console.error('sync: could not fetch pending changes (continuing without)');
  }
  let edited = false;
  for (const change of pendingList) {
    const { id, project, field, value } = change;
    if (!id) continue;
    appliedIds.push(id); // acknowledged either way — a bad row must not poison the queue
    if (field === 'task_state' || field === 'task_delete') {
      let tp;
      try {
        tp = JSON.parse(value);
      } catch {
        console.error(`sync: bad task payload for "${project}" — skipped`);
        continue;
      }
      const file = join(root, project, 'project.md');
      if (!existsSync(file)) {
        console.error(`sync: task change for unknown project "${project}" — skipped`);
        continue;
      }
      const wanted = String(tp.text || '').trim();
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      const hit = lines.findIndex((l) => {
        const m = l.match(/^\s*[-*] \[[ xX~]\]\s+(.*)$/);
        return m && m[1].trim() === wanted;
      });
      if (hit === -1) {
        console.error(`sync: task "${wanted}" not found in ${project}/project.md — skipped`);
        continue;
      }
      if (field === 'task_delete') {
        lines.splice(hit, 1);
        console.log(`applied dashboard change: ${project} deleted task "${wanted}"`);
      } else {
        const mark = tp.state === 'done' ? 'x' : tp.state === 'wip' ? '~' : ' ';
        const updatedLine = lines[hit].replace(/\[[ xX~]\]/, `[${mark}]`);
        if (updatedLine === lines[hit]) continue; // already in that state
        lines[hit] = updatedLine;
        console.log(`applied dashboard change: ${project} task "${wanted}" -> ${tp.state}`);
      }
      writeFileSync(file, lines.join('\n'));
      edited = true;
      continue;
    }
    const allowed = EDITABLE_FIELDS[field];
    if (!allowed || !allowed.includes(value)) {
      console.error(`sync: skipping unsupported pending change ${field}=${value} for "${project}"`);
      continue;
    }
    const file = join(root, project, 'project.md');
    if (!existsSync(file)) {
      console.error(`sync: pending change for unknown project "${project}" — skipped`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    if ((parseFrontmatter(text).data?.[field] || '') === value) continue; // already applied
    const updated = text.replace(new RegExp(`^(${field}:)[^\\r\\n]*`, 'm'), `$1 ${value}`);
    if (updated === text) {
      console.error(`sync: no ${field} line found in ${project}/project.md — skipped`);
      continue;
    }
    writeFileSync(file, updated);
    // Stamp with apply time, not request time: log.md is append-only, so an entry
    // carrying an older timestamp would sort before entries already below it.
    const stamp = formatDate(new Date());
    const requested = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(change.requested || '') ? change.requested : '';
    const when = requested && requested !== stamp ? ` (requested ${requested})` : '';
    const label = field[0].toUpperCase() + field.slice(1);
    appendFileSync(join(root, project, 'log.md'), `\n## ${stamp}\n${label} changed to ${value} from the dashboard${when}.\n`);
    console.log(`applied dashboard change: ${project} ${field} -> ${value}`);
    edited = true;
  }
  if (edited) {
    try {
      execSync(`git -C "${root}" add -A`, { stdio: 'ignore' });
      execSync(`git -C "${root}" commit -m "dashboard: apply queued changes"`, { stdio: 'ignore' });
    } catch {
      console.error('sync: git commit of applied changes failed (continuing)');
    }
  }
}

// ---- scan ----------------------------------------------------------------
const projects = [];
const updates = [];
const taskRows = [];
const dirs = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
  .map((d) => d.name)
  .sort();

for (const id of dirs) {
  const dir = join(root, id);
  const issues = [];
  const projectFile = join(dir, 'project.md');
  let meta = {};
  let body = '';

  if (!existsSync(projectFile)) {
    issues.push('missing project.md');
  } else {
    const parsed = parseFrontmatter(readFileSync(projectFile, 'utf8'));
    if (!parsed.data) issues.push('project.md has no frontmatter');
    meta = parsed.data || {};
    body = parsed.body;
    for (const key of ['name', 'status', 'horizon', 'urgency', 'summary']) {
      if (!meta[key]) issues.push(`missing "${key}"`);
    }
    checkEnum(meta, 'status', STATUS, issues);
    checkEnum(meta, 'horizon', HORIZON, issues);
    checkEnum(meta, 'urgency', URGENCY, issues);
  }

  const taskItems = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.match(/^\s*[-*] \[([ xX~])\]\s+(.*)$/);
    if (t) {
      const state = t[1] === ' ' ? 'open' : t[1] === '~' ? 'wip' : 'done';
      taskItems.push({ state, text: t[2].trim() });
    }
  }
  const done = taskItems.filter((t) => t.state === 'done').length;
  const open = taskItems.length - done;
  // done (bool) keeps pre-tri-state Apps Script versions rendering correctly; state is canonical
  for (const t of taskItems) taskRows.push({ project: id, done: t.state === 'done', state: t.state, task: t.text });

  let entries = [];
  const logFile = join(dir, 'log.md');
  if (existsSync(logFile)) {
    const res = parseLog(readFileSync(logFile, 'utf8'));
    entries = res.entries;
    if (res.unparsedHeadings) {
      issues.push(`${res.unparsedHeadings} log heading(s) not in "## YYYY-MM-DD HH:MM" format`);
    }
    for (const en of entries) updates.push({ timestamp: en.timestamp, projectId: id, entry: en.text });
  }

  const lastUpdate = entries.length
    ? entries.map((e) => e.timestamp).sort().at(-1)
    : formatDate(statSync(existsSync(projectFile) ? projectFile : dir).mtime);

  projects.push({
    id,
    name: meta.name || id,
    status: meta.status || '',
    horizon: meta.horizon || '',
    urgency: meta.urgency || '',
    progressDone: done,
    progressTotal: done + open,
    summary: meta.summary || '',
    repo: meta.repo || '',
    lastUpdate,
    issues,
  });
}

let brief = null;
const briefFile = join(root, 'BRIEF.md');
if (existsSync(briefFile)) {
  const parsed = parseFrontmatter(readFileSync(briefFile, 'utf8'));
  brief = { generated: parsed.data?.generated || '', markdown: parsed.body.trim() };
}

// ---- next actions (ACTIONS.md, maintained by the PM brain) ---------------
// Format per line: "- label | type | payload" under a "## <project-id>" heading.
const ACTION_TYPES = ['search', 'url', 'chat'];
let actions = null;
const actionsFile = join(root, 'ACTIONS.md');
if (existsSync(actionsFile)) {
  const parsed = parseFrontmatter(readFileSync(actionsFile, 'utf8'));
  const items = [];
  let currentProject = '';
  let badLines = 0;
  for (const line of parsed.body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      currentProject = h[1].trim();
      continue;
    }
    const li = line.match(/^\s*-\s+(.*)$/);
    if (!li) continue;
    const parts = li[1].split('|').map((s) => s.trim());
    if (parts.length < 3) {
      badLines++;
      continue;
    }
    const label = parts[0];
    const type = parts[1];
    const actionPayload = parts.slice(2).join(' | ');
    const typeOk = ACTION_TYPES.includes(type);
    const urlOk = type !== 'url' || /^https:\/\//.test(actionPayload);
    if (!currentProject || !label || !typeOk || !urlOk) {
      badLines++;
      continue;
    }
    items.push({ project: currentProject, label, type, payload: actionPayload });
  }
  if (badLines) console.error(`sync: skipped ${badLines} malformed action line(s) in ACTIONS.md`);
  actions = { generated: parsed.data?.generated || '', items };
}

const payload = {
  secret: config.secret,
  generatedAt: formatDate(new Date()),
  projects,
  updates,
  tasks: taskRows,
  actions,
  brief,
  appliedIds,
};

// ---- report --------------------------------------------------------------
for (const p of projects) {
  const flag = p.issues.length ? `  !! ${p.issues.join('; ')}` : '';
  console.log(`${p.id}: ${p.status} ${p.progressDone}/${p.progressTotal} urgency=${p.urgency} last=${p.lastUpdate}${flag}`);
}
console.log(
  `${projects.length} project(s), ${updates.length} log entries, ${taskRows.length} task(s), ` +
    `${actions ? actions.items.length : 0} action(s), brief ${brief && brief.markdown ? 'present' : 'empty'}`,
);

if (DRY) {
  console.log('\n--dry-run: not posting. Payload:\n');
  console.log(JSON.stringify({ ...payload, secret: '<redacted>' }, null, 2));
  process.exit(0);
}

if (config.webhookUrl.startsWith('PASTE')) {
  fail('webhookUrl not set in config — deploy the Apps Script first (see README)');
}

try {
  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const text = await res.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    fail(`webhook returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!result.ok) fail(`webhook error: ${result.error}`);
  const ack = appliedIds.length ? `, ${appliedIds.length} pending change(s) cleared` : '';
  console.log(`synced OK: ${result.projects} project(s) written, ${result.newUpdates} new update(s) appended${ack}`);
} catch (err) {
  fail(String(err));
}

// ---- helpers -------------------------------------------------------------
function parseFrontmatter(text) {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const rawLine of m[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line
      .slice(i + 1)
      .replace(/\s+#.*$/, '') // tolerate trailing "# comment" copied from PROTOCOL examples
      .trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: text.slice(m[0].length) };
}

function parseLog(text) {
  const entries = [];
  let unparsedHeadings = 0;
  let current = null;
  const finish = (c) => entries.push({ timestamp: c.timestamp, text: c.lines.join('\n').trim() });
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (current) finish(current);
      const ts = h[1].match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/);
      if (ts) current = { timestamp: ts[1], lines: [] };
      else {
        unparsedHeadings++;
        current = null;
      }
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) finish(current);
  return { entries, unparsedHeadings };
}

function checkEnum(meta, key, allowed, issues) {
  if (meta[key] && !allowed.includes(meta[key])) {
    issues.push(`${key} "${meta[key]}" not one of ${allowed.join('|')}`);
  }
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fail(msg) {
  console.error(`sync: ${msg}`);
  process.exit(1);
}

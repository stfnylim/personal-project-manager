#!/usr/bin/env node
/**
 * sync-jira — renders the projects folder onto ONE Jira board as minimal,
 * auto-managed issues. One-way: markdown is the source of truth, and hand-edits
 * to the pm-sync issues get overwritten. Hard-pinned to the configured project
 * key — every write is guarded against touching anything else.
 *
 * Runs after sync.mjs on the same cadence; exits silently when the config has
 * no "jira" block (e.g. the personal instance).
 *
 * Usage:
 *   node sync/sync-jira.mjs [--config <path>] [--dry-run]
 *
 * Per markdown project (non-archived; done only if already linked):
 *   one Task labeled pm-sync — summary = project name, duedate = due,
 *   description = summary + progress + last update, workflow status from
 *   STATUS_TO_JIRA, and active/blocked issues placed into the board's active
 *   sprint. The created issue key is written back into the project's
 *   frontmatter as `jira:` (auto-managed).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const readText = (f) => readFileSync(f, 'utf8').replace(/^﻿/, '');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const configArg = argv.includes('--config') ? argv[argv.indexOf('--config') + 1] : null;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(configArg || join(repoRoot, 'config.work.json'));

const fail = (m) => {
  console.error(`sync-jira: ${m}`);
  process.exit(1);
};
if (!existsSync(configPath)) fail(`config not found: ${configPath}`);
const config = JSON.parse(readText(configPath));
const jira = config.jira;
if (!jira || !jira.site || !jira.email || !jira.token || !jira.project) process.exit(0);
const root = config.projectsDir;
if (!root || !existsSync(root)) fail('projectsDir missing or not found');

const PROJECT_KEY = String(jira.project);
const BOARD_ID = jira.board;
const ISSUE_TYPE = jira.issueType || 'Task';
const LABEL = 'pm-sync';
// our status -> Jira workflow status (PIPE board: "On Hold" renders in the To Do column)
const STATUS_TO_JIRA = { backlog: 'To Do', active: 'In Progress', blocked: 'On Hold', done: 'Done', archived: 'Done' };
const SPRINTABLE = new Set(['active', 'blocked']); // backlog stays out of the sprint

const AUTH = 'Basic ' + Buffer.from(`${jira.email}:${jira.token}`).toString('base64');
async function api(method, path, body) {
  const res = await fetch(`https://${jira.site}/${path}`, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}${text ? ` :: ${text.slice(0, 240)}` : ''}`);
  return data;
}
// safety pin: never act on an issue outside the configured project
const assertPinned = (key) => {
  if (!String(key).startsWith(PROJECT_KEY + '-')) throw new Error(`refusing to touch ${key} (outside ${PROJECT_KEY})`);
};

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i === -1) continue;
    data[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .replace(/\s+#.*$/, '')
      .trim();
  }
  return { data, body: text.slice(m[0].length) };
}

// ---- gather markdown projects --------------------------------------------
const mdProjects = [];
for (const d of readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name.startsWith('.') || d.name.startsWith('_')) continue;
  const pf = join(root, d.name, 'project.md');
  if (!existsSync(pf)) continue;
  const text = readText(pf);
  const { data: meta, body } = parseFrontmatter(text);
  if (!meta) continue;
  let done = 0;
  let total = 0;
  for (const line of body.split(/\r?\n/)) {
    const t = line.match(/^\s*[-*] \[([ xX~])\]/);
    if (t) {
      total++;
      if (t[1].toLowerCase() === 'x') done++;
    }
  }
  let lastLog = '';
  const lf = join(root, d.name, 'log.md');
  if (existsSync(lf)) {
    const entries = readText(lf).split(/\r?\n## /).slice(1);
    if (entries.length) {
      const [head, ...bodyLines] = entries[entries.length - 1].split(/\r?\n/);
      lastLog = `${head}: ${bodyLines.join(' ').trim()}`.slice(0, 300);
    }
  }
  mdProjects.push({ id: d.name, file: pf, meta, done, total, lastLog });
}

const adf = (lines) => ({
  type: 'doc',
  version: 1,
  content: lines.filter(Boolean).map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});

function desiredFor(p) {
  const status = STATUS_TO_JIRA[p.meta.status] || 'To Do';
  const due = /^\d{4}-\d{2}-\d{2}$/.test(p.meta.due || '') ? p.meta.due : null;
  const descLines = [
    p.meta.summary || '',
    `Progress: ${p.done}/${p.total} tasks — status ${p.meta.status}, urgency ${p.meta.urgency}${due ? `, due ${due}` : ''}.`,
    p.lastLog ? `Last update — ${p.lastLog}` : '',
    `Auto-managed by pm-sync (source project: ${p.id}). Edits to this issue are overwritten.`,
  ];
  return { summary: p.meta.name || p.id, due, status, descLines };
}
const hashOf = (want) => JSON.stringify([want.summary, want.due, want.status, want.descLines]);

function writeBackKey(p, key) {
  const lines = readText(p.file).split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return false;
  lines.splice(end, 0, `jira: ${key}`);
  writeFileSync(p.file, lines.join('\n'));
  return true;
}

// ---- main -----------------------------------------------------------------
const existing = new Map();
const search = await api(
  'GET',
  `rest/api/3/search/jql?jql=${encodeURIComponent(`project = ${PROJECT_KEY} AND labels = ${LABEL}`)}&fields=summary,status,duedate,labels&maxResults=100`,
);
for (const issue of search.issues || []) existing.set(issue.key, issue);

let created = 0;
let updated = 0;
let transitioned = 0;
let linkedBack = false;
const sprintKeys = [];

for (const p of mdProjects) {
  const want = desiredFor(p);
  let key = p.meta.jira || '';
  try {
    if (!key) {
      if (p.meta.status === 'done' || p.meta.status === 'archived') continue; // don't create cards for finished work
      if (DRY) {
        console.log(`[dry] CREATE ${ISSUE_TYPE} "${want.summary}" — status->${want.status}${want.due ? `, due ${want.due}` : ''}${SPRINTABLE.has(p.meta.status) ? ', into active sprint' : ''}`);
        continue;
      }
      const res = await api('POST', 'rest/api/3/issue', {
        fields: {
          project: { key: PROJECT_KEY },
          issuetype: { name: ISSUE_TYPE },
          summary: want.summary,
          labels: [LABEL],
          duedate: want.due,
          description: adf(want.descLines),
        },
      });
      key = res.key;
      assertPinned(key);
      created++;
      if (writeBackKey(p, key)) linkedBack = true;
      existing.set(key, { fields: { status: { name: 'To Do' } } }); // so the transition pass below runs
      console.log(`created ${key} for ${p.id}`);
    } else {
      assertPinned(key);
      const cur = existing.get(key);
      let prevHash = null;
      try {
        prevHash = (await api('GET', `rest/api/3/issue/${key}/properties/pm-sync`)).value?.hash ?? null;
      } catch {
        /* property absent */
      }
      if (prevHash !== hashOf(want)) {
        if (DRY) {
          console.log(`[dry] UPDATE ${key} (${p.id}) — summary/desc/due refresh${want.due ? `, due ${want.due}` : ''}`);
        } else {
          await api('PUT', `rest/api/3/issue/${key}`, {
            fields: { summary: want.summary, labels: [LABEL], duedate: want.due, description: adf(want.descLines) },
          });
          updated++;
        }
      }
    }
    // transition if the workflow status differs
    const curStatus = existing.get(key)?.fields?.status?.name;
    if (key && curStatus && curStatus.toLowerCase() !== want.status.toLowerCase()) {
      if (DRY) {
        console.log(`[dry] TRANSITION ${key} (${p.id}): ${curStatus} -> ${want.status}`);
      } else {
        const ts = await api('GET', `rest/api/3/issue/${key}/transitions`);
        const t = (ts.transitions || []).find((x) => x.to && x.to.name.toLowerCase() === want.status.toLowerCase());
        if (t) {
          await api('POST', `rest/api/3/issue/${key}/transitions`, { transition: { id: t.id } });
          transitioned++;
        } else {
          console.error(`sync-jira: no transition ${curStatus} -> ${want.status} for ${key}`);
        }
      }
    }
    if (key && SPRINTABLE.has(p.meta.status)) sprintKeys.push(key);
    if (!DRY && key) {
      await api('PUT', `rest/api/3/issue/${key}/properties/pm-sync`, { hash: hashOf(want) });
    }
  } catch (err) {
    console.error(`sync-jira: ${p.id}: ${err.message}`);
  }
}

// place active/blocked cards into the active sprint
if (BOARD_ID && sprintKeys.length) {
  try {
    const sprints = await api('GET', `rest/agile/1.0/board/${BOARD_ID}/sprint?state=active`);
    const sprint = (sprints.values || [])[0];
    if (sprint) {
      if (DRY) console.log(`[dry] SPRINT "${sprint.name}" (#${sprint.id}) <- ${sprintKeys.join(', ')}`);
      else await api('POST', `rest/agile/1.0/sprint/${sprint.id}/issue`, { issues: sprintKeys });
    }
  } catch (err) {
    console.error(`sync-jira: sprint placement: ${err.message}`);
  }
}

if (linkedBack && !DRY) {
  try {
    execSync(`git -C "${root}" add -A`, { stdio: 'ignore' });
    execSync(`git -C "${root}" commit -m "jira-bridge: link issue keys"`, { stdio: 'ignore' });
  } catch {
    console.error('sync-jira: git commit of key write-back failed (continuing)');
  }
}
console.log(
  `${DRY ? '[dry] ' : ''}jira: ${mdProjects.length} project(s) scanned, ${existing.size} linked issue(s) on ${PROJECT_KEY}, ${created} created, ${updated} updated, ${transitioned} transitioned`,
);

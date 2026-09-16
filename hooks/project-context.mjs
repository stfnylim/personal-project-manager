#!/usr/bin/env node
/**
 * SessionStart hook: if the session's cwd belongs to a tracked PM project
 * (matched via the project's `repo:` frontmatter), print a compact context
 * block — stdout becomes session context. Prints nothing when no project
 * matches, so untracked repos stay noise-free.
 *
 * Wire-up (user settings.json):
 *   "hooks": { "SessionStart": [ { "hooks": [ { "type": "command",
 *     "command": "node \"<repo>\\hooks\\project-context.mjs\"" } ] } ] }
 *
 * The projects dir comes from config.work.json (or config.life.json) next to
 * the repo root; pass a dir as argv[2] to override.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (f) => readFileSync(f, 'utf8').replace(/^﻿/, '');

let projectsDir = process.argv[2] || '';
if (!projectsDir) {
  for (const cand of ['config.work.json', 'config.life.json']) {
    const p = join(repoRoot, cand);
    if (existsSync(p)) {
      try {
        projectsDir = JSON.parse(readText(p)).projectsDir || '';
        if (projectsDir) break;
      } catch {
        /* unreadable config — try the next */
      }
    }
  }
}
if (!projectsDir || !existsSync(projectsDir)) process.exit(0);

const norm = (p) => resolve(String(p)).toLowerCase().replace(/[\\/]+$/, '');
const cwd = norm(process.cwd());

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  if (!m) return data;
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
  return data;
}

const blocks = [];
for (const d of readdirSync(projectsDir, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue;
  const projectFile = join(projectsDir, d.name, 'project.md');
  if (!existsSync(projectFile)) continue;
  const text = readText(projectFile);
  const meta = frontmatter(text);
  if (!meta.repo || meta.status === 'archived' || meta.status === 'done') continue;
  const repo = norm(meta.repo);
  if (!(cwd === repo || cwd.startsWith(repo + sep) || repo.startsWith(cwd + sep))) continue;

  const tasks = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.match(/^\s*[-*] \[([ xX~])\]\s+(.*)$/);
    if (t) tasks.push({ mark: t[1].toLowerCase(), text: t[2].trim() });
  }
  const done = tasks.filter((t) => t.mark === 'x').length;
  const wip = tasks.filter((t) => t.mark === '~').map((t) => t.text);
  const open = tasks.filter((t) => t.mark === ' ').map((t) => t.text);

  let lastLog = '';
  const logFile = join(projectsDir, d.name, 'log.md');
  if (existsSync(logFile)) {
    const entries = readText(logFile).split(/\r?\n## /).slice(1);
    if (entries.length) {
      const [head, ...body] = entries[entries.length - 1].split(/\r?\n/);
      lastLog = `${head} — ${body.join(' ').trim().slice(0, 220)}`;
    }
  }

  const lines = [];
  lines.push(
    `This repo's work is tracked as PM project "${d.name}" (${meta.name || d.name}) — status ${meta.status}, urgency ${meta.urgency}${meta.due ? `, due ${meta.due}` : ''}, tasks ${done}/${tasks.length}.`,
  );
  if (wip.length) lines.push(`In progress: ${wip.join(' | ')}`);
  if (open.length) lines.push(`Open: ${open.slice(0, 5).join(' | ')}${open.length > 5 ? ` (+${open.length - 5} more)` : ''}`);
  if (lastLog) lines.push(`Last log: ${lastLog}`);
  lines.push(
    `If this session does real work on it: read ${join(projectsDir, d.name, 'project.md')} and log.md for full context first, and keep them updated per ${join(projectsDir, 'PROTOCOL.md')} — check off tasks, mark [~] what you start, append a timestamped log entry at milestones, commit the projects folder.`,
  );
  blocks.push(lines.join('\n'));
}

if (blocks.length) console.log(`<pm-context>\n${blocks.join('\n\n')}\n</pm-context>`);

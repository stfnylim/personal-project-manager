# Project Manager — Scope (v1)

Agreed 2026-08-27.

## What this is

A work project-management system where AI chat sessions (Claude Code or Codex) log their work as
markdown in a shared folder; a deterministic sync script renders that folder into a Google Sheet;
a small React web UI (and the sheet itself) make it visible to me and a coworker.

Core principles:

- **The markdown folder is the source of truth.** The sheet and web UI are read-only views.
- **Scripts for mechanics, agents for judgment.** No LLM in the sync path.
- **One writer to the sheet: the sync script.** Agents — including the PM brain — only write markdown.

## Locked decisions

- **Sheets transport:** Google Apps Script webhook (`doPost` + shared secret). No GCP project, no OAuth.
- **Data location:** `O:\CGI\R_n_D\work.steph\projects\` — sibling folder outside this repo.
  Chats working in any repo write to this absolute path.
- **Web UI:** React + TypeScript (Vite), hosted on GitHub Pages from this repo. The sheet/endpoint
  URL is never committed (see privacy model below).

## Architecture

```
chats (Claude/Codex, any repo)          PM agent (phase 4, scheduled)
        │  writes md                            │  writes BRIEF.md only
        ▼                                       ▼
O:\CGI\R_n_D\work.steph\projects\   ◄── source of truth (git-tracked)
        │
        ▼  sync script (Task Scheduler, ~15-30 min + manual)
Apps Script webhook (doPost, secret)
        │
        ▼
Google Sheet [Projects | Updates | Summary]
        │                        │
        ▼  shared read-only      ▼  doGet JSON (read token)
    coworker                React web UI (GitHub Pages)
```

## Data layer (`work.steph\projects\`)

- `PROTOCOL.md` — the convention: when a chat should create a project folder, the schema, examples,
  and the no-secrets rule.
- `_templates/project.md`
- `BRIEF.md` — latest overall summary (written by the PM agent in phase 4; hand-written before that).
- One folder per project; **folder slug = unique project ID**:
  - `project.md` — YAML frontmatter (`name`, `status: active|blocked|backlog|done`,
    `horizon: short|long`, `urgency: high|medium|low`, `summary`) plus a `## Tasks` checkbox list.
    Progress ("3/10") is **derived from checkboxes by the sync** — agents never maintain counters.
  - `log.md` — append-only entries (`## YYYY-MM-DD HH:MM` + text), newest at bottom.
- The folder is git-init'd so "what changed this week" comes free.

### How chats stay consistent (no per-chat pasting)

- Global `~/.claude/CLAUDE.md` and global Codex `AGENTS.md` each get a short pointer: significant
  work maps to a project folder at the path above — read `PROTOCOL.md`, keep `project.md` and
  `log.md` current.
- A `/log` skill for Claude Code that creates/updates project folders per the protocol.
- The sync validates frontmatter; malformed files are flagged in the sheet, not silently dropped.
- **Rule (in PROTOCOL.md): no credentials, secrets, or client-confidential details in project
  files** — everything in this folder flows to a Google Sheet and a web endpoint.

## Google Sheet

| Tab | Content | Write behavior |
|---|---|---|
| `Projects` | ID, Name, Status, Horizon, Urgency, Progress, Summary, Last Update | fully rewritten each sync (idempotent) |
| `Updates` | Timestamp, Project ID, Entry | append with dedupe on (project, timestamp) |
| `Summary` | latest brief from `BRIEF.md` + generated-at | overwritten each sync |
| `Tasks` | Project, Done, Task — every checklist item (v1.4) | fully rewritten each sync |
| `Actions` | Project, Label, Type, Payload — from brain-maintained `ACTIONS.md` (v1.4) | fully rewritten each sync |

Apps Script bound to the sheet:

- `doPost` — receives the full sync payload, checks the shared secret, writes all three tabs.
- `doGet` — returns the tabs as JSON, checks a read token. This is what the web UI fetches
  (no Sheets API client, no CORS pain).

## Sync (this repo)

- Script run by Task Scheduler every 15–30 min plus a manual command: scan folder → parse/validate
  → derive progress + last-update → POST full state to the webhook.
- `config.work.json` (**gitignored**): projects folder path, webhook URL, secret, read token.
- **Life instance later** = `config.life.json`, a different folder, and a different sheet, run on
  the personal side. Same code; the work UI and sheet never touch it.

## Web UI (this repo → GitHub Pages)

- React + TS (Vite), read-only.
- Mostly read-only; the one write path (added v1.1) is a project's status: local builds show it
  as a dropdown whose change is queued in a `Pending` sheet tab and applied to `project.md` by
  the next sync run — markdown stays the source of truth.
- **Home:** renders the `Summary` tab (markdown) plus headline stats (active/blocked counts, top urgencies).
- **Projects:** sortable/filterable table of the `Projects` tab.
- **Project detail:** timeline of that project's `Updates`.
- **Privacy model:** gitignoring the sheet URL keeps it out of source, but anything baked into a
  deployed static bundle is public. So the endpoint URL + read token are entered **once at runtime**
  and kept in `localStorage` (optionally seeded via a `?src=...&token=...` link that stores then
  cleans itself). Nothing private in the repo or the bundle; the coworker gets the link once, out of band.
- Honest security level: the endpoint is "anyone with URL + token" — obscurity-grade. Fine for
  backlog metadata; reinforced by the no-secrets rule.

## PM brain (phase 4)

A scheduled Claude agent that reads the projects folder and writes **markdown only**:

- `BRIEF.md` — overall business summary → `Summary` tab → web UI home.
- Flags stale projects (no log entry in N days), surfaces backlog, questions priorities.

## Phases

1. **Data layer** — projects folder, `PROTOCOL.md`, template, global CLAUDE.md/AGENTS.md pointers, `/log` skill.
2. **Sync** — Apps Script code + setup steps (you create the sheet and deploy the script), sync script, config, Task Scheduler job.
3. **Web UI** — Vite app, Pages deploy via GitHub Actions, runtime connect screen.
4. **PM brain** — scheduled brief + stale-project flags.

## Non-goals (v1)

- Life instance (later; same code, second config).
- Real auth (no login system — token-in-URL obscurity is the accepted level).
- Hand-editing the sheet (synced cells get overwritten; the `Pending` queue is the only
  sheet-to-markdown path, and only the dashboard writes it).

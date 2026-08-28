# Project Log Protocol

This folder is the source of truth for this PM instance's projects. AI chat sessions create and
update the files here; a sync script renders them into a Google Sheet and a web dashboard.
Follow this protocol exactly — the sync parses these files mechanically, and malformed files get
flagged on the dashboard.

<!-- Installed from templates/PROTOCOL.md in the project-manager tooling repo. -->

## The one rule that matters most

**Never put credentials, secrets, API keys, tokens, or confidential details in any file in this
folder.** Everything here flows to a Google Sheet and a web endpoint. If a project involves a
secret, reference it by location ("uses the deploy key stored in X"), never by value.

## Layout

```
<projects-dir>\
  PROTOCOL.md          <- this file
  BRIEF.md             <- latest overall summary (maintained by the PM agent; don't edit casually)
  _templates\project.md
  <project-id>\        <- one folder per project; folder name = project ID
    project.md         <- metadata + task checklist
    log.md             <- append-only dated log
```

## When to create or update a project

Log work that is part of an ongoing effort: it produces artifacts (code, configs, docs), spans
multiple steps, or will need follow-up. Skip logging for one-off questions, quick lookups, and
throwaway experiments.

Before creating a new folder, **list the existing `<project-id>` folders** and check whether the
current work belongs to one of them. Prefer updating an existing project over creating a
near-duplicate.

## Project IDs

Folder name = permanent unique ID. Lowercase kebab-case, short but recognizable
(`garden-irrigation`, `tax-2026`). Never rename a folder — the ID is referenced by sheet and
dashboard history.

## project.md

Copy `_templates\project.md`. Frontmatter — the five listed fields required, values exactly as
listed; `due` is optional:

```yaml
---
name: Human-readable project name
status: active        # active | blocked | backlog | done | archived
horizon: short        # short (days/weeks) | long (months/ongoing)
urgency: medium       # high | medium | low
summary: One or two sentences describing the goal, written for a reader who was not in the chat.
due: 2026-09-15       # optional deadline, YYYY-MM-DD — omit the line if there is none
---
```

Status meanings: `done` = finished work worth keeping visible; `archived` = out of sight — the
dashboard hides archived projects everywhere except the Projects view's "archived" tab. Archive
abandoned efforts or done work that no longer needs to be seen; never delete the folder (history
stays answerable). A `due` date past or near moves the project into "Needs attention".

Body: a `## Tasks` section with a markdown checkbox list. Dashboard progress ("3/9") is **derived
by counting these checkboxes** — keep them current and never write manual counters.

```markdown
## Tasks
- [x] Scope agreed
- [ ] Build the thing
```

Task granularity: milestone-sized steps (roughly 5–15 per project), not micro-todos. Add tasks as
scope grows, check them off when done, edit wording freely. When the work is finished, set
`status: done` and delete or move any remaining nice-to-have tasks so the count reads complete.

## log.md

Append-only. New entries go at the **bottom**. Each entry:

```markdown
## 2026-08-27 07:45
Two or three sentences: what happened, what changed, what's next or what's blocking.
```

- Get the timestamp from the shell — never guess it:
  PowerShell `Get-Date -Format "yyyy-MM-dd HH:mm"` / bash `date +"%Y-%m-%d %H:%M"`.
- Write in plain language for a reader who was not in the chat; no chat-internal shorthand.
- One entry per working session or milestone. Don't log every keystroke; never rewrite or delete
  old entries.

## Status changes

When a project becomes blocked, unblocked, or done, change the frontmatter **and** add a log entry
saying why. Keep `summary` current if the goal shifts.

## After editing

Commit inside this folder if git reports changes: `git add -A` and a one-line message. This folder
has its own git history so "what changed this week" is answerable.

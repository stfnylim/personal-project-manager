# Personal edition setup (Life PM)

This runbook stands up a **second, independent instance** of the PM system on a personal
machine: its own projects folder, its own Google Sheet + Apps Script endpoint, its own dashboard
build, wired into that machine's Claude. It shares this repo's code; it shares **no data, no
config, and no secrets** with any other instance.

**Audience:** primarily the Claude session on the personal machine (paste: *"Clone
<repo-url>, then read PERSONAL-SETUP.md and set up my Life PM"*). Steps tagged **[HUMAN]**
need the person — mostly the Google 5 minutes. Everything else the assistant should just do,
confirming paths with the user as it goes.

Windows paths are shown; adapt to macOS/Linux equivalents where obvious.

---

## 0. Prerequisites

- git and Node 18+ on PATH (`git --version`, `node --version`).
- This repo cloned somewhere permanent, e.g. `%USERPROFILE%\src\project-manager`.
- A Google account for the sheet.

## 1. Create the data folder

Pick the projects folder location — default `%USERPROFILE%\life-pm\projects` (ask the user if
another home makes sense). Then:

1. Create the folder plus `_templates\` inside it.
2. Copy `templates/PROTOCOL.md` from this repo to `<projects-dir>\PROTOCOL.md`, replacing every
   `<projects-dir>` placeholder with the real absolute path.
3. Copy `templates/project.md` to `<projects-dir>\_templates\project.md`.
4. `git init` the folder and make the first commit ("life-pm data folder created").

## 2. Create the instance config

At the **repo root**, copy `config.work.example.json` to `config.life.json` (gitignored — never
commit it) and fill in:

- `projectsDir`: the absolute path from step 1.
- `secret` and `readToken`: two different long random strings. Generate, don't invent:
  PowerShell: `-join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })` (run twice).
- `webhookUrl`: leave the placeholder until step 3.

## 3. [HUMAN] Google side (~5 minutes)

Follow README.md "One-time Google setup" with these instance-specific values:

1. Create a blank spreadsheet named **Life PM** (personal Google account).
2. Extensions → Apps Script → paste all of `appsscript/Code.gs`.
3. Set the `SECRET` and `READ_TOKEN` constants to the values from `config.life.json`.
4. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone** → authorize.
5. Paste the `/exec` URL into `config.life.json` as `webhookUrl`.

## 4. First sync

```
node sync/sync.mjs --config config.life.json --dry-run   # parse + validate only
node sync/sync.mjs --config config.life.json             # real push; tabs appear in the sheet
```

Fix any validation flags before moving on (the sync prints exactly what's malformed).

## 5. Schedule the sync

```
schtasks /Create /TN "Life PM Sync" /TR "\"<full path to node.exe>\" \"<repo>\sync\sync.mjs\" --config \"<repo>\config.life.json\"" /SC MINUTE /MO 5 /F
```

(`where.exe node` gives the node path. Verify with `schtasks /Query /TN "Life PM Sync"`.)

## 6. Build the dashboard

```
npm --prefix ui install        # first time only
$env:PM_CONFIG='config.life.json'; npm --prefix ui run build
```

`ui\dist\index.html` is a single self-contained, **pre-connected** file — double-click to open,
bookmark the file URL. Treat it like the config (it embeds the tokens); it is gitignored.
Rebuild after UI changes or token rotation, always with `PM_CONFIG` set — a build without it
bakes the work config if that exists on the machine.

## 7. Wire Claude on this machine

1. Append `templates/CLAUDE-md-pointer.md` (with `<projects-dir>` filled in) to
   `%USERPROFILE%\.claude\CLAUDE.md`.
2. Install the skill: copy `templates/log-skill-SKILL.md` to
   `%USERPROFILE%\.claude\skills\log\SKILL.md`, filling in `<projects-dir>`.
3. Sanity check: in a fresh chat, ask Claude to create a test project; confirm it lands in the
   sheet on the next sync, then mark it done or delete the folder.

## 8. Optional: PM brain

Per README.md "PM brain": create a scheduled task in the Claude desktop app (e.g.
`life-pm-brief`, mornings) using `pm-brain/prompt.md` with this instance's projects folder, so
BRIEF.md/dashboard-home stays curated.

## 9. Bonus: Notion access from any device

Goal: a Notion embed block showing the live dashboard.

1. **[HUMAN]** Push this repo to GitHub. **Pages on the free plan requires a public repo** — the
   repo is designed to be safe public (configs and dist are gitignored; verify with
   `git ls-files | grep -i config` → only the example should appear). If public is unacceptable,
   skip Pages and stop here (the local dist file still works everywhere else).
2. Repo Settings → Pages → Source: **GitHub Actions**. The committed *Deploy dashboard* workflow
   publishes on every push touching `ui/`.
3. In Notion, on a **private** page: `/embed` →
   `https://<user>.github.io/<repo>/?src=<url-encoded webhookUrl>&token=<readToken>&stay=1`
   The `stay=1` keeps the connection in the URL so the embed reconnects on every device without
   relying on iframe storage.
4. **Security note:** that URL grants read access to the PM data to anyone who has it. Keep it
   only in private pages; if it leaks, rotate `READ_TOKEN` in the Apps Script (redeploy), update
   `config.life.json`, rebuild, and re-paste the embed.

## Done checklist

- [ ] Sheet fills on sync; scheduled task runs
- [ ] Dashboard opens pre-connected from `ui\dist\index.html`
- [ ] A fresh Claude chat logs a project unprompted after real work
- [ ] (Bonus) Notion embed renders on phone

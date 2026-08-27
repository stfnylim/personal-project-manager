# Project Manager

Turns markdown project logs (written by AI chat sessions into
`O:\CGI\R_n_D\work.steph\projects\`) into a Google Sheet and a web dashboard.
Full design in [SCOPE.md](SCOPE.md); the data-folder conventions live in the data folder's
`PROTOCOL.md`.

```
markdown folders ──(sync.mjs, scheduled)──▶ Apps Script doPost ──▶ Google Sheet
                                                                     │  doGet JSON
                                             coworker (sheet) ◀──────┴──▶ React dashboard
```

## Layout

- `appsscript/Code.gs` — code for the Apps Script bound to the sheet (doPost webhook + doGet JSON).
- `sync/sync.mjs` — zero-dependency Node script: scan, parse, validate, POST.
- `config.work.json` — **gitignored**: projects dir, webhook URL, secret, read token.
- `config.work.example.json` — committed placeholder shape.
- `ui/` — the React + TS dashboard (see Dashboard below).
- `.github/workflows/deploy-ui.yml` — builds `ui/` and publishes it to GitHub Pages on push.

## One-time Google setup (~5 min)

1. Create a blank spreadsheet at sheets.google.com (name it e.g. **Work PM**). The tabs are
   created automatically on first sync.
2. In the sheet: **Extensions → Apps Script**. Delete the stub code and paste all of
   `appsscript/Code.gs`.
3. Replace the two constants at the top (`SECRET`, `READ_TOKEN`) with the `secret` and
   `readToken` values from your local `config.work.json`. Never commit or share those values.
4. **Deploy → New deployment → type: Web app** — Execute as: **Me**, Who has access: **Anyone**.
   Authorize when prompted (it only touches this spreadsheet).
5. Copy the Web app URL (ends in `/exec`) into `config.work.json` as `webhookUrl`.
6. Test: `node sync/sync.mjs` — the tabs should appear and fill.

**After editing Code.gs later:** Deploy → Manage deployments → pencil → Version: *New version* →
Deploy. Saving alone does not update the live URL.

Sharing with a coworker: share the spreadsheet read-only, or (phase 3) give them the dashboard
link once — the dashboard reads `doGet?token=…` and stores the endpoint in localStorage, so
nothing private lives in this repo or the deployed bundle.

## Usage

```
node sync/sync.mjs               # parse, validate, push to the sheet
node sync/sync.mjs --dry-run     # parse + validate only, print payload
node sync/sync.mjs --config config.life.json    # a second instance (separate folder + sheet)
```

Scheduling (once the webhook works): a Task Scheduler job ("PM Sync") runs the sync every 5
minutes, so a folder change written by a chat reaches the sheet within ~5 minutes; hit
**Refresh** in the dashboard to pull it in immediately (it also auto-refreshes every 5 minutes).
Run `node sync/sync.mjs` yourself for an instant push. Equivalent one-liner registration —

```
schtasks /Create /TN "PM Sync" /TR "\"<path-to-node.exe>\" \"O:\CGI\R_n_D\work.steph\src\project-manager\sync\sync.mjs\"" /SC MINUTE /MO 20 /F
```

## Dashboard

React + TypeScript (Vite), zero runtime deps beyond React. **Next actions** (Overview) renders
the brain-curated `ACTIONS.md` as one-click buttons — `search`/`url` open a tab, `chat` copies a
task kickoff prompt; the Projects table has a ⚡ column that copies a kickoff prompt for that
project's next unchecked task, and each project page lists the full checklist with per-task
start buttons plus an "open repo in VS Code" link when `repo:` is set in its frontmatter.
The Overview page also has
**copy new project prompt** / **copy add project prompt** buttons (and each project page a
pre-filled variant) — paste into any Claude/Codex chat to hook that chat into the tracker; the
prompt texts live in `ui/src/prompts.ts`. Views: **Overview** (the
Summary brief, stat tiles, needs-attention / gone-quiet / file-issue lists, latest activity),
**Projects** (status filters + sortable table), and a per-project **log timeline**.

### Using it locally (no hosting)

The build is one self-contained, pre-connected file: `ui\dist\index.html`. Double-click it (or
bookmark the file URL) — no server, no npm, no connect screen. Builds made on this machine bake
the endpoint URL + read token in from `config.work.json` (both `dist/` and the config are
gitignored, so neither ever reaches git). Because of that, **treat the built file like the
config**: don't send `index.html` itself to anyone you wouldn't hand the read token.

Rebuild after UI changes or a token rotation: `npm --prefix ui run build`.
Dev server: `npm --prefix ui run dev` → http://localhost:5173 (also auto-connects).

Builds made where `config.work.json` doesn't exist (e.g. GitHub Actions) bake nothing and show
the connect screen; the `?src=…&token=…` link flow below covers that case.

### Editing from the dashboard

Local builds (which carry the write secret from `config.work.json`) render each project's
**status as a dropdown**. Changing it does two things: the sheet's Projects tab updates
immediately, and the change is queued in a `Pending` tab. On its next run the sync applies the
change to that project's `project.md`, appends a log entry ("Status changed to X from the
dashboard"), commits, and clears the queue — so the markdown stays the source of truth. Builds
without the baked config (hosted/CI) show a plain read-only badge.

### Optional: publish to GitHub Pages

Only needed if someone else should use the dashboard (the coworker can just use the shared
sheet). Setup:

1. Create a GitHub repo and push this folder to `main` (the repo contains no secrets — config is
   gitignored; the dashboard never embeds the endpoint).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. The *Deploy dashboard* workflow builds and publishes on every push that touches `ui/`.

Connecting: the app asks for a name, endpoint URL + read token once and keeps them in
localStorage — never in the repo or the built bundle. To hand it to a coworker, send a one-time
link: `https://<user>.github.io/<repo>/?src=<url-encoded webhookUrl>&token=<readToken>&label=Work`
— the app stores the values, then scrubs them from the address bar.

## Second instance / personal edition

The system is multi-instance: each instance = its own projects folder + its own
`config.<name>.json` (gitignored) + its own sheet/endpoint. `PERSONAL-SETUP.md` is a full
runbook — written to be executed by the Claude on another machine — that stands up a personal
"Life PM" from a clone of this repo, including templates (`templates/`), the dashboard build
against a chosen config (`PM_CONFIG=config.life.json npm --prefix ui run build`), and an
optional Notion embed of the hosted dashboard (`?src=…&token=…&stay=1` keeps the connection
alive inside the iframe; private pages only).

## Global dashboard (multiple sources)

The dashboard is multi-source: it can merge any number of instances (e.g. Work + Life) in the
browser while the instances keep separate folders, sheets, endpoints, and secrets. With more
than one source connected, a scope switcher (All · Work · Life) appears in the top bar and every
merged row carries its source's identity dot + label (colors are validated categorical slots,
distinct from the status colors). Edits route to the owning instance's endpoint and only where
that source's write secret is present; briefs stay per-source cards.

Ways to connect sources:

- **Baked build:** `PM_CONFIG=config.work.json,config.life.json npm --prefix ui run build` —
  each config's `projectsDir` and secret ride along, so prompts and edits target the right
  instance. An optional `"label"` key in a config overrides the label derived from its filename.
- **In the app:** the **Sources** screen adds/removes endpoints at runtime (stored in
  localStorage only; read-only unless baked).
- **Link:** repeat the params — `?src=…&token=…&label=Work&src=…&token=…&label=Life` — the
  triples are zipped in order.

## PM brain

A scheduled agent (phase 4) that rewrites `BRIEF.md` in the projects folder — headline, "needs
attention", "gone quiet" (stale >7 days), and backlog-watch sections — then commits and runs the
sync so the brief lands in the sheet's **Summary** tab and the dashboard home screen.

- The canonical instructions live in `pm-brain/prompt.md` — edit that file to tune the brief.
- It runs as a **Claude desktop app scheduled task** (`work-pm-brief`, weekday mornings, visible
  under "Scheduled" in the app sidebar). Tasks run while the app is open; if the app was closed
  at the scheduled time, the run happens on next launch. Use "Run now" in the sidebar for an
  on-demand brief.
- **Manual run:** double-click `pm-brain\run-brain.cmd` (or the "PM Brain" Desktop shortcut) —
  it drives the bundled CLI headlessly, shows progress, and logs to `pm-brain\last-run.log`.
  One-time setup first: the CLI's login is separate from the desktop app's, so run
  `pm-brain\login-cli.cmd` once, type `/login`, finish the browser flow, then `/exit`.

## Security model

- The sync POSTs with a shared `secret`; the dashboard reads with a `readToken`. Both live only
  in the gitignored config and inside the Apps Script deployment.
- The endpoint is "anyone with URL + token" — obscurity-grade by design. The data folder's
  PROTOCOL.md therefore bans secrets and client-confidential details in project files.
- The sheet is never a source: hand-edits to synced cells get overwritten on the next sync. The
  one deliberate exception is the `Pending` tab — the queue dashboard edits travel through on
  their way into the markdown.

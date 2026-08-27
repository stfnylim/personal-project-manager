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

Scheduling (once the webhook works): a Task Scheduler job runs the sync every 20 minutes —

```
schtasks /Create /TN "PM Sync" /TR "\"<path-to-node.exe>\" \"O:\CGI\R_n_D\work.steph\src\project-manager\sync\sync.mjs\"" /SC MINUTE /MO 20 /F
```

## Dashboard

React + TypeScript (Vite), read-only, zero runtime deps beyond React. Views: **Overview** (the
Summary brief, stat tiles, needs-attention / gone-quiet / file-issue lists, latest activity),
**Projects** (status filters + sortable table), and a per-project **log timeline**.

### Using it locally (no hosting)

The build is one self-contained file: `ui\dist\index.html`. Double-click it — no server, no npm.
The first time in a given browser, connect by pasting the pre-filled link this prints into the
address bar:

```
powershell -c "$c = Get-Content 'O:\CGI\R_n_D\work.steph\src\project-manager\config.work.json' | ConvertFrom-Json; \"file:///O:/CGI/R_n_D/work.steph/src/project-manager/ui/dist/index.html?src=$([uri]::EscapeDataString($c.webhookUrl))&token=$($c.readToken)\""
```

Bookmark that link and it's one click from then on (the browser also remembers the connection in
localStorage, so the plain file works too). After changing UI code, rebuild with
`npm --prefix ui run build`. Local dev server: `npm --prefix ui run dev` → http://localhost:5173.

### Optional: publish to GitHub Pages

Only needed if someone else should use the dashboard (the coworker can just use the shared
sheet). Setup:

1. Create a GitHub repo and push this folder to `main` (the repo contains no secrets — config is
   gitignored; the dashboard never embeds the endpoint).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. The *Deploy dashboard* workflow builds and publishes on every push that touches `ui/`.

Connecting: the app asks for the endpoint URL + read token once and keeps them in localStorage —
never in the repo or the built bundle. To hand it to a coworker, send a one-time link:
`https://<user>.github.io/<repo>/?src=<url-encoded webhookUrl>&token=<readToken>` — the app
stores the values, then scrubs them from the address bar.

## Security model

- The sync POSTs with a shared `secret`; the dashboard reads with a `readToken`. Both live only
  in the gitignored config and inside the Apps Script deployment.
- The endpoint is "anyone with URL + token" — obscurity-grade by design. The data folder's
  PROTOCOL.md therefore bans secrets and client-confidential details in project files.
- The sheet is never a source: hand-edits to synced cells get overwritten on the next sync.

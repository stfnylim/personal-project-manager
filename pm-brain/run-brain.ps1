# PM brain — manual runner. Headless Claude rewrites BRIEF.md + ACTIONS.md in the
# projects folder, commits, and syncs to the sheet. (Scheduled runs use the Claude
# desktop app's task scheduler; this script is the double-click / Task Scheduler path.)
#
# One-time setup: the CLI's login is separate from the desktop app's — run
# login-cli.cmd once and type /login if this script reports an auth failure.
$projects = 'O:\CGI\R_n_D\work.steph\projects'
$repo = 'O:\CGI\R_n_D\work.steph\src\project-manager'
Start-Transcript -Path (Join-Path $repo 'pm-brain\last-run.log') -Force | Out-Null

# The CLI ships inside the Claude desktop app, in a versioned folder — resolve the newest.
$cliRoot = Join-Path $env:APPDATA 'Claude\claude-code'
$exe = $null
if (Test-Path $cliRoot) {
  $ver = Get-ChildItem $cliRoot -Directory |
    Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
    Select-Object -First 1
  if ($ver) { $exe = Join-Path $ver.FullName 'claude.exe' }
}
if (-not $exe -or -not (Test-Path $exe)) {
  Write-Host "claude.exe not found under $cliRoot"
  Stop-Transcript | Out-Null
  exit 1
}

Set-Location $projects
$prompt = (Get-Content (Join-Path $repo 'pm-brain\prompt.md') -Raw) + "`nToday is: $(Get-Date -Format 'yyyy-MM-dd HH:mm')."
Write-Host "Running the PM brain - this takes a couple of minutes..."
Write-Host ""
$prompt | & $exe -p --allowedTools "Read,Glob,Grep,Write,Bash"
Write-Host ""
Write-Host "Safety net: commit + sync in case the run skipped them..."
& git -C $projects add -A
& git -C $projects commit -m "pm-brain: refresh brief + actions"
& node "$repo\sync\sync.mjs"
Stop-Transcript | Out-Null

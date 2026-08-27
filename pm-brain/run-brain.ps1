# PM brain: headless Claude rewrites BRIEF.md in the projects folder, then the
# sync pushes it to the sheet's Summary tab (and the dashboard home screen).
$projects = 'O:\CGI\R_n_D\work.steph\projects'
$repo = 'O:\CGI\R_n_D\work.steph\src\project-manager'
$log = Join-Path $repo 'pm-brain\last-run.log'

"=== pm-brain $(Get-Date -Format 'yyyy-MM-dd HH:mm') ===" | Out-File $log -Encoding utf8

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
  "claude.exe not found under $cliRoot" | Out-File $log -Append -Encoding utf8
  exit 1
}

Set-Location $projects
$prompt = (Get-Content (Join-Path $repo 'pm-brain\prompt.md') -Raw) + "`nToday is: $(Get-Date -Format 'yyyy-MM-dd HH:mm')."
$prompt | & $exe -p --allowedTools "Read,Glob,Grep,Write,Bash" *>> $log

& git -C $projects add -A *>> $log
& git -C $projects commit -m "pm-brain: refresh BRIEF.md" *>> $log
& node "$repo\sync\sync.mjs" *>> $log

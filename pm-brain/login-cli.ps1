# One-time: log the bundled Claude CLI in (its auth is separate from the desktop app's).
$ver = Get-ChildItem "$env:APPDATA\Claude\claude-code" -Directory |
  Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
  Select-Object -First 1
Write-Host "Claude will open below. Type /login and press Enter, follow the browser flow,"
Write-Host "then type /exit once it says you're logged in."
Write-Host ""
& (Join-Path $ver.FullName 'claude.exe')

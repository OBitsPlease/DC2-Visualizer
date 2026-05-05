# Start-DOGE2-Visualizer.ps1
# Starts the DOGE2 visualizer server + Cloudflare tunnel,
# then writes the public URL to a text file and opens it.

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerScript = Join-Path $ScriptDir "doge2-server.js"
$UrlFile      = Join-Path $ScriptDir "DOGE2-Visualizer-URL.txt"
$CloudflaredExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$ServerPort  = 3100

Write-Host ""
Write-Host "  +==================================+" -ForegroundColor Yellow
Write-Host "  |   DOGE2 Chain Visualizer         |" -ForegroundColor Yellow
Write-Host "  +==================================+" -ForegroundColor Yellow
Write-Host ""

# ── Stop any leftover processes on port 3100 ──────────────────
Write-Host "[1/4] Cleaning up previous instances..." -ForegroundColor Cyan
$oldPids = (netstat -ano | Select-String ":$ServerPort\s").ToString() -split '\s+' | Select-Object -Last 1
foreach ($p in $oldPids) {
    if ($p -match '^\d+$') { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
}
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# ── Start the Node.js visualizer server ───────────────────────
Write-Host "[2/4] Starting visualizer server on port $ServerPort..." -ForegroundColor Cyan
$serverProc = Start-Process -FilePath "node" -ArgumentList "`"$ServerScript`"" -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 2

# Quick health check
try {
    $null = Invoke-WebRequest "http://127.0.0.1:$ServerPort/" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "      Server is up ✓" -ForegroundColor Green
} catch {
    Write-Host "      WARNING: Server did not respond. Check that node.js is installed." -ForegroundColor Red
}

# ── Start Cloudflare tunnel ────────────────────────────────────
Write-Host "[3/4] Starting Cloudflare tunnel..." -ForegroundColor Cyan

$tunnelUrl = $null
$cfOutput   = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()

$cfProc = Start-Process -FilePath $CloudflaredExe `
    -ArgumentList "tunnel --url http://127.0.0.1:$ServerPort --protocol http2" `
    -RedirectStandardError "$ScriptDir\cf-stderr.log" `
    -PassThru -WindowStyle Minimized

# Poll the stderr log for the trycloudflare URL (appears within ~5-10s)
Write-Host "[4/4] Waiting for tunnel URL" -ForegroundColor Cyan -NoNewline
$deadline = (Get-Date).AddSeconds(60)
$cfLog     = "$ScriptDir\cf-stderr.log"

while ((Get-Date) -lt $deadline) {
    Write-Host "." -NoNewline -ForegroundColor Yellow
    Start-Sleep -Seconds 2

    if (Test-Path $cfLog) {
        $content = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
            break
        }
    }
}
Write-Host ""

if (-not $tunnelUrl) {
    Write-Host "  Could not get tunnel URL. Check cf-stderr.log for details." -ForegroundColor Red
    $tunnelUrl = "TUNNEL URL NOT FOUND - check cf-stderr.log"
}

# ── Write URL to file and open it ─────────────────────────────
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

@"
DOGE2 Blockchain Visualizer - Live Public Link
===============================================

Share this URL with anyone you want to see the visualizer:

  $tunnelUrl

This is a FREE Cloudflare trycloudflare.com tunnel.
*** The URL changes every time you restart the launcher. ***

SECURITY:
  - Only the read-only blockchain visualizer is publicly accessible
  - Your DOGE2 wallet and node RPC (port 22655) are NOT reachable
  - Wallet methods (send, balance, private keys) are hard-blocked
  - The tunnel only forwards to the visualizer server on 127.0.0.1:$ServerPort

Started: $timestamp
Server PID: $($serverProc.Id)
Tunnel PID: $($cfProc.Id)

To stop: close this window or press Ctrl+C in the launcher window.
"@ | Set-Content -Path $UrlFile -Encoding UTF8

Write-Host ""
Write-Host "  +----------------------------------------------------------+" -ForegroundColor Green
Write-Host "  |  PUBLIC URL:                                             |" -ForegroundColor Green
Write-Host "  |  $tunnelUrl" -ForegroundColor White
Write-Host "  +----------------------------------------------------------+" -ForegroundColor Green
Write-Host ""

# Open Notepad with the URL file
Start-Process notepad $UrlFile

# Open local browser too
Start-Process "http://127.0.0.1:$ServerPort"

Write-Host "  Press ENTER to stop the server and tunnel." -ForegroundColor Gray
Read-Host | Out-Null

# ── Cleanup ────────────────────────────────────────────────────
Write-Host "Shutting down..." -ForegroundColor Cyan
Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $cfProc.Id     -Force -ErrorAction SilentlyContinue
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "Goodbye! 🐕" -ForegroundColor Yellow

@echo off
rem ZenPanel CLI (Windows) - duoc install.ps1 cai vao C:\ZenPanel\bin\zenpanel.cmd
setlocal
set TASK=ZenPanel Agent
set APP=C:\ZenPanel\app
set DATA=C:\ProgramData\ZenPanel
set LOG=%DATA%\zenpanel.log
set ACT=%~1
if "%ACT%"=="" set ACT=status

if /i "%ACT%"=="start" ( schtasks /Run /TN "%TASK%" & goto :eof )
if /i "%ACT%"=="stop" goto stop
if /i "%ACT%"=="restart" ( call :stop & timeout /t 2 >nul & schtasks /Run /TN "%TASK%" & goto :eof )
if /i "%ACT%"=="status" ( schtasks /Query /TN "%TASK%" /V /FO LIST | findstr /i "TaskName Status Last" & goto :eof )
if /i "%ACT%"=="logs" ( powershell -NoProfile -Command "Get-Content -Encoding UTF8 '%LOG%' -Tail 50 -Wait" & goto :eof )
if /i "%ACT%"=="url" ( powershell -NoProfile -Command "$u=''; if (Test-Path '%DATA%\tunnel.url') { $u=(Get-Content '%DATA%\tunnel.url' -Raw).Trim() }; if (-not $u -and (Test-Path '%LOG%')) { $u=(Select-String -Path '%LOG%' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1).Matches.Value }; if ($u) { try { $tok = & node '%APP%\agent\dist\cli\login-url.js' $u; if ($tok) { Write-Host $tok; exit 0 } } catch {}; Write-Host $u } else { Write-Host 'Cloudflare Tunnel dang ket noi hoac chua bat.' }" & goto :eof )
if /i "%ACT%"=="reset-password" ( cd /d "%APP%\agent" & set "ZENPANEL_DATA_DIR=%DATA%" & node dist\cli\reset-password.js %2 & goto :eof )
if /i "%ACT%"=="update" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$app='%APP%'; $sub='%2'; $force=($sub -eq '--force' -or $sub -eq '-f' -or $sub -eq '--full' -or $sub -eq 'full'); $onlyUi=($sub -eq 'ui' -or $sub -eq 'website' -or $sub -eq '--ui'); " ^
    "function Update-Website { " ^
    "  Write-Host '`n🌐 Dang tien hanh cap nhat giao dien Website ZenPanel...'; " ^
    "  $tmp = Join-Path $env:TEMP ('zp_ui_' + [System.Guid]::NewGuid().ToString('N').Substring(0,8)); " ^
    "  New-Item -ItemType Directory -Path $tmp -Force | Out-Null; " ^
    "  $zipFile = Join-Path $tmp 'main.zip'; " ^
    "  Write-Host '📥 Dang tai ma nguon moi nhat tu GitHub...'; " ^
    "  Invoke-WebRequest -Uri 'https://codeload.github.com/TXAVL/vps-dashboard/zip/refs/heads/main' -OutFile $zipFile; " ^
    "  Expand-Archive -Path $zipFile -DestinationPath $tmp -Force; " ^
    "  $srcRoot = Get-ChildItem -Path $tmp -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'dashboard') } | Select-Object -First 1; " ^
    "  if (-not $srcRoot) { Write-Host '❌ Khong tim thay thu muc dashboard.'; exit 1 }; " ^
    "  $srcDash = Join-Path $srcRoot.FullName 'dashboard'; " ^
    "  $dstDash = Join-Path $app 'dashboard'; " ^
    "  Write-Host '🔨 Dang dong bo tep tin dashboard...'; " ^
    "  if (Test-Path (Join-Path $dstDash 'src')) { Remove-Item -Recurse -Force (Join-Path $dstDash 'src') }; " ^
    "  Copy-Item -Recurse -Force (Join-Path $srcDash 'src') (Join-Path $dstDash 'src'); " ^
    "  if (Test-Path (Join-Path $srcDash 'public')) { Copy-Item -Recurse -Force (Join-Path $srcDash 'public') (Join-Path $dstDash 'public') }; " ^
    "  Copy-Item -Force (Join-Path $srcDash 'package.json') (Join-Path $dstDash 'package.json'); " ^
    "  if (Test-Path (Join-Path $srcDash 'index.html')) { Copy-Item -Force (Join-Path $srcDash 'index.html') (Join-Path $dstDash 'index.html') }; " ^
    "  if (Test-Path (Join-Path $srcDash 'vite.config.ts')) { Copy-Item -Force (Join-Path $srcDash 'vite.config.ts') (Join-Path $dstDash 'vite.config.ts') }; " ^
    "  Write-Host '⚡ Dang build lai giao dien Website (Vite)...'; " ^
    "  Push-Location $dstDash; try { cmd.exe /c 'npm run build' } finally { Pop-Location }; " ^
    "  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue; " ^
    "  Write-Host '`n================================================================'; " ^
    "  Write-Host '✔ Cap nhat giao dien Website ZenPanel THANH CONG!'; " ^
    "  Write-Host '✔ Dich vu khong can khoi dong lai - GIU NGUYEN 100% URL HIEN TAI!'; " ^
    "  Write-Host '================================================================'; " ^
    "  $curUrl = (Select-String -Path '%LOG%' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -Last 1).Matches.Value; " ^
    "  if ($curUrl) { " ^
    "    Write-Host ('🔗 URL hien tai: ' + $curUrl); " ^
    "    try { $loginUrl = & node (Join-Path $app 'agent\dist\cli\login-url.js') $curUrl; if ($loginUrl) { Write-Host ('🚀 Link dang nhap 1-Click (Tu dong login):`n   ' + $loginUrl) } } catch {} " ^
    "  }; " ^
    "  Write-Host '`n👉 Chi can tai lai (F5 / Ctrl+F5) tren trinh duyet de thay thay doi moi.`n'; " ^
    "}; " ^
    "if ($onlyUi) { Update-Website; exit 0 }; " ^
    "Write-Host '🔍 Dang kiem tra phien ban ZenPanel...'; " ^
    "$cur = ''; if (Test-Path \"$app\agent\package.json\") { $cur = (Get-Content \"$app\agent\package.json\" | ConvertFrom-Json).version }; " ^
    "try { $rem = (Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/package.json' -TimeoutSec 6).version } catch { $rem = '' }; " ^
    "if (-not $force -and $cur -and $rem -and [version]$cur -ge [version]$rem) { " ^
    "  Write-Host \"`n================================================================`n✔ Phien ban he thong: v$cur (Chua tang so phien ban).`n🚀 Tu dong cap nhat giao dien Website ZenPanel tu GitHub & GIU NGUYEN URL...`n================================================================\"; " ^
    "  Update-Website; exit 0 " ^
    "}; " ^
    "irm https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.ps1 | iex"
  goto :eof
)
echo Dung: zenpanel {status^|start^|stop^|restart^|logs^|url^|reset-password [mat-khau]^|update [ui^|--force]}
goto :eof

:stop
schtasks /End /TN "%TASK%" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*ZenPanel\app*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Da dung ZenPanel
goto :eof

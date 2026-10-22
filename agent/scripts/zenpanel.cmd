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
if /i "%ACT%"=="url" ( powershell -NoProfile -Command "(Select-String -Path '%LOG%' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1).Matches.Value" & goto :eof )
if /i "%ACT%"=="reset-password" ( cd /d "%APP%\agent" & set "ZENPANEL_DATA_DIR=%DATA%" & node dist\cli\reset-password.js %2 & goto :eof )
if /i "%ACT%"=="update" ( powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.ps1 | iex" & goto :eof )
echo Dung: zenpanel {status^|start^|stop^|restart^|logs^|url^|reset-password [mat-khau]^|update}
goto :eof

:stop
schtasks /End /TN "%TASK%" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*ZenPanel\app*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Da dung ZenPanel
goto :eof

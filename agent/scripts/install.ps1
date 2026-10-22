# ZenPanel - Script cài đặt 1 dòng cho Windows Server 2016+ / Windows 10/11
#   irm https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.ps1 | iex
# Biến môi trường tùy chọn: ZENPANEL_PORT (2083), ZENPANEL_BRANCH (main), ZENPANEL_TUNNEL (1)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'TXAVL/vps-dashboard'
$Branch = if ($env:ZENPANEL_BRANCH) { $env:ZENPANEL_BRANCH } else { 'main' }
$Port = if ($env:ZENPANEL_PORT) { $env:ZENPANEL_PORT } else { '2083' }
$Tunnel = if ($env:ZENPANEL_TUNNEL) { $env:ZENPANEL_TUNNEL } else { '1' }
$AppDir = 'C:\ZenPanel\app'
$DataDir = 'C:\ProgramData\ZenPanel'
$LogFile = Join-Path $DataDir 'zenpanel.log'
$TaskName = 'ZenPanel Agent'

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Blue }
function Ok($text) { Write-Host $text -ForegroundColor Green }

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Hãy mở PowerShell bằng "Run as Administrator" rồi chạy lại.' -ForegroundColor Red
    exit 1
}

Write-Host "🧘 ZenPanel installer — $((Get-CimInstance Win32_OperatingSystem).Caption) · $env:PROCESSOR_ARCHITECTURE" -ForegroundColor Cyan

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Test-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    return [int]((& node -p "process.versions.node.split('.')[0]")) -ge 20
}

Step 'Kiểm tra Node.js (cần >= 20)'
if (Test-Node) {
    Ok "Đã có Node.js $(node -v)"
} else {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $lts = $index | Where-Object { $_.lts -and ([int]($_.version.TrimStart('v').Split('.')[0]) -ge 20) } | Select-Object -First 1
    $msi = Join-Path $env:TEMP "node-$($lts.version)-$arch.msi"
    Write-Host "Đang tải Node.js $($lts.version) ..."
    Invoke-WebRequest "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-$arch.msi" -OutFile $msi
    Start-Process msiexec.exe -ArgumentList '/i', "`"$msi`"", '/qn', '/norestart' -Wait
    Remove-Item $msi -Force
    Refresh-Path
    if (-not (Test-Node)) { throw 'Cài Node.js thất bại. Hãy cài Node.js >= 20 thủ công rồi chạy lại.' }
    Ok "Đã cài Node.js $(node -v)"
}

Step "Tải mã nguồn ZenPanel ($Repo@$Branch)"
$tmp = Join-Path $env:TEMP "zenpanel-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp 'src.zip'
Invoke-WebRequest "https://codeload.github.com/$Repo/zip/refs/heads/$Branch" -OutFile $zip
Expand-Archive $zip -DestinationPath $tmp -Force
$src = Get-ChildItem $tmp -Directory | Select-Object -First 1

# Dừng bản đang chạy trước khi ghi đè
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$AppDir*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

New-Item -ItemType Directory -Force $AppDir, $DataDir | Out-Null
foreach ($dir in 'agent\src', 'agent\dist', 'dashboard\src', 'dashboard\dist') {
    $target = Join-Path $AppDir $dir
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
}
Copy-Item (Join-Path $src.FullName '*') $AppDir -Recurse -Force
Remove-Item $tmp -Recurse -Force

# Một số VPS Windows: cmd.exe (npm dùng để chạy script) không thấy "node" dù PowerShell thấy.
# Vì vậy cài gói với --ignore-scripts (esbuild/node-pty có bản build sẵn) và gọi node.exe trực tiếp.
$node = (Get-Command node).Source
$env:Path = "$(Split-Path $node);$env:Path"
function Invoke-Node([string[]]$NodeArgs) {
    & $node @NodeArgs
    if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại: node $($NodeArgs -join ' ')" }
}
function Invoke-Npm([string[]]$NpmArgs) {
    & npm @NpmArgs --ignore-scripts --no-fund --no-audit --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại: npm $($NpmArgs -join ' ')" }
}

Step 'Build ZenPanel Agent'
Push-Location (Join-Path $AppDir 'agent')
Invoke-Npm @('ci')
Invoke-Node @('node_modules/typescript/bin/tsc', '-p', 'tsconfig.json')
Invoke-Npm @('prune', '--omit=dev')
Pop-Location

Step 'Build ZenPanel Dashboard'
Push-Location (Join-Path $AppDir 'dashboard')
Invoke-Npm @('ci')
Invoke-Node @('node_modules/typescript/bin/tsc', '-b')
Invoke-Node @('node_modules/vite/bin/vite.js', 'build')
Pop-Location

Step 'Đăng ký ZenPanel chạy nền cùng Windows (Scheduled Task - SYSTEM)'
$starter = 'C:\ZenPanel\start-zenpanel.cmd'
@"
@echo off
set ZENPANEL_PORT=$Port
set ZENPANEL_TUNNEL=$Tunnel
set ZENPANEL_DATA_DIR=$DataDir
cd /d "$AppDir\agent"
"$node" "$AppDir\agent\dist\server.js" > "$LogFile" 2>&1
"@ | Set-Content -Path $starter -Encoding ASCII

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$starter`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null

if (-not (Get-NetFirewallRule -DisplayName "ZenPanel Panel $Port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "ZenPanel Panel $Port" -Group 'ZenPanel' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
}

if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
Start-ScheduledTask -TaskName $TaskName

Step 'Cài lệnh tắt: zenpanel'
$cliDir = 'C:\ZenPanel\bin'
New-Item -ItemType Directory -Force $cliDir | Out-Null
# Ghi đường dẫn tuyệt đối của node.exe vì cmd.exe trên một số VPS không thấy "node" trong PATH
(Get-Content (Join-Path $AppDir 'agent\scripts\zenpanel.cmd') -Raw).Replace('node dist\cli', "`"$node`" dist\cli") |
    Set-Content -Path (Join-Path $cliDir 'zenpanel.cmd') -Encoding ASCII
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if ($machinePath -notlike "*$cliDir*") { [Environment]::SetEnvironmentVariable('Path', "$machinePath;$cliDir", 'Machine') }

Step 'Chờ ZenPanel khởi động và Cloudflare cấp domain'
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if ((Test-Path $LogFile) -and (Select-String -Path $LogFile -Pattern 'Public URL' -Quiet)) { break }
}

if (Test-Path $LogFile) {
    # In lại khung thông tin (Public URL, Local, mật khẩu lần đầu) từ log của agent
    $lines = Get-Content $LogFile -Encoding UTF8
    $start = ($lines | Select-String '╭' | Select-Object -Last 1).LineNumber
    $end = ($lines | Select-String '╰' | Select-Object -Last 1).LineNumber
    if ($start -and $end) { $lines[($start - 1)..($end - 1)] | ForEach-Object { Write-Host $_ } }
}

Ok "`n✔ Cài đặt ZenPanel hoàn tất!"
Write-Host '  • Tự chạy lại khi khởi động lại Windows: đã bật (Scheduled Task SYSTEM)'
Write-Host '  • Lệnh nhanh (mở cửa sổ PowerShell/CMD mới): zenpanel status | restart | logs | url | reset-password | update'

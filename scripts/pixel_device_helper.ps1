<#
.SYNOPSIS
    Pixel 8 & Pixel 10 Wireless ADB Device Manager, Deployer, and Debugger.
.DESCRIPTION
    Full support for Wireless Debugging on Google Pixel 8 and Pixel 10 when the USB-C
    port is occupied by an external Desktop Mode monitor/capture card.
    Handles Wi-Fi pairing (adb pair), connection (adb connect), APK installation,
    HUD permissions, and filtered logcat debugging.
.PARAMETER Action
    Action to perform: "all", "detect", "connect", "pair", "install", "launch", "logs". Default is "all".
.PARAMETER Target
    Target device model: "pixel_8", "pixel_10", or "auto".
.PARAMETER Address
    IP address and port for wireless debugging (e.g. "192.168.86.50:41235").
.PARAMETER PairCode
    6-digit pairing code (for "pair" action).
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("detect", "connect", "pair", "install", "launch", "logs", "all", "pixel_8", "pixel_10", "auto")]
    [string]$Action = "all",

    [Parameter(Position=1)]
    [string]$Target = "auto",

    [Parameter(Position=2)]
    [string]$Address = "",

    [Parameter(Position=3)]
    [string]$PairCode = ""
)

# Normalize if target was passed as first argument
if ($Action -in @("pixel_8", "pixel_10", "auto")) {
    $Target = $Action
    $Action = "all"
}

$cacheDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cacheFile = Join-Path $cacheDir ".devices_cache.json"

function Load-DeviceCache {
    if (Test-Path $cacheFile) {
        try { return (Get-Content $cacheFile -Raw | ConvertFrom-Json) } catch { return @{} }
    }
    return [PSCustomObject]@{}
}

function Save-DeviceCache($key, $addr) {
    $c = Load-DeviceCache
    if (!$c) { $c = [PSCustomObject]@{} }
    if (!$c.PSObject.Properties[$key]) {
        $c | Add-Member -NotePropertyName $key -NotePropertyValue $addr -Force
    } else {
        $c.$key = $addr
    }
    try { ($c | ConvertTo-Json -Compress) | Set-Content $cacheFile -Force } catch {}
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  MATRIX CAPTURE: WIRELESS PIXEL DEVICE MANAGER" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan

# Handle Pairing Action
if ($Action -eq "pair") {
    Write-Host "`n>> WIRELESS PAIRING SETUP" -ForegroundColor Yellow
    Write-Host "1. On your phone: Settings > System > Developer options > Wireless debugging (turn ON)."
    Write-Host "2. Tap 'Pair device with pairing code'."
    Write-Host "3. Look for 'IP address & Port' and the 6-digit 'Wi-Fi pairing code'."

    $pairAddr = $Address
    if ([string]::IsNullOrWhiteSpace($pairAddr)) {
        $pairAddr = Read-Host "`nEnter IP & Pairing Port (e.g. 192.168.86.50:37849)"
    }
    $code = $PairCode
    if ([string]::IsNullOrWhiteSpace($code)) {
        $code = Read-Host "Enter 6-digit Pairing Code"
    }

    if ([string]::IsNullOrWhiteSpace($pairAddr) -or [string]::IsNullOrWhiteSpace($code)) {
        Write-Host "Pairing aborted: Address or Code was empty." -ForegroundColor Red
        exit 1
    }

    Write-Host "Running: adb pair $pairAddr $code" -ForegroundColor Cyan
    $pairRes = adb pair $pairAddr $code 2>&1
    Write-Host $pairRes

    if ($pairRes -match "successfully paired") {
        Write-Host "Pairing successful! Now return to the main Wireless Debugging screen" -ForegroundColor Green
        Write-Host "to get the active Connection Port, then run:" -ForegroundColor Yellow
        Write-Host "  .\scripts\pixel_device_helper.ps1 connect -Address <IP:ConnectPort>" -ForegroundColor Cyan
    }
    exit 0
}

# Handle Explicit Connect Action
if ($Action -eq "connect") {
    $connAddr = $Address
    if ([string]::IsNullOrWhiteSpace($connAddr)) {
        $cached = Load-DeviceCache
        $cachedHint = if ($cached -and $cached.last_address) { " (Cached: $($cached.last_address))" } else { "" }
        $connAddr = Read-Host "`nEnter IP address & Port shown on Wireless debugging screen$cachedHint"
        if ([string]::IsNullOrWhiteSpace($connAddr) -and $cached -and $cached.last_address) {
            $connAddr = $cached.last_address
        }
    }

    if ([string]::IsNullOrWhiteSpace($connAddr)) {
        Write-Host "Connection aborted: IP:Port address is required." -ForegroundColor Red
        exit 1
    }

    Write-Host "Connecting wirelessly to $connAddr..." -ForegroundColor Cyan
    $connRes = adb connect $connAddr 2>&1
    Write-Host $connRes
    if ($connRes -match "connected to") {
        Save-DeviceCache "last_address" $connAddr
    }
}

function Get-ConnectedAdbDevices {
    $out = (adb devices -l) 2>$null
    $lines = $out -split "`r?`n"
    $devList = @()
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("List of") -or $trimmed.StartsWith("*")) {
            continue
        }
        $parts = $trimmed -split '\s+'
        if ($parts.Length -ge 2 -and $parts[1] -ne "offline") {
            $devSerial = $parts[0]
            $devStatus = $parts[1]
            $model = "Unknown"
            foreach ($p in $parts) {
                if ($p.StartsWith("model:")) {
                    $model = $p.Substring(6)
                }
            }
            $devList += [PSCustomObject]@{
                Serial = $devSerial
                Status = $devStatus
                Model = $model
                IsWireless = ($devSerial -match ':\d+$')
                Raw = $trimmed
            }
        }
    }
    return $devList
}

# If Address was specified, connect upfront
if (![string]::IsNullOrWhiteSpace($Address)) {
    Write-Host "Connecting wirelessly to $Address..." -ForegroundColor Cyan
    $res = adb connect $Address 2>&1
    Write-Host $res
    if ($res -match "connected to") {
        Save-DeviceCache "last_address" $Address
    }
    Start-Sleep -Milliseconds 600
}

# 1. Query ADB devices
Write-Host "`n[1/4] Scanning ADB devices (Wireless & USB)..." -ForegroundColor Yellow
$devices = Get-ConnectedAdbDevices

# If no devices are found, try reconnecting to cached address
if ($devices.Count -eq 0) {
    $cached = Load-DeviceCache
    if ($cached -and $cached.last_address) {
        Write-Host "Attempting auto-reconnect to cached address $($cached.last_address)..." -ForegroundColor Cyan
        $null = adb connect $($cached.last_address) 2>$null
        Start-Sleep -Milliseconds 800
        $devices = Get-ConnectedAdbDevices
    }
}

# If still no devices, prompt the user with wireless connect options
if ($devices.Count -eq 0) {
    Write-Host "`n[!] No active ADB devices detected." -ForegroundColor Red
    Write-Host "Since the USB-C port is plugged into your external Desktop Mode display," -ForegroundColor Yellow
    Write-Host "connect wirelessly over Wi-Fi:" -ForegroundColor Yellow
    Write-Host "  1. On your phone: Settings > System > Developer options > Wireless debugging (turn ON)."
    Write-Host "  2. Read the 'IP address & Port' on the screen (e.g. 192.168.86.50:41235)."
    Write-Host "  3. (First time only) Pair device via: .\scripts\pixel_device_helper.ps1 pair"

    if ($Action -ne "detect") {
        $answer = Read-Host "`nWould you like to connect wirelessly right now? (Enter IP:Port or press Enter to skip)"
        if (![string]::IsNullOrWhiteSpace($answer)) {
            Write-Host "Connecting to $answer..." -ForegroundColor Cyan
            $res = adb connect $answer 2>&1
            Write-Host $res
            if ($res -match "connected to") {
                Save-DeviceCache "last_address" $answer
                Start-Sleep -Milliseconds 600
                $devices = Get-ConnectedAdbDevices
            }
        }
    }

    if ($devices.Count -eq 0) {
        Write-Host "`nNo device connected. Exiting." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "Found $($devices.Count) connected device(s):" -ForegroundColor Green
for ($i = 0; $i -lt $devices.Count; $i++) {
    $d = $devices[$i]
    $typeStr = if ($d.IsWireless) { "Wi-Fi Wireless" } else { "USB" }
    Write-Host "  [$i] Model: $($d.Model) | Serial: $($d.Serial) ($typeStr) | Status: $($d.Status)" -ForegroundColor Cyan
}

# 2. Select target device (Pixel 8 vs Pixel 10)
$targetDevice = $null

if ($Target -in @("pixel_8", "8")) {
    $targetDevice = $devices | Where-Object { $_.Model -match "Pixel_8|Pixel 8" } | Select-Object -First 1
} elseif ($Target -in @("pixel_10", "10")) {
    $targetDevice = $devices | Where-Object { $_.Model -match "Pixel_10|Pixel 10" } | Select-Object -First 1
}

# Fallback: choose first matching, or if only 1 device attached, select it
if ($null -eq $targetDevice) {
    $targetDevice = $devices[0]
}

$chosenSerial = $targetDevice.Serial
$isP8 = ($targetDevice.Model -match "Pixel_8|Pixel 8") -or ($Target -in @("pixel_8", "8"))
$devLabel = if ($isP8) { "Pixel 8" } else { "Pixel 10" }
$lpp = if ($isP8) { 31 } else { 49 }

Write-Host "`n>> Targeted: $devLabel (Model: $($targetDevice.Model), Serial: $chosenSerial)" -ForegroundColor Green
Write-Host ">> Active Viewport: $lpp lines/page (Arrow navigation: $(if ($isP8) { "63 init / 30 step" } else { "99 init / 48 step" }))" -ForegroundColor DarkCyan

if ($targetDevice.IsWireless) {
    Save-DeviceCache "last_address" $chosenSerial
    if ($isP8) { Save-DeviceCache "pixel_8_address" $chosenSerial }
    else { Save-DeviceCache "pixel_10_address" $chosenSerial }
}

if ($Action -in @("detect", "connect")) {
    exit 0
}

# 3. Build & Install APK
$apkPath = "app\build\outputs\apk\debug\app-debug.apk"
if ($Action -in @("install", "all")) {
    Write-Host "`n[2/4] Verifying APK build..." -ForegroundColor Yellow
    if (!(Test-Path $apkPath)) {
        Write-Host "Building debug APK with gradle..." -ForegroundColor Cyan
        .\gradlew.bat assembleDebug
    }

    Write-Host "`n[3/4] Installing APK over Wi-Fi to $chosenSerial ($devLabel)..." -ForegroundColor Yellow
    adb -s $chosenSerial install -r $apkPath

    Write-Host "Configuring overlay permissions..." -ForegroundColor Cyan
    adb -s $chosenSerial shell appops set com.matrixcapture.app SYSTEM_ALERT_WINDOW allow
}

# 4. Launch App
if ($Action -in @("launch", "all")) {
    Write-Host "`n[4/4] Launching Matrix Capture on $devLabel ($chosenSerial)..." -ForegroundColor Yellow
    adb -s $chosenSerial shell am start -n com.matrixcapture.app/.ui.MainActivity
}

# 5. Stream Logcat if requested
if ($Action -in @("logs", "all")) {
    Write-Host "`n[+] Wireless debugging active! Streaming logcat for $devLabel (Press Ctrl+C to stop)..." -ForegroundColor Green
    adb -s $chosenSerial logcat -v time -s "MatrixCapture:*" "DesktopPaginationService:*" "FloatingOverlayService:*" "CaptureViewModel:*"
}

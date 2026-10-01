# PowerShell script to cleanly release application ports (8000 for FastAPI, 5173 for Vite)
# Ensures clean restart on the same ports without port-in-use collisions.

param(
    [string[]]$Ports = @("8000", "5173")
)

$targetPorts = @()
foreach ($p in $Ports) {
    if ($p -match ',') {
        $targetPorts += ($p -split ',') | ForEach-Object { if ($_.Trim() -match '^\d+$') { [int]$_.Trim() } }
    } elseif ($p.Trim() -match '^\d+$') {
        $targetPorts += [int]$p.Trim()
    }
}
$targetPorts = $targetPorts | Select-Object -Unique

foreach ($port in $targetPorts) {
    $foundPids = @()

    # 1. Try Get-NetTCPConnection
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conns) {
            $foundPids += ($conns | Select-Object -ExpandProperty OwningProcess -Unique)
        }
    } catch {}

    # 2. Also check netstat for listening/bound processes
    try {
        $lines = netstat -ano | Select-String ":$port\s+"
        foreach ($line in $lines) {
            $parts = ($line -split '\s+') | Where-Object { $_ -ne "" }
            $p = $parts[-1]
            if ($p -match '^\d+$' -and [int]$p -gt 0) {
                $foundPids += [int]$p
            }
        }
    } catch {}

    $foundPids = $foundPids | Select-Object -Unique | Where-Object { $_ -ne $PID -and $_ -ne 0 -and $_ -ne 4 }

    foreach ($p in $foundPids) {
        $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
        $procName = if ($proc) { $proc.ProcessName } else { "PID $p" }
        Write-Host "[free_ports] Releasing port $port held by $procName ($p)..."
        
        # Kill full process tree
        & taskkill.exe /F /T /PID $p 2>$null | Out-Null
        if (Get-Process -Id $p -ErrorAction SilentlyContinue) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }

    # Wait briefly for OS socket release so subsequent bind succeeds immediately
    $timeoutMs = 2000
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
        $stillListening = $false
        try {
            $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($c) { $stillListening = $true }
        } catch {
            if (netstat -ano | Select-String ":$port\s+.*LISTENING") { $stillListening = $true }
        }
        if (-not $stillListening) { break }
        Start-Sleep -Milliseconds 100
    }
}
Write-Host "[free_ports] Port release check complete."

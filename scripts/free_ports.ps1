# PowerShell script to cleanly release application ports (8000 for FastAPI, 5173 for Vite)
# Ensures clean restart on the same ports without port-in-use collisions.

param(
    [int[]]$Ports = @(8000, 5173)
)

foreach ($port in $Ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($p in $pids) {
                if ($p -and $p -ne 0 -and $p -ne $PID) {
                    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
                    $procName = if ($proc) { $proc.ProcessName } else { "unknown" }
                    Write-Host "[free_ports] Releasing port $port held by PID $p ($procName)..."
                    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {
        # Fallback to netstat if Get-NetTCPConnection is unavailable
        $lines = netstat -ano | Select-String ":$port\s+.*LISTENING"
        foreach ($line in $lines) {
            $parts = ($line -split '\s+') | Where-Object { $_ -ne "" }
            $p = $parts[-1]
            if ($p -match '^\d+$' -and [int]$p -ne 0 -and [int]$p -ne $PID) {
                Write-Host "[free_ports] Releasing port $port held by PID $p..."
                Stop-Process -Id [int]$p -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
Write-Host "[free_ports] Port release check complete."

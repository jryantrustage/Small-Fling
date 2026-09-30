<#
.SYNOPSIS
    Discovers, lists, and terminates all running Node.js processes.

.DESCRIPTION
    1. Identifies all running Node.js processes (node.exe).
    2. Displays detailed information for each process (PID, Memory, StartTime, Path, CommandLine).
    3. Iterates through each discovered process and terminates it.
    4. Displays the state of Node.js processes after termination.
#>

# Function to query and collect Node.js process details
function Get-NodeProcesses {
    $processes = [System.Collections.Generic.List[PSCustomObject]]::new()

    # Query via CIM / WMI to get CommandLine, ExecutablePath, and ProcessId
    $cimProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue

    if ($cimProcesses) {
        foreach ($proc in $cimProcesses) {
            $pObj = Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue

            $wsMB = if ($pObj -and $pObj.WorkingSet64) {
                [math]::Round($pObj.WorkingSet64 / 1MB, 2)
            } elseif ($proc.WorkingSetSize) {
                [math]::Round([int64]$proc.WorkingSetSize / 1MB, 2)
            } else {
                0
            }

            $startTime = if ($pObj) { $pObj.StartTime } else { $proc.CreationDate }

            $processes.Add([PSCustomObject]@{
                PID         = $proc.ProcessId
                Name        = $proc.Name
                MemoryMB    = $wsMB
                StartTime   = $startTime
                Path        = $proc.ExecutablePath
                CommandLine = $proc.CommandLine
            })
        }
    } else {
        # Fallback: check Get-Process directly in case CIM is restricted or unavailable
        $fallback = Get-Process -Name "node" -ErrorAction SilentlyContinue
        if ($fallback) {
            foreach ($p in $fallback) {
                $wsMB = if ($p.WorkingSet64) { [math]::Round($p.WorkingSet64 / 1MB, 2) } else { 0 }
                $processes.Add([PSCustomObject]@{
                    PID         = $p.Id
                    Name        = $p.ProcessName
                    MemoryMB    = $wsMB
                    StartTime   = $p.StartTime
                    Path        = (Get-Process -Id $p.Id -ErrorAction SilentlyContinue).Path
                    CommandLine = "N/A"
                })
            }
        }
    }

    return $processes.ToArray()
}

# Function to print process details nicely
function Show-ProcessDetails {
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        [AllowEmptyCollection()]
        $Processes = @(),
        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    $procList = @($Processes | Where-Object { $null -ne $_ })

    Write-Host "`n================================================================================" -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host "================================================================================" -ForegroundColor Cyan

    if ($procList.Count -eq 0) {
        Write-Host "No active Node.js processes found." -ForegroundColor Green
        return
    }

    Write-Host "Found $($procList.Count) Node.js process(es):`n" -ForegroundColor Yellow

    # Display summary table
    $procList | Select-Object PID, Name, @{Name = "Memory (MB)"; Expression = { $_.MemoryMB } }, StartTime | Format-Table -AutoSize | Out-String | Write-Host

    # Display detailed command lines
    Write-Host "Process Details & Command Lines:" -ForegroundColor Yellow
    foreach ($proc in $procList) {
        Write-Host "--------------------------------------------------------------------------------" -ForegroundColor DarkGray
        Write-Host " [PID $($proc.PID)] $($proc.Name)" -ForegroundColor White -NoNewline
        Write-Host " | Memory: $($proc.MemoryMB) MB | Started: $($proc.StartTime)" -ForegroundColor Gray
        if ($proc.Path) {
            Write-Host "  Path:        $($proc.Path)" -ForegroundColor Gray
        }
        if ($proc.CommandLine) {
            Write-Host "  CommandLine: $($proc.CommandLine)" -ForegroundColor DarkCyan
        }
    }
    Write-Host "--------------------------------------------------------------------------------`n" -ForegroundColor DarkGray
}

# 1. Inspect Node processes BEFORE killing
$beforeProcesses = @(Get-NodeProcesses)
Show-ProcessDetails -Processes $beforeProcesses -Title "NODE.JS PROCESSES (BEFORE TERMINATION)"

if ($beforeProcesses.Count -eq 0) {
    Write-Host "[kill.ps1] No Node.js processes are currently running. Nothing to terminate." -ForegroundColor Green
    exit 0
}

# 2. Cycle through and kill each process
Write-Host "================================================================================" -ForegroundColor Magenta
Write-Host " TERMINATING NODE.JS PROCESSES" -ForegroundColor Magenta
Write-Host "================================================================================" -ForegroundColor Magenta

$killedCount = 0
$failedCount = 0

foreach ($proc in $beforeProcesses) {
    Write-Host "Attempting to kill PID $($proc.PID) ($($proc.Name))... " -NoNewline
    try {
        Stop-Process -Id $proc.PID -Force -ErrorAction Stop
        Write-Host "[TERMINATED]" -ForegroundColor Green
        $killedCount++
    } catch {
        Write-Host "[FAILED: $_]" -ForegroundColor Red
        $failedCount++
    }
}

Write-Host "`nTermination summary: $killedCount terminated, $failedCount failed." -ForegroundColor Yellow

# Allow brief moment for operating system cleanup
Start-Sleep -Milliseconds 750

# 3. Inspect Node processes AFTER killing
$afterProcesses = @(Get-NodeProcesses)
Show-ProcessDetails -Processes $afterProcesses -Title "NODE.JS PROCESSES (AFTER TERMINATION)"

if ($afterProcesses.Count -eq 0) {
    Write-Host "[kill.ps1] Success: All Node.js processes have been successfully terminated." -ForegroundColor Green
} else {
    Write-Host "[kill.ps1] Warning: $($afterProcesses.Count) Node.js process(es) could not be terminated or restarted." -ForegroundColor Red
}

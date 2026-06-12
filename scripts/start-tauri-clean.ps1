$ErrorActionPreference = 'Continue'

function Stop-ProcessByPort {
    param(
        [int]$Port
    )

    $killed = @{}

    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
        $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $processIds) {
            if ($processId -gt 0 -and -not $killed.ContainsKey($processId)) {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                $killed[$processId] = $true
                Write-Host "Stopped PID $processId on port $Port (Get-NetTCPConnection)"
            }
        }
    }

    $netstatLines = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+\d+$" | ForEach-Object { $_.Line }
    if ($netstatLines) {
        foreach ($line in $netstatLines) {
            $parts = ($line -replace '\s+', ' ').Trim().Split(' ')
            $processId = [int]$parts[-1]
            if ($processId -gt 0 -and -not $killed.ContainsKey($processId)) {
                taskkill /PID $processId /F | Out-Null
                $killed[$processId] = $true
                Write-Host "Stopped PID $processId on port $Port (netstat/taskkill)"
            }
        }
    }
}

$ports = @(18020, 1420)
foreach ($port in $ports) {
    Stop-ProcessByPort -Port $port
}

Set-Location -Path (Join-Path $PSScriptRoot "..")
Write-Host "Launching tauri dev from $(Get-Location)"
& npm run tauri dev
exit $LASTEXITCODE

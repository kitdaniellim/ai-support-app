$connections = netstat -ano | Select-String ":3000\s.*LISTENING"
foreach ($line in $connections) {
    $parts = $line.ToString().Trim() -split '\s+'
    $pid = $parts[-1]
    if ($pid -match '^\d+$') {
        Write-Host "Killing PID $pid on port 3000"
        Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "Port 3000 is now free"

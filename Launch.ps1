$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
    $address = 'http://127.0.0.1:3010'
    $running = $false
    try { $health = Invoke-RestMethod "$address/api/health" -TimeoutSec 2; $running = $health.app -eq 'vtt-pocket' } catch {}
    if (!$running) {
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\express'))) { throw 'Dependencies are missing. Open the project folder and run npm install once.' }
        $env:PORT = '3010'
        $process = Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
        for ($attempt=0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            try { $health = Invoke-RestMethod "$address/api/health" -TimeoutSec 1; if ($health.app -eq 'vtt-pocket') { $running=$true; break } } catch {}
            if ($process.HasExited) { break }
        }
        if (!$running) { throw 'Server could not start. See server-error.log in the project folder. Port 3010 may be in use.' }
        $process.Id | Set-Content -LiteralPath (Join-Path $PSScriptRoot '.server.pid')
    }
    Start-Process $address
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'VTT - launch error') | Out-Null
}

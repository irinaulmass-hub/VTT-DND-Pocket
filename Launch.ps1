$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
    $address = 'http://127.0.0.1:3010'
    $running = $false
    try { $health = Invoke-RestMethod "$address/api/health" -TimeoutSec 2; $running = $health.app -eq 'vtt-pocket' } catch {}
    if (!$running) {
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        if (!$node) { throw 'Install Node.js from https://nodejs.org and try again.' }
        $lockfile = Join-Path $PSScriptRoot 'package-lock.json'
        $installedLockfile = Join-Path $PSScriptRoot 'node_modules\.package-lock.json'
        $dependencyFiles = 'node_modules\express\package.json', 'node_modules\uuid\package.json', 'node_modules\ws\package.json', 'node_modules\.package-lock.json'
        $missingDependencies = $dependencyFiles | Where-Object { !(Test-Path -LiteralPath (Join-Path $PSScriptRoot $_) -PathType Leaf) }
        if ($missingDependencies -or (Get-Item -LiteralPath $lockfile).LastWriteTimeUtc -gt (Get-Item -LiteralPath $installedLockfile).LastWriteTimeUtc) {
            $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
            $install = Start-Process -FilePath $npm -ArgumentList 'ci', '--no-audit', '--no-fund' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'install.log') -RedirectStandardError (Join-Path $PSScriptRoot 'install-error.log')
            if ($install.ExitCode -ne 0) { throw 'Could not install dependencies. Check your internet connection and see install-error.log.' }
        }
        $env:PORT = '3010'
        $process = Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
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

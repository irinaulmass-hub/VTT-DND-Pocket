$ErrorActionPreference = 'Stop'
$startLock = $null
try {
    $previewData = Join-Path $PSScriptRoot '.editor-preview'
    New-Item -ItemType Directory -Path $previewData -Force | Out-Null
    try {
        $startLock = [IO.File]::Open((Join-Path $previewData 'launcher.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch { throw 'The editor is already starting. Please wait and try the shortcut again.' }

    # Resolve the extracted folder at runtime; never point a shortcut at another copy.
    $shortcutName = 'Книга мастера - Редактор.lnk'
    $desktop = [Environment]::GetFolderPath('DesktopDirectory')
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path $desktop $shortcutName))
    $link.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $link.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'Start-Editor.ps1') + '"'
    $link.WorkingDirectory = $PSScriptRoot
    $link.WindowStyle = 7
    $link.Description = 'Map editor: furnished rooms, paths, forests and world maps'
    $icon = Join-Path $PSScriptRoot 'public\icon_fixed.ico'
    if (Test-Path -LiteralPath $icon) { $link.IconLocation = $icon + ',0' }
    $link.Save()

    $hash = [Security.Cryptography.SHA256]::Create()
    try { $instance = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($PSScriptRoot).ToLowerInvariant()))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
    $ports = @(3020..3039)
    $listeners = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port })
    $address = $null
    foreach ($candidate in $ports) {
        if ($listeners -notcontains $candidate) { continue }
        try {
            $health = Invoke-RestMethod ('http://127.0.0.1:' + $candidate + '/api/health') -TimeoutSec 1
            if ($health.app -eq 'vtt-pocket' -and $health.instanceId -eq $instance) { $address = 'http://127.0.0.1:' + $candidate; break }
        } catch {}
    }
    if (!$address) {
        $port = $ports | Where-Object { $listeners -notcontains $_ } | Select-Object -First 1
        if (!$port) { throw 'Ports 3020-3039 are busy. Close an unused local server and try again.' }
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        if (!$node) { throw 'Install Node.js 24 or newer from https://nodejs.org, then open Start-Editor.bat again. The desktop shortcut has been created.' }
        $nodeVersion = & $node.Source --version
        if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) { throw 'This build is tested with Node.js 24. Install Node.js 24 or newer from https://nodejs.org.' }
        $dependencyFiles = 'node_modules\express\package.json', 'node_modules\uuid\package.json', 'node_modules\ws\package.json', 'node_modules\.package-lock.json'
        $missing = $dependencyFiles | Where-Object { !(Test-Path -LiteralPath (Join-Path $PSScriptRoot $_) -PathType Leaf) }
        $lock = Join-Path $PSScriptRoot 'package-lock.json'
        $installedLock = Join-Path $PSScriptRoot 'node_modules\.package-lock.json'
        if ($missing -or (Get-Item -LiteralPath $lock).LastWriteTimeUtc -gt (Get-Item -LiteralPath $installedLock).LastWriteTimeUtc) {
            Write-Host 'Preparing the editor. Installing dependencies...'
            $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
            $install = Start-Process -FilePath $npm -ArgumentList 'ci', '--no-audit', '--no-fund' -WorkingDirectory $PSScriptRoot -Wait -PassThru
            if ($install.ExitCode -ne 0) { throw 'Could not install dependencies. Check the internet connection and run Start-Editor.bat again.' }
        }
        $env:PORT = [string]$port
        $env:DATA_DIR = $previewData
        $env:VTT_INSTANCE_ID = $instance
        $env:VTT_EDITOR_DEMO = '1'
        $process = Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $previewData 'server.log') -RedirectStandardError (Join-Path $previewData 'server-error.log')
        $address = 'http://127.0.0.1:' + $port
        $ready = $false
        for ($attempt = 0; $attempt -lt 80; $attempt++) {
            Start-Sleep -Milliseconds 250
            try {
                $health = Invoke-RestMethod ($address + '/api/health') -TimeoutSec 1
                if ($health.app -eq 'vtt-pocket' -and $health.instanceId -eq $instance) { $ready = $true; break }
            } catch {}
            if ($process.HasExited) { break }
        }
        if (!$ready) { throw ('The editor could not start. See ' + (Join-Path $previewData 'server-error.log')) }
    }
    Start-Process ($address + '/?view=maps&world=71000000-0000-4000-8000-000000000000')
    Write-Host 'Editor opened. The desktop shortcut is ready.'
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Book of the Master - Editor') | Out-Null
    exit 1
} finally { if ($startLock) { $startLock.Dispose() } }

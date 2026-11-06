$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $desktop 'VTT - DnD.lnk'))
$link.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$link.Arguments = '"' + (Join-Path $PSScriptRoot 'Launch.vbs') + '"'
$link.WorkingDirectory = $PSScriptRoot
$link.Description = 'DnD: master console and player pocket sheets'
$link.IconLocation = (Join-Path $PSScriptRoot 'public\icon_fixed.ico') + ',0'
$link.Save()
Write-Output ('Shortcut created: ' + (Join-Path $desktop 'VTT - DnD.lnk'))

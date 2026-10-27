param([ValidateSet('Setup','Register','Start','Stop','Logs')][string]$Action='Start', [ValidateSet('classroom','public')][string]$Mode='public', [switch]$NoBrowser)
$ErrorActionPreference='Stop'
$DataDir=Join-Path $env:LOCALAPPDATA 'SurveyingLiteAvatar215'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$SettingsPath=Join-Path $DataDir 'settings.json'
$KeyPath=Join-Path $DataDir 'key.dpapi'
$script:Worker=$null
$script:Stage='initialize'
# Use the Windows WSL executable explicitly; support 32-bit PowerShell too.
$script:WslExe=Join-Path $env:SystemRoot 'System32\wsl.exe'
if(Test-Path (Join-Path $env:SystemRoot 'Sysnative\wsl.exe')){$script:WslExe=Join-Path $env:SystemRoot 'Sysnative\wsl.exe'}
if(-not (Test-Path $script:WslExe)){throw 'Windows wsl.exe was not found.'}
function Wsl-Argument([string]$Text) {
    # WSL parses its own command line. Keep simple tokens, especially switches, unquoted.
    if($Text -match '^[A-Za-z0-9_./:=+@,-]+$'){return $Text}
    return (Quote-Argument $Text)
}
function Wsl-Arguments([string[]]$Command) {
    if(-not $script:Settings.distro -or -not $script:Settings.user){throw 'Missing Ubuntu distribution or user. Run Setup.cmd.'}
    if(-not $Command -or $Command.Count -eq 0){throw 'Missing Linux command.'}
    $linux=($Command | ForEach-Object {Wsl-Argument $_}) -join ' '
    return ('-d '+(Wsl-Argument $script:Settings.distro)+' -u '+(Wsl-Argument $script:Settings.user)+' --exec '+$linux)
}
function Quote-Argument([string]$Text) {
    # Windows CommandLineToArgvW/CRT quoting, including spaces, quotes and trailing slashes.
    '"' + [regex]::Replace([regex]::Replace($Text,'(\\*)"','$1$1\"'),'(\\+)$','$1$1') + '"'
}
function New-WslProcess([string[]]$Command,[bool]$Redirect=$true) {
    $psi=New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName=$script:WslExe;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
    $psi.Arguments=Wsl-Arguments -Command $Command
    $psi.RedirectStandardInput=$Redirect;$psi.RedirectStandardOutput=$Redirect;$psi.RedirectStandardError=$Redirect
    if($Redirect){$psi.StandardOutputEncoding=New-Object System.Text.UTF8Encoding($false);$psi.StandardErrorEncoding=New-Object System.Text.UTF8Encoding($false)}
    $proc=New-Object System.Diagnostics.Process;$proc.StartInfo=$psi;[void]$proc.Start();return $proc
}
function Wsl-Once([string[]]$Command) {
    $p=New-WslProcess -Command $Command
    $p.StandardInput.Close();$o=$p.StandardOutput.ReadToEndAsync();$e=$p.StandardError.ReadToEndAsync()
    if(-not $p.WaitForExit(30000)){try{$p.Kill()}catch{};throw 'WSL did not respond within 30 seconds.'}
    if($p.ExitCode -ne 0){throw $e.Result};return $o.Result.Trim()
}
function Read-StoredApiKey([string]$Path) {
    if(-not (Test-Path -LiteralPath $Path)){throw 'Saved key missing. Run Setup.cmd.'}
    # Set-Content in previous launchers appended CRLF. SecureString expects only the encrypted text.
    $encrypted=[System.IO.File]::ReadAllText($Path).Trim()
    if([string]::IsNullOrWhiteSpace($encrypted)){throw 'Saved key is empty. Run Setup.cmd.'}
    try { return (ConvertTo-SecureString -String $encrypted -ErrorAction Stop) }
    catch { throw 'Cannot read the saved key for this Windows account. Run Setup.cmd with your normal Windows user. Key contents are not displayed.' }
}
function Register-Links {
    # Fixed commands only: no URL payload or %1 is sent to a shell.
    foreach($entry in @(@{scheme='liteavatar217';mode='public'},@{scheme='liteavatar217classroom';mode='classroom'},@{scheme='liteavatar216';mode='public'},@{scheme='liteavatar216classroom';mode='classroom'},@{scheme='liteavatar215';mode='classroom'})) {
        $base='HKCU:\Software\Classes\'+$entry.scheme
        New-Item $base -Force | Out-Null
        Set-Item $base -Value 'URL:LiteAvatar 21.7'
        New-ItemProperty $base -Name 'URL Protocol' -Value '' -Force | Out-Null
        New-Item "$base\shell\open\command" -Force | Out-Null
        $command='powershell.exe -NoProfile -ExecutionPolicy Bypass -File '+(Quote-Argument (Join-Path $PSScriptRoot 'Launcher.ps1'))+' -Action Start -Mode '+$entry.mode
        if($entry.mode -eq 'classroom'){$command+=' -NoBrowser'}
        Set-Item "$base\shell\open\command" -Value $command
    }
    $link=Join-Path ([Environment]::GetFolderPath('Startup')) 'LiteAvatar215.lnk'
    if(Test-Path -LiteralPath $link) {
        $shell=New-Object -ComObject WScript.Shell;$shortcut=$shell.CreateShortcut($link)
        $shortcut.TargetPath=(Get-Command powershell.exe).Source
        $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File '+(Quote-Argument (Join-Path $PSScriptRoot 'Launcher.ps1'))+' -Action Start -Mode public -NoBrowser'
        $shortcut.WorkingDirectory=$PSScriptRoot;$shortcut.WindowStyle=7;$shortcut.Save()
    }
    Write-Host 'Website buttons registered. Keep this folder in place.' -ForegroundColor Green
}
function Configure {
    $script:Stage='setup-list-ubuntu'
    Write-Host 'LiteAvatar 21.7 - setup' -ForegroundColor Cyan
    Write-Host 'Installed WSL distributions:'
    $installed=@(& $script:WslExe --list --quiet | ForEach-Object {($_ -replace "`0",'').Trim()} | Where-Object {$_})
    if($LASTEXITCODE -ne 0 -or $installed.Count -eq 0){throw 'Could not list installed WSL distributions. Run wsl.exe -l -v in Windows CMD.'}
    $installed | ForEach-Object {Write-Host ('  '+$_)}
    $defaultDistro=if($installed.Count -eq 1){$installed[0]}elseif($installed -contains 'Ubuntu-22.04'){'Ubuntu-22.04'}elseif($installed -contains 'Ubuntu'){'Ubuntu'}else{''}
    $d=Read-Host ('WSL distribution name (Enter = '+$defaultDistro+')')
    if(-not $d){$d=$defaultDistro};$d=$d.Trim()
    if($installed -notcontains $d){throw 'Distribution name does not match the installed list. Run Setup.cmd again and copy the exact name.'}
    $u=Read-Host 'Ubuntu user (Enter = gordon)';if(-not $u){$u='gordon'};$u=$u.Trim()
    if($u -notmatch '^[a-z_][a-z0-9_-]*[$]?$'){throw 'Invalid Ubuntu user name.'}
    $script:Settings=[pscustomobject]@{distro=$d;user=$u}
    $script:Stage='setup-verify-ubuntu-user'
    $identity=Wsl-Once -Command @('id','-un');if($identity -ne $u){throw 'Ubuntu user verification failed.'};if($identity -eq 'root'){throw 'Select your normal Ubuntu user, not root.'}
    Write-Host "Connected to Ubuntu user: $identity"
    $key=Read-Host 'Paste Bailian API Key (hidden)' -AsSecureString
    if($key.Length -eq 0){throw 'API Key is required.'}
    $script:Stage='setup-save-key'
    [System.IO.File]::WriteAllText($KeyPath,(ConvertFrom-SecureString $key),[System.Text.Encoding]::ASCII)
    $script:Settings | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $SettingsPath
    # DPAPI binds this encrypted key to the current Windows user and machine.
    $script:Stage='setup-website-link'
    $register=Read-Host 'Register website launch button? Y/N (Enter = Y)'
    if($register -ne 'N' -and $register -ne 'n') {
        Register-Links
    }
    $script:Stage='setup-windows-startup'
    $boot=Read-Host 'Start PUBLIC voice service on Windows login? Y/N (Enter = N)'
    if($boot -eq 'Y' -or $boot -eq 'y') {
        $link=Join-Path ([Environment]::GetFolderPath('Startup')) 'LiteAvatar215.lnk'
        $shell=New-Object -ComObject WScript.Shell;$shortcut=$shell.CreateShortcut($link)
        $shortcut.TargetPath=(Get-Command powershell.exe).Source
        $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File '+(Quote-Argument (Join-Path $PSScriptRoot 'Launcher.ps1'))+' -Action Start -Mode public -NoBrowser'
        $shortcut.WorkingDirectory=$PSScriptRoot;$shortcut.WindowStyle=7;$shortcut.Save()
    } else {
        $link=Join-Path ([Environment]::GetFolderPath('Startup')) 'LiteAvatar215.lnk'
        if(Test-Path $link){Remove-Item -LiteralPath $link}
    }
    Write-Host 'Setup saved. Keep this folder at its current location.' -ForegroundColor Green
}
try {
    if($Action -eq 'Setup' -or -not (Test-Path $SettingsPath)){Configure;if($Action -eq 'Setup'){exit 0}}
    Write-Host ('LiteAvatar 21.7 - '+$Action) -ForegroundColor Cyan
    $script:Stage='read-settings'
    $script:Settings=Get-Content -Raw $SettingsPath | ConvertFrom-Json
    $agentWindows=Join-Path $PSScriptRoot 'manager.py'
    $script:Stage='resolve-ubuntu-path'
    $agent=Wsl-Once -Command @('wslpath','-a',$agentWindows)
    if($Action -eq 'Register'){[void](Read-StoredApiKey -Path $KeyPath);Register-Links;Read-Host 'Done. Press Enter to close' | Out-Null;exit 0}
    if($Action -eq 'Stop'){Write-Host (Wsl-Once -Command @('python3',$agent,'stop'));exit 0}
    if($Action -eq 'Logs'){Write-Host (Wsl-Once -Command @('python3',$agent,'logs'));exit 0}
    if(-not (Test-Path $KeyPath)){throw 'Missing key. Run Setup.cmd.'}
    $script:Stage='read-saved-key'
    $secure=Read-StoredApiKey -Path $KeyPath
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try{$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    $script:Stage='start-local-services'
    $script:Worker=New-WslProcess -Command @('python3',$agent,'run','--mode',$Mode)
    $script:Worker.StandardInput.WriteLine((@{api_key=$plain} | ConvertTo-Json -Compress));$script:Worker.StandardInput.Flush();$plain=$null
    $script:Stage='monitor-local-services'
    $stderr=$script:Worker.StandardError.ReadToEndAsync();$lineTask=$script:Worker.StandardOutput.ReadLineAsync();$opened=$false
    Write-Host 'Starting LiteAvatar. Keep this window running (you may minimize it).' -ForegroundColor Cyan
    Write-Host 'Use Stop.cmd to stop. No Ubuntu terminal is required.'
    while($true){
        if($lineTask.IsCompleted){
            $line=$lineTask.Result;if($null -eq $line){break}
            try{$event=$line | ConvertFrom-Json;Write-Host $event.message
                if($event.event -eq 'ready' -and -not $opened -and -not $NoBrowser){
                    $url=if($Mode -eq 'classroom'){(($env:CLASSROOM_PUBLIC_ORIGIN).TrimEnd('/')+'/teacher?module=presentation')}else{$env:OAC_LITEAVATAR_URL}
                    Start-Process $url;$opened=$true
                }
            }catch{Write-Host $line}
            $lineTask=$script:Worker.StandardOutput.ReadLineAsync()
        }else{Start-Sleep -Milliseconds 200}
    }
    $script:Worker.WaitForExit()
    if($script:Worker.ExitCode -eq 2){Write-Host 'An older launcher is running. Use Stop.cmd, wait for it to stop, then click the website button again.' -ForegroundColor Yellow}
    elseif($script:Worker.ExitCode -ne 0){Write-Host $stderr.Result;throw 'Startup stopped. Use Logs.cmd to inspect the last errors.'}
} catch {
    Write-Host ('Failed stage: '+$script:Stage) -ForegroundColor Yellow
    Write-Host ('Launcher line: '+$_.InvocationInfo.ScriptLineNumber) -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Press Enter to close' | Out-Null
} finally {
    if($script:Worker -and -not $script:Worker.HasExited){
        try{$script:Worker.StandardInput.WriteLine('STOP');$script:Worker.StandardInput.Flush();[void]$script:Worker.WaitForExit(30000)}catch{}
        $script:Worker.Dispose()
    }
}

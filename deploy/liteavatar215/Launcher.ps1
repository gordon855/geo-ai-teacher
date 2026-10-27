param([ValidateSet('Setup','Start','Stop','Logs')][string]$Action='Start', [ValidateSet('classroom','public')][string]$Mode='classroom', [switch]$NoBrowser)
$ErrorActionPreference='Stop'
$DataDir=Join-Path $env:LOCALAPPDATA 'SurveyingLiteAvatar215'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$SettingsPath=Join-Path $DataDir 'settings.json'
$KeyPath=Join-Path $DataDir 'key.dpapi'
$script:Worker=$null
function Quote-Argument([string]$Text) {
    # Windows CommandLineToArgvW/CRT quoting, including spaces, quotes and trailing slashes.
    '"' + [regex]::Replace([regex]::Replace($Text,'(\\*)"','$1$1\"'),'(\\+)$','$1$1') + '"'
}
function New-WslProcess([string[]]$Command,[bool]$Redirect=$true) {
    $psi=New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName='wsl.exe';$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
    $all=@('-d',$script:Settings.distro,'-u',$script:Settings.user,'--exec')+$Command
    $psi.Arguments=($all | ForEach-Object {Quote-Argument $_}) -join ' '
    $psi.RedirectStandardInput=$Redirect;$psi.RedirectStandardOutput=$Redirect;$psi.RedirectStandardError=$Redirect
    if($Redirect){$psi.StandardOutputEncoding=New-Object System.Text.UTF8Encoding($false);$psi.StandardErrorEncoding=New-Object System.Text.UTF8Encoding($false)}
    $proc=New-Object System.Diagnostics.Process;$proc.StartInfo=$psi;[void]$proc.Start();return $proc
}
function Wsl-Once([string[]]$Command) {
    $p=New-WslProcess $Command
    $p.StandardInput.Close();$o=$p.StandardOutput.ReadToEndAsync();$e=$p.StandardError.ReadToEndAsync()
    if(-not $p.WaitForExit(30000)){try{$p.Kill()}catch{};throw 'WSL did not respond within 30 seconds.'}
    if($p.ExitCode -ne 0){throw $e.Result};return $o.Result.Trim()
}
function Configure {
    Write-Host 'LiteAvatar 21.5 - first-time setup' -ForegroundColor Cyan
    Write-Host 'Installed WSL distributions:'
    & wsl.exe -l -q
    $d=Read-Host 'WSL distribution name (Enter = Ubuntu)';if(-not $d){$d='Ubuntu'}
    $u=Read-Host 'Ubuntu user (Enter = gordon)';if(-not $u){$u='gordon'}
    $script:Settings=[pscustomobject]@{distro=$d;user=$u}
    $identity=Wsl-Once @('id','-un');if($identity -eq 'root'){throw 'Select your normal Ubuntu user, not root.'}
    Write-Host "Connected to Ubuntu user: $identity"
    $key=Read-Host 'Paste Bailian API Key (hidden)' -AsSecureString
    if($key.Length -eq 0){throw 'API Key is required.'}
    ConvertFrom-SecureString $key | Set-Content -Encoding ASCII -Path $KeyPath
    $script:Settings | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $SettingsPath
    # DPAPI binds this encrypted key to the current Windows user and machine.
    $register=Read-Host 'Register website launch button? Y/N (Enter = Y)'
    if($register -ne 'N' -and $register -ne 'n') {
        $base='HKCU:\Software\Classes\liteavatar215'
        New-Item $base -Force | Out-Null
        Set-Item $base -Value 'URL:LiteAvatar 21.5'
        New-ItemProperty $base -Name 'URL Protocol' -Value '' -Force | Out-Null
        New-Item "$base\shell\open\command" -Force | Out-Null
        # Fixed command. No URL payload or %1 reaches a shell or Python.
        $command='powershell.exe -NoProfile -ExecutionPolicy Bypass -File '+(Quote-Argument (Join-Path $PSScriptRoot 'Launcher.ps1'))+' -Action Start -Mode classroom'
        Set-Item "$base\shell\open\command" -Value $command
    }
    $boot=Read-Host 'Start classroom service on Windows login? Y/N (Enter = N)'
    if($boot -eq 'Y' -or $boot -eq 'y') {
        $link=Join-Path ([Environment]::GetFolderPath('Startup')) 'LiteAvatar215.lnk'
        $shell=New-Object -ComObject WScript.Shell;$shortcut=$shell.CreateShortcut($link)
        $shortcut.TargetPath=(Get-Command powershell.exe).Source
        $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File '+(Quote-Argument (Join-Path $PSScriptRoot 'Launcher.ps1'))+' -Action Start -Mode classroom -NoBrowser'
        $shortcut.WorkingDirectory=$PSScriptRoot;$shortcut.WindowStyle=7;$shortcut.Save()
    } else {
        $link=Join-Path ([Environment]::GetFolderPath('Startup')) 'LiteAvatar215.lnk'
        if(Test-Path $link){Remove-Item -LiteralPath $link}
    }
    Write-Host 'Setup saved. Keep this folder at its current location.' -ForegroundColor Green
}
try {
    if($Action -eq 'Setup' -or -not (Test-Path $SettingsPath)){Configure;if($Action -eq 'Setup'){exit 0}}
    $script:Settings=Get-Content -Raw $SettingsPath | ConvertFrom-Json
    $agentWindows=Join-Path $PSScriptRoot 'manager.py'
    $agent=Wsl-Once @('wslpath','-a',$agentWindows)
    if($Action -eq 'Stop'){Write-Host (Wsl-Once @('python3',$agent,'stop'));exit 0}
    if($Action -eq 'Logs'){Write-Host (Wsl-Once @('python3',$agent,'logs'));exit 0}
    if(-not (Test-Path $KeyPath)){throw 'Missing key. Run Setup.cmd.'}
    $secure=Get-Content -Raw $KeyPath | ConvertTo-SecureString
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try{$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    $script:Worker=New-WslProcess @('python3',$agent,'run','--mode',$Mode)
    $script:Worker.StandardInput.WriteLine((@{api_key=$plain} | ConvertTo-Json -Compress));$script:Worker.StandardInput.Flush();$plain=$null
    $stderr=$script:Worker.StandardError.ReadToEndAsync();$lineTask=$script:Worker.StandardOutput.ReadLineAsync();$opened=$false
    Write-Host 'Starting LiteAvatar. Keep this window running (you may minimize it).' -ForegroundColor Cyan
    Write-Host 'Use Stop.cmd to stop. No Ubuntu terminal is required.'
    while($true){
        if($lineTask.IsCompleted){
            $line=$lineTask.Result;if($null -eq $line){break}
            try{$event=$line | ConvertFrom-Json;Write-Host $event.message
                if($event.event -eq 'ready' -and -not $opened -and -not $NoBrowser){
                    $url=if($Mode -eq 'classroom'){(($env:CLASSROOM_PUBLIC_ORIGIN).TrimEnd('/')+'/teacher')}else{$env:OAC_LITEAVATAR_URL}
                    Start-Process $url;$opened=$true
                }
            }catch{Write-Host $line}
            $lineTask=$script:Worker.StandardOutput.ReadLineAsync()
        }else{Start-Sleep -Milliseconds 200}
    }
    $script:Worker.WaitForExit()
    if($script:Worker.ExitCode -eq 2){Write-Host 'Already running. Continue on the teacher website; use Stop.cmd before switching modes.' -ForegroundColor Yellow}
    elseif($script:Worker.ExitCode -ne 0){Write-Host $stderr.Result;throw 'Startup stopped. Use Logs.cmd to inspect the last errors.'}
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Press Enter to close' | Out-Null
} finally {
    if($script:Worker -and -not $script:Worker.HasExited){
        try{$script:Worker.StandardInput.WriteLine('STOP');$script:Worker.StandardInput.Flush();[void]$script:Worker.WaitForExit(30000)}catch{}
        $script:Worker.Dispose()
    }
}

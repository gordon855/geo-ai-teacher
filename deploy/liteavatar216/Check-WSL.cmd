@echo off
echo Checking Ubuntu-22.04 / gordon. Expected output: gordon
"%SystemRoot%\System32\wsl.exe" -d Ubuntu-22.04 -u gordon --exec id -un
echo Exit code: %errorlevel%
pause

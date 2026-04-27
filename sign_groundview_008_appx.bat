@echo off
setlocal enabledelayedexpansion

rem ============================================================
rem GroundView APPX local test signer
rem
rem What this does:
rem   1. Finds the newest dist\electron\GroundView-*.appx
rem   2. Creates or reuses a CurrentUser code-signing certificate
rem   3. Exports dist\electron\GroundView-TestCert.cer
rem   4. Optionally trusts the cert in LocalMachine\TrustedPeople and LocalMachine\Root
rem   5. Signs the APPX with signtool.exe
rem   6. Optionally installs the APPX
rem
rem Important:
rem   - LocalMachine\Root trust is persistent. Only answer Y on a dev/test PC.
rem   - To remove later, delete the cert with the shown thumbprint from:
rem       certlm.msc -> Trusted Root Certification Authorities
rem       certlm.msc -> Trusted People
rem       certmgr.msc -> Current User -> Personal
rem ============================================================

set "ROOT=%~dp0"
set "APPX_FILE="
set "CER_FILE=%ROOT%dist\electron\GroundView-TestCert.cer"
set "PUBLISHER=CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11"
set "CERT_FRIENDLY=GroundView Local AppX Test Certificate"

for /f "usebackq delims=" %%f in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%ROOT%dist\electron' -Filter 'GroundView-*.appx' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName"`) do set "APPX_FILE=%%f"

if not defined APPX_FILE (
  echo [ERROR] APPX not found:
  echo         %ROOT%dist\electron\GroundView-*.appx
  echo.
  echo Build it first with:
  echo   npm run dist:msix:norebuild
  pause
  exit /b 1
)

set "SIGNTOOL="
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\windows-10\x64\signtool.exe" (
  set "SIGNTOOL=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\windows-10\x64\signtool.exe"
)

if not defined SIGNTOOL (
  for /d %%d in (
    "C:\Program Files (x86)\Windows Kits\10\bin\10*"
    "C:\Program Files\Windows Kits\10\bin\10*"
  ) do (
    if exist "%%~d\x64\signtool.exe" (
      if not defined SIGNTOOL set "SIGNTOOL=%%~d\x64\signtool.exe"
    )
  )
)

if not defined SIGNTOOL (
  echo [ERROR] signtool.exe not found.
  echo         Install Windows SDK or run electron-builder once so winCodeSign is cached.
  pause
  exit /b 1
)

echo [INFO] APPX     : %APPX_FILE%
echo [INFO] Publisher: %PUBLISHER%
echo [INFO] SignTool : %SIGNTOOL%
echo.

set "PS1=%TEMP%\groundview_sign_appx_%RANDOM%.ps1"
> "%PS1%" echo $ErrorActionPreference = 'Stop'
>> "%PS1%" echo $subject = '%PUBLISHER%'
>> "%PS1%" echo $friendly = '%CERT_FRIENDLY%'
>> "%PS1%" echo $cerFile = '%CER_FILE%'
>> "%PS1%" echo $cert = Get-ChildItem Cert:\CurrentUser\My ^| Where-Object { $_.Subject -eq $subject -and $_.EnhancedKeyUsageList.FriendlyName -contains 'Code Signing' } ^| Sort-Object NotAfter -Descending ^| Select-Object -First 1
>> "%PS1%" echo if (-not $cert) {
>> "%PS1%" echo   $cert = New-SelfSignedCertificate -Type Custom -Subject $subject -KeyUsage DigitalSignature -FriendlyName $friendly -CertStoreLocation Cert:\CurrentUser\My -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
>> "%PS1%" echo }
>> "%PS1%" echo Export-Certificate -Cert $cert -FilePath $cerFile ^| Out-Null
>> "%PS1%" echo Write-Host $cert.Thumbprint

for /f "usebackq delims=" %%t in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"`) do set "CERT_THUMB=%%t"
set "PS_EXIT=%ERRORLEVEL%"
del "%PS1%" >nul 2>&1

if not "%PS_EXIT%"=="0" (
  echo [ERROR] Failed to create/export test certificate.
  pause
  exit /b 1
)

if not defined CERT_THUMB (
  echo [ERROR] Certificate thumbprint was empty.
  pause
  exit /b 1
)

echo [INFO] Cert    : %CERT_THUMB%
echo [INFO] CER     : %CER_FILE%
echo.

choice /C YN /N /M "Trust this test certificate in LocalMachine TrustedPeople and Root? [Y/N] "
if errorlevel 2 (
  echo [INFO] Skipping trust step. Windows may reject installation with 0x800B0109.
) else (
  net session >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] LocalMachine trust requires Administrator.
    echo         Close this window, then run PowerShell as Administrator and execute:
    echo         .\sign_groundview_008_appx.bat
    pause
    exit /b 1
  )
  echo [INFO] Trusting certificate for LocalMachine...
  certutil -addstore TrustedPeople "%CER_FILE%"
  if errorlevel 1 (
    echo [ERROR] Failed to add certificate to LocalMachine\TrustedPeople.
    pause
    exit /b 1
  )
  certutil -addstore Root "%CER_FILE%"
  if errorlevel 1 (
    echo [ERROR] Failed to add certificate to LocalMachine\Root.
    pause
    exit /b 1
  )
)

echo.
echo [INFO] Signing APPX...
"%SIGNTOOL%" sign /fd SHA256 /sha1 %CERT_THUMB% /debug "%APPX_FILE%"
if errorlevel 1 (
  echo [WARN] Signing returned non-zero. Checking whether the APPX already has a valid signature...
  "%SIGNTOOL%" verify /pa /v "%APPX_FILE%"
  if errorlevel 1 (
    echo [ERROR] Signing failed and existing signature could not be verified.
    pause
    exit /b 1
  )
  echo [PASS] Existing APPX signature is valid.
)

echo.
echo [INFO] Verifying signature...
"%SIGNTOOL%" verify /pa /v "%APPX_FILE%"
if errorlevel 1 (
  echo [WARN] Verification failed. If you skipped trust, this is expected.
) else (
  echo [PASS] Signature verified.
)

echo.
choice /C YN /N /M "Install this GroundView APPX now? [Y/N] "
if errorlevel 2 (
  echo [INFO] Install skipped.
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-AppxPackage -Path '%APPX_FILE%' -ForceUpdateFromAnyVersion"
  if errorlevel 1 (
    echo [ERROR] Install failed.
    echo         If the error is 0x800B0109, rerun and answer Y to the trust prompt.
    pause
    exit /b 1
  )
  echo [PASS] Installed GroundView APPX.
)

echo.
echo [DONE]
echo APPX      : %APPX_FILE%
echo Cert thumb: %CERT_THUMB%
echo.
pause
endlocal

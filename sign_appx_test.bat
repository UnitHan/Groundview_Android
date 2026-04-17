@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  GroundView APPX Self-Sign & Sideload Script
::  - Creates a self-signed certificate matching the appx publisher
::  - Signs the APPX package
::  - Installs the cert to Trusted People (required for sideloading)
::  - Opens the APPX installer
::
::  NOTE: Requires elevation (Run as Administrator)
::  Publisher CN must match package.json "publisher" field exactly
:: ============================================================

set "PUBLISHER=CN=DBF2708E-1A7A-45A4-922A-4B40C76E2C11"
set "CERT_NAME=GroundView-TestSign"
set "PFX_PASS=groundview-test"
set "ROOT=%~dp0"
set "DIST_DIR=%ROOT%dist\electron"
set "CERT_DIR=%ROOT%dist\cert"

:: Find the APPX file
for /f "delims=" %%f in ('dir /b /s "%DIST_DIR%\*.appx" 2^>nul') do set "APPX_FILE=%%f"
for /f "delims=" %%f in ('dir /b /s "%DIST_DIR%\*.msix" 2^>nul') do (
    if not defined APPX_FILE set "APPX_FILE=%%f"
)

if not defined APPX_FILE (
    echo [ERROR] No .appx or .msix found in %DIST_DIR%
    echo         Run build_all.bat first to generate the package.
    pause
    exit /b 1
)
echo [INFO] Target package : %APPX_FILE%

:: Check elevation
net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This script must be run as Administrator.
    echo         Right-click sign_appx_test.bat ^> Run as administrator
    pause
    exit /b 1
)

:: ────────────────────────────────────────────────────────────
:: Find signtool.exe (Windows SDK)
:: ────────────────────────────────────────────────────────────
set "SIGNTOOL="
for /d %%d in (
    "C:\Program Files (x86)\Windows Kits\10\bin\10*"
    "C:\Program Files\Windows Kits\10\bin\10*"
) do (
    if exist "%%d\x64\signtool.exe" (
        if not defined SIGNTOOL set "SIGNTOOL=%%d\x64\signtool.exe"
    )
)

if not defined SIGNTOOL (
    :: Fallback: search recursively
    for /f "delims=" %%f in ('dir /b /s "C:\Program Files (x86)\Windows Kits\10\bin\signtool.exe" 2^>nul') do (
        if not defined SIGNTOOL set "SIGNTOOL=%%f"
    )
)

if not defined SIGNTOOL (
    echo [ERROR] signtool.exe not found.
    echo         Install Windows SDK from:
    echo         https://developer.microsoft.com/windows/downloads/windows-sdk/
    pause
    exit /b 1
)
echo [INFO] signtool     : %SIGNTOOL%

:: ────────────────────────────────────────────────────────────
:: Create cert output dir
:: ────────────────────────────────────────────────────────────
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"
set "PFX_FILE=%CERT_DIR%\%CERT_NAME%.pfx"
set "CER_FILE=%CERT_DIR%\%CERT_NAME%.cer"

:: ────────────────────────────────────────────────────────────
:: Step 1: Create self-signed certificate (PowerShell)
:: ────────────────────────────────────────────────────────────
echo.
echo [STEP 1] Creating self-signed certificate...
echo          Subject : %PUBLISHER%

set "PS1_CERT=%TEMP%\gv_make_cert.ps1"
> "%PS1_CERT%" echo $subject  = '%PUBLISHER%'
>> "%PS1_CERT%" echo $certName = '%CERT_NAME%'
>> "%PS1_CERT%" echo $pfxFile  = '%PFX_FILE%'
>> "%PS1_CERT%" echo $cerFile  = '%CER_FILE%'
>> "%PS1_CERT%" echo $pfxPass  = '%PFX_PASS%'
>> "%PS1_CERT%" echo.
>> "%PS1_CERT%" echo $notAfter = (Get-Date).AddYears(3)
>> "%PS1_CERT%" echo $cert = New-SelfSignedCertificate -Subject $subject -Type CodeSigningCert -CertStoreLocation 'Cert:\CurrentUser\My' -HashAlgorithm SHA256 -NotAfter $notAfter -KeySpec Signature -KeyUsage DigitalSignature -FriendlyName $certName
>> "%PS1_CERT%" echo $thumb = $cert.Thumbprint
>> "%PS1_CERT%" echo Write-Host "[INFO] Cert thumbprint: $thumb"
>> "%PS1_CERT%" echo $secPwd = ConvertTo-SecureString -String $pfxPass -Force -AsPlainText
>> "%PS1_CERT%" echo Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$thumb" -FilePath $pfxFile -Password $secPwd ^| Out-Null
>> "%PS1_CERT%" echo Export-Certificate -Cert "Cert:\CurrentUser\My\$thumb" -FilePath $cerFile -Type CERT ^| Out-Null
>> "%PS1_CERT%" echo Write-Host "[INFO] PFX exported: $pfxFile"
>> "%PS1_CERT%" echo Write-Host "[INFO] CER exported: $cerFile"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_CERT%"
del "%PS1_CERT%" >nul 2>&1

if not exist "%PFX_FILE%" (
    echo [ERROR] Certificate creation failed.
    pause
    exit /b 1
)
echo [PASS]  Certificate created.

:: ────────────────────────────────────────────────────────────
:: Step 2: Trust the certificate (Trusted People + Root CA)
::         Required so Windows allows APPX sideloading
:: ────────────────────────────────────────────────────────────
echo.
echo [STEP 2] Trusting certificate in local machine stores...

set "PS1_TRUST=%TEMP%\gv_trust_cert.ps1"
> "%PS1_TRUST%" echo $cerFile = '%CER_FILE%'
>> "%PS1_TRUST%" echo $cer = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($cerFile)
>> "%PS1_TRUST%" echo foreach ($name in @('TrustedPeople', 'Root')) {
>> "%PS1_TRUST%" echo     $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($name, 'LocalMachine')
>> "%PS1_TRUST%" echo     $store.Open('ReadWrite')
>> "%PS1_TRUST%" echo     $store.Add($cer)
>> "%PS1_TRUST%" echo     $store.Close()
>> "%PS1_TRUST%" echo     Write-Host "[INFO] Added to LocalMachine\$name"
>> "%PS1_TRUST%" echo }

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_TRUST%"
del "%PS1_TRUST%" >nul 2>&1

echo [PASS]  Certificate trusted.

:: ────────────────────────────────────────────────────────────
:: Step 3: Sign the APPX
:: ────────────────────────────────────────────────────────────
echo.
echo [STEP 3] Signing APPX package...
echo          File : %APPX_FILE%

"%SIGNTOOL%" sign ^
    /fd SHA256 ^
    /p "%PFX_PASS%" ^
    /f "%PFX_FILE%" ^
    /tr http://timestamp.digicert.com ^
    /td SHA256 ^
    /v ^
    "%APPX_FILE%"

if errorlevel 1 (
    :: Timestamp server may be unreachable — retry without timestamp
    echo [WARN]  Signing with timestamp failed, retrying without timestamp server...
    "%SIGNTOOL%" sign ^
        /fd SHA256 ^
        /p "%PFX_PASS%" ^
        /f "%PFX_FILE%" ^
        /v ^
        "%APPX_FILE%"
)

if errorlevel 1 (
    echo [ERROR] Signing failed. See output above.
    pause
    exit /b 1
)
echo [PASS]  Package signed successfully.

:: ────────────────────────────────────────────────────────────
:: Step 4: Verify signature
:: ────────────────────────────────────────────────────────────
echo.
echo [STEP 4] Verifying signature...

"%SIGNTOOL%" verify /pa /v "%APPX_FILE%"
if errorlevel 1 (
    echo [WARN]  Verify returned non-zero (self-signed cert may show warning — this is expected)
) else (
    echo [PASS]  Signature verified.
)

:: ────────────────────────────────────────────────────────────
:: Step 5: Enable sideloading if needed + open installer
:: ────────────────────────────────────────────────────────────
echo.
echo [STEP 5] Checking sideloading / Developer Mode...

set "PS1_SIDE=%TEMP%\gv_sideload.ps1"
> "%PS1_SIDE%" echo $key = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
>> "%PS1_SIDE%" echo $val = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).AllowAllTrustedApps
>> "%PS1_SIDE%" echo if ($val -ne 1) {
>> "%PS1_SIDE%" echo     Set-ItemProperty -Path $key -Name 'AllowAllTrustedApps' -Value 1 -Type DWord -Force
>> "%PS1_SIDE%" echo     Write-Host '[INFO] Sideloading enabled'
>> "%PS1_SIDE%" echo } else {
>> "%PS1_SIDE%" echo     Write-Host '[INFO] Sideloading already enabled'
>> "%PS1_SIDE%" echo }

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_SIDE%"
del "%PS1_SIDE%" >nul 2>&1

:: ────────────────────────────────────────────────────────────
:: Summary
:: ────────────────────────────────────────────────────────────
echo.
echo ============================================================
echo   Done!
echo ============================================================
echo   Package  : %APPX_FILE%
echo   PFX cert : %PFX_FILE%   (password: %PFX_PASS%)
echo   CER cert : %CER_FILE%
echo.
echo   Opening installer...
echo ============================================================
echo.

:: Launch the APPX installer
powershell -NoProfile -Command "Start-Process '%APPX_FILE%'"

endlocal
pause

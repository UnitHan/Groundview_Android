@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  GroundView Full Build Script
::  Steps:
::    1. Python bundle build  (embeddable + requirements)
::    2. Vite renderer build
::    3. NSIS installer build
::    4. MSIX (appx) build with tile icons
::    5. Python unit tests    (Store review issue verification)
:: ============================================================

set "ROOT=%~dp0"
set "LOG_FILE=%ROOT%build_all.log"
set "PASS=0"
set "FAIL=0"

:: Color codes (Windows 10+)
set "C_RESET=[0m"
set "C_OK=[92m"
set "C_ERR=[91m"
set "C_HEAD=[96m"
set "C_WARN=[93m"

echo.
echo %C_HEAD%============================================================%C_RESET%
echo %C_HEAD%  GroundView Build Pipeline                                 %C_RESET%
echo %C_HEAD%============================================================%C_RESET%
echo   Started : %DATE% %TIME%
echo   Log     : %LOG_FILE%
echo.

:: Truncate old log
type nul > "%LOG_FILE%"

:: ─────────────────────────────────────────────────────────────
:: Helper: print step header
:: ─────────────────────────────────────────────────────────────
goto :main

:step_header
echo.
echo %C_HEAD%-------------------------------------------------------------%C_RESET%
echo %C_HEAD%  STEP %~1 : %~2%C_RESET%
echo %C_HEAD%-------------------------------------------------------------%C_RESET%
goto :eof

:ok
echo %C_OK%  [PASS] %~1%C_RESET%
set /a PASS+=1
echo [PASS] %~1 >> "%LOG_FILE%"
goto :eof

:fail
echo %C_ERR%  [FAIL] %~1%C_RESET%
set /a FAIL+=1
echo [FAIL] %~1 >> "%LOG_FILE%"
goto :eof

:warn
echo %C_WARN%  [WARN] %~1%C_RESET%
echo [WARN] %~1 >> "%LOG_FILE%"
goto :eof

:: ─────────────────────────────────────────────────────────────
:main
:: ─────────────────────────────────────────────────────────────

cd /d "%ROOT%"

:: ============================================================
:: STEP 1 — Python embeddable bundle
:: ============================================================
call :step_header 1 "Python bundle build (embeddable 3.10 + requirements)"

:: If python-bundle already exists, ask whether to rebuild
if exist "%ROOT%resources\python-bundle\python.exe" (
    call :warn "python-bundle already exists — skipping download, re-installing packages only"
    node scripts/bundle-python.js --skip-download 2>> "%LOG_FILE%"
) else (
    node scripts/bundle-python.js 2>> "%LOG_FILE%"
)

if errorlevel 1 (
    call :fail "Python bundle build failed — see %LOG_FILE%"
    echo.
    echo %C_ERR%  Build aborted at Step 1.%C_RESET%
    goto :summary
) else (
    call :ok "Python bundle ready at resources\python-bundle\"
)

:: Sanity-check: confirm python.exe exists in bundle
if not exist "%ROOT%resources\python-bundle\python.exe" (
    call :fail "python.exe not found in bundle after build"
    goto :summary
)
call :ok "python.exe confirmed in bundle"

:: Sanity-check: confirm key packages are importable
"%ROOT%resources\python-bundle\python.exe" -c "import fastapi, uvicorn, cryptography, PIL, requests" 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :fail "Key package import check failed (fastapi/uvicorn/cryptography/PIL/requests)"
    goto :summary
) else (
    call :ok "Key packages importable from bundled Python"
)

:: ============================================================
:: STEP 2 — Vite renderer build
:: ============================================================
call :step_header 2 "Renderer build (Vite / TypeScript / React)"

call npm run build 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :fail "Vite renderer build failed"
    goto :summary
) else (
    call :ok "Renderer build complete (dist\renderer)"
)

:: ============================================================
:: STEP 3 — NSIS installer
:: ============================================================
call :step_header 3 "NSIS installer build"

:: Kill any running GroundView process so NSIS installer can overwrite files
taskkill /f /im "GroundView.exe" >nul 2>&1
taskkill /f /im "groundview.exe" >nul 2>&1
call :ok "Ensured GroundView is not running before installer build"

:: Verify icon exists (required for NSIS)
if not exist "%ROOT%icon.ico" (
    call :fail "icon.ico not found — NSIS build will fail"
    goto :summary
)
call :ok "icon.ico present"

:: Use norebuild since renderer was already built in Step 2
call npx electron-builder --win nsis 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :fail "NSIS installer build failed"
    goto :summary
) else (
    call :ok "NSIS installer built"
)

:: Confirm output
for /f "delims=" %%f in ('dir /b /s "%ROOT%dist\electron\*-Setup-*.exe" 2^>nul') do (
    call :ok "Installer : %%f"
)

:: ============================================================
:: STEP 4 — MSIX (appx) build with tile icons
:: ============================================================
call :step_header 4 "MSIX (appx) build with tile icons"

:: Regenerate appx tile icons from source (prevents wrong-size / black-border issues)
echo   Regenerating appx tile icons from source...
python "%ROOT%build\gen_appx_icons.py" 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :warn "gen_appx_icons.py failed — using existing icons (may have sizing issues)"
) else (
    call :ok "Appx tile icons regenerated from source"
)

:: Verify all required appx tile assets exist
set "APPX_DIR=%ROOT%build\appx"
set "ICON_MISSING=0"

for %%i in (
    Square44x44Logo.png
    Square150x150Logo.png
    Square310x310Logo.png
    Wide310x150Logo.png
    StoreLogo.png
) do (
    if not exist "%APPX_DIR%\%%i" (
        call :fail "Missing tile asset: build\appx\%%i"
        set "ICON_MISSING=1"
    ) else (
        echo   [ok] build\appx\%%i
    )
)

if "!ICON_MISSING!"=="1" (
    call :fail "One or more tile icons missing — MSIX build aborted to prevent Store rejection"
    goto :summary
)
call :ok "All tile icon assets verified"

call npx electron-builder --win appx 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :fail "MSIX build failed"
    goto :summary
) else (
    call :ok "MSIX package built"
)

:: Confirm output
for /f "delims=" %%f in ('dir /b /s "%ROOT%dist\electron\*.msix" 2^>nul') do (
    call :ok "MSIX file : %%f"
)
for /f "delims=" %%f in ('dir /b /s "%ROOT%dist\electron\*.appx" 2^>nul') do (
    call :ok "APPX file : %%f"
)

:: ============================================================
:: STEP 5 — Python unit tests (Store review issue verification)
:: ============================================================
call :step_header 5 "Python unit tests (Store review regression)"

:: Detect which Python to use for testing:
:: Prefer the bundled python so tests reflect actual shipping environment
set "PY_TEST_BIN=%ROOT%resources\python-bundle\python.exe"
if not exist "!PY_TEST_BIN!" (
    where python >nul 2>&1
    if errorlevel 1 (
        call :fail "No Python available for testing (bundled and system both missing)"
        goto :summary
    )
    set "PY_TEST_BIN=python"
    call :warn "Using system Python for tests (bundled not found)"
) else (
    call :ok "Using bundled Python for tests: !PY_TEST_BIN!"
)

:: Set GROUNDVIEW_SETTINGS_DIR so tests find user-data/settings.json from repo root
set "GROUNDVIEW_SETTINGS_DIR=%ROOT%user-data"
set "PYTHONPATH=%ROOT%backend;%ROOT%resources\python-bundle\Lib\site-packages"

echo.
echo   Running: test_api_key_decrypt.py
echo   -------------------------------------------------------
"!PY_TEST_BIN!" "%ROOT%backend\test_api_key_decrypt.py" 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :fail "test_api_key_decrypt.py FAILED (encryption/decryption regression)"
) else (
    call :ok "test_api_key_decrypt.py passed"
)

echo.
echo   Running: test_gemini.py  (text-only smoke test, no image)
echo   -------------------------------------------------------
"!PY_TEST_BIN!" "%ROOT%backend\test_gemini.py" 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :warn "test_gemini.py returned non-zero (may require valid GEMINI_API_KEY in settings)"
) else (
    call :ok "test_gemini.py passed"
)

:: bundled Python import health check (mirrors what main.js does at runtime)
echo.
echo   Running: bundled Python import health check
echo   -------------------------------------------------------

:: Write a temp script to avoid batch ^ continuation issues
set "HEALTH_SCRIPT=%TEMP%\gv_health_check.py"
(
    echo import sys
    echo sys.path.insert(0, r"%ROOT%backend"^)
    echo from settings_manager import get_settings_manager
    echo from webview_ocr import run_gemini, encode_image_b64
    echo import fastapi, uvicorn, cryptography, PIL, requests, httpx
    echo print("[health] All imports OK"^)
) > "!HEALTH_SCRIPT!"

"!PY_TEST_BIN!" "!HEALTH_SCRIPT!" 2>> "%LOG_FILE%"
if errorlevel 1 (
    call :fail "Bundled Python import health check FAILED"
) else (
    call :ok "All runtime imports verified in bundled Python"
)
del "!HEALTH_SCRIPT!" >nul 2>&1

:: ============================================================
:: SUMMARY
:: ============================================================
:summary
echo.
echo %C_HEAD%============================================================%C_RESET%
echo %C_HEAD%  Build Summary%C_RESET%
echo %C_HEAD%============================================================%C_RESET%
echo   Finished : %DATE% %TIME%
echo   PASS     : %PASS%
echo   FAIL     : %FAIL%
echo.

if "%FAIL%"=="0" (
    echo %C_OK%  All steps completed successfully. Ready for Store submission.%C_RESET%
) else (
    echo %C_ERR%  %FAIL% step(s) failed. Review %LOG_FILE% for details.%C_RESET%
)

echo.
echo   Full log: %LOG_FILE%
echo.

:: Output dist directory listing
if exist "%ROOT%dist\electron\" (
    echo %C_HEAD%  Output files:%C_RESET%
    dir /b "%ROOT%dist\electron\" 2>nul
    echo.
)

endlocal
pause

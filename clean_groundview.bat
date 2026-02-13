@echo off
REM GroundView Complete Cleanup Script
REM Run this batch file to remove all GroundView data

echo ===================================
echo GroundView Complete Cleanup
echo ===================================
echo.
echo This will delete:
echo   - Application settings and API keys
echo   - Cache and temporary files
echo   - Log files
echo   - PaddleOCR model cache
echo.
echo Press Ctrl+C to cancel, or
pause

echo.
echo [1/4] Removing AppData\Roaming\GroundView...
if exist "%APPDATA%\GroundView" (
    rmdir /s /q "%APPDATA%\GroundView"
    echo    - Deleted: %APPDATA%\GroundView
) else (
    echo    - Not found: %APPDATA%\GroundView
)

echo.
echo [2/4] Removing AppData\Local\GroundView...
if exist "%LOCALAPPDATA%\GroundView" (
    rmdir /s /q "%LOCALAPPDATA%\GroundView"
    echo    - Deleted: %LOCALAPPDATA%\GroundView
) else (
    echo    - Not found: %LOCALAPPDATA%\GroundView
)

echo.
echo [3/4] Removing PaddleOCR cache...
if exist "%USERPROFILE%\.paddleocr" (
    rmdir /s /q "%USERPROFILE%\.paddleocr"
    echo    - Deleted: %USERPROFILE%\.paddleocr
) else (
    echo    - Not found: %USERPROFILE%\.paddleocr
)

echo.
echo [4/4] Removing development user-data folder...
if exist "%~dp0user-data" (
    rmdir /s /q "%~dp0user-data"
    echo    - Deleted: %~dp0user-data
) else (
    echo    - Not found: %~dp0user-data
)

echo.
echo ===================================
echo Cleanup Complete!
echo ===================================
echo.
echo All GroundView data has been removed.
echo You can now reinstall or the app is fully uninstalled.
echo.
pause

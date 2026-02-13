REM Script to create placeholder installer header/sidebar images
REM These should be replaced with actual graphics for production

@echo off
echo Creating placeholder installer graphics...
echo.
echo Please create the following images:
echo.
echo 1. build/installerHeader.bmp
echo    - Size: 150x57 pixels
echo    - Format: BMP (24-bit)
echo    - Content: GroundView logo + title on gradient background
echo.
echo 2. build/installerSidebar.bmp  
echo    - Size: 164x314 pixels
echo    - Format: BMP (24-bit)
echo    - Content: Vertical banner with GroundView branding
echo.
echo You can use tools like:
echo - GIMP (free)
echo - Photoshop
echo - Paint.NET
echo.
echo Or use online tools:
echo - https://www.photopea.com/
echo - https://www.canva.com/
echo.
echo For now, installer will use default NSIS graphics.
echo.
pause

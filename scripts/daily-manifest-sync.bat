@echo off
REM ============================================
REM Promos Ink Supply Chain - Daily Manifest Sync
REM Run this script daily to upload all manifests
REM ============================================

echo.
echo ============================================
echo   Promos Ink Supply Chain - Daily Sync
echo ============================================
echo.

set SCRIPT_DIR=%~dp0
set DATA_DIR=\\promos-dc01\data\Huy\desktop receiving tool

REM Upload CustomInk orders
echo [1/4] Uploading CustomInk orders...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload-manifest.ps1" -Type customink -FilePath "%DATA_DIR%\customink_orders.xlsx"
if %ERRORLEVEL% NEQ 0 echo Warning: CustomInk upload failed

REM Upload Sanmar manifest
echo [2/4] Uploading Sanmar manifest...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload-manifest.ps1" -Type sanmar -FilePath "%DATA_DIR%\sanmar.xlsx"
if %ERRORLEVEL% NEQ 0 echo Warning: Sanmar upload failed

REM Upload S&S Activewear manifest
echo [3/4] Uploading S&S Activewear manifest...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload-manifest.ps1" -Type ss -FilePath "%DATA_DIR%\s&s.xlsx"
if %ERRORLEVEL% NEQ 0 echo Warning: S&S upload failed

REM Upload Inbound (Quantum View)
echo [4/4] Uploading Inbound manifest...
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%upload-manifest.ps1" -Type inbound -FilePath "%DATA_DIR%\inbound.csv"
if %ERRORLEVEL% NEQ 0 echo Warning: Inbound upload failed

echo.
echo ============================================
echo   Sync complete!
echo ============================================
echo.

pause


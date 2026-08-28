@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "SILENT_FLAG="
if /I "%~1"=="/s" set "SILENT_FLAG=-Silent"
if /I "%~1"=="--silent" set "SILENT_FLAG=-Silent"
if /I "%SILENT%"=="1" set "SILENT_FLAG=-Silent"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\download-dependencies.ps1" %SILENT_FLAG%
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo Dependency bootstrap failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)
set "YUM_TONG_DEPENDENCIES_READY=1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build.ps1" %SILENT_FLAG%
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo Build failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)
if defined SILENT_FLAG exit /b 0
choice /C YN /N /M "Launch the built Material Designer application now? [Y/N] "
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build.ps1" -Launch -SkipBuild
exit /b %ERRORLEVEL%

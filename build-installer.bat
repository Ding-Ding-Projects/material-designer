@echo off
setlocal EnableExtensions
set "SCRIPT_DIR=%~dp0"
set "SILENT_FLAG="
if /I "%SILENT%"=="1" set "SILENT_FLAG=-Silent"
set "CANDIDATE="
:parse
if "%~1"=="" goto parsed
if /I "%~1"=="/s" set "SILENT_FLAG=-Silent" & shift & goto parse
if /I "%~1"=="--silent" set "SILENT_FLAG=-Silent" & shift & goto parse
if /I "%~1"=="--candidate" (
  if "%~2"=="" goto usage
  set "CANDIDATE=%~2"
  shift
  shift
  goto parse
)
echo Unknown option: %~1
goto usage
:parsed

if not defined CANDIDATE goto usage
call "%SCRIPT_DIR%download-dependencies.bat" /s
if errorlevel 1 exit /b %ERRORLEVEL%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build-installer.ps1" -Candidate "%CANDIDATE%" %SILENT_FLAG%
exit /b %ERRORLEVEL%
:usage
echo Usage: build-installer.bat --candidate ^<positive ordinal^> [/s]
exit /b 2

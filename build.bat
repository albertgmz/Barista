@REM Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only
@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" >nul 2>&1
if errorlevel 1 goto directory_failed

set "NODE_EXE="
set "NPM_CMD="
for /f "delims=" %%I in ('where.exe node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"
for /f "delims=" %%I in ('where.exe npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%~fI"
if not defined NODE_EXE goto missing_tools
if not defined NPM_CMD goto missing_tools
if not exist "%NODE_EXE%" goto missing_tools
if not exist "%NPM_CMD%" goto missing_tools
for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
set "PATH=%NODE_DIR%;%PATH%"
"%NODE_EXE%" --version >nul 2>&1
if errorlevel 1 goto missing_tools
call "%NPM_CMD%" --version >nul 2>&1
if errorlevel 1 goto missing_tools

set "BUILD_VERSION="
set "VERSION_FILE=%TEMP%\barista-version-%RANDOM%-%RANDOM%.tmp"
"%NODE_EXE%" -p "require('./package.json').version" > "%VERSION_FILE%" 2>nul
if errorlevel 1 goto version_failed
set /p "BUILD_VERSION=" < "%VERSION_FILE%"
del /q "%VERSION_FILE%" >nul 2>&1
if not defined BUILD_VERSION goto version_failed

if "%~1"=="" goto menu
if /i "%~1"=="installer" goto installer
if /i "%~1"=="portable" goto portable
if /i "%~1"=="run" goto run_portable
goto usage

:menu
cls
echo Barista %BUILD_VERSION%
echo.
echo   1. Build installer ^(NSIS setup .exe^)
echo   2. Build portable ^(single portable .exe^)
echo   3. Run portable
echo   4. Exit
echo.
set "BUILD_CHOICE="
set /p "BUILD_CHOICE=Choose 1-4: "
if "%BUILD_CHOICE%"=="1" goto installer
if "%BUILD_CHOICE%"=="2" goto portable
if "%BUILD_CHOICE%"=="3" goto run_portable
if "%BUILD_CHOICE%"=="4" goto success
echo.
echo ERROR: Enter 1, 2, 3, or 4.
pause
goto menu

:prepare
if exist "node_modules\" goto verify
echo node_modules is missing. Installing locked dependencies...
call "%NPM_CMD%" ci
if errorlevel 1 goto dependency_failed

:verify
echo.
echo [1/4] Typechecking...
call "%NPM_CMD%" run typecheck
if errorlevel 1 goto typecheck_failed
echo.
echo [2/4] Linting...
call "%NPM_CMD%" run lint
if errorlevel 1 goto lint_failed
echo.
echo [3/4] Checking formatting...
call "%NPM_CMD%" run format:check
if errorlevel 1 goto format_failed
echo.
echo [4/4] Testing...
call "%NPM_CMD%" run test
if errorlevel 1 goto test_failed
exit /b 0

:installer
call :prepare
if errorlevel 1 goto failed
echo.
echo Building the Barista %BUILD_VERSION% NSIS installer...
call "%NPM_CMD%" run package:installer
if errorlevel 1 goto installer_failed
call :print_artifact "release\Barista-%BUILD_VERSION%-setup.exe"
if errorlevel 1 goto artifact_failed
goto completed

:portable
call :prepare
if errorlevel 1 goto failed
echo.
echo Building the Barista %BUILD_VERSION% portable executable...
call "%NPM_CMD%" run package:portable
if errorlevel 1 goto portable_failed
call :print_artifact "release\Barista-%BUILD_VERSION%-portable.exe"
if errorlevel 1 goto artifact_failed
goto completed

:run_portable
if not exist "release\Barista-%BUILD_VERSION%-portable.exe" (
  call :prepare
  if errorlevel 1 goto failed
  echo.
  echo Portable executable not found. Building it now...
  call "%NPM_CMD%" run package:portable
  if errorlevel 1 goto portable_failed
)
call :print_artifact "release\Barista-%BUILD_VERSION%-portable.exe"
if errorlevel 1 goto artifact_failed
echo Launching Barista portable...
start "" "%CD%\release\Barista-%BUILD_VERSION%-portable.exe"
if errorlevel 1 goto launch_failed
goto completed

:print_artifact
if not exist "%~1" exit /b 1
for %%F in ("%~1") do (
  echo.
  echo Artifact: %%~fF
  echo Size: %%~zF bytes
  "%NODE_EXE%" -e "console.log('Size: ' + (Number(process.argv[1]) / 1048576).toFixed(2) + ' MiB')" "%%~zF"
)
exit /b 0

:completed
echo.
echo BUILD SUCCEEDED
if "%~1"=="" (
  pause
  goto menu
)
goto success

:usage
echo ERROR: Unknown command "%~1".
echo Usage: build.bat [installer^|portable^|run]
goto failed

:missing_tools
echo ERROR: Node.js and npm are required. Install Node.js 22.12 or newer and try again.
goto failed

:directory_failed
echo ERROR: Cannot access the Barista project directory.
exit /b 1

:version_failed
if defined VERSION_FILE del /q "%VERSION_FILE%" >nul 2>&1
echo ERROR: Could not read the version from package.json.
goto failed

:dependency_failed
echo ERROR: npm ci failed.
goto failed

:typecheck_failed
echo ERROR: Typecheck failed. No build was produced.
goto failed

:lint_failed
echo ERROR: Lint failed. No build was produced.
goto failed

:format_failed
echo ERROR: Format check failed. No build was produced.
goto failed

:test_failed
echo ERROR: Tests failed. No build was produced.
goto failed

:installer_failed
echo ERROR: Installer build failed.
goto failed

:portable_failed
echo ERROR: Portable build failed.
goto failed

:artifact_failed
echo ERROR: The expected Barista %BUILD_VERSION% artifact was not produced.
goto failed

:launch_failed
echo ERROR: The portable executable could not be launched.
goto failed

:failed
popd
exit /b 1

:success
popd
exit /b 0

@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title J.A.R.V.I.S.
if not exist "engine\.venv\Scripts\python.exe" goto :needsetup
if not exist "app\node_modules\electron\dist\electron.exe" goto :needsetup
if not exist "app\dist\index.html" goto :build
if not exist "app\dist-electron\main.cjs" goto :build
goto :run
:build
pushd app
call npm run build:renderer && call npm run build:electron
popd
:run
rem The shell hides itself in the tray; this window can be closed.
start "" "app\node_modules\electron\dist\electron.exe" "app"
exit /b 0
:needsetup
echo O Jarvis ainda nao foi instalado neste computador. Executando setup.cmd ...
call setup.cmd /nopause
if errorlevel 1 (pause & exit /b 1)
goto :run

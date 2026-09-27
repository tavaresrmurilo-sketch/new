@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title J.A.R.V.I.S. - desenvolvimento
if not exist "engine\.venv\Scripts\python.exe" call setup.cmd /nopause
if errorlevel 1 (pause & exit /b 1)
echo Iniciando Vite + Electron com recarga automatica. Ctrl+C para sair.
pushd app
call npm run dev
popd

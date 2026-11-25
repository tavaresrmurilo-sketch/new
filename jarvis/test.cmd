@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title J.A.R.V.I.S. - testes
if not exist "engine\.venv\Scripts\python.exe" call setup.cmd /nopause
set "PY=%~dp0engine\.venv\Scripts\python.exe"
set FAILED=0

echo === Engine (pytest) ===
"%PY%" -m pip install -q -r engine\requirements-dev.txt
pushd engine
"%PY%" -m pytest -q
if errorlevel 1 set FAILED=1
popd

pushd app
echo === Tipos (tsc) ===
call npm run typecheck
if errorlevel 1 set FAILED=1
echo === Unitarios (vitest) ===
call npx vitest run
if errorlevel 1 set FAILED=1
echo === Auditoria de botoes ===
call node scripts\audit-buttons.mjs
if errorlevel 1 set FAILED=1
echo === E2E (Playwright) ===
call npx playwright install chromium
call npm run build:renderer
call npx playwright test
if errorlevel 1 set FAILED=1
popd

if "%FAILED%"=="1" (echo. & echo ALGUNS TESTES FALHARAM. & if /i not "%~1"=="/nopause" pause & exit /b 1)
echo. & echo Todos os testes passaram.
if /i not "%~1"=="/nopause" pause
exit /b 0

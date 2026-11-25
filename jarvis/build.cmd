@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title J.A.R.V.I.S. - build
if not exist "engine\.venv\Scripts\python.exe" call setup.cmd /nopause
if errorlevel 1 goto :fail
set "PY=engine\.venv\Scripts\python.exe"

echo [1/4] Empacotando o Jarvis Engine com PyInstaller ...
"%PY%" -m pip install -q pyinstaller
if errorlevel 1 goto :fail
pushd engine
"..\%PY%" -m PyInstaller --noconfirm --clean --onedir --name jarvis-engine --distpath dist --workpath build ^
  --collect-submodules jarvis_engine --collect-submodules uvicorn --collect-submodules comtypes ^
  --collect-data faster_whisper --collect-data piper --collect-all openwakeword ^
  --collect-binaries ctranslate2 --collect-binaries onnxruntime --hidden-import pycaw.pycaw run_engine.py
if errorlevel 1 (popd & goto :fail)
popd

echo [2/4] Verificando tipos e compilando a interface ...
pushd app
call npm run build
if errorlevel 1 (popd & goto :fail)
echo [3/4] Gerando instalador Windows (NSIS) e versao portatil ...
call npx electron-builder --win --x64 --publish never
if errorlevel 1 (popd & goto :fail)
popd
echo [4/4] Pronto. Instaladores em app\release\
if /i not "%~1"=="/nopause" pause
exit /b 0
:fail
echo O build falhou. Veja as mensagens acima.
if /i not "%~1"=="/nopause" pause
exit /b 1

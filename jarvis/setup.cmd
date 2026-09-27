@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title J.A.R.V.I.S. - setup
echo ==========================================
echo   J.A.R.V.I.S. - instalacao
echo ==========================================

where python >nul 2>nul
if errorlevel 1 goto :nopython
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 goto :oldpython
where node >nul 2>nul
if errorlevel 1 goto :nonode

if exist "engine\.venv\Scripts\python.exe" goto :venv_ok
echo [1/5] Criando ambiente Python em engine\.venv ...
python -m venv "engine\.venv"
if errorlevel 1 goto :fail
:venv_ok
set "PY=engine\.venv\Scripts\python.exe"
echo [2/5] Instalando o Jarvis Engine ...
"%PY%" -m pip install --upgrade pip --disable-pip-version-check -q
"%PY%" -m pip install -q -r engine\requirements.txt -r engine\requirements-windows.txt
if errorlevel 1 goto :fail
echo [3/5] Instalando a voz local: faster-whisper, Piper e openWakeWord ...
"%PY%" -m pip install -q -r engine\requirements-voice.txt
if errorlevel 1 echo [AVISO] A voz local nao foi instalada. O Jarvis funciona por texto; rode setup.cmd de novo depois.

echo [4/5] Instalando o aplicativo desktop ...
pushd app
call npm install --no-fund --no-audit
if errorlevel 1 goto :fail_pop
echo [5/5] Compilando a interface ...
call npm run build:renderer
if errorlevel 1 goto :fail_pop
call npm run build:electron
if errorlevel 1 goto :fail_pop
popd

if not exist ".env.local" copy ".env.example" ".env.local" >nul
echo.
echo Pronto. Execute start.cmd para abrir o Jarvis.
echo Dica: com o Ollama instalado, rode "ollama pull qwen2.5:7b" para conversa livre.
goto :end

:nopython
echo [ERRO] Python 3.10 ou superior nao encontrado. Instale em https://www.python.org/downloads/ e marque "Add python.exe to PATH".
goto :fail
:oldpython
echo [ERRO] O Jarvis precisa de Python 3.10 ou superior.
goto :fail
:nonode
echo [ERRO] Node.js 20 ou superior nao encontrado. Instale em https://nodejs.org
goto :fail
:fail_pop
popd
:fail
echo.
echo A instalacao falhou. Veja as mensagens acima.
if /i not "%~1"=="/nopause" pause
exit /b 1
:end
if /i not "%~1"=="/nopause" pause
exit /b 0

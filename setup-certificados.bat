@echo off
setlocal enabledelayedexpansion

set CERT_FILE=cert.pem
set KEY_FILE=key.pem
set IP_LOCAL=

echo 🔐 Generador de certificados HTTPS con mkcert

:: Verificar si mkcert está instalado
where mkcert >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ mkcert no está instalado.
    echo 📦 Puedes instalarlo con Chocolatey: choco install mkcert
    pause
    exit /b
)

:: Buscar IP local (en español o inglés)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4 Address" /C:"Direcci.n IPv4"') do (
    set "IP=%%a"
    set "IP_LOCAL=!IP:~1!"
    goto :found
)

:found

:: Mostrar IP local detectada
echo 🌐 IP local detectada: %IP_LOCAL%

:: Instalar la CA local (si no se ha hecho)
echo 🛠 Instalando CA local...
mkcert -install

:: Generar certificado
echo 📄 Generando certificados para:
echo     localhost
echo     127.0.0.1
echo     ::1
echo     %IP_LOCAL%
echo 🔧 Archivos de salida: %CERT_FILE%, %KEY_FILE%

mkcert -cert-file %CERT_FILE% -key-file %KEY_FILE% localhost 127.0.0.1 ::1 %IP_LOCAL%

if %ERRORLEVEL% neq 0 (
    echo ❌ Ocurrió un error durante la generación del certificado.
    pause
    exit /b
)

echo ✅ Certificados generados correctamente.
pause

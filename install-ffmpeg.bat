@echo off
echo 🎬 Instalador de FFmpeg usando winget

:: Verificar si winget está disponible
where winget >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Winget no está disponible. Instálalo desde la Microsoft Store ("App Installer")
    pause
    exit /b
)

echo ✅ Winget encontrado. Iniciando instalación de FFmpeg...

:: Instalar FFmpeg Essentials Build
winget install "FFmpeg (Essentials Build)" --accept-source-agreements --accept-package-agreements

if %ERRORLEVEL% neq 0 (
    echo ❌ Falló la instalación de FFmpeg.
    pause
    exit /b
)

echo ✅ FFmpeg instalado correctamente.
echo 🔍 Ruta del ejecutable:
where ffmpeg

echo 📦 Versión instalada:
ffmpeg -version

pause

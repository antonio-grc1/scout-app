@echo off
title Juan XXIII - Launcher
echo ========================================================
echo  Iniciando Base de Datos Local, Backend y Frontend...
echo ========================================================

start "Juan XXIII - Base de Datos" cmd /k "%~dp0iniciar_db.bat"
timeout /t 3 /nobreak >nul
start "Juan XXIII - Backend" cmd /k "%~dp0iniciar_backend.bat"
timeout /t 2 /nobreak >nul
start "Juan XXIII - Frontend" cmd /k "%~dp0iniciar_frontend.bat"

echo.
echo Se han abierto las ventanas para:
echo - Base de Datos: localhost:5432 (scout_app)
echo - Backend API:   http://localhost:3000/api
echo - Frontend Web:  http://localhost:5173
echo.

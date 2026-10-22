@echo off
title ScoutApp - Detener Servicios
echo ==============================================
echo  Deteniendo procesos en puertos 5432, 3000 y 5173...
echo ==============================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5432 ^| findstr LISTENING') do (
    echo Deteniendo PostgreSQL (PID %%a)...
    taskkill /f /pid %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Deteniendo Backend (PID %%a)...
    taskkill /f /pid %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo Deteniendo Frontend (PID %%a)...
    taskkill /f /pid %%a 2>nul
)

echo.
echo Todos los servicios han sido detenidos.
pause

@echo off
title ScoutApp - Backend API
cd /d "%~dp0backend"
echo ==============================================
echo  Iniciando Backend NestJS (Puerto 3000)
echo ==============================================
npm run start:dev
pause

@echo off
title ScoutApp - Base de Datos Local
cd /d "%~dp0backend"
echo ==============================================
echo  Iniciando PostgreSQL Local (Puerto 5432)
echo ==============================================
npm run db:local
pause

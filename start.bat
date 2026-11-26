@echo off
chcp 65001 >nul
title SVTro Da Nang - Khoi dong He thong

echo ========================================================
echo   SVTro Da Nang - NestJS + MongoDB + Frontend
echo ========================================================
echo.

echo [1/3] Dang khoi dong Backend NestJS (Cong 5000)...
start "SVTro Backend (NestJS - Port 5000)" cmd /k "cd /d "%~dp0backend" && npm run start:dev"

echo [2/3] Dang khoi dong Frontend Web (Cong 3000)...
start "SVTro Frontend (Port 3000)" cmd /k "cd /d "%~dp0" && node server.js"

echo [3/3] Cho 5 giay roi tu dong mo trinh duyet...
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo.
echo Da khoi dong thanh cong!
echo - Trang web chinh: http://localhost:3000
echo - Swagger API Docs: http://localhost:5000/api/docs
echo.
pause

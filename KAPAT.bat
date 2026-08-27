@echo off
chcp 65001 >nul
title Gelir Takip - Kapatiliyor

echo  Sunucular kapatiliyor...
taskkill /F /IM httpd.exe  >nul 2>&1
taskkill /F /IM mysqld.exe >nul 2>&1
echo  Kapatildi.
timeout /t 2 /nobreak >nul

@echo off
chcp 65001 >nul
title Gelir Defteri

echo.
echo  ====================================
echo   GELIR DEFTERI - BASLATILIYOR
echo  ====================================
echo.

echo  [1/3] Veritabani (MySQL) baslatiliyor...
start "MySQL" /min "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone

echo  [2/3] Web sunucusu (Apache) baslatiliyor...
start "Apache" /min "C:\xampp\apache\bin\httpd.exe"

echo       Aciliyor, birkac saniye...
timeout /t 7 /nobreak >nul

echo  [3/3] Tarayici aciliyor...
start "" "http://localhost/gelir-defteri/"

echo.
echo  Hazir.
echo.
echo  Uygulama : http://localhost/gelir-defteri/
echo  Veritabani: http://localhost/phpmyadmin  (gelir_defteri)
echo.
echo  Isin bitince KAPAT.bat dosyasini calistir.
echo.
pause

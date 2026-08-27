<?php
/* =============================================================================
   ÖRNEK AYAR DOSYASI
   =============================================================================
   Bu dosyayı kopyalayın, adını "ayarlar.php" yapın ve kendi bilgilerinizi girin:

       copy ayarlar.ornek.php ayarlar.php

   ayarlar.php depoya GÖNDERİLMEZ (.gitignore içinde). Şifreler sürüm kontrolüne
   girmemelidir: depo bir kez herkese açık olduğunda şifre de herkese açık olur
   ve geçmiş kayıtlardan silmek çok zordur.

   Uygulama root ile bağlanmamalı. Yalnızca bu veritabanında veri okuyup yazan,
   tablo silme gibi yetkileri olmayan bir kullanıcı yeterlidir (en az yetki
   ilkesi). Böyle bir kullanıcıyı kur.sql oluşturuyor.
============================================================================= */

return [
    'sunucu'     => 'localhost',
    'veritabani' => 'gelir_defteri',
    'kullanici'  => 'defter_app',
    'sifre'      => 'BURAYA_KENDI_SIFRENIZI_YAZIN',
];

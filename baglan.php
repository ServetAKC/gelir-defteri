<?php
// Veritabanı bağlantısı. api.php bu dosyayı çağırır.
// XAMPP'ta kullanıcı adı "root", şifre boştur.

$db = new PDO(
    "mysql:host=localhost;dbname=gelir_defteri;charset=utf8mb4",
    "root",
    "",
    [
        // Hata olursa sessiz kalma, istisna fırlat.
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        // Sonuçlar sütun adlarıyla gelsin (0,1,2 diye de tekrarlanmasın).
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // Sorguları gerçekten veritabanına hazırlat (taklit etme).
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]
);

// Giriş ekranı yok; uygulama tek kullanıcıyla çalışıyor.
// Giriş eklendiğinde burası $_SESSION['kullanici_id'] olacak.
$KULLANICI_ID = 1;

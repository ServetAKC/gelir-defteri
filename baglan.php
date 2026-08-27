<?php
/* =============================================================================
   VERİTABANI BAĞLANTISI
   =============================================================================
   Kullanıcı adı ve şifre BU DOSYADA DEĞİL, ayarlar.php içinde durur.
   ayarlar.php depoya gönderilmez; örneği ayarlar.ornek.php olarak paylaşılır.

   Neden? Şifre koda yazılırsa depoyu gören herkes şifreyi görür. Depo sonradan
   gizlense bile eski commit'lerde durmaya devam eder. Bu yüzden şifreler ayrı
   bir dosyada tutulur ve o dosya sürüm kontrolüne hiç girmez.
============================================================================= */

$ayarDosyasi = __DIR__ . '/ayarlar.php';

// Ayar dosyası yoksa anlaşılır bir mesaj ver; PHP hatasıyla çökme.
if (!file_exists($ayarDosyasi)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'hata' => 'ayarlar.php bulunamadı. ayarlar.ornek.php dosyasını kopyalayıp '
                . 'adını ayarlar.php yapın ve veritabanı bilgilerinizi girin.'
    ]);
    exit;
}

$ayar = require $ayarDosyasi;

try {
    $db = new PDO(
        "mysql:host={$ayar['sunucu']};dbname={$ayar['veritabani']};charset=utf8mb4",
        $ayar['kullanici'],
        $ayar['sifre'],
        [
            // Hata olursa sessiz kalma, istisna fırlat.
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            // Sonuçlar sütun adlarıyla gelsin.
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Sorguları gerçekten veritabanına hazırlat (taklit etme).
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    // Şifreyi ekrana basmıyoruz; sadece bağlanamadığımızı söylüyoruz.
    echo json_encode([
        'hata' => 'Veritabanına bağlanılamadı. MySQL çalışıyor mu ve '
                . 'ayarlar.php içindeki bilgiler doğru mu?'
    ]);
    exit;
}

// Giriş ekranı yok; uygulama tek kullanıcıyla çalışıyor.
// Giriş eklendiğinde burası $_SESSION['kullanici_id'] olacak.
$KULLANICI_ID = 1;

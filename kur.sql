-- =============================================================================
--  GELİR DEFTERİ — VERİTABANI
--  phpMyAdmin > SQL sekmesine yapıştır ve çalıştır.
--  DİKKAT: ilk satır veritabanını siler, içinde veri varken çalıştırma.
-- =============================================================================

DROP DATABASE IF EXISTS gelir_defteri;
CREATE DATABASE gelir_defteri CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;
USE gelir_defteri;

-- -----------------------------------------------------------------------------
--  KULLANICILAR
--  Uygulamada henüz giriş ekranı yok, tek kullanıcı (id = 1) ile çalışıyor.
--  Tablo yine de var: giriş eklenmek istendiğinde şema hazır olsun diye.
-- -----------------------------------------------------------------------------
CREATE TABLE kullanicilar (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  eposta       VARCHAR(190) NOT NULL UNIQUE,
  sifre_hash   VARCHAR(255) NOT NULL,
  ad_soyad     VARCHAR(80)  NOT NULL,
  -- Ekranda hangi para biriminde gösterileceği (uygulamadaki "base").
  para_birimi  CHAR(3)      NOT NULL DEFAULT 'TRY'
);

-- -----------------------------------------------------------------------------
--  KATEGORİLER
-- -----------------------------------------------------------------------------
CREATE TABLE kategoriler (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kullanici_id INT UNSIGNED NOT NULL,
  ad           VARCHAR(24)  NOT NULL,
  renk_slot    TINYINT UNSIGNED NOT NULL DEFAULT 9,   -- arayüzdeki renk sırası

  -- Aynı kullanıcı aynı adı iki kez ekleyemez.
  -- Collation turkish_ci olduğu için "Kasa" ile "kasa" aynı sayılır.
  UNIQUE KEY uk_kategori (kullanici_id, ad),

  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
--  KURLAR — 1 birim kaç TL eder
-- -----------------------------------------------------------------------------
CREATE TABLE kurlar (
  kullanici_id INT UNSIGNED  NOT NULL,
  para_birimi  CHAR(3)       NOT NULL,
  deger        DECIMAL(12,4) NOT NULL,

  -- Bir kullanıcının bir para biriminden tek kuru olur.
  PRIMARY KEY (kullanici_id, para_birimi),
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
--  KAYITLAR — asıl veri
-- -----------------------------------------------------------------------------
CREATE TABLE kayitlar (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kullanici_id   INT UNSIGNED  NOT NULL,
  kategori_id    INT UNSIGNED  NOT NULL,

  tutar          DECIMAL(12,2) NOT NULL,                 -- girilen tutar
  para_birimi    CHAR(3)       NOT NULL DEFAULT 'TRY',
  kur            DECIMAL(12,4) NOT NULL DEFAULT 1.0000,  -- işlem anındaki kur

  -- ÜRETİLMİŞ SÜTUN: TL karşılığını veritabanı kendisi hesaplar.
  -- Dışarıdan yazılamaz, dolayısıyla tutarla çelişmesi imkânsız.
  -- STORED olduğu için diske yazılır ve raporlarda hızlıdır.
  tutar_try      DECIMAL(14,2) AS (tutar * kur) STORED,

  tarih          DATE          NOT NULL,
  aciklama       VARCHAR(80)   NULL,
  olusturma      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- YUMUŞAK SİLME: NULL ise kayıt duruyor, doluysa silinmiş sayılır.
  -- Arayüzdeki 8 saniyelik "Geri al" bunu tekrar NULL yapıyor.
  silinme_zamani DATETIME      NULL DEFAULT NULL,

  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,

  -- RESTRICT: içinde kaydı olan kategori SİLİNEMEZ.
  -- Arayüzdeki "bu kategoride N kayıt var" uyarısının veritabanı garantisi.
  FOREIGN KEY (kategori_id) REFERENCES kategoriler(id) ON DELETE RESTRICT,

  -- İndeksler: en sık sorulan iki soruyu hızlandırır.
  KEY ix_kullanici_tarih (kullanici_id, tarih),   -- ay şeridi, özet kartları
  KEY ix_kategori (kategori_id)                   -- pasta grafik
);

-- -----------------------------------------------------------------------------
--  GÖRÜNÜMLER — kaydedilmiş sorgular
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kategori_dagilimi AS
SELECT k.kullanici_id, k.kategori_id, kt.ad AS kategori_adi, kt.renk_slot,
       COUNT(*) AS kayit_sayisi, SUM(k.tutar_try) AS toplam_try
FROM kayitlar k
JOIN kategoriler kt ON kt.id = k.kategori_id
WHERE k.silinme_zamani IS NULL
GROUP BY k.kullanici_id, k.kategori_id, kt.ad, kt.renk_slot;

CREATE OR REPLACE VIEW v_aylik_ozet AS
SELECT kullanici_id, DATE_FORMAT(tarih, '%Y-%m') AS ay,
       COUNT(*) AS kayit_sayisi, SUM(tutar_try) AS toplam_try
FROM kayitlar
WHERE silinme_zamani IS NULL
GROUP BY kullanici_id, DATE_FORMAT(tarih, '%Y-%m');

-- -----------------------------------------------------------------------------
--  BAŞLANGIÇ VERİSİ
--  Tek kullanıcı ve varsayılan kurlar. Kategoriler boş başlar; kullanıcı
--  kendi kategorilerini ekler (arayüzde hazır öneriler var).
-- -----------------------------------------------------------------------------
INSERT INTO kullanicilar (id, eposta, sifre_hash, ad_soyad, para_birimi)
VALUES (1, 'dukkan@ornek.com', '$2y$10$ornekhashdegeri', 'Dükkân', 'TRY');

INSERT INTO kurlar (kullanici_id, para_birimi, deger) VALUES
  (1, 'TRY',  1.0000),
  (1, 'USD', 41.0000),
  (1, 'EUR', 48.0000),
  (1, 'GBP', 55.0000);

-- -----------------------------------------------------------------------------
--  UYGULAMA KULLANICISI
--  Uygulama root ile bağlanmamalı: root'un tablo silme, kullanıcı açma gibi
--  yetkileri var ve uygulamanın bunlara ihtiyacı yok. Bu yüzden yalnızca bu
--  veritabanında veri okuyup yazabilen ayrı bir kullanıcı açıyoruz.
--  Buna EN AZ YETKİ İLKESİ denir.
--
--  Aşağıdaki şifreyi kendi şifrenle değiştir ve AYNISINI ayarlar.php dosyasına
--  yaz. ayarlar.php depoya gönderilmez (.gitignore içinde).
-- -----------------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'defter_app'@'localhost' IDENTIFIED BY 'BURAYA_KENDI_SIFRENIZI_YAZIN';
-- ALTER da yaziyoruz: kullanici zaten varsa CREATE hicbir sey yapmaz ve eski
-- sifre gecerli kalirdi. Bu satir sifreyi her durumda gunceller.
ALTER USER 'defter_app'@'localhost' IDENTIFIED BY 'BURAYA_KENDI_SIFRENIZI_YAZIN';
GRANT SELECT, INSERT, UPDATE, DELETE ON gelir_defteri.* TO 'defter_app'@'localhost';
FLUSH PRIVILEGES;

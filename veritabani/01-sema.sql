-- =============================================================================
--  GELİR DEFTERİ — VERİTABANI ŞEMASI (MySQL 8)
-- =============================================================================
--  Bu dosya veritabanını sıfırdan kurar. Çalıştırmak için:
--      mysql -u root -p < 01-sema.sql
--
--  TASARIM KARARLARI (staj sunumunda sorulacak yerler bunlar):
--
--  1) Neden ayrı tablolar?  Kategori adını her kaydın içine yazsaydık, "Nakit
--     Satış" adını değiştirmek için binlerce satırı güncellemek gerekirdi ve
--     yazım hataları yüzünden "Nakit satis" / "nakit satış" diye ikiz kayıtlar
--     oluşurdu. Kategoriyi ayrı tabloya alıp kayıtta sadece numarasını (id)
--     tutmak buna engel olur. Buna NORMALİZASYON denir.
--
--  2) Neden DECIMAL, FLOAT değil?  FLOAT ondalık sayıları YAKLAŞIK saklar;
--     0.1 + 0.2 = 0.30000000000000004 eder. Parada bu kabul edilemez.
--     DECIMAL(12,2) kuruşu kuruşuna, tam olarak saklar.
--
--  3) Neden kur her kaydın içinde?  Satış o günkü kurdan yapıldı. Kur tablosunu
--     yarın güncelleyince geçmiş satışların TL karşılığı değişmemeli. Bu yüzden
--     kur, işlem anında kaydın içine "dondurulur".
--
--  4) Neden silme yerine silindi işareti?  Uygulamada 8 saniyelik "Geri al"
--     var. Satırı gerçekten silersek geri getiremeyiz. Bunun yerine
--     silinme_zamani alanını doldururuz (buna YUMUŞAK SİLME denir); geri al
--     işlemi de alanı tekrar NULL yapar.
-- =============================================================================

DROP DATABASE IF EXISTS gelir_defteri;

-- utf8mb4: Türkçe karakterler ve emoji dahil her şeyi saklar.
-- turkish_ci: sıralama ve karşılaştırma Türkçe kurallarına göre yapılır,
--             ayrıca "ci" (case-insensitive) sayesinde "Kasa" ile "kasa" aynı
--             kabul edilir; bu, aşağıdaki UNIQUE kuralını da güçlendirir.
CREATE DATABASE gelir_defteri
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_turkish_ci;

USE gelir_defteri;


-- -----------------------------------------------------------------------------
--  KULLANICILAR
-- -----------------------------------------------------------------------------
CREATE TABLE kullanicilar (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  eposta          VARCHAR(190)  NOT NULL,
  -- Şifrenin KENDİSİ asla saklanmaz. Sadece geri döndürülemez özeti (hash)
  -- saklanır: PHP'de password_hash(), Node'da bcrypt/argon2.
  -- Veritabanı çalınsa bile kimsenin şifresi ele geçmez.
  sifre_hash      VARCHAR(255)  NOT NULL,
  ad_soyad        VARCHAR(80)   NOT NULL,
  -- Kullanıcının ekranda görmek istediği para birimi (uygulamadaki "base").
  para_birimi     CHAR(3)       NOT NULL DEFAULT 'TRY',
  olusturma       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Aynı e-posta ile iki hesap açılamaz. Bu kuralı uygulamaya değil
  -- veritabanına koyuyoruz: uygulama kodunda hata olsa bile veri bozulmaz.
  UNIQUE KEY uk_kullanici_eposta (eposta)
) ENGINE=InnoDB;


-- -----------------------------------------------------------------------------
--  KATEGORİLER
-- -----------------------------------------------------------------------------
CREATE TABLE kategoriler (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kullanici_id    INT UNSIGNED  NOT NULL,
  ad              VARCHAR(24)   NOT NULL,
  -- Arayüzdeki renk sırası (1-8 ayrı renk, 9 ve sonrası nötr gri).
  renk_slot       TINYINT UNSIGNED NOT NULL DEFAULT 9,
  olusturma       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Bir kullanıcı aynı adı iki kez ekleyemez. Collation turkish_ci olduğu için
  -- "Kasa" ve "kasa" aynı sayılır — uygulamadaki kontrolün veritabanı karşılığı.
  UNIQUE KEY uk_kategori_ad (kullanici_id, ad),

  -- YABANCI ANAHTAR: kategori mutlaka var olan bir kullanıcıya ait olmalı.
  -- ON DELETE CASCADE: kullanıcı silinirse kategorileri de silinsin, ortada
  -- sahipsiz satır kalmasın.
  CONSTRAINT fk_kategori_kullanici
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;


-- -----------------------------------------------------------------------------
--  KURLAR  (1 birim kaç TL eder)
-- -----------------------------------------------------------------------------
CREATE TABLE kurlar (
  kullanici_id    INT UNSIGNED  NOT NULL,
  para_birimi     CHAR(3)       NOT NULL,
  deger           DECIMAL(12,4) NOT NULL,
  guncelleme      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

  -- BİLEŞİK BİRİNCİL ANAHTAR: bir kullanıcının bir para biriminden tek kuru olur.
  PRIMARY KEY (kullanici_id, para_birimi),

  CONSTRAINT fk_kur_kullanici
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id)
    ON DELETE CASCADE,

  -- Kur sıfır veya eksi olamaz. CHECK kısıtı MySQL 8.0.16+ ile çalışır.
  CONSTRAINT ck_kur_pozitif CHECK (deger > 0)
) ENGINE=InnoDB;


-- -----------------------------------------------------------------------------
--  KAYITLAR  (asıl veri)
-- -----------------------------------------------------------------------------
CREATE TABLE kayitlar (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kullanici_id    INT UNSIGNED  NOT NULL,
  kategori_id     INT UNSIGNED  NOT NULL,

  tutar           DECIMAL(12,2) NOT NULL,   -- girilen tutar (kendi biriminde)
  para_birimi     CHAR(3)       NOT NULL DEFAULT 'TRY',
  kur             DECIMAL(12,4) NOT NULL DEFAULT 1.0000,  -- işlem anındaki kur

  -- ÜRETİLMİŞ SÜTUN: tutar * kur her zaman TL karşılığıdır. Elle hesaplayıp
  -- yazmak yerine veritabanına hesaplatıyoruz; böylece tutarsız veri imkânsız.
  -- STORED = diske yazılır, dolayısıyla indekslenebilir ve raporlarda hızlıdır.
  tutar_try       DECIMAL(14,2) AS (tutar * kur) STORED,

  tarih           DATE          NOT NULL,   -- işlem günü (saat tutmuyoruz)
  aciklama        VARCHAR(80)   NULL,
  olusturma       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Yumuşak silme: NULL ise kayıt duruyor, dolu ise silinmiş sayılır.
  -- "Geri al" bu alanı NULL yapar.
  silinme_zamani  DATETIME      NULL DEFAULT NULL,

  CONSTRAINT fk_kayit_kullanici
    FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id)
    ON DELETE CASCADE,

  -- ON DELETE RESTRICT: içinde kaydı olan kategori SİLİNEMEZ.
  -- Uygulamadaki "bu kategoride N kayıt var, önce onları silin" uyarısının
  -- veritabanı seviyesindeki garantisi budur.
  CONSTRAINT fk_kayit_kategori
    FOREIGN KEY (kategori_id) REFERENCES kategoriler(id)
    ON DELETE RESTRICT,

  CONSTRAINT ck_tutar_pozitif CHECK (tutar > 0),
  CONSTRAINT ck_tutar_ustsinir CHECK (tutar <= 999999999.99),

  -- İNDEKSLER: indeks, kitabın arkasındaki dizin gibidir. Olmazsa MySQL
  -- her sorguda tüm tabloyu baştan sona okur.
  -- Bu indeks "şu kullanıcının şu tarih aralığındaki kayıtları" sorusunu
  -- doğrudan cevaplar — ay şeridi ve özet kartları hep bunu sorar.
  KEY ix_kayit_kullanici_tarih (kullanici_id, tarih),

  -- Kategori dağılımı (pasta grafik) bu indeksi kullanır.
  KEY ix_kayit_kategori (kategori_id, tarih)
) ENGINE=InnoDB;


-- =============================================================================
--  GÖRÜNÜMLER (VIEW)
--  Görünüm = kaydedilmiş sorgu. Uygulama karmaşık SQL yazmak yerine bunlardan
--  normal tablo gibi SELECT yapar. Aynı hesabın iki yerde farklı yazılması
--  riskini ortadan kaldırır.
-- =============================================================================

-- Kategori dağılımı: hangi kategoriden ne kadar gelir geldi?
CREATE OR REPLACE VIEW v_kategori_dagilimi AS
SELECT
    k.kullanici_id,
    k.kategori_id,
    kt.ad                       AS kategori_adi,
    kt.renk_slot,
    COUNT(*)                    AS kayit_sayisi,
    SUM(k.tutar_try)            AS toplam_try
FROM kayitlar k
JOIN kategoriler kt ON kt.id = k.kategori_id
WHERE k.silinme_zamani IS NULL          -- silinmiş kayıtlar raporlara girmez
GROUP BY k.kullanici_id, k.kategori_id, kt.ad, kt.renk_slot;


-- Aylık özet: hangi ayda kaç kayıt, ne kadar gelir?
CREATE OR REPLACE VIEW v_aylik_ozet AS
SELECT
    kullanici_id,
    DATE_FORMAT(tarih, '%Y-%m')  AS ay,     -- "2026-08"
    COUNT(*)                     AS kayit_sayisi,
    SUM(tutar_try)               AS toplam_try
FROM kayitlar
WHERE silinme_zamani IS NULL
GROUP BY kullanici_id, DATE_FORMAT(tarih, '%Y-%m');


-- =============================================================================
--  UYGULAMA KULLANICISI
--  Uygulama root ile bağlanmamalı. En az yetki ilkesi: uygulamanın DROP TABLE
--  yetkisi olmasına gerek yok, o yüzden vermiyoruz.
-- =============================================================================
CREATE USER IF NOT EXISTS 'defter_app'@'localhost' IDENTIFIED BY 'BuSifreyiDegistir!';
GRANT SELECT, INSERT, UPDATE, DELETE ON gelir_defteri.* TO 'defter_app'@'localhost';
FLUSH PRIVILEGES;

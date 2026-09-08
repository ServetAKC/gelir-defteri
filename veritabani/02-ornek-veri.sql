-- =============================================================================
--  ÖRNEK VERİ
--  Şema kurulduktan sonra çalıştırın:  mysql -u root -p < 02-ornek-veri.sql
--  Amaç: sorguları ve uygulamayı boş veritabanıyla değil, gerçekçi veriyle
--  denemek. Sunumda ekranın dolu görünmesi de işe yarar.
-- =============================================================================

USE gelir_defteri;

-- İşlemi tek parça yapıyoruz: ya hepsi girer ya hiçbiri.
-- Araya hata düşerse yarım veri kalmaz. Buna TRANSACTION denir.
START TRANSACTION;

-- -----------------------------------------------------------------------------
-- Kullanıcı
-- sifre_hash örnektir; gerçek uygulamada password_hash('1234', PASSWORD_DEFAULT)
-- gibi bir fonksiyonun ürettiği değer yazılır, elle uydurulmaz.
-- -----------------------------------------------------------------------------
INSERT INTO kullanicilar (eposta, sifre_hash, ad_soyad, para_birimi) VALUES
  ('dukkan@ornek.com', '$2y$10$ornekhashdegeri.ornekhashdegeri.ornekhash', 'Örnek Dükkân', 'TRY');

SET @uid = LAST_INSERT_ID();   -- yeni eklenen kullanıcının id'si

-- -----------------------------------------------------------------------------
-- Kurlar
-- -----------------------------------------------------------------------------
INSERT INTO kurlar (kullanici_id, para_birimi, deger) VALUES
  (@uid, 'TRY', 1.0000),
  (@uid, 'USD', 41.0000),
  (@uid, 'EUR', 48.0000),
  (@uid, 'GBP', 55.0000);

-- -----------------------------------------------------------------------------
-- Kategoriler
-- -----------------------------------------------------------------------------
INSERT INTO kategoriler (kullanici_id, ad, renk_slot) VALUES
  (@uid, 'Nakit Satış',   1),
  (@uid, 'Kart Satış',    2),
  (@uid, 'Online Sipariş', 3),
  (@uid, 'Hizmet',        4),
  (@uid, 'Toptan',        5);

-- Kategori id'lerini ada göre yakalayıp değişkene alıyoruz; böylece aşağıdaki
-- INSERT'lerde "1, 2, 3" gibi sabit sayı yazmak zorunda kalmıyoruz.
SET @nakit   = (SELECT id FROM kategoriler WHERE kullanici_id = @uid AND ad = 'Nakit Satış');
SET @kart    = (SELECT id FROM kategoriler WHERE kullanici_id = @uid AND ad = 'Kart Satış');
SET @online  = (SELECT id FROM kategoriler WHERE kullanici_id = @uid AND ad = 'Online Sipariş');
SET @hizmet  = (SELECT id FROM kategoriler WHERE kullanici_id = @uid AND ad = 'Hizmet');
SET @toptan  = (SELECT id FROM kategoriler WHERE kullanici_id = @uid AND ad = 'Toptan');

-- -----------------------------------------------------------------------------
-- Kayıtlar
-- Tarihler bugüne göre hesaplanıyor (CURDATE), böylece dosyayı ne zaman
-- çalıştırırsanız çalıştırın "bu ay" ve "bugün" dolu görünür.
-- -----------------------------------------------------------------------------
INSERT INTO kayitlar (kullanici_id, kategori_id, tutar, para_birimi, kur, tarih, aciklama) VALUES
  -- bugün
  (@uid, @nakit,  1450.00, 'TRY',  1.0000, CURDATE(),                        'Sabah kasası'),
  (@uid, @kart,   2380.50, 'TRY',  1.0000, CURDATE(),                        'Öğlen POS'),
  (@uid, @hizmet,  650.00, 'TRY',  1.0000, CURDATE(),                        'Montaj'),
  -- bu hafta
  (@uid, @nakit,  1890.00, 'TRY',  1.0000, CURDATE() - INTERVAL 1 DAY,       NULL),
  (@uid, @online,  120.00, 'USD', 41.0000, CURDATE() - INTERVAL 2 DAY,       'Yurt dışı sipariş'),
  (@uid, @kart,   3120.75, 'TRY',  1.0000, CURDATE() - INTERVAL 3 DAY,       'Hafta sonu'),
  (@uid, @toptan, 15400.00,'TRY',  1.0000, CURDATE() - INTERVAL 5 DAY,       'Bayi siparişi'),
  -- geçen ay
  (@uid, @nakit,  2100.00, 'TRY',  1.0000, CURDATE() - INTERVAL 1 MONTH,     NULL),
  (@uid, @online,  250.00, 'EUR', 47.5000, CURDATE() - INTERVAL 1 MONTH,     'Avrupa siparişi'),
  (@uid, @hizmet,  900.00, 'TRY',  1.0000, CURDATE() - INTERVAL 1 MONTH,     'Bakım'),
  -- iki ay önce
  (@uid, @kart,   4750.00, 'TRY',  1.0000, CURDATE() - INTERVAL 2 MONTH,     NULL),
  (@uid, @toptan, 22000.00,'TRY',  1.0000, CURDATE() - INTERVAL 2 MONTH,     'Sezon açılışı');

-- Silinmiş bir kayıt örneği: raporlarda GÖRÜNMEMELİ.
-- Sorgularınızı test ederken bunun toplamlara karışmadığını kontrol edin.
INSERT INTO kayitlar (kullanici_id, kategori_id, tutar, para_birimi, kur, tarih, aciklama, silinme_zamani)
VALUES (@uid, @nakit, 999.00, 'TRY', 1.0000, CURDATE(), 'Yanlış giriş', NOW());

COMMIT;

-- Kontrol
SELECT COUNT(*) AS toplam_satir,
       SUM(silinme_zamani IS NULL) AS aktif,
       SUM(silinme_zamani IS NOT NULL) AS silinmis
FROM kayitlar;

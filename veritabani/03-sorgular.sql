-- =============================================================================
--  UYGULAMANIN İHTİYAÇ DUYDUĞU SORGULAR
-- =============================================================================
--  Şu an bu hesapların hepsini JavaScript yapıyor (tarayıcıda, tüm kayıtları
--  tek tek gezerek). Veritabanına geçince hesabı MySQL yapar: veri zaten orada
--  olduğu için tüm listeyi tarayıcıya taşımaya gerek kalmaz.
--
--  Aşağıdaki ? işaretleri PARAMETREDİR. Sunucu kodunda değerleri sorgunun
--  içine YAPIŞTIRMAYIN; prepared statement ile ? yerine gönderin. Sebebi:
--  açıklama kutusuna  '; DROP TABLE kayitlar; --  yazan biri tablonuzu siler.
--  Buna SQL ENJEKSİYONU denir ve en yaygın saldırıdır.
-- =============================================================================

USE gelir_defteri;
SET @uid = 1;          -- örneklerde kullanıcı 1; gerçekte oturumdaki kullanıcı


-- -----------------------------------------------------------------------------
--  1) ÖZET KARTLARI  (Bugün / Bu Ay / Toplam)
--  Üç ayrı sorgu yerine tek sorguda üçü birden: koşullu toplama.
--  CASE WHEN ... THEN tutar ELSE 0 END  ->  "koşula uyanları topla".
-- -----------------------------------------------------------------------------
SELECT
    SUM(CASE WHEN tarih = CURDATE() THEN tutar_try ELSE 0 END)          AS bugun_try,
    SUM(CASE WHEN YEAR(tarih)  = YEAR(CURDATE())
             AND  MONTH(tarih) = MONTH(CURDATE()) THEN tutar_try ELSE 0 END) AS bu_ay_try,
    SUM(tutar_try)                                                       AS toplam_try,
    COUNT(*)                                                             AS kayit_sayisi
FROM kayitlar
WHERE kullanici_id = @uid
  AND silinme_zamani IS NULL;


-- -----------------------------------------------------------------------------
--  2) PASTA GRAFİK  (kategori dağılımı, büyükten küçüğe)
--  Yüzdeyi de veritabanı hesaplıyor. Pencere fonksiyonu SUM() OVER (),
--  "her satırın yanına toplamı da yaz" demek (MySQL 8+).
-- -----------------------------------------------------------------------------
SELECT
    kategori_adi,
    renk_slot,
    kayit_sayisi,
    toplam_try,
    ROUND(100.0 * toplam_try / SUM(toplam_try) OVER (), 1) AS yuzde
FROM v_kategori_dagilimi
WHERE kullanici_id = @uid
ORDER BY toplam_try DESC;


-- -----------------------------------------------------------------------------
--  3) KAYIT LİSTESİ  (ay ve kategori süzgeciyle, sayfalı)
--  JOIN: iki tabloyu birleştirir. Kayıtta sadece kategori_id var; kategori
--  ADINI göstermek için kategoriler tablosuna uğruyoruz.
--  LIMIT/OFFSET: sayfalama. 10.000 kaydı birden göndermeyiz.
-- -----------------------------------------------------------------------------
SELECT
    k.id,
    k.tarih,
    kt.ad            AS kategori,
    kt.renk_slot,
    k.tutar,
    k.para_birimi,
    k.kur,
    k.tutar_try,
    k.aciklama
FROM kayitlar k
JOIN kategoriler kt ON kt.id = k.kategori_id
WHERE k.kullanici_id = @uid
  AND k.silinme_zamani IS NULL
  AND (? IS NULL OR DATE_FORMAT(k.tarih, '%Y-%m') = ?)   -- ay süzgeci ("2026-08" ya da NULL)
  AND (? IS NULL OR k.kategori_id = ?)                   -- kategori süzgeci
ORDER BY k.tarih DESC, k.id DESC
LIMIT 50 OFFSET 0;


-- -----------------------------------------------------------------------------
--  4) AY ŞERİDİ  (hangi aylarda kayıt var?)
--  Arayüzde kaydı olmayan ayları soluk göstermek için.
-- -----------------------------------------------------------------------------
SELECT ay, kayit_sayisi, toplam_try
FROM v_aylik_ozet
WHERE kullanici_id = @uid
  AND ay LIKE CONCAT(?, '%')      -- ? = '2026'
ORDER BY ay;


-- -----------------------------------------------------------------------------
--  5) SON 12 AYIN TRENDİ  (grafik eklemek isterseniz hazır)
-- -----------------------------------------------------------------------------
SELECT
    DATE_FORMAT(tarih, '%Y-%m') AS ay,
    SUM(tutar_try)              AS toplam_try
FROM kayitlar
WHERE kullanici_id = @uid
  AND silinme_zamani IS NULL
  AND tarih >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY DATE_FORMAT(tarih, '%Y-%m')
ORDER BY ay;


-- -----------------------------------------------------------------------------
--  6) EN ÇOK GETİREN KATEGORİ
-- -----------------------------------------------------------------------------
SELECT kategori_adi, toplam_try
FROM v_kategori_dagilimi
WHERE kullanici_id = @uid
ORDER BY toplam_try DESC
LIMIT 1;


-- =============================================================================
--  YAZMA İŞLEMLERİ
-- =============================================================================

-- 7) Kayıt ekle
INSERT INTO kayitlar (kullanici_id, kategori_id, tutar, para_birimi, kur, tarih, aciklama)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- 8) Kayıt güncelle (düzenleme modu)
--    kullanici_id koşulu ŞART: yoksa kullanıcı, id'yi değiştirerek başkasının
--    kaydını düzenleyebilir. Buna yetkisiz nesne erişimi (IDOR) denir.
UPDATE kayitlar
SET kategori_id = ?, tutar = ?, para_birimi = ?, kur = ?, tarih = ?, aciklama = ?
WHERE id = ? AND kullanici_id = ?;

-- 9) Kayıt sil (yumuşak silme — geri alınabilir)
UPDATE kayitlar SET silinme_zamani = NOW()
WHERE id = ? AND kullanici_id = ? AND silinme_zamani IS NULL;

-- 10) Geri al
UPDATE kayitlar SET silinme_zamani = NULL
WHERE id = ? AND kullanici_id = ?;

-- 11) Tümünü sil (yine geri alınabilir)
UPDATE kayitlar SET silinme_zamani = NOW()
WHERE kullanici_id = ? AND silinme_zamani IS NULL;

-- 12) Kur güncelle. Kayıt varsa günceller, yoksa ekler ("upsert").
INSERT INTO kurlar (kullanici_id, para_birimi, deger)
VALUES (?, ?, ?)
ON DUPLICATE KEY UPDATE deger = VALUES(deger);

-- 13) Kategori sil.
--     Yabancı anahtar RESTRICT olduğu için, içinde kayıt varsa MySQL bu sorguyu
--     hata vererek reddeder. Sunucu bu hatayı yakalayıp kullanıcıya
--     "bu kategoride N kayıt var" mesajını gösterir.
DELETE FROM kategoriler WHERE id = ? AND kullanici_id = ?;


-- =============================================================================
--  İNDEKS ÇALIŞIYOR MU?
--  Sorgunun önüne EXPLAIN yazınca MySQL planını gösterir.
--  "type: ref" veya "range" iyidir (indeks kullanıyor).
--  "type: ALL" kötüdür: tüm tabloyu baştan sona okuyor demektir.
-- =============================================================================
EXPLAIN
SELECT * FROM kayitlar
WHERE kullanici_id = 1 AND tarih BETWEEN '2026-08-01' AND '2026-08-31';

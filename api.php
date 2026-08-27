<?php
/* =============================================================================
   API — tarayıcı ile veritabanı arasındaki köprü
   =============================================================================
   Tarayıcı MySQL'e doğrudan bağlanamaz (bağlanabilseydi veritabanı şifresinin
   sayfa kaynağında görünmesi gerekirdi). Bu yüzden arayüz buraya istek atar,
   burası veritabanıyla konuşur ve sonucu JSON olarak geri verir.

   Kullanım:  api.php?islem=getir          -> defterin tamamını döner
              api.php?islem=kayit-ekle     -> gövdede JSON ile veri gelir

   GÜVENLİK: Bütün sorgular prepared statement (soru işaretli). Kullanıcının
   yazdığı metin hiçbir zaman komut olarak çalışmaz -> SQL enjeksiyonu kapalı.
============================================================================= */

require "baglan.php";
header("Content-Type: application/json; charset=utf-8");

// İstek gövdesindeki JSON'u diziye çevir (POST isteklerinde dolu gelir).
$veri = json_decode(file_get_contents("php://input"), true);
if (!is_array($veri)) $veri = [];

$islem = isset($_GET["islem"]) ? $_GET["islem"] : "";

try {
    switch ($islem) {

        /* ------------------------------------------------------------------
           DEFTERİ GETİR
           Arayüzün beklediği yapının aynısını üretiyoruz:
           { categories: [...], entries: [...], rates: {...}, base: "TRY" }
        ------------------------------------------------------------------ */
        case "getir":
            echo json_encode(defteriGetir($db, $KULLANICI_ID));
            break;

        /* ---------------------------- KAYITLAR ---------------------------- */

        case "kayit-ekle":
            $s = $db->prepare(
                "INSERT INTO kayitlar
                   (kullanici_id, kategori_id, tutar, para_birimi, kur, tarih, aciklama)
                 VALUES (?, ?, ?, ?, ?, ?, ?)"
            );
            $s->execute([
                $KULLANICI_ID,
                $veri["kategori_id"],
                $veri["tutar"],
                $veri["para_birimi"],
                $veri["kur"],
                $veri["tarih"],
                $veri["aciklama"]
            ]);
            cevap(["id" => $db->lastInsertId()]);
            break;

        case "kayit-guncelle":
            // kullanici_id koşulu ŞART: olmasa kullanıcı id'yi değiştirip
            // başkasının kaydını düzenleyebilirdi (IDOR açığı).
            $s = $db->prepare(
                "UPDATE kayitlar
                    SET kategori_id = ?, tutar = ?, para_birimi = ?, kur = ?,
                        tarih = ?, aciklama = ?
                  WHERE id = ? AND kullanici_id = ?"
            );
            $s->execute([
                $veri["kategori_id"], $veri["tutar"], $veri["para_birimi"],
                $veri["kur"], $veri["tarih"], $veri["aciklama"],
                $veri["id"], $KULLANICI_ID
            ]);
            cevap();
            break;

        case "kayit-sil":
            // Gerçekten silmiyoruz, silinmiş olarak işaretliyoruz ki geri alınabilsin.
            $s = $db->prepare(
                "UPDATE kayitlar SET silinme_zamani = NOW()
                  WHERE id = ? AND kullanici_id = ? AND silinme_zamani IS NULL"
            );
            $s->execute([$veri["id"], $KULLANICI_ID]);
            cevap(["ids" => [$veri["id"]]]);
            break;

        case "tumunu-sil":
            // Önce hangi kayıtları sildiğimizi not ediyoruz; "Geri al" bunları geri getirecek.
            $s = $db->prepare(
                "SELECT id FROM kayitlar WHERE kullanici_id = ? AND silinme_zamani IS NULL"
            );
            $s->execute([$KULLANICI_ID]);
            $idler = array_column($s->fetchAll(), "id");

            $db->prepare(
                "UPDATE kayitlar SET silinme_zamani = NOW()
                  WHERE kullanici_id = ? AND silinme_zamani IS NULL"
            )->execute([$KULLANICI_ID]);

            cevap(["ids" => $idler]);
            break;

        case "kayit-geri-al":
            $idler = isset($veri["ids"]) ? $veri["ids"] : [];
            if (count($idler) > 0) {
                // Değişken sayıda id için o kadar soru işareti üretiyoruz: ?,?,?
                $soru = implode(",", array_fill(0, count($idler), "?"));
                $s = $db->prepare(
                    "UPDATE kayitlar SET silinme_zamani = NULL
                      WHERE kullanici_id = ? AND id IN ($soru)"
                );
                $s->execute(array_merge([$KULLANICI_ID], $idler));
            }
            cevap();
            break;

        /* --------------------------- KATEGORİLER --------------------------- */

        case "kategori-ekle":
            try {
                $s = $db->prepare(
                    "INSERT INTO kategoriler (kullanici_id, ad, renk_slot) VALUES (?, ?, ?)"
                );
                $s->execute([$KULLANICI_ID, $veri["ad"], $veri["renk_slot"]]);
            } catch (PDOException $e) {
                // 23000 = kısıt ihlali. Buradaki tek kısıt UNIQUE(kullanici_id, ad).
                if ($e->getCode() === "23000") {
                    throw new Exception($veri["ad"] . " zaten var.");
                }
                throw $e;
            }
            cevap(["id" => $db->lastInsertId()]);
            break;

        case "kategori-sil":
            try {
                $s = $db->prepare("DELETE FROM kategoriler WHERE id = ? AND kullanici_id = ?");
                $s->execute([$veri["id"], $KULLANICI_ID]);
            } catch (PDOException $e) {
                // Yabancı anahtar RESTRICT olduğu için, içinde kayıt varsa
                // MySQL silmeyi reddeder ve buraya düşeriz.
                if ($e->getCode() === "23000") {
                    throw new Exception("Bu kategoride kayıt var, önce onları silin.");
                }
                throw $e;
            }
            cevap();
            break;

        /* ------------------------------ KURLAR ------------------------------ */

        case "kur-guncelle":
            // Kayıt varsa güncelle, yoksa ekle (upsert).
            $s = $db->prepare(
                "INSERT INTO kurlar (kullanici_id, para_birimi, deger) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE deger = VALUES(deger)"
            );
            $s->execute([$KULLANICI_ID, $veri["para_birimi"], $veri["deger"]]);
            cevap();
            break;

        case "taban-degistir":
            $s = $db->prepare("UPDATE kullanicilar SET para_birimi = ? WHERE id = ?");
            $s->execute([$veri["para_birimi"], $KULLANICI_ID]);
            cevap();
            break;

        /* ------------------------------ YEDEK ------------------------------ */

        case "yedek-yukle":
            // Defterin tamamı değişiyor. TRANSACTION: ya hepsi olur ya hiçbiri.
            // Araya hata düşerse yarım veri kalmaz.
            $db->beginTransaction();
            try {
                // Önce kayıtlar silinmeli: kategorilerin üzerinde yabancı anahtar var.
                $db->prepare("DELETE FROM kayitlar WHERE kullanici_id = ?")->execute([$KULLANICI_ID]);
                $db->prepare("DELETE FROM kategoriler WHERE kullanici_id = ?")->execute([$KULLANICI_ID]);

                // Kategoriler: eski id'ler yerine yeni id'ler oluşacak, eşlemeyi tutuyoruz.
                $eslesme = [];
                $ekleKat = $db->prepare(
                    "INSERT INTO kategoriler (kullanici_id, ad, renk_slot) VALUES (?, ?, ?)"
                );
                foreach ($veri["categories"] as $kat) {
                    $ekleKat->execute([$KULLANICI_ID, $kat["name"], $kat["slot"]]);
                    $eslesme[$kat["id"]] = $db->lastInsertId();
                }

                $ekleKayit = $db->prepare(
                    "INSERT INTO kayitlar
                       (kullanici_id, kategori_id, tutar, para_birimi, kur, tarih, aciklama)
                     VALUES (?, ?, ?, ?, ?, ?, ?)"
                );
                foreach ($veri["entries"] as $k) {
                    if (!isset($eslesme[$k["categoryId"]])) continue;   // kategorisi yoksa atla
                    $ekleKayit->execute([
                        $KULLANICI_ID, $eslesme[$k["categoryId"]], $k["amount"],
                        $k["currency"], $k["rate"], $k["date"], $k["note"]
                    ]);
                }

                $kurGuncelle = $db->prepare(
                    "INSERT INTO kurlar (kullanici_id, para_birimi, deger) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE deger = VALUES(deger)"
                );
                foreach ($veri["rates"] as $kod => $deger) {
                    $kurGuncelle->execute([$KULLANICI_ID, $kod, $deger]);
                }

                $db->prepare("UPDATE kullanicilar SET para_birimi = ? WHERE id = ?")
                   ->execute([$veri["base"], $KULLANICI_ID]);

                $db->commit();
            } catch (Exception $e) {
                $db->rollBack();     // hata: her şeyi geri sar
                throw $e;
            }
            cevap();
            break;

        default:
            throw new Exception("Bilinmeyen işlem: " . $islem);
    }

} catch (Exception $e) {
    // Hata olursa 400 kodu ve açıklama dönüyoruz; arayüz bunu kullanıcıya gösteriyor.
    http_response_code(400);
    echo json_encode(["hata" => $e->getMessage()]);
}


/* =============================================================================
   YARDIMCI FONKSİYONLAR
============================================================================= */

// Kısa "tamam" cevabı. İstenirse yanına ek bilgi konur.
function cevap($ek = []) {
    echo json_encode(array_merge(["tamam" => true], $ek));
}

// Defterin tamamını arayüzün beklediği biçimde toplar.
function defteriGetir($db, $uid) {

    // Kategoriler
    $s = $db->prepare("SELECT id, ad, renk_slot FROM kategoriler WHERE kullanici_id = ? ORDER BY id");
    $s->execute([$uid]);
    $kategoriler = [];
    foreach ($s->fetchAll() as $r) {
        $kategoriler[] = [
            // id'yi metne çeviriyoruz: arayüz kimlikleri metin olarak karşılaştırıyor.
            "id"   => (string)$r["id"],
            "name" => $r["ad"],
            "slot" => (int)$r["renk_slot"]
        ];
    }

    // Kayıtlar (silinmiş olanlar gelmez)
    $s = $db->prepare(
        "SELECT id, kategori_id, tutar, para_birimi, kur, tarih, aciklama,
                UNIX_TIMESTAMP(olusturma) AS zaman
           FROM kayitlar
          WHERE kullanici_id = ? AND silinme_zamani IS NULL
          ORDER BY tarih DESC, id DESC"
    );
    $s->execute([$uid]);
    $kayitlar = [];
    foreach ($s->fetchAll() as $r) {
        $kayitlar[] = [
            "id"         => (string)$r["id"],
            "amount"     => (float)$r["tutar"],
            "currency"   => $r["para_birimi"],
            "rate"       => (float)$r["kur"],
            "categoryId" => (string)$r["kategori_id"],
            "date"       => $r["tarih"],
            "note"       => $r["aciklama"] === null ? "" : $r["aciklama"],
            "createdAt"  => (int)$r["zaman"] * 1000    // JavaScript milisaniye kullanır
        ];
    }

    // Kurlar
    $s = $db->prepare("SELECT para_birimi, deger FROM kurlar WHERE kullanici_id = ?");
    $s->execute([$uid]);
    $kurlar = [];
    foreach ($s->fetchAll() as $r) {
        $kurlar[$r["para_birimi"]] = (float)$r["deger"];
    }

    // Görüntüleme para birimi
    $s = $db->prepare("SELECT para_birimi FROM kullanicilar WHERE id = ?");
    $s->execute([$uid]);
    $taban = $s->fetchColumn();

    return [
        "categories" => $kategoriler,
        "entries"    => $kayitlar,
        "rates"      => $kurlar,
        "base"       => $taban ? $taban : "TRY"
    ];
}

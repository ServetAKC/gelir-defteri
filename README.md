# Gelir Defteri

Küçük bir dükkânın günlük gelirlerini kaydeden web uygulaması.
Kayıtlar kategori ve para birimiyle tutulur, özet ve grafiklerle raporlanır.

**Yığın:** PHP 8 · MySQL (MariaDB) · Vanilla JavaScript · Apache (XAMPP)
Çerçeve (framework) ve dış kütüphane kullanılmadı.

> **Kurmak için:** [KURULUM.md](KURULUM.md) — adım adım, hiç bilmeyen biri için.
> Aşağıdaki özet kurulum, ortamı zaten hazır olanlar içindir.

---

## Özellikler

- **Gelir kaydı** — tutar, para birimi, kategori, tarih, açıklama
- **Kendi kategorilerin** — ekleme, silme, hazır öneriler; her kategoriye ayrı renk
- **Çoklu para birimi** — TRY / USD / EUR / GBP, kurları kullanıcı belirler
- **Tarihsel kur** — kayıt eklenirken o günkü kur kaydın içine yazılır, sonradan
  kur değişse bile geçmiş kayıtların değeri bozulmaz
- **Özet kartları** — bugün, bu ay, toplam
- **Pasta grafik** — kategori dağılımı (kütüphane yok, SVG ile çizildi)
- **Ay şeridi** — 12 aydan birini seçip o ayın kayıtlarını süzme
- **Düzenleme modu** — satır bazlı düzenleme ve silme
- **Geri alma** — her silmeden sonra 8 saniyelik "Geri al"
- **Yedekleme** — defteri düz metin (.txt) olarak dışa/içe aktarma
- **Açık/koyu tema** ve mobil uyumlu arayüz (tablo dar ekranda karta dönüşür)

---

## Kurulum

Gereken: [XAMPP](https://www.apachefriends.org/) (Apache + MySQL + PHP)

1. Bu depoyu `C:\xampp\htdocs\` içine klonla:

   ```bash
   git clone <depo-adresi> C:/xampp/htdocs/gelir-defteri
   ```

2. XAMPP Control Panel'den **Apache** ve **MySQL**'i başlat
   (ya da depodaki `BASLAT.bat` dosyasını çalıştır).

3. Veritabanını kur — `http://localhost/phpmyadmin` → SQL sekmesi →
   `kur.sql` dosyasının içeriğini yapıştır ve çalıştır.
   Komut satırından:

   ```bash
   mysql -u root < kur.sql
   ```

4. Ayar dosyasını oluştur — **şifre depoda tutulmaz**:

   ```bash
   copy ayarlar.ornek.php ayarlar.php
   ```

   `ayarlar.php` içine `kur.sql`'de belirlediğin veritabanı şifresini yaz.
   Bu dosya `.gitignore` içindedir, depoya gönderilmez.

5. Aç: <http://localhost/gelir-defteri/>

> Uygulama `root` ile değil, yalnızca kendi veritabanında veri okuyup yazabilen
> `defter_app` kullanıcısıyla bağlanır (en az yetki ilkesi). Şifre koda değil,
> sürüm kontrolüne girmeyen `ayarlar.php` dosyasına yazılır: depoya giren bir
> şifre, depo sonradan gizlense bile eski commit'lerde durmaya devam eder.

---

## Mimari

```
TARAYICI                 SUNUCU                  VERİTABANI
index.html               api.php                 MySQL
style.css        <-->    baglan.php     <-->     gelir_defteri
app.js                   (PHP + PDO)             (4 tablo, 2 view)
```

Tarayıcı veritabanına doğrudan bağlanamaz; bağlanabilseydi veritabanı
şifresinin sayfa kaynağında görünmesi gerekirdi. Bu yüzden araya PHP giriyor.

Her işlemde akış aynı: **sunucuya söyle → defteri yeniden çek → ekranı çiz.**
Arayüz kendi kendine ekranı güncellemez; her değişiklikten sonra veriyi
sunucudan taze alır. Böylece ekranda görünen, veritabanındakiyle her zaman aynıdır.

### Dosyalar

| Dosya | Görevi |
|---|---|
| `kur.sql` | Veritabanı şeması, görünümler, başlangıç verisi |
| `baglan.php` | PDO bağlantısı (ayarları `ayarlar.php`'den okur) |
| `ayarlar.ornek.php` | Ayar şablonu; kopyalanıp `ayarlar.php` yapılır |
| `api.php` | 11 işlemlik JSON API |
| `index.html` | Sayfa iskeleti |
| `style.css` | Görünüm, temalar, mobil düzen |
| `app.js` | Arayüz mantığı (form, liste, grafik, yedek) |

---

## Veritabanı

```
kullanicilar
     |
     |---< kategoriler ---+
     |                    |
     |---< kayitlar >-----+
     |
     |---< kurlar
```

Tasarım kararları:

- **Normalizasyon** — kayıt, kategorinin adını değil `id`'sini tutar.
- **`DECIMAL`, `FLOAT` değil** — `FLOAT` ondalıkları yaklaşık saklar
  (`0.1 + 0.2 = 0.30000000000000004`), parada kuruş kaydırır.
- **Üretilmiş sütun** — `tutar_try DECIMAL(14,2) AS (tutar * kur) STORED`.
  TL karşılığını veritabanı hesaplar; tutarla çelişmesi imkânsızdır ve
  `STORED` olduğu için indekslenebilir.
- **Yumuşak silme** — `DELETE` yerine `silinme_zamani = NOW()`.
  Arayüzdeki "Geri al" bu alanı `NULL` yapar.
- **Yabancı anahtarlar** — kullanıcı silinirse kategorileri de silinir
  (`CASCADE`); içinde kaydı olan kategori silinemez (`RESTRICT`).
- **Transaction** — yedek geri yükleme tek parça çalışır; hata olursa
  `rollBack` ile hiçbiri uygulanmaz.
- **İndeksler** — `(kullanici_id, tarih)` ay/özet sorguları için,
  `(kategori_id)` kategori dağılımı için.

### API işlemleri

| İşlem | Yaptığı |
|---|---|
| `getir` | Defterin tamamını JSON döner |
| `kayit-ekle` / `kayit-guncelle` | Kayıt ekleme / düzenleme |
| `kayit-sil` / `tumunu-sil` | Yumuşak silme |
| `kayit-geri-al` | Silinenleri geri getirme |
| `kategori-ekle` / `kategori-sil` | Kategori yönetimi |
| `kur-guncelle` | Kur değiştirme (upsert) |
| `taban-degistir` | Görüntüleme para birimi |
| `yedek-yukle` | .txt yedekten geri yükleme (transaction) |

---

## Güvenlik

- **Prepared statement** — tüm sorgular parametreli, SQL enjeksiyonuna kapalı
- **Yetki kontrolü** — her sorguda `kullanici_id` koşulu (IDOR koruması)
- **XSS** — arayüzde kullanıcı metni `textContent` ile basılır, `innerHTML` ile değil
- **Şifreler** — `password_hash` ile saklanacak şekilde tasarlandı (şema hazır)

## Bilinen eksikler

- Giriş ekranı yok; uygulama tek kullanıcı (`id = 1`) ile çalışır.
  `kullanicilar` tablosu ve tüm sorgulardaki `kullanici_id` koşulu hazır,
  eklenecek tek şey oturum yönetimi.
- Kur bilgisi elle girilir; otomatik kur servisi bağlı değil.
- Yalnızca gelir takibi yapar, gider tarafı yoktur.

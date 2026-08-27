# Kurulum — adım adım

Hiç bilmeyen biri için yazıldı. Sırayla yap, atlama.
Toplam süre: 10-15 dakika.

---

## 1. XAMPP kur

XAMPP, projeyi çalıştırmak için gereken üç şeyi bir arada getirir:
web sunucusu (Apache), veritabanı (MySQL) ve PHP.

1. <https://www.apachefriends.org/> adresine git
2. **XAMPP for Windows** düğmesine bas, inen dosyayı çalıştır
3. Kurulumda hiçbir şeyi değiştirme, hep **Next** de
4. Kurulacağı yer `C:\xampp` olsun (varsayılan zaten bu)

> Zaten kuruluysa bu adımı atla.

---

## 2. Projeyi indir

1. GitHub'daki proje sayfasında yeşil **Code** düğmesine bas
2. **Download ZIP** de
3. İnen dosyaya sağ tıkla → **Tümünü ayıkla**
4. Çıkan klasörün **içindekileri** şuraya taşı:

```
C:\xampp\htdocs\gelir-defteri\
```

**Dikkat:** ZIP'ten çıkan klasörün adı `gelir-defteri-main` olur ve içinde bir
klasör daha vardır. İç içe iki klasör kalmasın. Doğrusu şöyle görünmeli:

```
C:\xampp\htdocs\gelir-defteri\
    index.html
    api.php
    app.js
    style.css
    kur.sql
    ...
```

`index.html` doğrudan `gelir-defteri` klasörünün içinde olmalı.

---

## 3. Apache ve MySQL'i başlat

1. Başlat menüsünden **XAMPP Control Panel**'i aç
2. **Apache** satırındaki **Start** düğmesine bas
3. **MySQL** satırındaki **Start** düğmesine bas
4. İkisinin de adı **yeşil** olmalı

> Bu iki program kapalıyken site açılmaz. Bilgisayarı her kapatıp açtığında
> tekrar başlatman gerekir. (Projedeki `BASLAT.bat` bunu tek tıkla yapar.)

**Apache başlamıyorsa:** büyük ihtimalle 80 numaralı portu başka bir program
kullanıyor (genelde Skype veya IIS). O programı kapatıp tekrar dene.

---

## 4. Veritabanını kur

1. Tarayıcıda aç: <http://localhost/phpmyadmin>
2. Üst menüden **SQL** sekmesine tıkla
3. Proje klasöründeki `kur.sql` dosyasını **Not Defteri** ile aç
4. İçindeki her şeyi seç (Ctrl+A), kopyala (Ctrl+C)
5. phpMyAdmin'deki büyük kutuya yapıştır (Ctrl+V)
6. **ÖNEMLİ:** Yapıştırdığın metnin en altında şu satır var:

   ```sql
   CREATE USER IF NOT EXISTS 'defter_app'@'localhost' IDENTIFIED BY 'BURAYA_KENDI_SIFRENIZI_YAZIN';
   ```

   `BURAYA_KENDI_SIFRENIZI_YAZIN` yerine kendi belirlediğin bir şifre yaz.
   Örnek: `Defter2026`. **Bu şifreyi bir yere not et**, birazdan lazım olacak.

7. Sağ alttaki **Git** düğmesine bas

Sol tarafta **gelir_defteri** diye bir veritabanı belirmeli. İçinde
`kategoriler`, `kayitlar`, `kullanicilar`, `kurlar` tabloları olacak.

> Veritabanı zaten kuruluysa ve içinde verilerin varsa bu adımı ATLA.
> `kur.sql`'in ilk satırı veritabanını siler.

---

## 5. Şifre dosyasını oluştur

Şifreler koda yazılmaz, ayrı bir dosyada durur. O dosya GitHub'a gönderilmez;
bu yüzden onu sen oluşturacaksın.

1. Proje klasöründeki `ayarlar.ornek.php` dosyasını kopyala (Ctrl+C, Ctrl+V)
2. Kopyanın adını `ayarlar.php` yap
3. Not Defteri ile aç
4. Şu satırı bul:

   ```php
   'sifre'      => 'BURAYA_KENDI_SIFRENIZI_YAZIN',
   ```

5. 4. adımda belirlediğin şifreyi yaz:

   ```php
   'sifre'      => 'Defter2026',
   ```

6. Kaydet (Ctrl+S) ve kapat

> Dosyanın adı tam olarak `ayarlar.php` olmalı. Windows uzantıları gizliyorsa
> yanlışlıkla `ayarlar.php.txt` olabilir. Kontrol et.

---

## 6. Aç

<http://localhost/gelir-defteri/>

Çalıştıysa boş bir defter göreceksin. Sağdaki "Kategoriler" bölümünden
bir kategori ekle, sonra soldaki formdan ilk gelirini kaydet.

---

## Hata alırsan

| Ne görüyorsun | Sebebi | Çözüm |
|---|---|---|
| Sayfa hiç açılmıyor, "erişilemiyor" | Apache kapalı | XAMPP'ta Apache'yi başlat |
| "Sunucu hatası ... XAMPP çalışıyor mu?" | MySQL kapalı | XAMPP'ta MySQL'i başlat |
| "ayarlar.php bulunamadı" | 5. adım yapılmamış | `ayarlar.ornek.php`'yi kopyalayıp `ayarlar.php` yap |
| "Veritabanına bağlanılamadı" | Şifre uyuşmuyor | `ayarlar.php`'deki şifre ile `kur.sql`'de yazdığın aynı mı? |
| Sayfa açılıyor ama bomboş, hiçbir şey çalışmıyor | Dosyalar iç içe klasörde | `index.html` doğrudan `gelir-defteri` klasöründe olmalı |
| Ekranda PHP kodu görünüyor | Dosyayı çift tıklayıp açmışsın | Tarayıcıya `localhost/gelir-defteri/` yaz |

Hata mesajını görmek istersen tarayıcıda **F12** tuşuna bas, **Console**
sekmesine bak. Kırmızı yazılar sorunun ne olduğunu söyler.

---

## Ne nerede

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Sayfanın iskeleti (butonlar, form, tablo) |
| `style.css` | Görünüm (renk, boyut, yerleşim) |
| `app.js` | Tarayıcıda çalışan kod (tıklamalar, grafik) |
| `api.php` | Sunucuda çalışan kod (veritabanına yazar/okur) |
| `baglan.php` | Veritabanı bağlantısını kurar |
| `ayarlar.php` | Şifre burada (sende var, GitHub'da yok) |
| `kur.sql` | Veritabanını oluşturur |

Kodun her satırında Türkçe açıklama var. `app.js`'in en başında uygulamanın
nasıl çalıştığını anlatan bir bölüm var, oradan başla.

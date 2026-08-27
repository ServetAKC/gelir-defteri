# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dil

Kod yorumları, arayüz metinleri, commit mesajları ve kullanıcıyla iletişim **Türkçe**.
Değişken/fonksiyon adları karışık: eski katman İngilizce (`state`, `entries`, `renderList`),
sunucuya bağlanan yeni katman Türkçe (`sunucu`, `defteriYukle`, `uygula`). Dokunduğun
dosyanın hâkim diline uy, tek dosya içinde ikisini karıştırma.

## Çalıştırma

Derleme adımı, paket yöneticisi, test çerçevesi **yok**. Dosyalar doğrudan Apache
tarafından servis edilir.

```bash
BASLAT.bat          # MySQL + Apache başlatır, tarayıcıyı açar
KAPAT.bat           # ikisini de durdurur
```

- Uygulama: <http://localhost/gelir-defteri/>
- Veritabanı arayüzü: <http://localhost/phpmyadmin> (`gelir_defteri`)
- Proje `C:\xampp\htdocs\gelir-defteri\` içinde olmak zorunda; Apache yalnızca
  `htdocs` altını yayınlar.

Değişiklikten sonra derleme/yeniden başlatma gerekmez — sayfayı yenilemek yeterli.

### Elle test

Otomatik test yok. API'yi doğrudan denemek en hızlı yol:

```bash
curl -s "http://localhost/gelir-defteri/api.php?islem=getir"
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"ad":"Test","renk_slot":1}' \
  "http://localhost/gelir-defteri/api.php?islem=kategori-ekle"
```

JavaScript'te sözdizimi kontrolü: `node --check app.js`

### Veritabanı

```bash
"C:\xampp\mysql\bin\mysql.exe" -u root -e "USE gelir_defteri; SELECT * FROM kayitlar;"
```

**`kur.sql`'i asla mevcut veri üzerinde çalıştırma** — ilk satırı `DROP DATABASE`.

## Mimari

Üç katman: `index.html`/`app.js` (tarayıcı) → `api.php` (PHP) → MySQL.

### Tek yönlü veri akışı

Arayüz DOM'u kendi kendine güncellemez. Her kullanıcı işleminde:

```
sunucu(islem, veri)  →  defteriYukle()  →  render()
```

`defteriYukle()` `state`'i sunucudan gelen JSON ile **komple değiştirir**, `render()`
ekranı sıfırdan çizer. Yeni bir işlem eklerken bu kalıbı bozma; yerel `state`'i elle
düzeltip render çağırma, ekranla veritabanı ayrışır. `uygula()` bu üçlünün kısayolu.

### state'in şekli

```js
state = {
  categories: [{ id, name, slot }],
  entries:    [{ id, amount, currency, rate, categoryId, date, note, createdAt }],
  rates:      { TRY: 1, USD: 41, ... },
  base:       'TRY'
}
```

`api.php`'deki `defteriGetir()` bu yapıyı üretir; sütun adları (`ad`, `tutar`,
`kategori_id`) burada arayüzün beklediği adlara çevrilir. Şema değişirse iki tarafı
birden güncelle.

**id'ler metin.** `defteriGetir()` hepsini `(string)` yapar, çünkü arayüz `dataset.id`
ile karşılaştırır. Sayı olarak dönerlerse `catById()` ve satır eşleştirmeleri sessizce bozulur.

### Para birimi

Her kaydın kendi `rate` değeri vardır — işlem anındaki kur, kaydın içine dondurulmuştur.
`kurlar` tablosu yalnızca *bugünkü* kuru tutar. Görüntülenen değer:

```
(amount × rate) ÷ rates[base]
```

`baseValue()` (JS) ve `tutar_try` üretilmiş sütunu (SQL) bu hesabın iki ucudur.
Kur güncellemek geçmiş kayıtları yeniden fiyatlandırmamalı.

### Silme

`DELETE` yok, `silinme_zamani = NOW()` var. Sunucu silinen id'leri döner, arayüz
8 saniyelik "Geri al" şeridinde tutar, geri alma `kayit-geri-al` ile işareti kaldırır.
Tüm okuma sorgularında `silinme_zamani IS NULL` koşulu şart.

### Tarih

Kod içinde her yerde ISO (`2026-08-27`) — metin karşılaştırması tarih karşılaştırmasıyla
aynı sonucu verdiği için sıralama ve ay süzgeci tek satır. Kullanıcı `gg.aa.yyyy` görür;
çeviriyi yalnızca `isoToTR()` / `trToISO()` yapar. Tarih kutusundan okuma her zaman
`readDateField()`, yazma `setDateField()` üzerinden.

### Kısıtların kaynağı veritabanı

Arayüzdeki bazı hata mesajları aslında MySQL kısıtlarının çevirisidir:

- Kategori içinde kayıt varsa silinmez → yabancı anahtar `ON DELETE RESTRICT`
- Aynı ada ikinci kategori eklenmez → `UNIQUE (kullanici_id, ad)`, `utf8mb4_turkish_ci`
  sayesinde "Kasa"/"kasa" aynı sayılır

`api.php` bu hataları PDO kodu `23000` üzerinden yakalayıp kullanıcı diline çevirir.
Kontrolü sadece arayüze taşıma.

### Tek kullanıcı

Giriş ekranı yok, `baglan.php` içinde `$KULLANICI_ID = 1` sabit. Şema ve tüm sorgular
`kullanici_id` taşır; oturum eklenince tek değişecek yer o satırdır.
**Her sorguda `kullanici_id` koşulunu koru** — sadece `WHERE id = ?` yazmak yetkisiz
erişime (IDOR) kapı açar.

## Bu ortamın kısıtları

Arayüz bir zamanlar kısıtlı bir iframe içinde de çalışıyordu; oradan kalan iki karar
hâlâ geçerli ve bilinçlidir:

- `confirm()`, `alert()`, `<dialog>.showModal()` **kullanılmaz** — onay pencereleri
  (`askConfirm`) ve modallar elle `<div>` ile kuruludur.
- Kullanıcı metni ekrana `textContent` / `createTextNode` ile basılır. `innerHTML`
  yalnızca sabit ikonlar için.

## Şifreler

`ayarlar.php` veritabanı şifresini tutar ve `.gitignore` içindedir; şablonu
`ayarlar.ornek.php`. Uygulama `root` ile değil, sadece `SELECT/INSERT/UPDATE/DELETE`
yetkili `defter_app` kullanıcısıyla bağlanır.

## Belgeler

- `README.md` — proje tanıtımı, mimari, API tablosu, tasarım kararları
- `KURULUM.md` — sıfırdan kurulum, adım adım (yeni başlayan için)
- `OKUBENI.txt` — Türkçe genel bakış ve sunum notları

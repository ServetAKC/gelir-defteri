/* ============================================================================
   GELİR DEFTERİ — JAVASCRIPT
   ============================================================================

   BÜYÜK RESİM (önce burayı oku, gerisi kolay):

   1) Bütün veri tek bir nesnede durur, adı "state" (durum):
        state = {
          categories: [ {id, name, slot}, ... ],   // kategoriler
          entries:    [ {id, amount, currency, rate, categoryId, date, note, createdAt}, ... ],
          rates:      { TRY:1, USD:41, EUR:48, GBP:55 },  // 1 birim kaç TL
          base:       'TRY'                                // ekranda hangi birim gösterilsin
        }

   2) Bu nesne artık tarayıcıda DEĞİL, MySQL veritabanında duruyor.
      Tarayıcı veritabanına doğrudan bağlanamaz (bağlanabilseydi veritabanı
      şifresinin sayfa kaynağında görünmesi gerekirdi). Araya bir sunucu giriyor:

          tarayıcı  <-->  api.php  <-->  MySQL

      Arayüz api.php'ye istek atar, o veritabanıyla konuşur ve JSON döner.

   3) Akış her zaman aynı üç adımdır:
        sunucuya söyle  ->  defteri yeniden çek  ->  render()
      Yani ekranı kendi kendimize güncellemiyoruz; her işlemden sonra veriyi
      sunucudan taze alıp ekranı ondan çiziyoruz. Böylece ekranda gördüğünüz
      şey her zaman veritabanındaki şeyle birebir aynı olur.

   4) render() şunları sırayla çağırır:
        fillSelects()      açılır listeleri doldurur
        renderCategories() kategori rozetlerini basar
        renderRates()      kur penceresindeki satırları basar
        renderStats()      üç özet kartını hesaplar (ve pastayı çizdirir)
        renderList()       kayıt tablosunu basar

   5) Kod en dışta bir (function(){ ... })() içinde. Buna IIFE denir: "yaz ve hemen
      çalıştır". Amacı, buradaki değişkenlerin sayfanın geneline sızmamasıdır.

   ============================================================================ */
(function () {
  'use strict';   /* Katı mod: sessizce yutulan hataları hata olarak gösterir. */

  /* --------------------------------------------------------------------------
     SABİTLER
     -------------------------------------------------------------------------- */

  /* Sunucu adresi. Bu dosyayla aynı klasörde duran PHP dosyası. */
  var API = 'api.php';

  var MAX_SLOT = 8;      /* Kaç kategoriye ayrı renk verebiliyoruz (CSS'te --cat-1..8). */
  var MAX_SLICES = 6;    /* Pastada en fazla kaç dilim; fazlası "Diğer"de toplanır.
                            Sebep: 6'dan fazla dilimde göz dilimleri ayırt edemiyor. */

  /* Tek bir kayıt için üst sınır: 999.999.999,99.
     Neden sınır koyuyoruz? Yanlışlıkla tuşa basılı kalınca girilen 30 haneli
     sayı hem anlamsız hem de ekranı dağıtıyor. Bir dükkânın tek kaydı bu
     rakamı geçmez; geçiyorsa da zaten bu araç yetmez. */
  var MAX_AMOUNT = 999999999.99;

  /* Kur için de aynı mantıkla makul bir tavan. */
  var MAX_RATE = 1000000;

  /* Hazır kategoriler: her dükkâna uyan üç genel seçenek. Tek tıkla eklenir,
     eklenmiş olan listeden düşer. Kendi adınızı yazmak da serbest. */
  var SUGGESTIONS = ['Nakit Satış', 'Kart Satış', 'Hizmet'];

  /* Desteklenen para birimleri. rate = 1 biriminin kaç TL ettiği (başlangıç değeri).
     Bu sayfa dışarıya istek atamadığı için canlı kur çekemiyoruz; kullanıcı günceller. */
  var CURRENCIES = [
    { code: 'TRY', name: 'Türk lirası',      rate: 1 },
    { code: 'USD', name: 'ABD doları',       rate: 41 },
    { code: 'EUR', name: 'Euro',             rate: 48 },
    { code: 'GBP', name: 'İngiliz sterlini', rate: 55 }
  ];

  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  /* Ay şeridindeki kısa adlar. Dar ekranda 12 tanesi tek satıra sığsın diye. */
  var MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
                      'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  /* --------------------------------------------------------------------------
     HTML ELEMANLARINI BİR KEZ YAKALAMA
     Her seferinde document.getElementById yazmak yerine hepsini burada toplayıp
     el.amount, el.pieSvg gibi kısa adlarla kullanıyoruz.
     -------------------------------------------------------------------------- */
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    /* üst bar ve kur penceresi */
    fxBtn: $('fxBtn'), fxBtnLabel: $('fxBtnLabel'), fxOverlay: $('fxOverlay'),
    fxClose: $('fxClose'), base: $('baseCurrency'), rateList: $('rateList'),

    /* yedek penceresi */
    backupBtn: $('backupBtn'), backupOverlay: $('backupOverlay'), backupClose: $('backupClose'),
    backupText: $('backupText'), downloadBtn: $('downloadBtn'), copyBtn: $('copyBtn'),
    refreshBackupBtn: $('refreshBackupBtn'), importFile: $('importFile'),
    importTextBtn: $('importTextBtn'), backupError: $('backupError'), backupHint: $('backupHint'),

    /* gelir formu */
    formPanel: $('formPanel'), formTitle: $('formTitle'), cancelEdit: $('cancelEdit'),
    form: $('incomeForm'), amount: $('amount'), currency: $('currency'), category: $('category'),
    date: $('date'), datePicker: $('datePicker'), dateBtn: $('dateBtn'),
    note: $('note'), error: $('formError'), submit: $('submitBtn'),
    noCatHint: $('noCatHint'),

    /* üç nokta menüleri */
    topDots: $('topDots'), topMenu: $('topMenu'),
    listDots: $('listDots'), listMenu: $('listMenu'),
    toggleEdit: $('toggleEdit'), toggleEditLabel: $('toggleEditLabel'),

    /* kategoriler */
    catList: $('catList'), catForm: $('catForm'), catName: $('catName'),
    catCancel: $('catCancel'), catError: $('catError'), catCount: $('catCount'),
    suggest: $('suggest'),

    /* ay şeridi */
    prevYear: $('prevYear'), nextYear: $('nextYear'), yearLabel: $('yearLabel'),
    monthList: $('monthList'), allMonths: $('allMonths'),

    /* liste */
    filter: $('filterCategory'), clearAll: $('clearAll'),
    body: $('incomeBody'), tableWrap: $('tableWrap'), listNote: $('listNote'),
    empty: $('emptyState'), emptyTitle: $('emptyTitle'), emptyText: $('emptyText'),

    /* pasta grafik */
    pieCard: $('pieCard'), pieSvg: $('pieSvg'), pieLegend: $('pieLegend'), pieNote: $('pieNote'),
    pieCenterLabel: $('pieCenterLabel'), pieCenterValue: $('pieCenterValue'),

    /* özet kartları */
    statToday: $('statToday'), statTodayMeta: $('statTodayMeta'),
    statMonth: $('statMonth'), statMonthMeta: $('statMonthMeta'),
    statTotal: $('statTotal'), statTotalMeta: $('statTotalMeta'),

    /* geri al şeridi */
    /* onay penceresi */
    confirmOverlay: $('confirmOverlay'), confirmTitle: $('confirmTitle'),
    confirmText: $('confirmText'), confirmYes: $('confirmYes'), confirmNo: $('confirmNo'),

    toast: $('toast'), toastText: $('toastText'), undoBtn: $('undoBtn')
  };

  /* Uygulamanın tüm verisi. Sayfa açılınca sunucudan doldurulur;
     o gelene kadar boş bir iskeletle duruyor. */
  var state = { categories: [], entries: [], rates: { TRY: 1 }, base: 'TRY' };

  /* Hangi kategoriye göre filtrelendiğimiz. 'all' = filtre yok.
     Bu bilgi state'e girmez, çünkü kalıcı olması gerekmiyor; sayfa yenilenince sıfırlanır. */
  var activeFilter = 'all';

  /* Düzenlenmekte olan kaydın kimliği. null ise form "yeni kayıt" modundadır.
     Dolu ise aynı form o kaydın üstüne yazar. Bu da geçici bilgi, state'e girmez. */
  var editingId = null;

  /* Düzenleme modu açık mı? Kapalıyken tablo satırlarında düğme gösterilmez. */
  var editMode = false;

  /* Ay süzgeci. Boş metin = "Tümü", yoksa "2026-08" biçiminde tek bir ay.
     activeYear ise şeritte hangi yılın aylarının gösterildiği; seçimden
     bağımsızdır (2025'e bakıp seçimi değiştirmeden geri dönebilirsiniz). */
  var activeMonth = '';
  var activeYear = Number(todayISO().slice(0, 4));

  /* ==========================================================================
     BÖLÜM 1 — SUNUCU İLE KONUŞMA
     --------------------------------------------------------------------------
     Üç fonksiyon var, hepsi bu:

       sunucu(islem, veri)  : api.php'ye istek atar, cevabı döner
       defteriYukle()       : defterin tamamını çekip state'e koyar
       uygula(islem, veri)  : işlemi yaptır + defteri tazele + ekranı çiz

     Hepsi "söz" (Promise) döndürüyor. Sebep: internet üzerinden konuşmak zaman
     alır ve tarayıcı bu sırada beklemez. .then(...) "iş bitince şunu yap" demektir.
     ========================================================================== */

  /* CURRENCIES listesinden { TRY:1, USD:41, ... } biçiminde bir kur tablosu üretir.
     Yedek dosyası okunurken, dosyada olmayan para birimleri için başlangıç
     değeri gerekiyor; onu bu fonksiyon veriyor. */
  function defaultRates() {
    var r = {};
    CURRENCIES.forEach(function (c) { r[c.code] = c.rate; });
    return r;
  }

  /* Sunucuya bir istek gönderir. Hata olursa açıklamasıyla birlikte fırlatır. */
  function sunucu(islem, veri) {
    return fetch(API + '?islem=' + islem, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(veri || {})
    }).then(function (cevap) {
      return cevap.json().then(function (sonuc) {
        /* PHP tarafı hata durumunda { hata: "..." } dönüyor. */
        if (!cevap.ok || (sonuc && sonuc.hata)) {
          throw new Error(sonuc && sonuc.hata ? sonuc.hata : 'Sunucu hatası');
        }
        return sonuc;
      });
    });
  }

  /* Defterin tamamını sunucudan çeker ve state'e yazar. */
  function defteriYukle() {
    return fetch(API + '?islem=getir').then(function (cevap) {
      if (!cevap.ok) throw new Error('Defter okunamadı');
      return cevap.json();
    }).then(function (gelen) {
      state = gelen;
      return state;
    });
  }

  /* En sık kullanılan kalıp: işlemi yaptır, defteri tazele, ekranı çiz. */
  function uygula(islem, veri) {
    return sunucu(islem, veri)
      .then(defteriYukle)
      .then(render)
      .catch(sunucuHatasi);
  }

  /* Sunucuya ulaşılamazsa kullanıcı sebebini görsün; sessizce yutmuyoruz. */
  function sunucuHatasi(err) {
    showError('Sunucu hatası: ' + err.message +
      ' (XAMPP çalışıyor mu? Apache ve MySQL açık olmalı.)');
    console.error(err);
  }

  /* ==========================================================================
     BÖLÜM 2 — PARA BİRİMİ HESABI
     --------------------------------------------------------------------------
     Her kaydın içinde iki bilgi var: amount (girilen tutar) ve rate (o kayıt
     eklenirken 1 birimin kaç TL ettiği). Yani kaydın TL karşılığı sabittir:
         TL karşılığı = amount * rate
     Ekranda göstereceğimiz birime çevirmek için TL'yi o birimin güncel kuruna böleriz:
         gösterilecek = (amount * rate) / rates[base]

     Örnek: 100 USD'lik satış, o günkü kur 40 -> TL karşılığı 4000.
     Ekranı EUR'ya alırsak ve EUR kuru 50 ise: 4000 / 50 = 80 EUR görünür.

     Neden kuru kaydın içinde saklıyoruz? Çünkü satış o günkü kurdan yapıldı.
     Yarın kur değişince geçmiş satışın TL değeri değişmemeli.
     ========================================================================== */
  function baseValue(entry) {
    var inTRY = entry.amount * (entry.rate || 1);
    return inTRY / (state.rates[state.base] || 1);
  }

  /* Sayıyı "₺1.234,56" gibi Türkçe biçimde yazar.
     Intl.NumberFormat nesnesini her çağrıda yeniden kurmak pahalı olduğu için
     kurduklarımızı formatters içinde saklayıp tekrar kullanıyoruz. */
  var formatters = {};
  function money(value, code) {
    var key = code || state.base;
    if (!formatters[key]) {
      formatters[key] = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: key });
    }
    return formatters[key].format(value);
  }

  /* ==========================================================================
     BÖLÜM 3 — KÜÇÜK YARDIMCILAR
     ========================================================================== */

  /* Benzersiz kimlik üretir: zaman damgası + rastgele harfler.
     Aynı milisaniyede iki kayıt eklense bile rastgele kısım sayesinde çakışmaz. */
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* Kimliğe göre kategori bulur, yoksa null döner (kategori silinmiş olabilir). */
  function catById(id) {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) return state.categories[i];
    }
    return null;
  }

  /* Kategorinin rengini CSS değişkeni olarak verir: 'var(--cat-3)' gibi.
     Doğrudan hex kod vermiyoruz ki tema değişince renk de kendiliğinden değişsin. */
  function catColor(cat) {
    if (!cat || !cat.slot || cat.slot > MAX_SLOT) return 'var(--cat-9)';
    return 'var(--cat-' + cat.slot + ')';
  }

  /* Yeni kategoriye boştaki en küçük renk numarasını verir.
     Bir kategori silinirse onun numarası boşalır ve sıradaki yeni kategori onu alır. */
  function nextSlot() {
    var used = {};
    state.categories.forEach(function (c) { used[c.slot] = true; });
    for (var s = 1; s <= MAX_SLOT; s++) {
      if (!used[s]) return s;
    }
    return MAX_SLOT + 1;   /* 8 renk de doluysa nötr griye düşer */
  }

  /* İki kategori adının "aynı" sayılıp sayılmayacağını karşılaştırmak için
     sadeleştirir: baştaki/sondaki boşlukları atar, küçük harfe çevirir
     (Türkçe kurallarıyla: I/ı, İ/i doğru eşleşsin), aradaki fazla boşlukları teke indirir. */
  function normalize(name) {
    return name.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
  }

  /* Bir kategoride kaç kayıt var? (Rozetteki sayı ve silme kontrolü için.) */
  function entryCount(catId) {
    return state.entries.filter(function (e) { return e.categoryId === catId; }).length;
  }

  /* Bugünün tarihini "2026-08-27" biçiminde verir.
     Neden hazır toISOString() kullanmıyoruz? O, saati UTC'ye çevirir ve
     akşam saatlerinde tarihi bir gün ileri/geri kaydırabilir. Bu yüzden
     yerel gün/ay/yılı elle birleştiriyoruz. padStart(2,'0') = 7 -> "07". */
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') +   /* getMonth() 0'dan başlar, +1 gerekir */
      '-' + String(d.getDate()).padStart(2, '0');
  }

  /* "2026-08-27" -> "27 Ağustos 2026" */
  function formatDate(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    return p[2] + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0];
  }

  /* --- Tarih kutusu: ekranda gg.aa.yyyy, kodun içinde ISO ---
     Kod her yerde "2026-08-27" biçimini kullanır; çünkü bu biçimde metin
     karşılaştırması tarih karşılaştırmasıyla aynı sonucu verir (sıralama ve
     "aynı ay mı" kontrolü bu sayede tek satır). Kullanıcı ise Türkçe biçimi
     görür. Aşağıdaki iki fonksiyon arada çeviri yapar. */
  function isoToTR(iso) {
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : '';
  }

  function trToISO(text) {
    var p = String(text).trim().split('.');
    if (p.length !== 3) return '';

    var gun = p[0], ay = p[1], yil = p[2];
    if (gun.length !== 2 || ay.length !== 2 || yil.length !== 4) return '';

    var iso = yil + '-' + ay + '-' + gun;

    /* Gerçekten var olan bir gün mü? 31.02.2026 yazılırsa Date nesnesi bunu
       2 Mart'a kaydırır; tarihi kurup geri okuyoruz, aynı çıkmıyorsa geçersiz. */
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    if (String(d.getDate()).padStart(2, '0') !== gun) return '';
    if (String(d.getMonth() + 1).padStart(2, '0') !== ay) return '';

    return iso;
  }

  /* Kutuya ISO tarih yazar (hem görünen metin hem gizli takvim kutusu). */
  function setDateField(iso) {
    el.date.value = isoToTR(iso);
    el.datePicker.value = iso;
  }

  /* Kutudaki metni ISO'ya çevirir; geçersizse boş metin döner. */
  function readDateField() {
    return trToISO(el.date.value);
  }

  /* Form hatası göster/gizle. */
  function showError(msg) { el.error.textContent = msg; el.error.hidden = false; }
  function hideError() { el.error.hidden = true; }

  /* ==========================================================================
     BÖLÜM 4 — KATEGORİLER
     ========================================================================== */

  /* Yeni kategori ekler. Başarılıysa kategori nesnesini, hatalıysa null döner. */
  function addCategory(rawName) {
    var name = rawName.trim().replace(/\s+/g, ' ');

    if (!name) {
      el.catError.textContent = 'Kategori adı boş olamaz.';
      el.catError.hidden = false;
      return Promise.resolve(null);      /* çağıran yine .then ile bekleyebilsin */
    }

    var exists = state.categories.some(function (c) { return normalize(c.name) === normalize(name); });
    if (exists) {
      el.catError.textContent = name + ' zaten var.';
      el.catError.hidden = false;
      return Promise.resolve(null);
    }

    /* Kategoriyi sunucu oluşturuyor; numarasını (id) da o veriyor.
       Bu yüzden fonksiyon artık hazır kategoriyi değil, "birazdan gelecek"
       anlamına gelen bir söz (Promise) döndürüyor. */
    return sunucu('kategori-ekle', { ad: name, renk_slot: nextSlot() })
      .then(function (sonuc) {
        el.catError.hidden = true;
        return defteriYukle().then(function () {
          render();
          return catById(String(sonuc.id));
        });
      })
      .catch(function (err) {
        el.catError.textContent = err.message;
        el.catError.hidden = false;
        return null;
      });
  }

  /* Kategori rozetlerini sıfırdan çizer.
     textContent = '' -> içini tamamen boşalt. Sonra hepsini yeniden ekliyoruz. */
  function renderCategories() {
    el.catList.textContent = '';

    state.categories.forEach(function (cat) {
      var count = entryCount(cat.id);

      var item = document.createElement('span');
      item.className = 'cat';

      /* Renk noktası */
      var dot = document.createElement('span');
      dot.className = 'cat__dot';
      dot.style.background = catColor(cat);
      item.appendChild(dot);

      /* Kategori adı.
         createTextNode kullanıyoruz (innerHTML değil): kullanıcının yazdığı ad
         içinde < > gibi işaretler olsa bile HTML olarak yorumlanmaz, düz yazı kalır.
         Bu, başkasının kodunun sayfaya sızmasını (XSS) engelleyen alışkanlıktır. */
      item.appendChild(document.createTextNode(cat.name));

      /* Kaç kayıt var rozeti */
      var badge = document.createElement('span');
      badge.className = 'cat__count';
      badge.textContent = count;
      item.appendChild(badge);

      /* Silme düğmesi. Hangi kategoriye ait olduğunu data-id ile taşıyoruz;
         tıklama olayında bu değeri okuyacağız. */
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'cat__del';
      del.dataset.id = cat.id;
      del.innerHTML = '&times;';
      del.title = count > 0
        ? cat.name + ' kategorisinde ' + count + ' kayıt var'
        : cat.name + ' kategorisini sil';
      del.setAttribute('aria-label', cat.name + ' kategorisini sil');
      item.appendChild(del);

      el.catList.appendChild(item);
    });

    /* Listenin sonundaki "+ Kategori ekle" düğmesi */
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'cat cat--add';
    addBtn.id = 'addCatBtn';
    addBtn.textContent = '+ Kategori ekle';
    el.catList.appendChild(addBtn);

    el.catCount.textContent = state.categories.length + ' kategori';

    renderSuggestions();
  }

  /* Hazır kategori düğmeleri. Her çizimde yeniden kuruluyor, çünkü listenin
     içeriği kategoriler eklendikçe değişiyor: zaten var olanı göstermiyoruz. */
  function renderSuggestions() {
    /* İlk çocuk "Hazır:" yazısı; onu koruyup gerisini siliyoruz. */
    while (el.suggest.children.length > 1) {
      el.suggest.removeChild(el.suggest.lastChild);
    }

    var kalanlar = SUGGESTIONS.filter(function (name) {
      return !state.categories.some(function (c) { return normalize(c.name) === normalize(name); });
    });

    /* Üçü de eklenmişse satırı tamamen gizle. */
    el.suggest.hidden = kalanlar.length === 0;

    kalanlar.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggest__btn';
      b.dataset.name = name;      /* tıklanınca hangi adı ekleyeceğimizi taşır */
      b.textContent = '+ ' + name;
      el.suggest.appendChild(b);
    });
  }

  /* ==========================================================================
     BÖLÜM 5 — KUR PENCERESİ
     ========================================================================== */

  /* Kur satırlarını çizer.
     Satırlar bir kez kurulur; sonraki çağrılarda sadece kutulardaki sayı tazelenir.
     Neden? Kullanıcı kutuya yazarken elemanı silip yeniden yaratırsak imleç kaybolur.
     Ayrıca o an yazılan kutuya (document.activeElement) hiç dokunmuyoruz. */
  function renderRates() {
    if (el.rateList.children.length) {
      CURRENCIES.forEach(function (c) {
        var input = document.getElementById('rate-' + c.code);
        if (input && document.activeElement !== input) input.value = state.rates[c.code];
      });
      return;
    }

    /* TL'yi listeye koymuyoruz: 1 TL = 1 TL, ayarlanacak bir şey yok. */
    CURRENCIES.filter(function (c) { return c.code !== 'TRY'; }).forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'rate-row';

      var label = document.createElement('label');
      label.className = 'rate-row__label';
      label.htmlFor = 'rate-' + c.code;               /* etikete tıklayınca kutu odaklansın */
      label.textContent = '1 ' + c.code + ' = ';

      var input = document.createElement('input');
      input.type = 'number';
      input.id = 'rate-' + c.code;
      input.min = '0';
      input.step = '0.01';
      input.dataset.code = c.code;                    /* hangi birimin kuru olduğunu taşır */
      input.value = state.rates[c.code];

      row.appendChild(label);
      row.appendChild(input);
      el.rateList.appendChild(row);
    });
  }

  /* Pencereyi açar. Açarken:
     - hidden kalkar
     - odak pencerenin ilk kutusuna gider (klavye kullanıcısı için)
     - kapanınca odağın geri döneceği düğmeyi hatırlarız */
  function openFx() {
    el.fxOverlay.hidden = false;
    el.base.focus();
  }

  function closeFx() {
    el.fxOverlay.hidden = true;
    el.topDots.focus();   /* odak, menüyü açan üç nokta düğmesine dönsün */
  }

  /* Açılır listeleri (kategori, para birimi, filtre) doldurur. */
  function fillSelects() {
    /* Kategori seçeneklerinin HTML metni. */
    var catOpts = state.categories.map(function (c) {
      return '<option value="' + c.id + '">' + c.name + '</option>';
    }).join('');

    /* Listeyi yenilerken kullanıcının seçimini koru. */
    var keep = el.category.value;
    el.category.innerHTML = catOpts;
    if (keep) el.category.value = keep;

    /* Filtrede seçili kategori silinmişse "tüm kategoriler"e dön. */
    if (activeFilter !== 'all' && !catById(activeFilter)) activeFilter = 'all';
    el.filter.innerHTML = '<option value="all">Tüm kategoriler</option>' + catOpts;
    el.filter.value = activeFilter;

    /* Para birimi listeleri hiç değişmiyor; sadece bir kez dolduruyoruz. */
    if (!el.currency.options.length) {
      el.currency.innerHTML = CURRENCIES.map(function (c) {
        return '<option value="' + c.code + '">' + c.code + '</option>';
      }).join('');
      el.base.innerHTML = CURRENCIES.map(function (c) {
        return '<option value="' + c.code + '">' + c.code + ' · ' + c.name + '</option>';
      }).join('');
    }
    el.base.value = state.base;
    el.fxBtnLabel.textContent = state.base;   /* üst bardaki düğmede yazan kod */

    /* Hiç kategori yoksa kayıt yapılamaz: ilgili alanları kapat ve ipucunu göster. */
    var none = state.categories.length === 0;
    el.category.disabled = none;
    el.submit.disabled = none;
    el.noCatHint.hidden = !none;
  }

  /* ==========================================================================
     BÖLÜM 6 — ÖZET KARTLARI
     ========================================================================== */

  /* Bütün kayıtları tek turda gezip dört şeyi aynı anda hesaplar:
     toplam, bu ay, bugün ve kategori kırılımı. Tek döngü yeter, dört ayrı
     döngü yazmaya gerek yok. */
  function renderStats() {
    var today = todayISO();
    var prefix = today.slice(0, 7);   /* "2026-08" -> ay karşılaştırması için */

    var total = 0, month = 0, monthCount = 0, day = 0, dayCount = 0;
    var byCat = {};                   /* { kategoriId: toplamTutar } */

    state.entries.forEach(function (e) {
      var value = baseValue(e);       /* seçili para birimindeki karşılığı */
      total += value;
      byCat[e.categoryId] = (byCat[e.categoryId] || 0) + value;

      if (e.date === today) { day += value; dayCount++; }
      if (String(e.date).slice(0, 7) === prefix) { month += value; monthCount++; }
    });

    setTile(el.statToday, day);
    el.statTodayMeta.textContent = dayCount + ' kayıt · ' + formatDate(today);

    setTile(el.statMonth, month);
    el.statMonthMeta.textContent =
      MONTHS[Number(prefix.slice(5, 7)) - 1] + ' ' + prefix.slice(0, 4) + ' · ' + monthCount + ' kayıt';

    setTile(el.statTotal, total);
    el.statTotalMeta.textContent = state.entries.length + ' kayıt';

    /* Kategori kırılımı hazır; pastayı da buradan çizdiriyoruz. */
    renderPie(byCat, total);
  }

  /* ==========================================================================
     BÖLÜM 7 — PASTA (HALKA) GRAFİK
     --------------------------------------------------------------------------
     NASIL ÇİZİLİYOR? Dilim dilim üçgen çizmiyoruz. Tek bir daire çiziyoruz ve
     onun ÇEVRE ÇİZGİSİNİ (stroke) kalın yapıp kesik kesik gösteriyoruz:

       stroke-dasharray: "çizilen uzunluk, boşluk uzunluğu"
       stroke-dashoffset: çizginin nereden başlayacağı (negatif = ileri kaydır)

     Dairenin çevresi C = 2 * pi * r. Bir kategorinin payı %25 ise onun çizgisi
     C'nin dörtte biri kadar uzun olur, gerisi boşluk bırakılır. Her dilimi kendi
     rengiyle ayrı bir daire olarak üst üste koyup offset'i kaydırınca halka oluşur.

     rotate(-90 60 60): SVG'de açı sağdan (saat 3 yönü) başlar; -90 derece
     döndürerek dilimlerin saat 12'den başlamasını sağlıyoruz.

     gap (2 birim): her dilimin ucundan biraz kısaltıyoruz ki komşu dilimler
     birbirine yapışmasın, arada ince bir ayrım görünsün.
     ========================================================================== */
  var SVG_NS = 'http://www.w3.org/2000/svg';   /* SVG elemanları bu ad alanıyla yaratılmalı */
  var RADIUS = 42;                              /* 120x120 kağıtta halkanın yarıçapı */
  var CIRC = 2 * Math.PI * RADIUS;              /* çevre uzunluğu */

  /* Kategori toplamlarını, çizilecek dilim listesine çevirir:
     büyükten küçüğe sıralar ve 6'dan fazlaysa kalanları "Diğer"de toplar. */
  function pieRows(byCat) {
    var rows = Object.keys(byCat).map(function (id) {
      var cat = catById(id);
      return {
        name: cat ? cat.name : 'Silinen kategori',
        color: catColor(cat),
        sum: byCat[id]
      };
    }).filter(function (r) { return r.sum > 0; })
      .sort(function (a, b) { return b.sum - a.sum; });   /* b - a = büyükten küçüğe */

    if (rows.length > MAX_SLICES) {
      var head = rows.slice(0, MAX_SLICES - 1);          /* ilk 5 kategori ayrı dilim */
      var tail = rows.slice(MAX_SLICES - 1);             /* geri kalan hepsi */
      var rest = tail.reduce(function (t, r) { return t + r.sum; }, 0);
      head.push({
        name: 'Diğer (' + tail.length + ' kategori)',
        color: 'var(--cat-9)',
        sum: rest                                        /* tutar kaybolmuyor, toplanıyor */
      });
      rows = head;
    }
    return rows;
  }

  /* Halkanın ortasına yazılacak metni hazırlar.
     Küçük tutarlarda tam biçim kullanılır: "₺12.450,00".
     Uzun kalanlarda kısaltılmış biçime geçiyoruz: "₺1,3 Mn" gibi. Bunu
     Intl'in "compact" gösterimi yapıyor, dolayısıyla kısaltmalar da Türkçe olur. */
  var kisaFormatlar = {};
  function shortMoney(value, limit) {
    var tam = money(value);
    if (tam.length <= limit) return tam;

    var key = state.base;
    if (!kisaFormatlar[key]) {
      try {
        kisaFormatlar[key] = new Intl.NumberFormat('tr-TR', {
          style: 'currency', currency: key,
          notation: 'compact', maximumFractionDigits: 1
        });
      } catch (err) {
        kisaFormatlar[key] = null;   /* eski tarayıcı: kısaltma yok */
      }
    }
    return kisaFormatlar[key] ? kisaFormatlar[key].format(value) : tam;
  }

  function centerText(value) { return shortMoney(value, 11); }

  /* Özet kartına yazar: sığmayacak kadar uzunsa kısaltır, tam hâlini de
     kutunun üstüne gelince görünen ipucuna (title) koyar. */
  function setTile(node, value) {
    node.textContent = shortMoney(value, 13);
    node.title = money(value);
  }

  /* Halkanın ortasındaki iki satırı yazar.
     value bir SAYIDIR; biçimlendirmeyi burada yapıyoruz ki metnin uzunluğuna
     göre yazı boyutunu da ayarlayabilelim. */
  function setCenter(label, value) {
    el.pieCenterLabel.textContent = label;

    var metin = centerText(value);
    el.pieCenterValue.textContent = metin;

    /* Metin uzadıkça punto düşsün; yoksa uzun tutar halkaya taşar. */
    var punto = 24;
    if (metin.length > 11) punto = 18;
    else if (metin.length > 9) punto = 21;
    el.pieCenterValue.style.fontSize = punto + 'px';
  }

  function renderPie(byCat, total) {
    var rows = pieRows(byCat);

    /* Hiç kayıt yoksa grafiği tamamen gizle; boş bir halka göstermenin anlamı yok. */
    el.pieCard.hidden = rows.length === 0 || total <= 0;
    if (el.pieCard.hidden) return;

    /* Dilim sayısı 6 ile sınırlı ama başlıkta gerçek kategori sayısını yazıyoruz:
       "2 dilim" teknik kaçıyor, "2 kategori" doğrudan anlaşılıyor. */
    var kategoriSayisi = Object.keys(byCat).filter(function (id) { return byCat[id] > 0; }).length;
    el.pieNote.textContent = kategoriSayisi + ' kategori';
    el.pieSvg.textContent = '';      /* önceki çizimi temizle */
    el.pieLegend.textContent = '';

    var gap = rows.length > 1 ? 2 : 0;   /* tek dilim varsa boşluk bırakma */
    var offset = 0;                      /* bir sonraki dilim çevrenin neresinden başlayacak */

    rows.forEach(function (row, i) {
      var share = row.sum / total;                              /* 0 ile 1 arası pay */
      var length = Math.max(share * CIRC - gap, 0.5);           /* dilimin çizgi uzunluğu */

      /* --- dilimi çiz --- */
      var arc = document.createElementNS(SVG_NS, 'circle');
      arc.setAttribute('class', 'pie__slice');
      arc.setAttribute('cx', '60');            /* dairenin merkezi (120/2) */
      arc.setAttribute('cy', '60');
      arc.setAttribute('r', String(RADIUS));
      arc.setAttribute('fill', 'none');        /* içi boş olsun, sadece kenar çizgisi */
      arc.setAttribute('stroke', row.color);
      arc.setAttribute('stroke-width', '19');  /* halkanın kalınlığı */
      arc.setAttribute('stroke-dasharray', length + ' ' + (CIRC - length));
      arc.setAttribute('stroke-dashoffset', String(-offset));
      arc.setAttribute('transform', 'rotate(-90 60 60)');
      arc.dataset.index = i;                   /* fare gelince hangi dilim olduğunu bilelim */
      el.pieSvg.appendChild(arc);

      offset += share * CIRC;                  /* sıradaki dilim buradan başlayacak */

      /* --- yan listedeki satırı yaz --- */
      var legendRow = document.createElement('div');
      legendRow.className = 'legend__row';
      legendRow.dataset.index = i;

      var chip = document.createElement('span');
      chip.className = 'chip';
      var dot = document.createElement('span');
      dot.className = 'chip__dot';
      dot.style.background = row.color;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(row.name));

      var val = document.createElement('span');
      val.className = 'legend__val';
      var strong = document.createElement('strong');
      strong.textContent = money(row.sum);
      val.appendChild(strong);
      /* Türkçede işaret sayının önüne yazılır: %42 */
      val.appendChild(document.createTextNode(' · %' + Math.round(share * 100)));

      legendRow.appendChild(chip);
      legendRow.appendChild(val);
      el.pieLegend.appendChild(legendRow);
    });

    /* Çizim bitti: güncel dilimleri ve toplamı sakla, ortadaki yazıyı toplama ayarla. */
    pie.rows = rows;
    pie.total = total;
    focusSlice(null);
  }

  /* Fare olayları için ortak hafıza. Neden ayrı bir nesne?
     Dinleyicileri (aşağıda) sadece BİR KEZ bağlıyoruz. Eğer her çizimde yeniden
     bağlasaydık, dinleyiciler üst üste birikir ve eski verilere takılı kalırdı. */
  var pie = { rows: [], total: 0 };

  /* index = üstüne gelinen dilimin sırası, null = fare grafikten çıktı.
     Seçili dilim vurgulanır, diğerleri soluklaşır, ortadaki yazı da değişir. */
  function focusSlice(index) {
    var slices = el.pieSvg.querySelectorAll('.pie__slice');
    var legends = el.pieLegend.querySelectorAll('.legend__row');

    for (var i = 0; i < slices.length; i++) {
      slices[i].classList.toggle('is-dim', index !== null && i !== index);
      if (legends[i]) legends[i].classList.toggle('is-active', index === i);
    }

    if (index === null || !pie.rows[index]) {
      setCenter('Toplam', pie.total);
    } else {
      setCenter(pie.rows[index].name, pie.rows[index].sum);
    }
  }

  /* Hem grafiğin hem yan listenin üstünde fare gezinmesini dinliyoruz.
     Dinleyiciyi tek tek dilimlere değil, kapsayıcıya bağlıyoruz (olay delegasyonu):
     içerik her yeniden çizildiğinde dinleyicileri tekrar bağlamak gerekmez. */
  [el.pieSvg, el.pieLegend].forEach(function (container) {
    container.addEventListener('mouseover', function (ev) {
      var target = ev.target.closest('[data-index]');   /* fare hangi dilimin üstünde? */
      if (target) focusSlice(Number(target.dataset.index));
    });
    container.addEventListener('mouseleave', function () { focusSlice(null); });
  });

  /* ==========================================================================
     BÖLÜM 8 — AY ŞERİDİ VE KAYIT LİSTESİ
     ========================================================================== */

  /* Şeritteki 12 ay düğmesini çizer.
     Her ayın altında o ayda kayıt olup olmadığını da gösteriyoruz: kaydı
     olmayan aylar soluk çıkıyor, böylece hangi aylarda iş olduğu bir bakışta
     görünüyor. */
  function renderMonthBar() {
    el.yearLabel.textContent = activeYear;
    el.monthList.textContent = '';

    /* Bu yıl içinde hangi aylarda kayıt var? {"2026-08": true} gibi. */
    var doluAylar = {};
    state.entries.forEach(function (e) {
      doluAylar[String(e.date).slice(0, 7)] = true;
    });

    for (var i = 0; i < 12; i++) {
      var ayKodu = activeYear + '-' + String(i + 1).padStart(2, '0');

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mb__chip';
      if (ayKodu === activeMonth) b.className += ' is-on';
      if (!doluAylar[ayKodu]) b.className += ' is-empty';
      b.dataset.month = ayKodu;
      b.textContent = MONTHS_SHORT[i];
      b.title = MONTHS[i] + ' ' + activeYear;
      el.monthList.appendChild(b);
    }

    /* "Tümü" düğmesi, hiçbir ay seçili değilken vurgulu. */
    el.allMonths.className = activeMonth ? 'mb__all' : 'mb__all is-on';
  }

  el.monthList.addEventListener('click', function (ev) {
    var chip = ev.target.closest('.mb__chip');
    if (!chip) return;

    /* Seçili aya tekrar basmak seçimi kaldırır: ikinci bir "Tümü" gibi çalışır. */
    activeMonth = (chip.dataset.month === activeMonth) ? '' : chip.dataset.month;
    renderMonthBar();
    renderList();
  });

  el.allMonths.addEventListener('click', function () {
    activeMonth = '';
    renderMonthBar();
    renderList();
  });

  el.prevYear.addEventListener('click', function () {
    activeYear--;
    renderMonthBar();
  });

  el.nextYear.addEventListener('click', function () {
    activeYear++;
    renderMonthBar();
  });

  /* Ekranda gösterilecek kayıtları verir: filtre uygulanmış ve tarihe göre
     yeniden eskiye sıralanmış hali. slice() ile kopya alıyoruz ki sort()
     asıl diziyi (state.entries) karıştırmasın. */
  function visibleEntries() {
    var list = activeFilter === 'all'
      ? state.entries.slice()
      : state.entries.filter(function (e) { return e.categoryId === activeFilter; });

    /* Ay süzgeci: tarihin ilk 7 karakteri ("2026-08") seçilen ayla aynı mı?
       ISO biçimi kullandığımız için ay karşılaştırması bu kadar basit. */
    if (activeMonth) {
      list = list.filter(function (e) { return String(e.date).slice(0, 7) === activeMonth; });
    }

    list.sort(function (a, b) {
      /* Aynı gün içindeyse sonra eklenen üstte olsun. */
      if (a.date === b.date) return b.createdAt - a.createdAt;
      /* Tarihler "2026-08-27" biçiminde olduğu için metin karşılaştırması
         doğru sonuç verir; ayrıca Date nesnesi kurmaya gerek kalmaz. */
      return a.date < b.date ? 1 : -1;
    });

    return list;
  }

  /* Tek bir tablo hücresi üretir. */
  function cell(cls, text) {
    var td = document.createElement('td');
    td.className = cls;
    td.textContent = text;
    return td;
  }

  function renderList() {
    var list = visibleEntries();
    el.body.textContent = '';   /* tabloyu boşalt, baştan doldur */

    list.forEach(function (e) {
      var cat = catById(e.categoryId);
      var tr = document.createElement('tr');
      /* Telefon kart görünümünde soldaki renk şeridi bu değişkenden okunur. */
      tr.style.setProperty('--row-color', catColor(cat));

      /* 1. sütun: tarih */
      tr.appendChild(cell('c-date', formatDate(e.date)));

      /* 2. sütun: renkli nokta + kategori adı */
      var tdCat = document.createElement('td');
      tdCat.className = 'c-cat';
      var chip = document.createElement('span');
      chip.className = 'chip';
      var dot = document.createElement('span');
      dot.className = 'chip__dot';
      dot.style.background = catColor(cat);
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(cat ? cat.name : 'Silinen kategori'));
      tdCat.appendChild(chip);
      tr.appendChild(tdCat);

      /* 3. sütun: açıklama */
      tr.appendChild(cell('c-note', e.note || ''));

      /* 4. sütun: tutar. Üstte seçili para birimindeki karşılığı,
         kaydın kendi birimi farklıysa altında küçük yazıyla orijinali. */
      var tdAmount = document.createElement('td');
      tdAmount.className = 'c-amount';
      tdAmount.textContent = money(baseValue(e));
      if (e.currency !== state.base) {
        var orig = document.createElement('small');
        orig.textContent = money(e.amount, e.currency);
        tdAmount.appendChild(orig);
      }
      tr.appendChild(tdAmount);

      /* 5. sütun: düzenle ve sil düğmeleri — SADECE düzenleme modunda.
         Hangi kayda ait olduklarını data-id ile taşıyorlar; tıklama olayında okunuyor. */
      if (editMode) {
        var tdAction = document.createElement('td');
        tdAction.className = 'c-action';

        var btns = document.createElement('span');
        btns.className = 'row-btns';

        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'del edit';
        editBtn.dataset.id = e.id;
        editBtn.title = 'Düzenle';
        editBtn.setAttribute('aria-label', 'Kaydı düzenle');
        editBtn.textContent = '✎';
        btns.appendChild(editBtn);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'del';
        btn.dataset.id = e.id;
        btn.title = 'Sil';
        btn.setAttribute('aria-label', 'Kaydı sil');
        btn.innerHTML = '&times;';
        btns.appendChild(btn);

        tdAction.appendChild(btns);
        tr.appendChild(tdAction);
      }

      /* Düzenlenen kayıt hangisiyse o satır vurgulansın. */
      if (e.id === editingId) tr.className = 'is-editing';

      el.body.appendChild(tr);
    });

    /* Tablo mu boş kutu mu görünecek? */
    var hasRows = list.length > 0;
    el.tableWrap.hidden = !hasRows;
    /* Telefon görünümünde kart düzeni için işaret sınıfı. */
    el.tableWrap.classList.toggle('rows-editable', editMode);
    el.listNote.hidden = !hasRows;
    el.empty.hidden = hasRows;
    el.clearAll.disabled = state.entries.length === 0;

    if (hasRows) {
      /* reduce: diziyi tek bir sayıya indirger. Burada gösterilen kayıtların toplamı. */
      var sum = list.reduce(function (t, e) { return t + baseValue(e); }, 0);
      var onEk = activeMonth
        ? MONTHS[Number(activeMonth.slice(5, 7)) - 1] + ' ' + activeMonth.slice(0, 4) + ' · '
        : '';
      el.listNote.textContent = onEk + list.length + ' kayıt · ' + money(sum);

    } else if (state.entries.length > 0) {
      /* Kayıt var ama süzgeçler yüzünden görünmüyor: hangisi yüzünden olduğunu yazalım. */
      if (activeMonth) {
        var ayAdi = MONTHS[Number(activeMonth.slice(5, 7)) - 1] + ' ' + activeMonth.slice(0, 4);
        el.emptyTitle.textContent = ayAdi + ' ayında kayıt yok';
        el.emptyText.textContent = 'Başka bir ay seçin veya "Tümü" deyin.';
      } else {
        el.emptyTitle.textContent = 'Bu kategoride kayıt yok';
        el.emptyText.textContent = 'Filtreyi değiştirerek diğer gelirleri görebilirsiniz.';
      }

    } else if (state.categories.length === 0) {
      /* Daha hiçbir şey yok: önce kategori istiyoruz. */
      el.emptyTitle.textContent = 'Önce kategori ekleyin';
      el.emptyText.textContent = 'Dükkânınızın gelir türlerini kendiniz tanımlayın: nakit satış, hizmet, online sipariş…';

    } else {
      el.emptyTitle.textContent = 'Kayıt yok';
      el.emptyText.textContent = 'Formu doldurarak ilk geliri kaydedin.';
    }
  }

  /* Ekranın tamamını state'e göre yeniden çizen tek fonksiyon. */
  function render() {
    fillSelects();
    renderMonthBar();
    renderCategories();
    renderRates();
    renderStats();     /* içinde renderPie'ı da çağırır */
    renderList();
  }

  /* ==========================================================================
     BÖLÜM 9 — OLAYLAR (kullanıcı bir şey yapınca ne olacak)
     ========================================================================== */

  /* --- Üç nokta menüleri ---
     İki menü var: sağ üstteki (yedek + para birimi) ve listedeki (düzenleme
     modu + tümünü sil). İkisi de aynı iki fonksiyonla çalışıyor.

     Menüyü kapatmanın üç yolu: dışarı tıklamak, Esc'e basmak, bir seçeneğe
     basmak. "Dışarı tıklandı" olayını document üzerinde dinliyoruz; menüyü açan
     düğmenin kendi tıklaması oraya ulaşmasın diye stopPropagation kullanıyoruz,
     yoksa menü açıldığı anda kapanırdı. */
  function closeMenus() {
    [[el.topDots, el.topMenu], [el.listDots, el.listMenu]].forEach(function (ikili) {
      ikili[1].hidden = true;
      ikili[0].setAttribute('aria-expanded', 'false');   /* ekran okuyucuya durumu bildir */
    });
  }

  function openMenu(trigger, menu) {
    closeMenus();                    /* aynı anda tek menü açık kalsın */
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    var ilkSecenek = menu.querySelector('button:not(:disabled)');
    if (ilkSecenek) ilkSecenek.focus();   /* klavyeyle gelen kullanıcı için */
  }

  function bindMenu(trigger, menu) {
    trigger.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (menu.hidden) openMenu(trigger, menu);
      else closeMenus();
    });

    /* Bir seçeneğe basılınca menüyü kapat. Seçeneğin kendi işi (pencere açmak,
       silmek vb.) bu satırdan ÖNCE çalışır: olay önce düğmenin kendi
       dinleyicisine, sonra kapsayıcıya (buraya) uğrar. */
    menu.addEventListener('click', function (ev) {
      if (ev.target.closest('button')) closeMenus();
    });
  }

  bindMenu(el.topDots, el.topMenu);
  bindMenu(el.listDots, el.listMenu);
  document.addEventListener('click', closeMenus);

  /* --- Düzenleme modu (genel) ---
     Kapalıyken tablo sade görünür, satırlarda düğme yoktur: yanlışlıkla silme
     ihtimali de azalır. Açıkken her satırda ✎ (düzenle) ve × (sil) belirir. */
  function setEditMode(acik) {
    editMode = acik;
    el.toggleEditLabel.textContent = acik ? 'Düzenleme modunu kapat' : 'Düzenleme modu';

    /* Mod kapanırken bir kaydı düzenliyorsak formu da normale döndürüyoruz. */
    if (!acik && editingId) stopEdit();
    else renderList();
  }

  el.toggleEdit.addEventListener('click', function () { setEditMode(!editMode); });

  /* Tutar kutusuna sığmayacak kadar uzun sayı yazılmasın: 12 haneden (yani
     yüz milyarlardan) sonrasını kırpıyoruz. Asıl kontrol kaydetmede ama
     kullanıcı daha yazarken sınırı hissetsin. */
  el.amount.addEventListener('input', function () {
    var ham = el.amount.value;
    if (ham.replace(/[^0-9]/g, '').length > 12) {
      el.amount.value = ham.slice(0, ham.length - 1);
    }
  });

  /* --- Tarih kutusu davranışı ---
     Kullanıcı yazarken noktaları biz koyuyoruz: 2708 -> 27.08, 27082026 -> 27.08.2026.
     Sadece imleç metnin sonundayken araya giriyoruz ki ortadan düzeltme yapan
     kullanıcının imleci zıplamasın. */
  el.date.addEventListener('input', function () {
    if (el.date.selectionStart !== el.date.value.length) return;

    var rakamlar = el.date.value.replace(/[^0-9]/g, '').slice(0, 8);
    var metin = rakamlar;
    if (rakamlar.length > 4) {
      metin = rakamlar.slice(0, 2) + '.' + rakamlar.slice(2, 4) + '.' + rakamlar.slice(4);
    } else if (rakamlar.length > 2) {
      metin = rakamlar.slice(0, 2) + '.' + rakamlar.slice(2);
    }
    el.date.value = metin;
  });

  /* Yazma bitince gizli takvim kutusunu da aynı tarihe getir. */
  el.date.addEventListener('change', function () {
    var iso = readDateField();
    if (iso) el.datePicker.value = iso;
  });

  /* Takvim düğmesi: gizli tarih kutusunun takvimini açar.
     showPicker() modern tarayıcılarda var; yoksa kullanıcı elle yazmaya devam eder. */
  el.dateBtn.addEventListener('click', function () {
    el.datePicker.value = readDateField() || todayISO();
    if (typeof el.datePicker.showPicker === 'function') {
      try { el.datePicker.showPicker(); } catch (err) { el.date.focus(); }
    } else {
      el.date.focus();
    }
  });

  /* Takvimden seçilen tarih görünen kutuya yazılır. */
  el.datePicker.addEventListener('change', function () {
    if (el.datePicker.value) setDateField(el.datePicker.value);
  });

  /* --- Onay penceresi ---
     confirm() kısıtlı çerçevede çalışmadığı için soruyu kendi penceremizde
     soruyoruz. Kullanıcı "Evet" derse saklanan işi çalıştırıyoruz. */
  var confirmAction = null;

  function askConfirm(baslik, metin, evetYazisi, yapilacakIs) {
    el.confirmTitle.textContent = baslik;
    el.confirmText.textContent = metin;
    el.confirmYes.textContent = evetYazisi;
    confirmAction = yapilacakIs;
    el.confirmOverlay.hidden = false;
    el.confirmNo.focus();          /* odak güvenli seçenekte başlasın */
  }

  function closeConfirm() {
    el.confirmOverlay.hidden = true;
    confirmAction = null;
  }

  el.confirmYes.addEventListener('click', function () {
    var yapilacak = confirmAction;
    closeConfirm();
    if (yapilacak) yapilacak();
  });
  el.confirmNo.addEventListener('click', closeConfirm);
  el.confirmOverlay.addEventListener('click', function (ev) {
    if (ev.target === el.confirmOverlay) closeConfirm();
  });

  /* --- Gelir kaydetme --- */
  el.form.addEventListener('submit', function (ev) {
    ev.preventDefault();   /* formun sayfayı yeniden yüklemesini engelle */
    hideError();

    if (state.categories.length === 0) {
      showError('Önce bir kategori ekleyin.');
      openCatForm();
      return;
    }

    /* Kullanıcı "12,50" yazmış olabilir; JavaScript ondalık ayracı olarak nokta ister. */
    var amount = parseFloat(String(el.amount.value).replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) {
      showError('Sıfırdan büyük bir tutar girin.');
      el.amount.focus();
      return;
    }
    if (amount > MAX_AMOUNT) {
      showError('Tutar çok büyük. Tek kayıt en fazla ' + money(MAX_AMOUNT, 'TRY') + ' olabilir.');
      el.amount.focus();
      el.amount.select();
      return;
    }
    var isoTarih = readDateField();
    if (!isoTarih) {
      showError('Tarihi gg.aa.yyyy biçiminde girin. Örnek: ' + isoToTR(todayISO()));
      el.date.focus();
      return;
    }

    var code = el.currency.value;

    /* Math.round(x * 100) / 100 = iki basamağa yuvarla.
       Ondalık hesaplarda 0.1 + 0.2 = 0.30000000000000004 gibi artıklar oluşur;
       kuruş seviyesinde tutmak bunu temizler. */
    var yuvarlanmis = Math.round(amount * 100) / 100;

    if (editingId) {
      /* --- DÜZENLEME: mevcut kaydın üstüne yaz --- */
      var kayit = state.entries.filter(function (e) { return e.id === editingId; })[0];
      if (!kayit) return;

      /* Para birimi değiştiyse kuru o birimin GÜNCEL kuruyla tazeliyoruz.
         Aynı kaldıysa kaydın eski kuruna dokunmuyoruz: satış o günkü kurdan yapıldı. */
      var kullanilacakKur = (kayit.currency !== code) ? (state.rates[code] || 1) : kayit.rate;

      sunucu('kayit-guncelle', {
        id:          editingId,
        kategori_id: el.category.value,
        tutar:       yuvarlanmis,
        para_birimi: code,
        kur:         kullanilacakKur,
        tarih:       isoTarih,
        aciklama:    el.note.value.trim()
      })
        .then(defteriYukle)
        .then(function () { stopEdit(); })   /* formu normale döndürür + ekranı çizer */
        .catch(sunucuHatasi);
      return;
    }

    /* --- YENİ KAYIT --- */
    var keepCat = el.category.value;  /* form sıfırlanınca kaybolmasın diye sakla */

    sunucu('kayit-ekle', {
      kategori_id: keepCat,
      tutar:       yuvarlanmis,
      para_birimi: code,
      kur:         state.rates[code] || 1,  /* o anki kur kayda yazılır, sabit kalır */
      tarih:       isoTarih,
      aciklama:    el.note.value.trim()
    })
      .then(defteriYukle)
      .then(function () {
        render();

        /* Formu bir sonraki kayda hazırla: alanlar boş, kategori/para birimi aynı,
           tarih bugün, imleç tutar kutusunda. Arka arkaya giriş için en hızlısı bu. */
        el.form.reset();
        el.category.value = keepCat;
        el.currency.value = code;
        setDateField(todayISO());
        el.amount.focus();
      })
      .catch(sunucuHatasi);
  });

  /* --- Düzenleme modu ---
     startEdit: kaydın bütün alanlarını forma doldurur ve formu "güncelle" moduna alır.
     stopEdit:  modu kapatır, formu temizler, ekranı yeniler. */
  function startEdit(id) {
    var kayit = state.entries.filter(function (e) { return e.id === id; })[0];
    if (!kayit) return;

    editingId = id;
    hideError();

    /* Alanları kaydın kendi değerleriyle doldur. */
    el.amount.value = kayit.amount;
    el.currency.value = kayit.currency;
    el.category.value = kayit.categoryId;
    setDateField(kayit.date);
    el.note.value = kayit.note || '';

    /* Formun görünümünü düzenleme moduna çevir. */
    el.formTitle.textContent = 'Kaydı Düzenle';
    el.submit.textContent = 'Değişikliği Kaydet';
    el.cancelEdit.hidden = false;

    renderList();   /* düzenlenen satır vurgulansın */

    /* Telefonda form tablonun yukarısında kaldığı için ekranı forma kaydırıyoruz. */
    el.formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.amount.focus();
    el.amount.select();   /* tutarın üstüne direkt yazılabilsin */
  }

  function stopEdit() {
    editingId = null;
    el.form.reset();
    setDateField(todayISO());
    el.formTitle.textContent = 'Gelir Ekle';
    el.submit.textContent = 'Geliri Kaydet';
    el.cancelEdit.hidden = true;
    hideError();
    render();
  }

  el.cancelEdit.addEventListener('click', stopEdit);

  /* --- Kur penceresi --- */
  el.fxBtn.addEventListener('click', openFx);
  el.fxClose.addEventListener('click', closeFx);

  /* Perdeye (pencerenin dışına) tıklayınca kapansın.
     ev.target === el.fxOverlay kontrolü şart: pencerenin İÇİNE tıklandığında da
     olay yukarı doğru perdeye ulaşır; bu kontrol olmasa pencere kendi kendine kapanırdı. */
  el.fxOverlay.addEventListener('click', function (ev) {
    if (ev.target === el.fxOverlay) closeFx();
  });

  /* Esc tuşu açık olanı kapatsın (klavye kullanıcısının beklediği davranış).
     Sıra önemli: en üstte duran pencere önce kapanır, menüler en sonda. */
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!el.confirmOverlay.hidden) closeConfirm();
    else if (!el.fxOverlay.hidden) closeFx();
    else if (!el.backupOverlay.hidden) closeBackup();
    else closeMenus();
  });

  /* Görüntüleme para birimi değişti: her şey yeniden hesaplanır. */
  el.base.addEventListener('change', function () {
    uygula('taban-degistir', { para_birimi: el.base.value });
  });

  /* Kur kutusuna her yazışta çalışır ('input' olayı).
     Geçersiz değerde (boş, 0, eksi) hiçbir şey yapmıyoruz; kullanıcı yazmayı
     bitirince geçerli hale gelecek. render() yerine sadece etkilenen iki bölümü
     yeniliyoruz, çünkü render() kur kutusunu da yeniden çizip imleci bozabilir. */
  el.rateList.addEventListener('input', function (ev) {
    var input = ev.target.closest('input[data-code]');
    if (!input) return;

    var value = parseFloat(String(input.value).replace(',', '.'));
    if (!isFinite(value) || value <= 0 || value > MAX_RATE) return;

    /* Ekranda anında görünsün diye önce yereldeki değeri güncelliyoruz. */
    state.rates[input.dataset.code] = value;
    renderStats();
    renderList();

    /* Sunucuya her tuş vuruşunda istek atmıyoruz: yazma bitene kadar bekliyoruz.
       Buna "geciktirme" (debounce) denir; yarım yazılmış değerler kaydedilmez. */
    clearTimeout(kurZamanlayici);
    var kod = input.dataset.code;
    kurZamanlayici = setTimeout(function () {
      sunucu('kur-guncelle', { para_birimi: kod, deger: value }).catch(sunucuHatasi);
    }, 600);
  });

  var kurZamanlayici = null;

  /* --- Kategori ekleme formu --- */
  function openCatForm() {
    el.catForm.hidden = false;
    el.catError.hidden = true;
    el.catName.focus();
  }
  function closeCatForm() {
    el.catForm.hidden = true;
    el.catError.hidden = true;
    el.catName.value = '';
  }

  /* Kategori listesindeki tıklamalar. Tek dinleyici, iki iş:
     "+ Kategori ekle" düğmesi ve rozetlerin silme çarpıları.
     closest(): tıklanan yerden yukarı doğru çıkıp aranan elemanı bulur
     (kullanıcı düğmenin içindeki yazıya tıklamış olabilir). */
  el.catList.addEventListener('click', function (ev) {
    if (ev.target.closest('#addCatBtn')) {
      openCatForm();
      return;
    }

    var del = ev.target.closest('.cat__del');
    if (!del) return;

    var id = del.dataset.id;
    var cat = catById(id);
    if (!cat) return;

    /* İçinde kayıt olan kategori silinmez: silinirse kayıtlar sahipsiz kalır. */
    var count = entryCount(id);
    if (count > 0) {
      el.catError.textContent = cat.name + ' kategorisinde ' + count +
        ' kayıt var. Önce bu kayıtları silin veya filtreleyip düzenleyin.';
      el.catError.hidden = false;
      return;
    }

    /* Silmeyi sunucu yapıyor. Kategoride kayıt varsa veritabanındaki yabancı
       anahtar kuralı silmeyi reddediyor ve buraya hata olarak dönüyor. */
    sunucu('kategori-sil', { id: id })
      .then(function () {
        el.catError.hidden = true;
        return defteriYukle().then(render);
      })
      .catch(function (err) {
        el.catError.textContent = err.message;
        el.catError.hidden = false;
      });
  });

  el.catForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    addCategory(el.catName.value).then(function (cat) {
      if (!cat) return;               /* hata mesajı addCategory içinde gösterildi */
      el.catName.value = '';
      el.category.value = cat.id;     /* yeni kategori formda hazır seçili gelsin */
      el.catName.focus();             /* arka arkaya kategori eklemek kolay olsun */
    });
  });

  el.catCancel.addEventListener('click', closeCatForm);
  el.catName.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeCatForm();
  });

  /* Öneri düğmeleri: adı hazır kategori ekler. */
  el.suggest.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.suggest__btn');
    if (!btn) return;
    addCategory(btn.dataset.name).then(function (cat) {
      if (cat) el.category.value = cat.id;
    });
  });

  /* --- Kayıt silme ---
     Burada onay penceresi (confirm) YOK. Sebep: bu sayfa kısıtlanmış bir
     çerçevede açıldığında confirm çalışmaz, sessizce "hayır" döner ve silme
     hiç gerçekleşmez. Onun yerine: hemen sil, altta 8 saniye "Geri al" göster. */
  el.body.addEventListener('click', function (ev) {
    /* Önce düzenle düğmesine bakıyoruz: onun sınıfı "del edit" olduğu için
       aşağıdaki .del kontrolüne de takılırdı, yani sırayı bozarsak silerdi. */
    var editBtn = ev.target.closest('.edit');
    if (editBtn) {
      startEdit(editBtn.dataset.id);
      return;
    }

    var btn = ev.target.closest('.del');
    if (!btn) return;

    var id = btn.dataset.id;
    var item = state.entries.filter(function (e) { return e.id === id; })[0];
    if (!item) return;

    /* Silinen kayıt o an düzenleniyorsa formu normale döndür. */
    if (editingId === id) {
      editingId = null;
      el.form.reset();
      setDateField(todayISO());
      el.formTitle.textContent = 'Gelir Ekle';
      el.submit.textContent = 'Geliri Kaydet';
      el.cancelEdit.hidden = true;
    }

    /* Sunucu kaydı gerçekten silmiyor, "silindi" diye işaretliyor.
       Geri al, aynı kaydın işaretini kaldırıyor. */
    sunucu('kayit-sil', { id: id })
      .then(function (sonuc) {
        return defteriYukle().then(function () {
          render();
          showUndo(money(item.amount, item.currency) + ' tutarındaki kayıt silindi',
                   { type: 'ids', ids: sonuc.ids });
        });
      })
      .catch(sunucuHatasi);
  });

  /* Kategori filtresi. Sadece listeyi yeniliyoruz: özet kartları ve pasta
     her zaman TÜM kayıtları gösterir, filtre onları etkilemez. */
  el.filter.addEventListener('change', function () {
    activeFilter = el.filter.value;
    renderList();
  });

  /* Tüm kayıtları sil (yine geri alınabilir). */
  el.clearAll.addEventListener('click', function () {
    if (state.entries.length === 0) return;

    /* Geri dönüşü zor bir iş: önce onay soruyoruz, sonra da geri alma şeridi çıkıyor. */
    askConfirm(
      'Tüm kayıtlar silinsin mi?',
      state.entries.length + ' gelir kaydının tamamı silinecek. Kategoriler ve kurlar kalır. ' +
      'Sildikten sonra 8 saniye boyunca "Geri al" ile dönebilirsiniz.',
      'Evet, hepsini sil',
      function () {
        sunucu('tumunu-sil')
          .then(function (sonuc) {
            return defteriYukle().then(function () {
              render();
              showUndo(sonuc.ids.length + ' kayıt silindi', { type: 'ids', ids: sonuc.ids });
            });
          })
          .catch(sunucuHatasi);
      }
    );
  });

  /* ==========================================================================
     BÖLÜM 10 — YEDEK AL / GERİ YÜKLE
     --------------------------------------------------------------------------
     Defteri okunabilir düz metne çeviriyoruz. Amaç: dosyayı Not Defteri'nde
     açan biri ne yazdığını anlasın, istersek elle bile düzeltebilsin.

     Biçim şöyle:

       GELİR DEFTERİ — YEDEK
       Tarih: 27.08.2026
       Görüntüleme birimi: TRY

       # KURLAR
       USD = 41

       # KATEGORİLER
       Nakit Satış | renk 1

       # KAYITLAR
       # tarih | kategori | tutar | birim | kur | açıklama
       2026-08-27 | Nakit Satış | 1500.00 | TRY | 1 | Öğle satışı

     Kurallar: "#" ile başlayan satırlar başlık/açıklamadır, alanlar "|" ile
     ayrılır. Okuması da yazması da kolay olsun diye JSON yerine bunu seçtik.
     ========================================================================== */

  /* Metinde "|" işareti alan ayıracı olduğu için, kullanıcının yazdığı metnin
     içinde "|" varsa onu "/" yapıyoruz; yoksa geri okurken sütunlar kayar. */
  function temizle(text) {
    return String(text || '').replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
  }

  /* state -> metin */
  function buildBackupText() {
    var d = new Date();
    var satirlar = [];

    satirlar.push('GELİR DEFTERİ — YEDEK');
    satirlar.push('Tarih: ' + formatDate(todayISO()) + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
    satirlar.push('Görüntüleme birimi: ' + state.base);
    satirlar.push('');

    satirlar.push('# KURLAR');
    CURRENCIES.forEach(function (c) {
      if (c.code !== 'TRY') satirlar.push(c.code + ' = ' + state.rates[c.code]);
    });
    satirlar.push('');

    satirlar.push('# KATEGORİLER');
    state.categories.forEach(function (c) {
      satirlar.push(temizle(c.name) + ' | renk ' + c.slot);
    });
    satirlar.push('');

    satirlar.push('# KAYITLAR');
    satirlar.push('# tarih | kategori | tutar | birim | kur | açıklama');

    /* Kayıtları eskiden yeniye yazıyoruz: dosyayı açan kişi defter gibi okusun. */
    state.entries.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : a.createdAt - b.createdAt);
    }).forEach(function (e) {
      var cat = catById(e.categoryId);
      satirlar.push([
        e.date,
        temizle(cat ? cat.name : 'Silinen kategori'),
        e.amount.toFixed(2),          /* 1500 -> "1500.00", her satır aynı düzende */
        e.currency,
        e.rate,
        temizle(e.note)
      ].join(' | '));
    });

    satirlar.push('');
    satirlar.push('# Toplam ' + state.entries.length + ' kayıt.');

    return satirlar.join('\n');
  }

  /* metin -> state parçaları. Anlaşılmazsa hata fırlatır (throw), çağıran yakalar. */
  function parseBackupText(text) {
    var kategoriler = [];
    var kayitlar = [];
    var kurlar = defaultRates();
    var base = state.base;
    var bolum = '';       /* o an hangi başlığın altındayız */
    var slotSayaci = 0;

    /* Adı verilen kategoriyi bulur; yoksa oluşturur. Böylece kayıt sahipsiz kalmaz. */
    function kategoriBul(ad) {
      var bulunan = kategoriler.filter(function (c) { return normalize(c.name) === normalize(ad); })[0];
      if (bulunan) return bulunan;
      slotSayaci++;
      var yeni = { id: uid('c'), name: ad, slot: slotSayaci };
      kategoriler.push(yeni);
      return yeni;
    }

    String(text).split('\n').forEach(function (ham) {
      var satir = ham.trim();
      if (!satir) return;                       /* boş satırları atla */

      /* Başlık satırı mı? "# KURLAR" gibi. */
      if (satir.charAt(0) === '#') {
        var baslik = satir.replace(/#/g, '').trim().toLocaleLowerCase('tr-TR');
        if (baslik.indexOf('kur') === 0) bolum = 'kur';
        else if (baslik.indexOf('kateg') === 0) bolum = 'kategori';
        else if (baslik.indexOf('kay') === 0) bolum = 'kayit';
        /* diğer # satırları sadece açıklamadır, atlanır */
        return;
      }

      /* Henüz bir başlık görmediysek buradaki satırlar üst bilgidir. */
      if (!bolum) {
        var ikiNokta = satir.indexOf(':');
        if (ikiNokta > -1) {
          var deger = satir.slice(ikiNokta + 1).trim().toUpperCase();
          if (kurlar[deger]) base = deger;      /* "Görüntüleme birimi: USD" */
        }
        return;
      }

      if (bolum === 'kur') {
        /* "USD = 41" */
        var parcalar = satir.split('=');
        if (parcalar.length < 2) return;
        var kod = parcalar[0].trim().toUpperCase();
        var deger2 = parseFloat(parcalar[1].replace(',', '.'));
        if (kurlar[kod] && isFinite(deger2) && deger2 > 0) kurlar[kod] = deger2;
        return;
      }

      if (bolum === 'kategori') {
        /* "Nakit Satış | renk 1" */
        var k = satir.split('|');
        var ad = k[0].trim();
        if (!ad) return;
        var kategori = kategoriBul(ad);
        var renk = k[1] ? parseInt(String(k[1]).replace(/\D/g, ''), 10) : NaN;
        if (isFinite(renk) && renk >= 1) kategori.slot = renk;
        return;
      }

      /* bolum === 'kayit' : "2026-08-27 | Nakit Satış | 1500.00 | TRY | 1 | not" */
      var a = satir.split('|');
      if (a.length < 3) return;

      var tarih = a[0].trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return;    /* tarihi bozuk satırı atla */

      var tutar = parseFloat(String(a[2]).replace(',', '.'));
      if (!isFinite(tutar) || tutar <= 0 || tutar > MAX_AMOUNT) return;   /* sınırı aşan satırı atla */

      var birim = (a[3] || 'TRY').trim().toUpperCase();
      if (!kurlar[birim]) birim = 'TRY';

      var kur = parseFloat(String(a[4] || '1').replace(',', '.'));
      if (!isFinite(kur) || kur <= 0) kur = 1;

      kayitlar.push({
        id: uid('e'),
        amount: Math.round(tutar * 100) / 100,
        currency: birim,
        rate: kur,
        categoryId: kategoriBul(a[1].trim() || 'Diğer').id,
        date: tarih,
        note: a.slice(5).join('|').trim(),      /* nottaki fazladan | varsa geri birleştir */
        createdAt: Date.now() + kayitlar.length /* sırayı koru */
      });
    });

    if (!kategoriler.length && !kayitlar.length) {
      throw new Error('Bu metinde defter bulunamadı.');
    }

    kurlar.TRY = 1;
    return { categories: kategoriler, entries: kayitlar, rates: kurlar, base: kurlar[base] ? base : 'TRY' };
  }

  /* Okunan defteri uygular. Eskisini saklayıp "Geri al" şeridi gösteriyoruz:
     yanlış dosya yüklendiyse tek tıkla eski hale dönülür. */
  function applyBackup(yeni) {
    var onceki = JSON.parse(JSON.stringify(state));   /* derin kopya: eski hali dondur */

    /* Sunucu tarafında bu işlem tek parça (transaction): defterin tamamı
       değişiyor, araya hata düşerse hiçbiri uygulanmıyor. */
    sunucu('yedek-yukle', yeni)
      .then(defteriYukle)
      .then(function () {
        stopEdit();        /* düzenleme modundaysak çık + ekranı yenile */
        closeBackup();
        showUndo(state.entries.length + ' kayıt geri yüklendi',
                 { type: 'state', prev: onceki });
      })
      .catch(function (err) {
        el.backupError.textContent = 'Yükleme başarısız: ' + err.message;
        el.backupError.hidden = false;
      });
  }

  /* Metni okuyup uygular; hata olursa pencerede kırmızı mesaj gösterir. */
  function importFromText(text) {
    try {
      applyBackup(parseBackupText(text));
    } catch (err) {
      el.backupError.textContent = 'Yükleme başarısız: ' + err.message +
        ' Metnin tamamını, başlık satırlarıyla birlikte yapıştırdığınızdan emin olun.';
      el.backupError.hidden = false;
    }
  }

  function openBackup() {
    el.backupText.value = buildBackupText();   /* pencere her açıldığında güncel metin */
    el.backupError.hidden = true;
    el.backupOverlay.hidden = false;
    el.backupText.focus();
  }

  function closeBackup() {
    el.backupOverlay.hidden = true;
    el.topDots.focus();
  }

  el.backupBtn.addEventListener('click', openBackup);
  el.backupClose.addEventListener('click', closeBackup);
  el.backupOverlay.addEventListener('click', function (ev) {
    if (ev.target === el.backupOverlay) closeBackup();
  });
  el.refreshBackupBtn.addEventListener('click', function () {
    el.backupText.value = buildBackupText();
    el.backupError.hidden = true;
  });

  /* --- .txt olarak indirme ---
     İki yol deniyoruz, çünkü sayfa iki farklı yerde çalışabiliyor:

     1) claude.ai üzerinde yayınlanmış hâli kısıtlı bir çerçevede açılır ve
        sayfanın kendi başlattığı indirme engellenir. Orada dosyayı kaydetmek
        için görüntüleyicinin "downloads" yeteneğini kullanıyoruz:
        claude.use('downloads') bize bir kaydetme fonksiyonu veriyor, kullanıcıya
        onay kutusu çıkıyor ve dosya öyle iniyor.
     2) Dosyayı kendi bilgisayarınızda açtığınızda (index.html'e çift tıklayınca)
        böyle bir kısıt yok: metni Blob'a (bellekteki geçici dosya) koyup görünmez
        bir bağlantıya tıklatıyoruz.

     \ufeff (BOM) = dosyanın başına konan görünmez işaret. Not Defteri ve Excel'in metni UTF-8
     olarak açıp Türkçe karakterleri bozmaması için dosyanın başına konur. */
  function dosyaAdi() {
    return 'gelir-defteri-' + todayISO() + '.txt';
  }

  /* Klasik yol: tarayıcının kendi indirme mekanizması. */
  function klasikIndir(metin) {
    try {
      var blob = new Blob(['\ufeff' + metin], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = dosyaAdi();
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* Adresi bir süre sonra serbest bırak, yoksa bellekte kalır. */
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (err) { /* aşağıdaki not zaten çıkış yolunu söylüyor */ }

    el.backupHint.textContent =
      'İndirme başlamadıysa "Panoya kopyala" deyip metni bir .txt dosyasına yapıştırın.';
  }

  el.downloadBtn.addEventListener('click', function () {
    var metin = el.backupText.value;

    /* Yayınlanmış sayfada mıyız? window.claude varsa evet. */
    if (window.claude && typeof window.claude.use === 'function') {
      el.backupHint.textContent = 'Kaydetme izni isteniyor…';

      window.claude.use('downloads').then(function (downloads) {
        if (!downloads) { klasikIndir(metin); return; }   /* yetenek yoksa klasik yola dön */

        return downloads.save({ filename: dosyaAdi(), data: '\ufeff' + metin })
          .then(function () {
            el.backupHint.textContent = 'Dosya kaydedildi: ' + dosyaAdi();
          })
          .catch(function (err) {
            /* 'declined' = kullanıcı onay kutusunda "hayır" dedi; ısrar etmiyoruz. */
            if (err && err.code === 'declined') {
              el.backupHint.textContent = 'Kaydetme iptal edildi.';
            } else {
              klasikIndir(metin);
            }
          });
      }).catch(function () { klasikIndir(metin); });

    } else {
      klasikIndir(metin);
    }
  });

  /* --- Panoya kopyalama ---
     Önce modern yolu deniyoruz; izin verilmezse eski yöntemle (metni seçip
     kopyala komutu) hallediyoruz. Eski yöntem her yerde çalışır. */
  el.copyBtn.addEventListener('click', function () {
    var text = el.backupText.value;

    function eskiYol() {
      el.backupText.select();
      try { document.execCommand('copy'); } catch (e) { /* yapacak bir şey yok */ }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        el.copyBtn.textContent = 'Kopyalandı';
        setTimeout(function () { el.copyBtn.textContent = 'Panoya kopyala'; }, 1600);
      }).catch(eskiYol);
    } else {
      eskiYol();
    }
  });

  /* --- Kutudaki metinden yükleme --- */
  el.importTextBtn.addEventListener('click', function () {
    importFromText(el.backupText.value);
  });

  /* --- Dosyadan yükleme ---
     FileReader dosyayı okur; okuma bitince onload çalışır (dosya okuma anlıktır
     ama yine de "bittiğinde şunu yap" şeklinde yazılır). */
  el.importFile.addEventListener('change', function () {
    var file = el.importFile.files && el.importFile.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      el.backupText.value = String(reader.result || '').replace(/^\ufeff/, '');  /* BOM'u at */
      importFromText(el.backupText.value);
    };
    reader.onerror = function () {
      el.backupError.textContent = 'Dosya okunamadı.';
      el.backupError.hidden = false;
    };
    reader.readAsText(file, 'utf-8');

    /* Aynı dosyayı ikinci kez seçebilmek için kutuyu sıfırla
       (aynı dosya tekrar seçilirse change olayı yoksa çalışmaz). */
    el.importFile.value = '';
  });

  /* ==========================================================================
     BÖLÜM 11 — GERİ ALMA ŞERİDİ
     --------------------------------------------------------------------------
     İki tür geri alma var:
       { type: 'entries', items: [...] }  -> silinen kayıtları geri ekler
       { type: 'state',   prev: {...} }   -> defterin tamamını eski haline döndürür
     ========================================================================== */
  var undoTimer = null;      /* setTimeout'un kimliği; iptal edebilmek için tutuyoruz */
  var undoPayload = null;    /* yukarıdaki iki kutudan biri */

  function showUndo(message, payload) {
    undoPayload = payload;
    el.toastText.textContent = message;
    el.toast.hidden = false;

    /* Önceki sayaç varsa iptal et, yoksa eski sayaç yeni şeridi erken kapatır. */
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 8000);
  }

  function hideUndo() {
    clearTimeout(undoTimer);
    undoPayload = null;
    el.toast.hidden = true;
  }

  el.undoBtn.addEventListener('click', function () {
    if (!undoPayload) return;

    if (undoPayload.type === 'state') {
      /* Yedek yükleme geri alınıyor: defterin eski halini sunucuya geri yazıyoruz. */
      sunucu('yedek-yukle', undoPayload.prev)
        .then(defteriYukle).then(render).then(hideUndo).catch(sunucuHatasi);
    } else {
      /* Silinen kayıtların "silindi" işaretini kaldırıyoruz. */
      sunucu('kayit-geri-al', { ids: undoPayload.ids })
        .then(defteriYukle).then(render).then(hideUndo).catch(sunucuHatasi);
    }
  });

  /* ==========================================================================
     BÖLÜM 12 — BAŞLANGIÇ
     Sayfa açılır açılmaz çalışan iki satır: tarihi bugüne ayarla ve ekranı çiz.
     ========================================================================== */
  setDateField(todayISO());

  /* Defteri sunucudan çekip ekranı çiz. Sayfa açılışında yapılan tek iş bu. */
  defteriYukle()
    .then(render)
    .catch(function (err) {
      showError('Veritabanına ulaşılamadı: ' + err.message +
        ' XAMPP Control Panel\'de Apache ve MySQL çalışıyor mu?');
      console.error(err);
    });
})();

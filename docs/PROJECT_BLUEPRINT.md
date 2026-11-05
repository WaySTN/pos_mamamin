# PROJECT BLUEPRINT — MamaMin POS 1.0

**Dokumen sumber kebenaran untuk pembangunan aplikasi oleh AI Agent Antigravity**  
**Repository:** `pos_mamamin`  
**Target:** aplikasi kasir **Android APK**, offline-first, satu HP kasir, SQLite lokal, printer thermal Bluetooth 58 mm.  
**Bahasa:** Indonesia  
**Status:** spesifikasi MVP; belum merupakan laporan implementasi yang telah selesai.  
**Pembaruan dokumen:** 5 November 2026 (rancangan awal).

> **Instruksi pembuka untuk agent:** baca `AGENTS.md` dan file ini secara utuh; inspeksi repository sebelum melakukan apa pun. **Jangan** membuat ulang repo atau menghapus file Markdown yang telah ada. Kerjakan setiap fase sampai diuji, bukan sekadar sampai UI tampak jadi. Jika tidak memiliki perangkat/printer/keystore, laporkan blocker secara eksplisit dan jangan mengklaim APK final telah teruji.

---

## 1. Tujuan, masalah, dan ukuran keberhasilan

Kedai **MamaMin** membutuhkan aplikasi untuk menggantikan pencatatan manual dan menghindari langganan software kasir bulanan. Saat ini kebutuhan yang telah diketahui dari owner adalah:

- Input transaksi penjualan dan **cetak struk per transaksi** menggunakan printer thermal yang bersedia dibeli owner.
- Pantau **pendapatan/omzet harian** dan **akumulasi bulanan** pada HP kasir yang sama.
- **Catat pengeluaran** agar pemilik mempunyai gambaran arus operasional sederhana.
- Katalog berisi mie ayam dengan beberapa pilihan, mie yamin, **seblak prasmanan**, jajanan, dan minuman.
- Perangkat kasir ditargetkan **satu HP Android**; owner **tidak perlu memantau real-time dari HP lain**.

### 1.1 Sasaran kualitas

| Sasaran | Acceptance criteria operasional |
| --- | --- |
| Cepat | Kasir dapat memilih produk, kuantitas, metode pembayaran, simpan transaksi, dan memulai cetak tanpa navigasi panjang. |
| Offline | Transaksi dan laporan tetap berfungsi dengan Wi-Fi dan data seluler dimatikan. |
| Akurat | Total belanja, kembalian, snapshot harga, pembatalan, dan laporan mengikuti aturan di §4, §8–11. |
| Andal | Kegagalan printer **tidak** menggandakan transaksi; aplikasi tertutup/terbuka tidak menghilangkan data tersimpan. |
| Aman | Ada backup di luar HP dan restore yang benar-benar diuji; data bisnis tidak bocor lewat repo/log. |
| Praktis | Satu codebase React + Capacitor menjadi APK yang bisa diinstal langsung melalui USB/sideload. |
| Hemat | Tidak ada biaya server database/hosting atau langganan software untuk fungsi inti; biaya printer, kertas, perangkat, perawatan tetap ada. |

### 1.2 Definisi yang konsisten

- **Omzet**: jumlah `grand_total_rupiah` transaksi `PAID` dalam periode; transaksi `VOID` dikecualikan.
- **Pengeluaran tercatat**: penjumlahan expense `ACTIVE` pada tanggal bisnis terpilih.
- **Selisih operasional sederhana** = omzet − pengeluaran tercatat; **bukan laba bersih**, bukan otomatis saldo kas.
- **Transaksi tersimpan**: penjualan dan semua item/options telah committed secara atomik di SQLite.
- **Struk terkirim**: bytes ESC/POS berhasil dikirim melalui koneksi printer (belum membuktikan kertas fisik keluar).
- **Tanggal bisnis**: tanggal kalender dalam `Asia/Jakarta` (`YYYY-MM-DD`); awal hari **00:00 WIB** untuk MVP. Owner belum meminta pola *shift* yang melewati tengah malam.
- **Payment QRIS**: kasir memverifikasi pembayaran pada layanan QRIS eksternal lalu menekan konfirmasi. Tidak ada integrasi/API bank atau verifikasi pembayaran otomatis di app.

---

## 2. Keputusan arsitektur yang sudah disepakati

| Bidang | Pilihan MVP | Kenapa |
| --- | --- | --- |
| Target | **Android APK**, dipasang di satu HP kasir | Paling ekonomis bila HP sudah tersedia; dapat bekerja offline. |
| UI | **React + TypeScript + Vite** | Familiar dengan pengembang, cepat untuk UI POS. |
| Styling | **Tailwind CSS** | UI mobile yang konsisten tanpa framework berat. |
| Native runtime | **Capacitor Android** | Mengemas React ke APK dan memanggil plugin Android native. |
| Penyimpanan | **SQLite native lokal** via `@capacitor-community/sqlite` | Tanpa server; transaksi relasional ACID. |
| Print | **Bluetooth Classic SPP + ESC/POS 58 mm** | Target printer thermal Android; harus dibuktikan melalui pengujian fisik. |
| Backup | Ekspor *full backup* ke file di **luar HP kasir** | Kegagalan HP/uninstall tidak boleh menghilangkan seluruh riwayat. |
| Hosting/API/cloud | **Tidak ada pada MVP** | Owner tidak membutuhkan pemantauan dari perangkat lain. |
| Sistem pembayaran | Tunai + QRIS **manual** | Tidak perlu payment gateway. |
| Zona waktu | **Asia/Jakarta** | Konteks operasional kedai; laporan tanggal lokal konsisten. |

**Bukan Flutter/React Native.** UI React berada dalam WebView native milik Capacitor. SQLite dan Bluetooth mengakses Android melalui native bridge, **bukan** akses browser murni. Browser preview hanya untuk tampilan/logika yang tidak native; pengetesan database/print dilakukan pada APK perangkat nyata.

### 2.1 Prinsip offline-first

1. Seluruh ketergantungan yang diperlukan untuk checkout disertakan dalam APK; tidak mengambil UI/CSS/JS dari CDN saat runtime.
2. Tidak ada panggilan internet pada jalur menyimpan transaksi, menghitung report, atau print.
3. Tanggal bisnis dihitung lokal. Apabila jam HP salah, aplikasi tidak punya sumber waktu server untuk memverifikasinya; tampilkan/ingatkan owner untuk menjaga waktu otomatis perangkat.
4. Database terletak di storage privat aplikasi Android, **bukan** file terbuka di folder Download.
5. Tidak melakukan `clear`, reset, atau migrasi destruktif saat startup. Berikan error yang dapat dipahami bila inisialisasi gagal.

---

## 3. Scope MVP dan non-goals

### 3.1 Wajib ada dalam 1.0

| Modul | Detail minimum |
| --- | --- |
| **Kasir** | Tab/kategori, pencarian, produk aktif, keranjang, tambah/kurangi qty, catatan opsional, opsi/topping jika berlaku, subtotal, total. |
| **Checkout** | Pilih CASH atau QRIS; tunai input uang diterima dan hitung kembalian; QRIS wajib klik konfirmasi setelah kasir memverifikasi di luar app. |
| **Penyimpanan transaksi** | ID stabil, nomor unik, snapshot, header+item+modifier, timestamp/tanggal bisnis, status `PAID`; satu operasi database atomik. |
| **Riwayat** | Urutan terbaru, filter tanggal, detail transaksi, metode bayar, status, cetak ulang, batalkan dengan alasan. |
| **Menu** | CRUD kategori/produk/opsi, harga, status aktif/habis, urutan tampil; produk nonaktif tidak muncul saat memilih tetapi tetap ada di histori. |
| **Seblak** | Dukungan skema kombinasi komponen dengan harga per opsi dan qty, **setelah harga/aturan owner terkonfirmasi**. |
| **Print** | Pilih perangkat Bluetooth paired, simpan identitas printer, tes cetak, struk, error/retry/reprint tanpa duplikasi penjualan. |
| **Pengeluaran** | Form tambah, daftar per tanggal, kategori dan keterangan; koreksi melalui pembatalan expense dan input ulang untuk jejak audit sederhana. |
| **Laporan** | Omzet/jumlah transaksi, metode CASH/QRIS, pengeluaran, selisih sederhana, produk terlaris, rentang harian/bulanan. |
| **Backup/restore** | Ekspor backup lengkap, bagikan/simpan ke luar app, validasi, konfirmasi, restore, uji pemulihan dan migrasi data. |
| **Pengaturan** | Identitas kedai pada struk, printer, versi app, backup/restore, pengingat backup. |

### 3.2 Tidak dibuat dalam MVP

Login cloud; akun pegawai multi-role; sinkronisasi internet; banyak HP kasir aktif; stok bahan, resep/HPP; penggajian; pemesanan online; diskon/promosi rumit; split bill; refund parsial; loyalty point; printer kitchen; dashboard web owner real-time; gateway QRIS otomatis; integration marketplace; notifikasi WhatsApp otomatis; akuntansi/tax reporting lengkap.

**Aturan anti-scope-creep:** jangan membuat modul hanya karena mudah dihasilkan AI. Catat kebutuhan ekspansi di backlog, tetapi jangan merusak waktu pengerjaan core.

### 3.3 Asumsi dan pending decision

Beberapa keputusan **belum** pernah dikonfirmasi owner; harus tampak di daftar §20. Terutama metode harga seblak prasmanan, topping dan harga aktual, pilihan printer fisik, identitas alamat pada struk, apakah semua varian menu tersedia, serta aturan operasional jika ada pesanan dibatalkan setelah pembayaran. Desain skema boleh dibuat fleksibel, namun **jangan mengarang kebijakan usaha**.

---

## 4. Aturan bisnis inti

### 4.1 Item dan harga

1. Produk biasa punya `base_price_rupiah` tetap (contoh Mie Ayam, Es Teh).
2. Produk yang memiliki opsi/topping dapat menambahkan opsi berharga per unit. Harga per porsi = harga dasar produk + jumlah `(harga opsi × kuantitas opsi per porsi)`.
3. Harga 0 boleh hanya jika benar-benar produk/opsi gratis yang disetujui; tidak boleh negatif.
4. Jika dua porsi Seblak mempunyai topping berbeda, masukkan **dua line item** yang masing-masing mempunyai snapshot opsi sendiri; jangan mencampur topping antar porsi.
5. Produk yang dinonaktifkan tidak dapat dijual sebagai pesanan baru, tetapi detail penjualan lama tetap terbaca.
6. Tidak ada harga otomatis dari poster. Harga yang dicontohkan di §5 adalah **input awal untuk dikonfirmasi**, bukan data final yang diam-diam dianggap benar.

### 4.2 Transaksi/pembayaran

1. Pilih item → hitung total → konfirmasi pembayaran → simpan SQLite **dalam satu database transaction** → baru coba print.
2. `CASH`: `paid_amount_rupiah >= grand_total_rupiah`, `change_amount_rupiah = paid - total`; kasir boleh memasukkan angka tepat.
3. `QRIS`: aplikasi memberi instruksi kasir untuk mengecek aplikasi/QRIS provider terlebih dahulu. Sesudah kasir konfirmasi, catat `paid_amount_rupiah = grand_total_rupiah`, `change_amount_rupiah = 0`.
4. Jangan menyimpan transaksi penjualan sebagai `PAID` hanya karena tombol QRIS dipilih, sebelum kasir menyatakan pembayaran telah diterima.
5. Blok submit ganda selama proses simpan; gunakan UUID transaksi yang dibuat untuk satu usaha checkout dan cek idempotensi bila proses diulang. Jangan membuat nomor baru ketika mencetak ulang.
6. Nomor struk format contoh `MM-YYYYMMDD-0001` unik untuk masing-masing tanggal bisnis; nomor dialokasikan secara atomik. Nomor boleh memiliki celah jika suatu transaksi memang dibatalkan atau ada kebijakan perubahan, tetapi **tidak** boleh duplikat.
7. Simpan hasil harga dan nama dalam snapshot, sehingga perubahan katalog tidak mengubah histori.
8. Tidak ada delete fisik transaksi PAID. Pembatalan mengubah status menjadi `VOID`, menyimpan waktu dan alasan; riwayat tetap terlihat. Alur pengembalian uang secara nyata di luar scope 1.0 dan perlu kebijakan owner sebelum diaktifkan di operasi produksi.
9. Jika print gagal, transaksi tetap tersimpan. Kasir melihat pesan dan tombol **Coba Cetak Lagi** dari transaksi yang sama.

### 4.3 Pengeluaran dan laporan

1. Pengeluaran memiliki tanggal bisnis, nominal integer positif, kategori, dan keterangan bebas (disarankan wajib agar berguna).
2. Salah input diperbaiki dengan menandai expense `VOID` dengan alasan lalu membuat expense baru; tidak menghapus histori diam-diam.
3. Pengeluaran berbeda dari nilai stok, HPP, beban akrual, atau aliran kas berdasarkan rekening. Jangan label hasil `omzet - pengeluaran` sebagai profit bersih.
4. Filter periode laporan bersumber dari transaksi dan expense berstatus valid, bukan total yang diakumulasi di state UI.
5. Jumlah transaksi = jumlah header transaksi `PAID`, **bukan** jumlah item terjual.

---

## 5. Katalog awal berdasarkan foto menu (BELUM FINAL)

Daftar ini membantu membuat kategori dan demo menggunakan contoh dari poster menu yang diberikan pengguna. **Agent tidak boleh menyajikannya sebagai harga resmi terkini hingga owner mengecek kembali**; seed boleh hanya untuk development dan harus jelas dapat diedit/hapus.

| Kategori | Contoh item terlihat | Harga pada foto | Status verifikasi |
| --- | --- | ---: | --- |
| Mie | Mie Ayam | Rp10.000 | Konfirmasi owner |
| Mie | Mie Ayam Telur | Rp13.000 | Konfirmasi owner |
| Mie | Mie Ayam Ceker | Rp13.000 | Konfirmasi owner |
| Mie | Mie Ayam Kepala | Rp13.000 | Konfirmasi owner |
| Mie | Mie Yamin | Rp10.000 | Konfirmasi owner |
| Minuman | Es Teh | Rp3.000 | Konfirmasi owner |
| Minuman | Es Jeruk | Rp5.000 | Konfirmasi owner |
| Minuman | Es Capcin (cappuccino cincau) | Rp5.000 | Konfirmasi owner |
| Minuman | Aneka Pop Ice / Milo / HiLo / Good Day | Rp5.000 (poster menyebut kelompok) | Nama varian perlu dikonfirmasi |
| Minuman | NutriSari | Rp3.000 (poster menyebut kelompok) | Pilihan rasa perlu dikonfirmasi |
| Jajanan | Aneka cilok (siomay, cilok, tahu) | Rp500/pcs pada foto | Satuan perlu dikonfirmasi |
| Jajanan | Cireng isi ayam | Rp1.000/pcs pada foto | Konfirmasi owner |
| Jajanan | Piscok | Rp1.000/pcs pada foto | Konfirmasi owner |
| Jajanan | Risol sayur/mayo | Rp1.000/pcs pada foto | Konfirmasi varian |
| Jajanan | Risol varian lain (mayo, 'mental' pada poster, cokelat, matcha, ayam pedas, ragout) | Rp3.000/pcs pada foto | **Penamaan dan overlap varian perlu dicek** |
| Seblak | Seblak prasmanan | **Belum ada harga/rule yang dapat diandalkan** | **BLOCKER sebelum konfigurasi produksi** |

> Jangan menafsirkan tulisan poster `500 AN`, `1000 AN`, dan `3000 AN` sebagai `Rp500.000` atau `Rp1.000.000`: konteksnya penulisan nominal per item yang perlu verifikasi. Jangan membuat seluruh menu jajanan dari satu grup harga tanpa struktur produk/opsi yang masuk akal.

### 5.1 Strategi master data

- `categories`: Mie, Seblak, Jajanan, Minuman (dapat diedit).
- `products`: item yang memiliki harga tetap, atau produk induk yang dapat dipilih opsi. Contoh `Mie Ayam Telur` dapat berupa produk terpisah karena poster memang menawarkannya sebagai satu menu harga tetap.
- `option_groups`/`options`: khusus modifier yang dipilih saat transaksi (mis. tambahan seblak), **bukan** semua varian harus dijadikan topping.
- `product_option_groups`: menghubungkan grup opsi dengan produk tertentu.
- `is_active` untuk sementara menonaktifkan produk; `is_available` untuk stok habis pada tampilan kasir tanpa mencatat inventori bahan.

---

## 6. Peta layar dan user flows

### 6.1 Navigasi mobile

Bottom navigation (atau pola navigasi yang setara) mempunyai empat menu:

1. **Kasir** — halaman default saat aplikasi dibuka.
2. **Riwayat** — daftar/detail transaksi + reprint/void.
3. **Laporan** — tab Harian/Bulanan atau filter tanggal.
4. **Lainnya** — Kelola Menu, Pengeluaran, Printer, Backup/Restore, Pengaturan.

Jangan meletakkan dashboard sebagai penghalang sebelum mulai transaksi.

### 6.2 Alur utama kasir

```text
Buka APK
   ↓
Kasir → pilih kategori/produk → isi qty/opsi/catatan → keranjang
   ↓
Konfirmasi total → pilih metode pembayaran
   ├─ CASH: input uang diterima; validasi ≥ total; tampilkan kembalian
   └─ QRIS: kasir verifikasi via layanan eksternal; tekan "Sudah Diterima"
   ↓
Simpan transaksi atomik ke SQLite (nomor + header + items + options)
   ├─ GAGAL: tetap di checkout; tampilkan error; jangan print/jangan klaim sukses
   └─ BERHASIL: tampilkan detail transaksi tersimpan
                            ↓
                Kirim ESC/POS ke printer (opsional jika printer offline)
                   ├─ sent → tampilkan "Terkirim ke printer; pastikan struk keluar"
                   └─ error/unknown → tampilkan Retry/Cetak Ulang
```

### 6.3 Alur tambahan

- **Riwayat → detail → Cetak Ulang:** mengambil data snapshot transaksi lama; **tidak** menulis transaksi penjualan baru. Beri label `SALINAN` agar kasir dapat membedakan struk ulang; jika transaksi `VOID`, cetakan harus jelas bertanda `DIBATALKAN` dan tidak boleh terlihat seperti struk penjualan sah.
- **Riwayat → Batalkan:** wajib tampilkan konfirmasi risiko + alasan. Transaksi `VOID` tetap ada, tidak ikut omzet.
- **Menu → Ubah Harga:** hanya memengaruhi transaksi mendatang.
- **Pengeluaran → Tambah:** simpan nominal/kategori/tanggal/catatan, langsung terlihat di laporan yang cocok.
- **Backup:** tampilkan waktu backup terakhir yang terverifikasi, lalu ekspor dan simpan di luar HP.
- **Restore:** pilih file → validasi + pratinjau metadata → konfirmasi eksplisit → safety backup → restore → verifikasi isi.

### 6.4 Error/edge states UX yang wajib

Katalog kosong; pencarian tidak ada hasil; produk tidak tersedia; qty nol; nominal tunai kurang; QRIS belum dikonfirmasi; database gagal; HP storage penuh; tanggal/waktu perangkat salah; printer belum dipasangkan; Bluetooth mati; izin ditolak; printer tidak merespons; status print tidak pasti; struk panjang; gagal backup; backup rusak; restore versi tidak cocok; migrasi database gagal; data UI habis karena transaksi lain belum tersimpan.

### 6.5 Kriteria desain visual

- Mobile portrait dulu, lebar acuan 360–430 CSS px, komponen menyentuh layar nyaman (target sentuh sekitar 44–48 CSS px).
- Header sederhana; nama aplikasi, menu navigasi singkat, kategori produk yang bisa digeser, tombol keranjang/checkout sticky di bawah.
- Rupiah sebagai `Rp10.000`, tanggal mis. `05 Nov 2026 19.30 WIB`; gunakan `Intl.NumberFormat('id-ID')` dan `Intl.DateTimeFormat` dengan `timeZone: 'Asia/Jakarta'`.
- Validasi inline dan status yang eksplisit; jangan memakai warna saja untuk status transaksi.
- Konfirmasi sebelum penghapusan/nonaktif, batal, dan restore.
- Jangan mewajibkan login internet; jika ingin mengamankan menu/pengeluaran di masa depan, PIN lokal adalah usulan tahap lanjut (belum kebutuhan owner).

---

## 7. Kontrak fitur (detail acceptance criteria)

| ID | Fitur | Diterima jika ... |
| --- | --- | --- |
| POS-01 | Katalog | Hanya produk aktif & tersedia muncul; kategori dan pencarian berfungsi offline. |
| POS-02 | Keranjang | Ubah qty/opsi per item tidak mengubah item lain; total diperbarui benar. |
| POS-03 | Pembayaran CASH | Input 20000 pada total 16000 menghasilkan kembalian 4000; input kurang ditolak. |
| POS-04 | Pembayaran QRIS | Tidak bisa finalize sebelum kasir klik konfirmasi; nilai bayar = total, kembalian 0. |
| POS-05 | Atomisitas | Jika insert item gagal, header + nomor gagal/rollback secara benar tanpa setengah transaksi. |
| POS-06 | Idempotensi | Tap checkout berulang/race tidak menduplikasi penjualan. |
| POS-07 | Riwayat | Setelah restart HP/aplikasi, transaksi lama tetap ada dan snapshot tak berubah. |
| POS-08 | VOID | Dibatalkan beralasan, tetap di histori, tidak ada di omzet/menu terlaris. |
| POS-09 | Print | Struk memuat data aktual; error print tidak menyentuh transaksi. |
| POS-10 | Reprint | Struk dari nomor sama, total histori tidak berubah. |
| POS-11 | Master menu | Edit harga/disable produk tidak mengubah nota penjualan lama. |
| POS-12 | Seblak | Harga sesuai rumus dan aturan owner; dua porsi topping berbeda tersimpan terpisah. |
| POS-13 | Pengeluaran | Tercatat pada tanggal yang benar; jika VOID tidak ikut total. |
| POS-14 | Laporan | Omzet harian dan bulanan = jumlah transaksi PAID yang sama; tanpa double count join detail. |
| POS-15 | Backup | File keluar sandbox HP, dapat diverifikasi dan dipulihkan di instalasi uji. |
| POS-16 | Android release | Signed APK terinstal, offline, printer teruji, update APK tidak menghapus data. |

---

## 8. Mesin harga: spesifikasi dan contoh perhitungan

### 8.1 Rumus resmi aplikasi

Untuk satu `transaction_item` dengan qty porsi `q`, harga dasar per porsi `p`, dan modifier `j` dengan harga `m_j` serta kuantitas per porsi `n_j`:

```text
unit_total_rupiah = p + Σ(m_j × n_j)
line_total_rupiah = q × unit_total_rupiah
subtotal_rupiah = Σ(line_total_rupiah semua item)
grand_total_rupiah = subtotal_rupiah   (MVP tidak ada pajak/diskon/biaya layanan)
CASH: change = paid_amount - grand_total
QRIS: paid_amount = grand_total, change = 0 (setelah konfirmasi manual)
```

Semua operand harus berupa **integer rupiah**, qty integer positif, dan perhitungan diuji terpisah dari React UI. Jangan memakai `parseFloat` uang atau menyimpan harga dalam string `Rp...` pada DB.

### 8.2 Contoh konfirmasi internal (bukan aturan seblak owner)

- `Mie Ayam` 1 × Rp10.000 + `Es Teh` 2 × Rp3.000 = Rp16.000.
- Tunai Rp20.000 → kembalian Rp4.000.
- `Seblak Original` hipotetis Rp5.000 + 2 bakso × Rp2.000 + 1 ceker × Rp3.000 = **Rp12.000 per porsi**; contoh ini **jangan digunakan sebagai harga riil**.
- Jika dua porsi memiliki topping berbeda, simpan dua row `transaction_items` berqty 1 untuk mempertahankan opsi masing-masing.

### 8.3 Pemodelan seblak yang belum dikonfirmasi

Terdapat beberapa kemungkinan aturan usaha: jumlah topping per item, paket tetap, atau berat. **Jangan menebak model seblak.** Rancang domain sehingga mode `FIXED` dan `BASE_PLUS_OPTIONS` bisa diimplementasikan; jika owner memilih berbasis berat, tambahkan desain khusus di fase keputusan, bukan menyisipkan asumsi diam-diam ke schema.

Untuk POC, kasir bisa menguji alur modifier dengan **data dummy berlabel contoh**, tetapi jangan mengaktifkan produk Seblak dalam katalog produksi sebelum nominal/aturan disahkan.

---

## 9. Database SQLite: desain relasional v1

### 9.1 Kaidah umum

- Koneksi SQLite native dari plugin; `PRAGMA foreign_keys = ON` pada koneksi (verifikasi dukungan plugin). Gunakan transaksi untuk setiap operasi multi-tabel.
- ID entitas: `TEXT` UUID v4 yang dihasilkan aplikasi. Gunakan uniqueness di SQLite sebagai lapis pengaman.
- Timestamp: `INTEGER` **epoch UTC milidetik**; tanggal bisnis: `TEXT` `YYYY-MM-DD` WIB.
- Uang: `INTEGER` rupiah dengan `CHECK` nilai yang relevan.
- `is_active`/`is_available`: `INTEGER` 0/1 dengan `CHECK`.
- Entitas bisnis historis di-*soft delete* atau dinonaktifkan agar FK/snapshot aman; jangan hapus transaksi asli.
- Simpan `schemaVersion` konsisten melalui mekanisme upgrade plugin/SQLite; migrasi diuji dari versi sebelumnya, bukan hanya instalasi bersih.
- Tidak boleh memakai `localStorage` untuk transaksi/uang. Local state boleh dipakai untuk keranjang yang **belum checkout**.

### 9.2 Relasi

```text
categories 1 ─── * products
products   * ─── * option_groups (via product_option_groups)
option_groups 1 ─── * options
transactions 1 ─── * transaction_items
products      1 ─── * transaction_items (referensi; detail tetap snapshot)
transaction_items 1 ─── * transaction_item_options
options       1 ─── * transaction_item_options (referensi; tetap snapshot)
transactions 1 ─── * print_attempts
expenses (standalone, masuk laporan melalui business_date)
daily_counters (alokasi nomor struk per business_date)
settings (key/value lokal)
```

### 9.3 SQL referensi untuk migrasi awal

> SQL berikut adalah **spesifikasi awal yang dapat dijadikan dasar migration**, bukan file SQL yang sudah dijalankan. Agent wajib memverifikasi terhadap versi SQLite/driver Android, menulis migration yang dapat diuji, dan memperhatikan `CHECK`, FK serta indeks.

```sql
CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  pricing_mode TEXT NOT NULL DEFAULT 'FIXED'
    CHECK (pricing_mode IN ('FIXED', 'BASE_PLUS_OPTIONS')),
  base_price_rupiah INTEGER NOT NULL DEFAULT 0 CHECK (base_price_rupiah >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE option_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  min_selected INTEGER NOT NULL DEFAULT 0 CHECK (min_selected >= 0),
  max_selected INTEGER CHECK (max_selected IS NULL OR max_selected >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  CHECK (max_selected IS NULL OR max_selected >= min_selected)
);

CREATE TABLE options (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES option_groups(id),
  name TEXT NOT NULL,
  unit_price_rupiah INTEGER NOT NULL CHECK (unit_price_rupiah >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_option_groups (
  product_id TEXT NOT NULL REFERENCES products(id),
  group_id TEXT NOT NULL REFERENCES option_groups(id),
  PRIMARY KEY (product_id, group_id)
);

CREATE TABLE daily_counters (
  business_date TEXT PRIMARY KEY NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_number TEXT NOT NULL UNIQUE,
  daily_sequence INTEGER NOT NULL CHECK (daily_sequence > 0),
  occurred_at_ms INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID','VOID')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','QRIS')),
  subtotal_rupiah INTEGER NOT NULL CHECK (subtotal_rupiah >= 0),
  grand_total_rupiah INTEGER NOT NULL CHECK (grand_total_rupiah >= 0),
  paid_amount_rupiah INTEGER NOT NULL CHECK (paid_amount_rupiah >= 0),
  change_amount_rupiah INTEGER NOT NULL CHECK (change_amount_rupiah >= 0),
  void_reason TEXT,
  voided_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  UNIQUE (business_date, daily_sequence),
  CHECK ((status = 'PAID' AND void_reason IS NULL AND voided_at_ms IS NULL)
      OR (status = 'VOID' AND void_reason IS NOT NULL AND voided_at_ms IS NOT NULL)),
  CHECK (grand_total_rupiah = subtotal_rupiah),
  CHECK (paid_amount_rupiah >= grand_total_rupiah),
  CHECK (change_amount_rupiah = paid_amount_rupiah - grand_total_rupiah),
  CHECK (payment_method <> 'QRIS' OR change_amount_rupiah = 0)
);

CREATE TABLE transaction_items (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  product_id TEXT REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  base_unit_price_rupiah INTEGER NOT NULL CHECK (base_unit_price_rupiah >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_total_rupiah INTEGER NOT NULL CHECK (unit_total_rupiah >= 0),
  line_total_rupiah INTEGER NOT NULL CHECK (line_total_rupiah >= 0),
  notes TEXT,
  CHECK (line_total_rupiah = unit_total_rupiah * quantity)
);

CREATE TABLE transaction_item_options (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_item_id TEXT NOT NULL REFERENCES transaction_items(id),
  option_id TEXT REFERENCES options(id),
  option_name_snapshot TEXT NOT NULL,
  unit_price_rupiah INTEGER NOT NULL CHECK (unit_price_rupiah >= 0),
  quantity_per_portion INTEGER NOT NULL CHECK (quantity_per_portion > 0)
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at_ms INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_rupiah INTEGER NOT NULL CHECK (amount_rupiah > 0),
  notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
  void_reason TEXT,
  voided_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  CHECK ((status = 'ACTIVE' AND void_reason IS NULL AND voided_at_ms IS NULL)
      OR (status = 'VOID' AND void_reason IS NOT NULL AND voided_at_ms IS NOT NULL))
);

CREATE TABLE print_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  attempted_at_ms INTEGER NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('SENT_TO_DEVICE','FAILED','UNKNOWN')),
  error_message TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_products_category ON products(category_id, is_active, is_available);
CREATE INDEX idx_tx_business_status ON transactions(business_date, status);
CREATE INDEX idx_tx_time ON transactions(occurred_at_ms);
CREATE INDEX idx_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_options_item ON transaction_item_options(transaction_item_id);
CREATE INDEX idx_expenses_date_status ON expenses(business_date, status);
CREATE INDEX idx_print_tx ON print_attempts(transaction_id, attempted_at_ms);
```

**Kewajiban yang tidak tercakup oleh `CHECK` SQL:**

- `transaction_items.unit_total_rupiah` = base price + seluruh harga opsi (kuantitas per porsi) dan `transactions.subtotal` = jumlah semua line. Karena membutuhkan agregasi antartabel, validasi ini dilakukan di domain service **sebelum insert**, disimpan atomik, dan diuji.
- Option yang dipilih harus tergabung dalam group yang diizinkan produk, group aktif, option aktif, serta mematuhi min/max; validasi service + tes. Untuk `max_selected`, definisi apakah menghitung item/qty atau jenis opsi harus sesuai aturan owner; jika belum disepakati, jangan memasang limit selain yang pasti.
- `business_date` valid sesuai tanggal WIB dari `occurred_at_ms`; cek di service dan pengujian.
- Tanggal input pengeluaran dapat dipilih owner untuk pencatatan biaya sebelumnya; waktu pencatatan tetap disimpan terpisah.
- `print_attempts` best effort; gagal menulis log printer tidak boleh mengubah transaksi PAID.
- `is_available` adalah sakelar tampil/non-tampil tanpa pengurangan stok otomatis.
- Bila `transaction_items.product_id` tidak boleh null karena tidak ada delete fisik katalog, tetap boleh menggunakan snapshot; keberadaan FK tidak mengubah harga historis.

### 9.4 Contoh query laporan yang menghindari double count

**Omzet dan jumlah transaksi per tanggal bisnis** (dari header saja, tanpa JOIN ke item):

```sql
SELECT business_date,
       COUNT(*) AS transaction_count,
       COALESCE(SUM(grand_total_rupiah), 0) AS revenue_rupiah
FROM transactions
WHERE status = 'PAID'
  AND business_date BETWEEN ? AND ?
GROUP BY business_date
ORDER BY business_date ASC;
```

**Metode bayar**:

```sql
SELECT payment_method,
       COUNT(*) AS transaction_count,
       COALESCE(SUM(grand_total_rupiah), 0) AS amount_rupiah
FROM transactions
WHERE status = 'PAID'
  AND business_date BETWEEN ? AND ?
GROUP BY payment_method;
```

**Pengeluaran**:

```sql
SELECT COALESCE(SUM(amount_rupiah), 0) AS expenses_rupiah
FROM expenses
WHERE status = 'ACTIVE'
  AND business_date BETWEEN ? AND ?;
```

**Top menu** (snapshot nama untuk histori, grup berdasarkan `product_id` dan snapshot bila diperlukan):

```sql
SELECT ti.product_id, ti.product_name_snapshot,
       SUM(ti.quantity) AS quantity_sold,
       SUM(ti.line_total_rupiah) AS sales_rupiah
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id
WHERE t.status = 'PAID'
  AND t.business_date BETWEEN ? AND ?
GROUP BY ti.product_id, ti.product_name_snapshot
ORDER BY quantity_sold DESC, sales_rupiah DESC;
```

Jika produk diubah namanya, satu `product_id` bisa tampil dalam beberapa snapshot. Untuk kartu *menu terlaris* yang harus digabung berdasarkan identitas produk, gunakan `GROUP BY ti.product_id` dan nama sekarang/fallback snapshot yang dipilih eksplisit, **bukan** menggandakan jumlah. Jangan menghitung omzet header setelah JOIN detail tanpa terlebih dahulu mengelompokkan kembali per transaksi.

### 9.5 Kontrak migrasi database

- Database awal = schema versi 1. Kenaikan schema hanya melalui migration terurut, dikendalikan versi plugin SQLite/metadata yang konsisten.
- Migration harus idempotent sesuai mekanisme upgrade yang dipilih; jangan menjalankan DDL `CREATE TABLE` buta pada tiap startup lalu mengabaikan perubahan kolom.
- Setiap migration dites dari **database lama berisi transaksi** ke versi baru. Test tidak boleh menghapus data.
- Jangan memutakhirkan *major* plugin database dan Capacitor tanpa memeriksa compatibility, changelog, dan backup.
- Jalankan verifikasi integritas (`PRAGMA integrity_check` atau mekanisme yang didukung) saat maintenance/restore, bukan pada setiap checkout.

---

## 10. Application services dan keamanan transaksi

### 10.1 Service minimal

```ts
interface MoneyCalculator {
  calculateCart(cart: CartDraft): CartTotals; // pure, no DB/UI
}

interface TransactionRepository {
  createPaidSale(input: ConfirmedSale): Promise<SavedTransaction>;
  getById(id: string): Promise<SavedTransaction | null>;
  list(filter: TransactionFilter): Promise<SavedTransaction[]>;
  void(id: string, reason: string): Promise<void>;
}

interface PrinterAdapter {
  listPairedPrinters(): Promise<PrinterDevice[]>;
  connect(deviceId: string): Promise<void>;
  printReceipt(receipt: ReceiptPayload): Promise<PrintResult>;
  disconnect(): Promise<void>;
}

interface BackupService {
  exportFullBackup(): Promise<BackupResult>;
  inspectBackup(file: SelectedFile): Promise<BackupPreview>;
  restoreValidatedBackup(file: SelectedFile): Promise<void>;
}
```

**Interface hanya contoh kontrak arsitektural**, bukan dependency wajib atau kode siap kompilasi (tipe domain didefinisikan agent). Gunakan adapter untuk mengisolasi plugin native agar komponen UI tidak memanggil SQLite/Bluetooth secara langsung.

### 10.2 Checkout atomik (pseudocode)

```text
CHECKOUT(input):
  validate cart > 0 and product/options pricing; calculate totals with integer
  validate payment rules and QRIS manual confirmation
  freeze submitted checkout UUID (idempotency key); disable submit
  BEGIN SQLITE TRANSACTION
    if sale UUID already exists: load it and return that result
    get business_date from captured transaction timestamp in Asia/Jakarta
    upsert/read daily_counters for business_date and increment atomically
    format receipt_number MM-YYYYMMDD-NNNN
    INSERT transactions(PAID, snapshot total, method, paid, change)
    INSERT all transaction_items (snapshots)
    INSERT all transaction_item_options (snapshots)
  COMMIT
  return saved sale; UI navigate to saved sale detail
  try print receipt from saved sale (outside DB transaction)
  if print fails: show reprint, NEVER repeat CHECKOUT
```

**Implementasi:** gunakan transaksi SQLite resmi yang disediakan plugin/connection (verifikasi API versi yang diinstal). `daily_counters` dan `transactions` ada dalam transaksi sama; uji proses app crash/double tap. Jika `COMMIT` berhasil tetapi respons JS hilang, retry dengan **ID checkout yang sama** harus mengambil penjualan lama, bukan membuat baru.

### 10.3 Manajemen koneksi dan status

- Satu `DatabaseService` menginisialisasi SQLite dan migration saat bootstrap; jaga satu sumber koneksi, jangan buka-tutup acak dari setiap komponen.
- `PRAGMA foreign_keys=ON`, transaksi dan query parameterized untuk input teks; tidak menyusun SQL dengan interpolasi user.
- Tangkap error untuk UI dengan pesan aman, **tanpa** mencetak data transaksi sensitif ke console/telemetry.
- State keranjang boleh hilang bila aplikasi force-close sebelum checkout (belum transaksi). Tetapi **setelah committed**, transaksi harus bertahan.
- Saat membuka app, handle initialization loading/error/retry; jangan otomatis membuat database baru jika database lama bermasalah tanpa memeriksa data.

---

## 11. Laporan dan pembulatan periode

### 11.1 Filter periode

- **Hari ini**: `business_date` WIB hari ini.
- **Tanggal pilihan**: satu `YYYY-MM-DD` WIB.
- **Bulanan**: tanggal pertama sampai tanggal terakhir bulan WIB terkait.
- **Custom range**: opsional bila tidak mengganggu MVP.

### 11.2 Angka dashboard

1. Omzet (PAID saja), jumlah transaksi PAID.
2. Total CASH, total QRIS yang **dikonfirmasi manual**.
3. Jumlah pengeluaran ACTIVE.
4. Selisih sederhana (omzet − pengeluaran tercatat).
5. Top produk berdasarkan total qty (dengan definisi grup yang eksplisit).
6. Grafik harian dalam sebulan boleh sederhana; tidak boleh lebih diprioritaskan daripada akurasi angka.

### 11.3 Ekspor laporan

Ekspor CSV berisi tanggal WIB, nomor struk, metode, total, status, serta CSV terpisah untuk pengeluaran (jika diperlukan). Gunakan UTF-8, delimiter dan escaping CSV yang benar, termasuk mitigasi **CSV/spreadsheet formula injection** untuk field teks user yang diawali `=`, `+`, `-`, `@`, atau karakter kendali; jangan bocorkan data tidak diperlukan. **CSV adalah laporan, bukan backup** yang bisa memulihkan relasi penuh database.

### 11.4 Pengujian akurasi sederhana

Contoh transaksi hari sama: A=CASH Rp16.000, B=QRIS Rp13.000, C=VOID Rp10.000; pengeluaran ACTIVE Rp5.000 dan VOID Rp2.000. Laporan benar adalah omzet **Rp29.000**, jumlah transaksi **2**, CASH **Rp16.000**, QRIS **Rp13.000**, pengeluaran **Rp5.000**, selisih sederhana **Rp24.000**. Nilai VOID tidak masuk hitungan apa pun kecuali daftar histori.

---

## 12. Integrasi printer Bluetooth ESC/POS

### 12.1 Perangkat dan koneksi

Target perangkat: **printer thermal 58 mm dengan Bluetooth Classic SPP dan ESC/POS**. Preferensi awal **desktop USB + Bluetooth** untuk kedai tetap, tetapi **merek/model belum dipilih**. USB hanya jalur alternatif (belum masuk dukungan aplikasi kecuali diuji/disepakati); **MVP Android memakai Bluetooth Classic**.

1. Uji printer fisik **sebelum** membangun seluruh POS. Cari dokumentasi mode SPP/ESC/POS, lebar efektif dan character set.
2. Pairing dapat dilakukan melalui **Settings Bluetooth Android**. Di app, tampilkan daftar *paired/bonded devices*; scanning baru diperlukan jika ada kebutuhan konkret.
3. Android 12+ (API 31+) perlu `BLUETOOTH_CONNECT` saat aplikasi berkomunikasi dengan perangkat paired. `BLUETOOTH_SCAN` hanya jika discovery digunakan; permission legacy disesuaikan batas maxSdkVersion. Jangan minta permission lokasi jika tidak dibutuhkan.
4. Print via plugin/bridge Kotlin/Java Android yang terbukti bekerja atau dikembangkan secukupnya; referensi library kandidat ESC/POS harus diperiksa kompatibilitas/lisensi sebelum dipakai.
5. Tangani socket timeout, reconnect, Bluetooth mati, permission ditolak, printer tidak tersedia, reconnect setelah pause/resume, dan encoding rupiah/karakter non-ASCII.
6. Jangan menjamin barcode/logo/cut otomatis dari model murah; fitur inti cukup teks dan feed. Jika printer tidak memiliki cutter, tidak memaksanya.

### 12.2 Kontrak format struk

```text
         MAMAMIN
   [alamat bila diset]
-------------------------------
No  : MM-20261105-0001
Wkt : 05/11/2026 19:35 WIB
-------------------------------
Mie Ayam
  1 x 10.000             10.000
Es Teh
  2 x  3.000              6.000
-------------------------------
TOTAL                    16.000
BAYAR CASH               20.000
KEMBALIAN                 4.000
-------------------------------
      Terima kasih!
```

Contoh adalah **simulasi**. Tata letak/karakter/penanganan nama topping panjang harus menyesuaikan lebar efektif printer terpilih. Harga per item/opsi dari snapshot tersimpan, bukan dari daftar produk saat print.

### 12.3 Kebijakan status cetak

- `SENT_TO_DEVICE`: operasi pengiriman bytes selesai tanpa error yang dilaporkan. **Tidak membuktikan** struk fisik keluar atau kertas tersedia.
- `FAILED`: kegagalan diketahui (izin/koneksi/timeout).
- `UNKNOWN`: status transport/hasil fisik tidak pasti; ajak kasir memeriksa kertas sebelum reprint.
- Reprint tidak mengubah total transaksi; pada struk ulang tampilkan `SALINAN`. Jika transaksi sudah `VOID`, cantumkan `DIBATALKAN` secara mencolok. Log setiap percobaan printer best effort di `print_attempts`.
- Cetak uji dari halaman pengaturan **tidak** membuat transaksi penjualan.
- Jika printer belum tersedia, UI bisa berfungsi dengan `MockPrinterAdapter` **hanya untuk dev** dan release produksi wajib ditahan sampai uji fisik printer selesai.

### 12.4 Kasus yang harus dites langsung di HP + printer

- Pair → print percobaan → print transaksi 1/5/20 item → cetak ulang.
- Printer dimatikan saat checkout; transaksi tetap tersimpan.
- Bluetooth dimatikan/izin ditolak; UI menampilkan instruksi pemulihan.
- Paper-out, reset printer, sambung ulang, tutup/buka app.
- Encoding nama panjang, topping berulang, kertas 58 mm; tidak terpotong pada margin.
- Dua transaksi berurutan tanpa menimpa struk sebelumnya.

### 12.5 Evaluasi pilihan teknis bridge Android & penangguhan printer fisik

Berdasarkan evaluasi arsitektur pada Fase P1 (Android target SDK 36 / Android 12+):

1. **Mengapa bukan Web Bluetooth atau plugin BLE umum:** Printer thermal kasir 58 mm ekonomis mayoritas memakai **Bluetooth Classic SPP (RFCOMM UUID `00001101-0000-1000-8000-00805F9B34FB`)**, sedangkan Web Bluetooth API di Chromium/WebView dan plugin BLE (`@capacitor-community/bluetooth-le`) hanya mendukung GATT/BLE dan tidak menjamin kompatibilitas SPP. Plugin Cordova lawas banyak yang tidak terawat untuk izin runtime Android 12–16.
2. **Pilihan teknis yang dipilih (Feasibility Plan):** Membuat **Capacitor local native plugin tipis berbahasa Kotlin/Java** langsung di proyek `android/` (`BluetoothAdapter.getBondedDevices()` + `BluetoothDevice.createRfcommSocketToServiceRecord(SPP_UUID)` + `OutputStream.write(escPosBytes)` dengan timeout terkelola di background thread), dipasangkan ke kontrak TypeScript `PrinterAdapter`.
3. **Strategi izin minimal:** Karena printer dipasangkan (*paired*) satu kali lewat Pengaturan Bluetooth Android, aplikasi pada Android 12+ cukup meminta `android.permission.BLUETOOTH_CONNECT` saat runtime (tanpa `BLUETOOTH_SCAN` dan tanpa izin lokasi). Permission ini **belum ditambahkan** ke `AndroidManifest.xml` sebelum bridge native diaktifkan dan diuji dengan unit printer fisik.
4. **Pemisahan lapisan saat perangkat belum tersedia:** Pembentukan teks/ESC-POS 58 mm (`receiptFormatter.ts`), orkestrasi transaksi tersimpan & audit `print_attempts` (`receiptService.ts`), serta kontrak `PrinterAdapter` + `MockPrinterAdapter` selesai dan diuji terpisah sehingga ketiadaan printer fisik tidak menghambat penyelesaian fitur inti POS.

---

## 13. Backup, restore, dan keamanan data

### 13.1 Prinsip yang tidak bisa ditawar

Database hanya ada di satu HP. **Uninstall app atau Clear Data dapat menghapus database**. Backup di storage internal aplikasi yang sama **tidak cukup**. Harus ada file backup tersimpan di lokasi yang dapat diakses setelah aplikasi/HP bermasalah.

### 13.2 Format dan prosedur backup

- Gunakan mekanisme full export yang kompatibel dengan versi `@capacitor-community/sqlite` (misalnya ekspor JSON penuh); verifikasi API aktual dan struktur ekspor yang dihasilkan. Jangan salin file DB saat koneksi menulis secara sembarangan.
- Bungkus payload ekspor dalam metadata: `format_id`, `app_version`, `schema_version`, `exported_at_ms`, `timezone`, `record_counts`, dan checksum/hash untuk deteksi kerusakan file. Isi payload tetap data lengkap, bukan hanya agregasi.
- File contoh: `mamamin-backup-2026-11-05-2100.json` (nama unik; jangan menimpa backup sebelumnya otomatis).
- Simpan melalui mekanisme native **Android Sharesheet / Storage Access Framework (SAF)** atau plugin yang benar-benar menghasilkan file yang dapat diakses user/Drive. Jangan berasumsi share file dari path privat tanpa FileProvider/URI tepat bisa dibuka aplikasi lain.
- Pastikan ekspor selesai, file benar-benar dapat dibuka dan checksum valid sebelum menampilkan status berhasil. Pengingat akhir hari boleh ada; **jangan** mencatat 'backup sukses' jika user belum menyimpan file ke tempat di luar HP.
- Anjurkan backup harian setelah tutup kasir, simpan minimal beberapa backup sebelumnya, dan salin ke tempat eksternal (akun Drive pribadi/hard drive/perangkat kedua). Tanpa internet, backup bisa diekspor ke penyimpanan eksternal ketika tersedia.

### 13.3 Restore aman

```text
Pilih file → baca metadata → validasi format/schema/checksum/ukuran
   ↓
Tampilkan jumlah transaksi, pengeluaran, waktu backup, risiko overwrite
   ↓
Minta konfirmasi eksplisit + buat backup pengaman data saat ini
   ↓
Tutup koneksi normal → import sesuai API plugin yang diuji
   ↓
Buka ulang DB → jalankan integrity_check, foreign_key_check,
validasi hitungan + sample transaksi + data master
   ├─ gagal: berikan rollback/recovery dari backup pengaman
   └─ sukses: tampilkan hasil restore dan timestamp
```

**Peringatan plugin:** `importFromJson` dapat memiliki perilaku berbeda menurut versi dan opsi `overwrite`/versi schema; pada beberapa versi import full dapat menghapus isi tabel/DB. Jangan gunakan pada database aktif tanpa pengaman. Setelah restore, UI/cache query harus di-reset/dimuat ulang, dan prosedur pemulihan diuji pada database dummy lalu perangkat uji sebelum digunakan di database riil.

### 13.4 Perlindungan privasi

- Data transaksi/backup asli mungkin mengandung informasi bisnis sensitif. Jangan upload ke GitHub, AI prompt publik, logging, atau issue tracker.
- Tidak ada kebutuhan menyimpan nama/nomor telepon pelanggan dalam MVP; jangan menambahkannya.
- Backup JSON mentah **tidak terenkripsi** kecuali agent secara eksplisit menerapkan enkripsi yang teruji; tidak boleh mengklaim file aman hanya karena berada di Drive. Beri edukasi penyimpanan yang aman.
- Keystore signing APK dan kata sandinya bersifat rahasia; simpan di luar repository dan lakukan backup aman terhadap keystore.

---

## 14. Arsitektur folder kode dan dependency rules

```text
pos_mamamin/
├── README.md                     # ringkasan publik; status aktual
├── AGENTS.md                     # aturan AI Agent
├── docs/
│   └── PROJECT_BLUEPRINT.md      # spesifikasi utama ini
├── src/
│   ├── app/
│   │   ├── router.tsx            # navigasi antar halaman
│   │   └── bootstrap.ts          # inisialisasi native & app
│   ├── features/
│   │   ├── cashier/              # katalog kasir, cart, checkout
│   │   ├── products/             # kategori, item, modifier
│   │   ├── transactions/         # histori, detail, void, reprint
│   │   ├── expenses/             # form dan daftar pengeluaran
│   │   ├── reports/              # ringkasan dan query presentation
│   │   └── settings/             # printer, identitas, backup
│   ├── components/
│   │   └── ui/                   # reusable UI primitives
│   ├── domain/
│   │   ├── money.ts              # kalkulasi integer
│   │   ├── dates.ts              # business_date WIB
│   │   └── types.ts              # model & DTO
│   ├── database/
│   │   ├── sqlite.ts             # lifecycle SQLite native
│   │   ├── migrations/           # perubahan schema versioned
│   │   └── repositories/         # hanya layer ini query DB
│   ├── services/
│   │   ├── printer/
│   │   │   ├── printerAdapter.ts  # kontrak
│   │   │   ├── nativePrinter.ts   # implementasi Android
│   │   │   └── receiptFormatter.ts
│   │   └── backup/               # export/inspect/restore
│   ├── lib/                       # helper lintas fitur bila perlu
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── android/                       # diciptakan oleh npx cap add android
├── public/                        # aset lokal, bukan CDN
├── tests/                         # unit + contract + fixtures dummy
├── capacitor.config.ts
├── vite.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json / tsconfig.*.json # bentuk mengikuti scaffold aktual
├── .gitignore
└── ...                             # file toolchain yang dihasilkan Vite
```

**Struktur target, bukan kewajiban menyiapkan semua file kosong.** AI Agent boleh menambahkan folder kecil (hooks, test fixtures, assets) untuk kebutuhan yang jelas; jangan menambah lapisan repository abstrak berlebihan. Native Android code untuk printer ditempatkan di area plugin/bridge yang terhubung dengan proyek `android/` sesuai dokumentasi Capacitor, bukan menyelipkan JavaScript Web Bluetooth yang keliru.

### 14.1 Ketergantungan lapisan

```text
features (UI) → application/use-case functions → domain (pure)
                                        ↓
                               repositories (SQLite)
                                        ↓
                             native SQLite plugin

features/settings + transaction detail → printer service → Android bridge
features/settings                  → backup service → SQLite export + SAF/share
```

- Komponen UI tidak membuka koneksi DB langsung atau menjalankan SQL literal.
- `domain` tidak boleh bergantung pada React, WebView, atau Capacitor; ini membuat uji harga mudah.
- Printer tidak menentukan apakah transaksi berhasil disimpan; hanya beroperasi atas `SavedTransaction`.
- Laporan membaca DB, bukan menjumlahkan keranjang React di RAM.
- Hindari *global mutable state* untuk penomoran struk. Sumber kebenaran adalah SQLite.

### 14.2 Coding standard minimal

- TypeScript `strict: true`; jangan `any` sembarangan atau menonaktifkan lint untuk menutupi error.
- Gunakan parameterized SQL, transaksi DB, tipe data eksplisit, error classification, dan status UI loading/success/error.
- Utamakan fungsi sederhana daripada abstraksi besar; tidak ada class berlapis hanya untuk gaya.
- Format rupiah hanya di presentation layer; integer mentah ke DB.
- Testing logic bisnis dulu sebelum styling detail.
- Query batch/indeks seperlunya; tidak perlu optimasi spekulatif.

---

## 15. Setup awal development di Antigravity + Android USB

> **Penting:** repository `pos_mamamin` beserta 3 Markdown sudah dibuat pengguna. Jangan jalankan perintah seperti `rm -rf`, `git clean -fdx`, `git init` ulang, atau scaffold Vite yang memilih `Remove existing files`. Instruksi berikut adalah jalur aman untuk agent; eksekusi sesuaikan OS lokal pengguna.

### 15.1 Prasyarat dan verifikasi

```bash
node --version
npm --version
git status --short
adb version
adb devices
```

Target dasar **Capacitor 8** (dokumentasi resmi yang dicek Nov 2026) membutuhkan **Node 22+**, Android Studio **2025.2.1+**, Android SDK/platform-tools, JDK bawaan Android Studio. Gunakan versi stabil yang kompatibel dengan HP target dan plugin yang dipilih. Jangan menaikkan major dependency tanpa bukti kompatibilitas.

Jika `adb devices` menunjukkan `unauthorized`, buka kunci HP dan izinkan USB debugging. Jika tidak terdeteksi, periksa driver USB Android (khususnya Windows), mode transfer data, kabel, PATH Android SDK/platform-tools. Aplikasi native tidak dapat diuji hanya dengan browser.

### 15.2 Scaffold React TANPA menghapus dokumen/repo

**Metode paling aman:** buat scaffold **di sibling sementara**, lalu salin **hanya file aplikasi/toolchain** ke `pos_mamamin`, tidak menimpa README/AGENTS/docs/.git.

```bash
# Dari parent directory yang berisi folder pos_mamamin:
npm create vite@latest pos_mamamin_scaffold -- --template react-ts

# Lalu MERGE SELEKTIF dari pos_mamamin_scaffold ke pos_mamamin:
# src/, public/, index.html, package.json, tsconfig*, vite.config.ts,
# eslint.config.* dan file konfigurasi yang benar-benar diperlukan.
# Jangan salin scaffold README.md atau .git ke repo existing.
# Gabungkan .gitignore, jangan overwrite secara buta.
```

Tidak ada satu perintah `cp -r` lintas OS yang aman untuk seluruh file pada repo existing; lakukan merge selektif menggunakan IDE/file explorer atau perintah OS yang terverifikasi terlebih dahulu. Setelah itu dari `pos_mamamin`:

```bash
npm install
npm run dev
npm run build
```

**Vite di folder non-kosong:** jika agent memilih `npm create vite@latest . -- --template react-ts`, hanya lanjut bila CLI secara jelas menyediakan opsi **preserve/ignore existing files**; **jangan pilih delete/remove**. Metode sibling lebih aman.

### 15.3 Tailwind CSS (gaya setup Vite terbaru)

```bash
npm install tailwindcss @tailwindcss/vite
```

Di `vite.config.ts`, gabungkan plugin React dari scaffold dengan `tailwindcss()` dari `@tailwindcss/vite`; pada CSS utama tambahkan `@import "tailwindcss";` dan pastikan di-import dari `main.tsx`. **Jangan menggunakan panduan Tailwind v3** (`@tailwind base/components/utilities`, `npx tailwindcss init -p`) bila yang diinstal Tailwind v4 tanpa alasan terverifikasi.

### 15.4 Tambahkan Capacitor Android

```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap init
```

Saat `cap init`: nama aplikasi `MamaMin POS`, package ID **`com.mamamin.pos`** (jangan diubah setelah release agar jalur update APK tetap kompatibel), `webDir` = `dist` sesuai output Vite. Verifikasi `capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mamamin.pos',
  appName: 'MamaMin POS',
  webDir: 'dist',
};

export default config;
```

Lanjutkan:

```bash
npm run build
npx cap add android
npx cap sync android
npx cap run android
```

`cap run` menjalankan deployment debug ke perangkat/emulator yang dipilih. `npx cap open android` membuka proyek Gradle native jika perlu. **Setelah perubahan React yang perlu masuk APK** jalankan `npm run build` lalu `npx cap sync android` (atau `cap run`, yang melakukan sync sebagai bagian workflow). Untuk pengembangan cepat, opsi live reload boleh digunakan namun **tidak boleh** menjadi konfigurasi `server.url` produksi; release harus melayani asset lokal dari APK.

### 15.5 SQLite native dan unit test

```bash
npm install @capacitor-community/sqlite
npx cap sync android
npm install -D vitest
```

**Periksa dulu versi:** pada Nov 2026 repository plugin SQLite mempunyai release major 8 yang sesuai dengan Capacitor 8; gunakan versi/plugin yang kompatibel dan uji native. Implementasikan `DatabaseService` untuk open/close, migration, query, dan transaction. UI browser tidak otomatis menjadi lingkungan SQLite native; jika membuat *browser adapter* untuk visual development, **jangan menggunakannya sebagai sumber transaksi produksi**.

Tambahkan script `test` yang memanggil `vitest run` ketika konfigurasi siap. Untuk navigasi `react-router-dom` dapat diinstal hanya jika diperlukan; untuk cart state, React state/context dulu cukup. Jangan menginstall database ORM atau state manager berat tanpa alasan.

### 15.6 Printer native POC

1. Sediakan interface adapter + implementasi mock **dev-only**.
2. Pilih plugin ESC/POS Bluetooth Classic yang sesuai versi Capacitor/Android, atau buat bridge Android Java/Kotlin kecil menggunakan Android Bluetooth socket + library ESC/POS yang lisensinya cocok.
3. Pasangkan printer dari Android settings; enumerasi paired devices; minta permission runtime sesuai SDK.
4. Implementasikan tombol `Cetak Uji` yang **tidak** mencatat transaksi.
5. Uji pada **HP fisik dan printer fisik**, dokumentasikan merek, model, firmware, Android version, protokol, kode halaman/encoding yang berhasil.

**Jika printer belum tersedia, jangan mengaku fitur print sudah selesai.** Selesaikan UI, SQLite, formatter dan stub, lalu tandai blocker hardware sebelum release produksi.

### 15.7 `.gitignore` wajib

Pastikan `.gitignore` mencakup minimal pola berikut (gabungkan dengan scaffold, jangan menimpa):

```gitignore
node_modules/
dist/
coverage/
*.log
.env
.env.*
!.env.example
android/.gradle/
android/build/
android/app/build/
android/local.properties
*.jks
*.keystore
*.p12
*.db
*.db-*
*.sqlite
*.sqlite3
*.sqlite-wal
*.sqlite-shm
*backup*.json
*backup*.zip
*.apk
*.aab
```

**Jangan gitignore seluruh `android/`.** Lacak source Gradle/native Android yang diperlukan untuk membangun APK; rahasiakan private signing config serta perangkat spesifik. `*backup*.json` tidak menggantikan inspeksi `git status` sebelum push. Jika pengembang memakai sampel dataset dummy, simpan pada file fixture yang tidak mengandung data nyata dan namanya tidak menyerupai backup produksi.

---

## 16. Roadmap implementasi bertahap (gate wajib)

Agent harus menuntaskan setiap fase dengan **bukti kompilasi/pengujian**, bukan sekadar checklist berdasarkan persepsi. Fase tidak boleh dilabeli tuntas bila dependensi fisik belum ada.

| Fase | Pekerjaan | Exit gate / bukti |
| --- | --- | --- |
| **P0** Toolchain | Audit repo; scaffold aman; React/TS/Vite/Tailwind; Capacitor Android; USB debug. | `npm run build` lulus dan APK debug menampilkan layar dasar di HP. |
| **P1** Native feasibility | Inisialisasi/migrasi SQLite; write/read persisted setelah restart; mock/native printer; proof of concept printer fisik. | 1 dummy sale tersimpan; setelah force-close/relaunch masih ada; satu cetak uji fisik berhasil bila perangkat tersedia. |
| **P2** Master & cart | Kategori, menu CRUD, opsi, POS UI, harga integer, penghitungan cart; verifikasi aturan seblak dengan owner. | Test kalkulasi, menu nonaktif, cart qty, seblak berbeda per porsi lulus. Harga produksi tidak ditebak. |
| **P3** Checkout | Cash/QRIS manual, save atomik, nomor struk, detail/riwayat, void, printer/reprint. | Test duplicate submit, rollback error, print failure, histori snapshot, void tanpa perubahan omzet lulus. |
| **P4** Ops/report | Pengeluaran, report harian/bulanan, metode bayar, menu terlaris, ekspor CSV. | Angka cocok dengan dataset referensi §11.4; restart tidak mengubah report. |
| **P5** Data safety | Full backup, share/SAF ke luar HP, inspect/restore, failure handling, migrasi. | File backup eksternal dipulihkan pada instalasi/perangkat uji dan integritasnya benar. |
| **P6** Release | End-to-end test offline, hardening, signed APK, verifikasi upgrade, README aktual, handover. | APK release terpasang, berfungsi saat offline, printer fisik teruji, data aman selama upgrade. |

### 16.1 Cara melaporkan progres ke pengguna

Setiap tahap sertakan singkat: `Selesai`, `Diuji di mana`, `Perintah + hasil`, `Belum diuji/Blocker`, `File penting`, `Next step`. Contoh yang boleh: "build web lulus; printer belum diuji karena hardware belum tersedia". Contoh yang dilarang: "APK final 100% berfungsi" padahal hanya menjalankan Vite.

### 16.2 Milestone minimum sebelum meminta demo owner

P2/P3 berfungsi pada HP asli, punya kategori yang benar, menu dapat diedit, checkout tunai dapat disimpan; sebelum live-use: uji printer dan backup (P5). Demo dengan data dummy dipisahkan dari penjualan riil, jangan menguji secara destruktif di database produksi.

### 16.3 Pemisahan status implementasi saat printer fisik ditangguhkan

Apabila perangkat printer thermal 58 mm fisik belum tersedia selama tahap pengembangan, pelaporan dan penyelesaian fitur dipisahkan secara tegas menjadi empat jalur agar fitur bisnis inti tidak terhambat namun tidak pernah mengklaim pengujian hardware semu:

1. **Core POS (SQLite, katalog, checkout, riwayat, void, pengeluaran, laporan, backup/restore):** wajib selesai dan diuji penuh pada perangkat Android fisik.
2. **Receipt generation & preview 58 mm:** wajib selesai dan diuji berdasarkan `SavedTransaction` nyata di SQLite (termasuk penanda `SALINAN` dan `DIBATALKAN` serta payload ESC/POS dasar).
3. **Printer interface & mock (`PrinterAdapter` + `MockPrinterAdapter`):** wajib selesai dan diuji termasuk penanganan kegagalan tanpa menduplikasi transaksi.
4. **Native Bluetooth Classic SPP connection & physical printing:** berstatus **`PENDING HARDWARE VERIFICATION` (`BLOCKED` untuk rilis final P6)** hingga unit printer fisik dibeli, dipasangkan, dan lulus uji cetak kertas nyata (§12.4).

---

## 17. Strategi testing dan test matrix

### 17.1 Lapisan pengujian

- **Unit (Vitest):** kalkulasi money, penggabungan modifier, qty, format nomor struk, tanggal bisnis WIB, validasi payment, rentang periode laporan, formatter struk (tanpa printer).
- **Repository/contract:** test SQLite transaksi atomik, FK, migration, snapshot, query reports pada lingkungan yang benar-benar mendukung SQLite; browser mock bukan bukti SQLite Android berjalan.
- **Android integration:** SQLite native, permission Bluetooth, paired device, cetak nyata, share file dan restore di HP fisik.
- **Manual UAT owner:** alur pesanan kedai saat ramai, seblak dan jajanan per pcs, biaya pengeluaran, kesesuaian laporan & struk, backup akhir hari.

### 17.2 Test matrix rinci

| ID | Skenario | Expected |
| --- | --- | --- |
| T01 | App baru pertama kali diinstal | DB dibuat satu kali, initial settings wajar, tanpa crash. |
| T02 | Buka tanpa internet | Halaman kasir + katalog tersedia; transaksi berfungsi. |
| T03 | Mie Ayam 1 + Es Teh 2 | Total 16.000 pada harga contoh; unit test murni. |
| T04 | Tunai 20.000 pada total 16.000 | Kembalian 4.000; nilai disimpan integer. |
| T05 | Tunai 10.000 pada total 16.000 | Checkout ditolak, tidak tersimpan. |
| T06 | QRIS belum konfirmasi | Tidak ada transaksi PAID baru. |
| T07 | QRIS dikonfirmasi | Transaksi PAID, kembalian 0, metode QRIS. |
| T08 | Seblak dua porsi topping berbeda | Snapshot opsi terpisah, total per porsi tepat (data contoh tervalidasi). |
| T09 | Tap Simpan berkali-kali/latensi | Satu transaksi dan satu nomor struk saja. |
| T10 | Gagal insert detail | Rollback header dan detail; tidak ada transaksi parsial. |
| T11 | App force-close setelah commit | Riwayat dan nilai tetap ada setelah dibuka lagi. |
| T12 | Printer mati saat checkout | Transaksi tetap PAID; print gagal, reprint tersedia. |
| T13 | Reprint 3 kali | Total transaksi/omzet tidak berubah. |
| T14 | Harga menu diedit setelah terjual | Riwayat lama tetap memakai snapshot harga. |
| T15 | Produk dinonaktifkan | Tidak tampil untuk pesanan baru; transaksi lama utuh. |
| T16 | VOID beralasan | Tetap di riwayat; tidak ikut omzet dan top produk. |
| T17 | Pengeluaran 5.000 ACTIVE, 2.000 VOID | Hanya 5.000 dihitung. |
| T18 | Laporan sampel §11.4 | Omzet 29.000, transaksi 2, selisih 24.000. |
| T19 | Sekitar 23:59 dan 00:01 WIB | Masing-masing masuk business_date yang benar. |
| T20 | Backup ke lokasi di luar HP | File bisa ditemukan/buka kembali dan valid. |
| T21 | Restore file rusak/format salah | Ditolak, DB aktif tidak ditimpa. |
| T22 | Restore backup valid | Hitungan/relasi/struk sama dengan sebelum backup. |
| T23 | Update APK versi baru | Data lama tetap, migrasi berhasil, signing ID sesuai. |
| T24 | Bluetooth permission ditolak | Pesan bermakna; tidak crash; transaksi tetap bisa disimpan. |
| T25 | Printer teks panjang / 58 mm | Layout terbaca; tidak mengandung baris hilang. |
| T26 | Simulasi ruang penyimpanan rendah | Error aman, tidak menandai checkout berhasil bila commit gagal. |
| T27 | Mengubah tanggal pengeluaran | Report masuk tanggal bisnis yang dipilih dengan benar. |
| T28 | 100+ transaksi dummy | Daftar/rekap tetap responsif; nomor unik; tidak ganda. |
| T29 | QRIS & tunai hari yang sama | Pecahan report sama dengan omzet; tidak double count. |
| T30 | Database migration dari schema lama | Tanpa kehilangan transaksi; versi dan FK valid. |

### 17.3 Kriteria UAT owner sebelum produksi

- Owner bisa menyelesaikan contoh transaksi mie, jajanan, minuman, seblak yang aturannya telah dikonfirmasi.
- Kertas struk terpotong/dirobek dan jelas terbaca, total sama dengan layar.
- Kasir dapat mencetak ulang **nomor transaksi yang sama**.
- Owner membuka laporan harian/bulanan, cocok dengan transaksi uji dan pengeluaran.
- Owner paham cara mengeluarkan backup dari HP dan mencoba restore di perangkat uji.
- Jika printer rusak/offline, penjualan masih tercatat dan tidak muncul duplikasi.
- Ada prosedur koreksi penjualan batal, dan owner memahami batasan QRIS manual.

---

## 18. Operasional, keamanan, dan pemeliharaan

### 18.1 SOP penggunaan kasir

1. Pastikan waktu HP benar, baterai/pengisian daya tersedia, printer aktif dan kertas cukup.
2. Cek harga, barang habis, dan printer bila diperlukan.
3. Catat pembayaran sesuai metode; untuk QRIS, periksa notifikasi provider di luar app **sebelum** konfirmasi di POS.
4. Setelah checkout, periksa struk jika perlu; bila print gagal, gunakan reprint dari histori.
5. Catat biaya operasional dan tinjau laporan pada akhir hari.
6. Lakukan backup ke luar HP dan pastikan file benar-benar tersimpan.

### 18.2 Disaster recovery

- HP hilang/rusak: instal APK **dengan package ID dan versi schema yang cocok** di HP pengganti, restore backup terakhir, verifikasi hitungan dan tanggal.
- Printer gagal: POS tetap boleh menyimpan transaksi; struk bisa dicetak kemudian saat terhubung.
- App update: backup dahulu; gunakan signing key yang sama; tes upgrade data di HP uji.
- Database gagal dibuka: jangan inisialisasi ulang otomatis; tampilkan pemulihan/restore dari file eksternal.

### 18.3 Biaya dan risiko residual

Tidak ada biaya langganan database/hosting pada desain lokal; tetapi perangkat, printer, kertas, daya, backup eksternal (bila berbayar), dan maintenance tetap memiliki biaya. Risiko tersisa: kehilangan transaksi setelah backup terakhir, jam HP salah, cash/QRIS salah dikonfirmasi manual, printer murah bermasalah. Komunikasikan keterbatasan itu ke owner dengan bahasa praktis.

### 18.4 GitHub portofolio

- README menjelaskan **masalah nyata + solusi**, bukan klaim fiktif. Tambahkan screenshot aplikasi hanya setelah ada hasil nyata, dengan data demo yang disamarkan.
- Publikasi kode boleh dilakukan setelah pemeriksaan rahasia/aset; jangan upload database riil, screenshot nomor pelanggan/rekap penghasilan asli, keystore, atau backup.
- Jangan menulis nama/logo partner brand sebagai kerja sama resmi tanpa izin; gunakan aset yang telah disetujui pemilik kedai.
- Commit bertahap dengan pesan jelas; tag release hanya bila signed APK telah diuji.

---

## 19. Final APK: debug → release → distribusi

### 19.1 Persiapan release

Sebelum final:

1. Semua fase P0–P6 dan test wajib (§17) selesai; catat model printer/HP uji.
2. Pastikan `appId`/Android `applicationId` final konsisten, versi aplikasi dan `versionCode` naik pada update, nama aplikasi dan ikon benar.
3. Backup data saat ini di luar HP; uji migrasi ke versi target.
4. Jalankan `npm ci` (jika lockfile stabil), `npm run build`, test/lint/TypeScript sesuai script; hasil harus benar-benar lulus.
5. Pastikan **tidak** ada URL live reload (`server.url`), CDN runtime, debug logs sensitif, dummy printer dalam jalur produksi, atau hard-coded harga seblak tak disetujui.
6. `npx cap sync android` membawa bundle web terbaru dan plugin native.

### 19.2 Build debug (pengujian via USB)

```bash
adb devices
npm run build
npx cap sync android
npx cap run android
```

Jika Android SDK tidak dikenali dari Antigravity, buka Android Studio dan perbaiki konfigurasi SDK/JDK, PATH/platform-tools; jangan mengubah proyek menjadi web-only.

### 19.3 Signed release APK (sideload, bukan Play Store)

```bash
npm run build
npx cap sync android
npx cap open android
```

Di **Android Studio**:

1. Pilih menu **Build → Generate Signed Bundle / APK** (penamaan sedikit berubah antar versi IDE).
2. Pilih **APK** → Next.
3. Pilih **release keystore** yang sudah disimpan aman atau buat baru sekali untuk release perdana (password kuat + backup keystore di luar repository). Catat alias dengan aman.
4. Pilih build variant `release`, selesaikan wizard signing (mengikuti panduan resmi versi Android Studio yang dipakai).
5. Cari artefak pada `android/app/build/outputs/apk/release/` atau path yang dilaporkan IDE. **Jangan menggunakan APK unsigned sebagai rilis akhir.**
6. Pasang APK pada perangkat uji dan jalankan test offline, SQLite, printer, backup/restore, dan migrasi data jika upgrade dari APK lama.

**Keamanan signing:** tidak boleh commit keystore, file properties berisi password, atau membuka kredensial ke AI prompt/log publik. Jika signing key hilang, jalur update APK sideload yang sudah terinstal bisa terhambat. Simpan key di lokasi aman dan terpisah.

**Catatan:** `npx cap run android` menghasilkan deployment debug untuk testing, **bukan otomatis signed release APK** yang siap diserahkan. APK dari tombol *Run* Android Studio bisa memiliki atribut `testOnly` sehingga tidak cocok dibagikan via file manager. Gunakan wizard Generate Signed APK untuk distribusi langsung.

### 19.4 Tes rilis paling akhir

- Instal APK release baru di HP uji bersih → buka tanpa internet → buat 3 dummy sales.
- Test CASH + QRIS manual; print fisik 58 mm; reprint tanpa duplikasi.
- Buat expense; cek harian/bulanan; backup keluar HP.
- Uji restore di HP/instalasi uji dan cocokkan hitungan.
- Uji update dengan APK versi berikutnya bertanda tangan **sama** tanpa uninstall; cek semua transaksi masih ada.
- Tinjau `git status` dan artefak release agar tidak ada rahasia/data produksi yang masuk repo.

### 19.5 Handover ke owner

Berikan owner: APK release teruji, model printer yang kompatibel, prosedur pairing dan reprint, SOP kasir satu halaman, SOP backup harian/restore, batasan QRIS manual, prosedur update aplikasi, kontak pengembang/penanggung jawab. **Jangan** membagikan signing private key ke repo publik; simpan aman pada pihak yang bertanggung jawab atas pemeliharaan aplikasi.

---

## 20. Open decisions / hal yang harus dikonfirmasi (jangan dikarang)

| ID | Pertanyaan | Dampak | Strategi aman sebelum dijawab |
| --- | --- | --- | --- |
| D01 **Kritis** | Seblak dihitung per topping/pcs, paket, berdasarkan berat, atau aturan lain? | Harga, model option, UI checkout. | Siapkan struktur modifier; **jangan aktifkan harga seblak produksi**. |
| D02 **Kritis** | Daftar topping seblak, satuan, harga, kuantitas maksimum, level pedas, dan apakah ada harga dasar? | Master options dan validasi. | Tidak membuat harga dummy menjadi default resmi. |
| D03 | Harga dan ketersediaan semua menu pada foto masih berlaku? | Seed katalog resmi. | Data foto hanya referensi awal dan dapat diedit. |
| D04 | Kasir menggunakan HP Android versi/merk apa? | Min API, performa, pairing, layar. | Gunakan Android target sesuai toolchain; uji HP aktual sebelum final. |
| D05 **Kritis release** | Printer thermal merek/model apa yang dibeli? Benar Bluetooth Classic SPP/ESC-POS? | Integrasi native dan layout struk. | Buat adapter dan formatter; tahan klaim uji fisik sampai tersedia. |
| D06 | Nama, alamat, kontak, tagline, logo di struk? | Pengaturan dan format receipt. | Default tampil nama `MamaMin`; detail lain opsional. |
| D07 | Aturan pembatalan sesudah pembayaran, siapa boleh membatalkan, perlu bukti refund? | Audit/operasional. | Wajib alasan void; jangan klaim refund otomatis atau kas sudah kembali. |
| D08 | Kategori pengeluaran yang dibutuhkan (bahan, gas, gaji, kemasan, lain)? | UI expense/report. | Pakai kategori teks sederhana yang dapat dipilih/disesuaikan. |
| D09 | Perlu rekap PDF/Excel atau cukup angka di app + CSV? | Scope ekspor laporan. | MVP angka di app; CSV opsional setelah core. |
| D10 | Siapa pemegang release signing key untuk `com.mamamin.pos`? | Kemampuan upgrade APK jangka panjang. | `applicationId` dikonsistenkan menjadi `com.mamamin.pos`; tetapkan pemegang keystore sebelum release. |
| D11 | Tanggal bisnis selalu 00:00–23:59 WIB atau shift kedai bisa melintasi hari? | Query harian/bulanan. | Default tanggal kalender WIB; ubah hanya setelah keputusan owner. |

**Cara mencatat keputusan:** isi hasil konfirmasi, tanggal, dan pihak yang mengonfirmasi di tabel ini atau log singkat di bawah. Jangan mengubah asumsi menjadi fakta tanpa bukti.

### Decision log

| Tanggal | Keputusan | Dasar |
| --- | --- | --- |
| 2026-11-05 | Android APK, 1 HP kasir, offline-first, SQLite lokal, printer Bluetooth; owner melihat laporan di HP kasir. | Hasil brainstorming kebutuhan awal. |
| 2026-11-05 | QRIS dicatat manual; belum integrasi gateway. | Batas MVP paling sederhana. |
| 2026-11-05 | Harga dan mekanisme seblak belum dipastikan; perlu konfirmasi owner. | Menghindari aturan bisnis fiktif. |
| 2026-11-06 | Android `applicationId` / Capacitor `appId` dikonsistenkan menjadi `com.mamamin.pos`; lokasi blueprint dirapikan ke `docs/PROJECT_BLUEPRINT.md`. | Konsistensi konfigurasi & dokumentasi Fase P0. |
| 2026-11-06 | Fase P0 terverifikasi pada perangkat pengembangan fisik POCO X6 Pro 5G (`2311DRK48G`, Android 16 / SDK 36) melalui USB/ADB, termasuk cold-start tanpa Wi-Fi & data seluler. | Bukti kelulusan exit gate P0. |
| 2026-11-06 | Fase P1 SQLite Native (`@capacitor-community/sqlite@8.1.1`), migrasi skema v1 (12 tabel, 7 indeks, `PRAGMA foreign_keys = ON`), transaksi atomik/rollback, dan persistensi data lintas `am force-stop` + *cold start* offline lulus verifikasi pada POCO X6 Pro 5G (`mamamin_posSQLite.db`). | Bukti kelulusan exit gate SQLite Native P1. |
| 2026-11-06 | Pengujian printer fisik 58 mm ditangguhkan sementara karena perangkat belum tersedia (`PENDING HARDWARE VERIFICATION`). Fondasi `PrinterAdapter`, `MockPrinterAdapter`, `ReceiptService`, dan formatter/preview struk 58 mm dari transaksi SQLite selesai; fitur P2–P5 dilanjutkan tanpa mengklaim cetak fisik berhasil. | Penyesuaian roadmap agar pengembangan Core POS tidak terhambat sambil menjaga kejujuran status hardware. |
| 2026-11-06 | Fase P2 (Master Kategori, Produk, Modifier/Topping, Keranjang Kasir Mobile-First) terverifikasi end-to-end: 30 automated tests (Vitest) + live APK di POCO X6 Pro 5G via USB/ADB. Data katalog & grup opsi tersimpan di SQLite native, sinkronisasi offline instan, toggle ketersediaan real-time, dan kalkulasi pure integer Rupiah tanpa floating-point. | Bukti kelulusan exit gate Fase P2. |

---

## 21. Checklist review sebelum meminta agent lanjut fase berikutnya

- [ ] Agent membaca `AGENTS.md`, Blueprint, dan memeriksa file existing.
- [ ] Tech stack dan versi plugin terpasang kompatibel; lockfile dicommit.
- [ ] Tidak ada file hasil scaffold yang menimpa 3 Markdown atau `.git/`.
- [ ] Semua UI yang diklaim berfungsi punya repository/service nyata, bukan dummy hard-coded.
- [ ] Harga dihitung di domain pure dan diuji; data produksi belum mengadopsi asumsi seblak.
- [ ] Commit transaksi atomik dan idempotent; printer berada di luar transaksi DB.
- [ ] Report tidak menggandakan omzet akibat join.
- [ ] Izin Bluetooth dan printer fisik diuji, atau diberi status blocker.
- [ ] Backup keluar HP dan restore valid; hasil diuji di instalasi terpisah.
- [ ] APK release ditandatangani keystore aman dan diuji instal/update.
- [ ] README hanya menandai fitur completed setelah bukti nyata.

---

## 22. Sumber primer dan catatan keakuratan

Dokumen berikut perlu dipakai agent untuk memverifikasi API/perintah **sesuai versi yang dipasang**, terutama bila ada perubahan major sesudah dokumen dibuat:

1. **Capacitor docs:** https://capacitorjs.com/docs
2. **Capacitor getting started:** https://capacitorjs.com/docs/getting-started
3. **Capacitor environment setup:** https://capacitorjs.com/docs/getting-started/environment-setup
4. **SQLite community plugin:** https://github.com/capacitor-community/sqlite
5. **SQLite JSON import/export docs:** https://github.com/capacitor-community/sqlite/blob/master/docs/ImportExportJson.md
6. **Tailwind Vite setup:** https://tailwindcss.com/docs/installation/using-vite
7. **Android Bluetooth permissions:** https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
8. **Android app signing:** https://developer.android.com/studio/publish/app-signing
9. **Android build for release:** https://developer.android.com/build/build-for-release
10. **Antigravity Rules:** https://antigravity.google/docs/rules/

**Perlu dibedakan:** fitur yang bisa dirancang dengan dokumen ≠ fitur yang telah diuji. Pengujian Bluetooth, SQLite native, APK signing, dan backup/restore bergantung pada lingkungan pengembangan dan perangkat aktual. Jangan mengklaim hal tersebut berhasil hanya karena blueprint ini lengkap.

---

## 23. Instruksi pertama untuk AI Agent (siap ditempel di Antigravity)

> Baca `AGENTS.md`, `README.md`, dan `docs/PROJECT_BLUEPRINT.md` sampai selesai. Audit isi repository `pos_mamamin` dan environment lokal tanpa menghapus/mengganti file existing. Mulai fase **P0**, kerjakan React + TypeScript + Vite + Tailwind terbaru yang kompatibel, integrasikan Capacitor Android secara aman, lalu buktikan APK debug berjalan di HP Android lewat USB bila perangkat tersedia. Jangan membangun UI penuh atau fitur online lebih dahulu. Laporkan file yang diubah, perintah yang dijalankan, hasil build/test nyata, blocker, dan rencana P1. Setelah P0 berhasil, lanjut fase secara bertahap mengikuti blueprint. Jangan mengarang harga seblak atau mengklaim printer berhasil sebelum pengujian fisik.

**Selesai dokumen:** gunakan file ini sebagai panduan operasional implementasi dari repository baru hingga signed release APK yang teruji.

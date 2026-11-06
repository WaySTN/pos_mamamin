# MamaMin POS 🍜

**Aplikasi kasir Android offline-first untuk Kedai MamaMin**, dikembangkan untuk membantu UMKM mencatat penjualan dan pengeluaran, mencetak struk thermal Bluetooth, serta melihat rekap harian/bulanan **tanpa biaya langganan software kasir bulanan**.

> **Status proyek:** dalam pengembangan. Dokumen ini menjelaskan rancangan dan target MVP; fitur tidak boleh diklaim sudah tersedia sebelum diimplementasikan dan diuji di perangkat nyata.
>
> **Catatan biaya:** aplikasi inti tidak memerlukan server/hosting berbayar. Perangkat Android, printer, kertas thermal, perawatan, dan kemungkinan biaya pengembangan tetap merupakan biaya terpisah.

## Latar Belakang

Kedai MamaMin menjual mie ayam/mie yamin dengan beberapa varian, seblak prasmanan, jajanan, dan minuman. Kebutuhan awal yang disampaikan owner adalah:

1. Mencatat transaksi kasir dengan cepat dan mencetak **satu struk per transaksi**.
2. Memantau omzet dan jumlah transaksi harian, serta rekap bulanan.
3. Mencatat pengeluaran operasional kedai.
4. Menggunakan satu HP Android sebagai kasir, tanpa ketergantungan pada internet dan tanpa langganan POS bulanan.

Aplikasi ini **bukan** sistem pemesanan online, akuntansi lengkap, manajemen stok bahan, atau POS multi-cabang.

## Lingkup MVP 1.0

| Modul | Kemampuan target |
| --- | --- |
| Kasir | Katalog berdasarkan kategori, pencarian, keranjang, jumlah, catatan, varian/topping, hitung total |
| Pembayaran | Tunai (nominal bayar dan kembalian), QRIS **konfirmasi manual oleh kasir** |
| Transaksi | Simpan lokal secara atomik, nomor unik, riwayat, detail, pembatalan beralasan, cetak ulang |
| Printer | Struk 58 mm ESC/POS lewat Bluetooth Classic **setelah lolos uji kompatibilitas** |
| Menu | Tambah/edit/nonaktifkan kategori, produk, harga dan opsi topping |
| Pengeluaran | Input, daftar, kategori, tanggal, nominal dan catatan |
| Laporan | Omzet harian/bulanan, jumlah transaksi, tunai vs QRIS, pengeluaran, menu terlaris |
| Data | SQLite lokal, ekspor laporan, backup dan restore terverifikasi |

**Definisi penting:** `omzet` = total transaksi berstatus sah/PAID; `selisih operasional` = omzet − pengeluaran tercatat, **bukan otomatis laba bersih**. Transaksi batal tidak masuk omzet.

## Teknologi

- **React + TypeScript + Vite** — antarmuka dan logika aplikasi.
- **Tailwind CSS** — styling layar mobile.
- **Capacitor (Android)** — kemasan APK dan jembatan ke API native.
- **`@capacitor-community/sqlite`** — penyimpanan transaksi/menu/pengeluaran langsung di HP.
- **Android Bluetooth Classic (SPP) + ESC/POS** — komunikasi ke printer thermal melalui adapter/plugin native yang diuji.
- **Vitest** — pengujian unit untuk logika harga, laporan, dan aturan transaksi; pengujian perangkat Android tetap wajib.

React berjalan di Android WebView melalui Capacitor. Ini **APK Android sungguhan**, tetapi bukan React Native ataupun UI Android Java/XML. Tidak ada server API, MySQL, Supabase, Firebase, atau login cloud pada MVP.

## Gambaran Arsitektur

```text
HP Android (satu kasir aktif)
┌────────────────────────────────────────────────┐
│ MamaMin POS APK                                │
│ React UI → Application services                │
│        ├── Repositories → SQLite lokal          │
│        ├── Report queries → SQLite lokal        │
│        ├── Backup/restore → ekspor file         │
│        └── Printer adapter → Bluetooth ESC/POS  │
└────────────────────────────────────────────────┘
                        │
             File backup di LUAR HP
         (dibagikan/simpan via Files/Drive)
```

**Batasan:** owner melihat laporan pada HP kasir. Tidak ada sinkronisasi real-time dengan HP lain; dua kasir bersamaan belum didukung. Semua transaksi inti harus tetap bekerja tanpa internet.

Arsitektur folder lengkap, model data, validasi, alur kegagalan, dan kriteria kelulusan ada di **[`docs/PROJECT_BLUEPRINT.md`](docs/PROJECT_BLUEPRINT.md)**. Aturan kerja AI Agent ada di **[`AGENTS.md`](AGENTS.md)**.

## Struktur Repositori yang Ditargetkan

Struktur berikut **dibuat bertahap oleh AI Agent**; sebagian belum ada pada repository saat dokumen ini ditulis.

```text
pos_mamamin/
├── README.md
├── AGENTS.md
├── docs/
│   └── PROJECT_BLUEPRINT.md
├── src/
│   ├── app/                   # bootstrap, router, provider
│   ├── features/
│   │   ├── cashier/
│   │   ├── products/
│   │   ├── transactions/
│   │   ├── expenses/
│   │   ├── reports/
│   │   └── settings/
│   ├── components/ui/         # komponen lintas-fitur
│   ├── domain/                # tipe, model dan kalkulasi murni
│   ├── database/
│   │   ├── migrations/
│   │   ├── repositories/
│   │   └── sqlite.ts
│   ├── services/
│   │   ├── printer/
│   │   └── backup/
│   ├── lib/
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── android/                    # dihasilkan oleh Capacitor; source native dilacak Git
├── public/
├── tests/
├── capacitor.config.ts
├── vite.config.ts
├── package.json
├── package-lock.json
└── .gitignore
```

## Setup Development (setelah kode aplikasi dibuat)

### Persiapan

- Node.js **22 atau lebih baru** untuk Capacitor 8; cek ulang versi minimum jika major Capacitor berubah.
- Android Studio dan Android SDK yang kompatibel, termasuk ADB/platform-tools. Untuk Capacitor 8, dokumentasi resmi mensyaratkan Android Studio **2025.2.1 atau lebih baru**.
- HP Android untuk pengujian nyata: aktifkan Developer Options → USB Debugging, lalu setujui dialog otorisasi USB.
- Antigravity IDE/terminal untuk pengembangan. Android Studio cukup untuk SDK, inspeksi native, build/signing saat diperlukan.

**Jangan menjalankan scaffolding dengan opsi yang menghapus isi direktori**, karena repo sudah berisi `README.md`, `AGENTS.md`, dan `docs/`. Instruksi bootstrap aman ada di Blueprint §15.

Setelah proyek React/Capacitor diinisialisasi oleh agent:

```bash
npm ci
npm run dev
```

`npm ci` digunakan jika `package-lock.json` sudah ada dan sinkron; jika belum, jalankan `npm install` satu kali lalu commit lockfile.

### Jalankan di HP melalui USB

```bash
adb devices
npm run build
npx cap sync android
npx cap run android
```

Perangkat harus muncul sebagai `device` (bukan `unauthorized`). Perintah `cap run` memasang dan menjalankan build debug di Android. Jika muncul pilihan target, pilih HP yang terhubung.

Alternatif untuk membuka proyek native:

```bash
npx cap open android
```

> `npm run dev` di laptop **tidak** membuktikan plugin SQLite native atau printer Bluetooth berjalan. Pengujian keduanya harus memakai APK di HP fisik. Untuk perubahan kode web yang ingin masuk APK, lakukan build/sync ulang (atau gunakan workflow live reload khusus development).

## Build APK Release

Langkah tinggi (rinci di Blueprint §19):

1. Pastikan semua gate pengujian (transaksi, offline, printer fisik, backup/restore, laporan) lulus.
2. Buat backup data usaha sebelum pengujian migrasi/update aplikasi.
3. Jalankan `npm run build` dan `npx cap sync android`.
4. Buka proyek Android: `npx cap open android`.
5. Android Studio → **Build → Generate Signed Bundle / APK** → pilih **APK**, lalu gunakan **keystore release milik pemilik proyek**.
6. Simpan keystore dan password di tempat aman, **jangan commit ke Git**. Gunakan `applicationId` (`com.mamamin.pos`) dan sertifikat signing yang sama untuk pembaruan berikutnya.
7. Pasang APK release pada HP uji, pastikan bisa membuka data yang ada ketika di-upgrade, mencetak, backup, dan berjalan offline.

APK release lazimnya muncul dalam `android/app/build/outputs/apk/release/`; lokasi final bergantung pengaturan Gradle. **Tidak perlu Play Store** untuk pemasangan internal, tetapi instalasi APK dari luar Play Store memerlukan persetujuan pengguna pada Android.

## Aturan Data dan Keamanan

- Semua nominal memakai **integer rupiah**, bukan floating point.
- Waktu disimpan sebagai epoch UTC (milidetik); tanggal bisnis dan laporan menggunakan zona waktu **Asia/Jakarta**.
- Harga/nama produk disalin ke detail transaksi saat pembayaran agar transaksi lama tidak berubah ketika menu diedit.
- Transaksi dibatalkan dengan status `VOID` dan alasan; data historis tidak dihapus secara diam-diam.
- Pembayaran QRIS ditandai **berdasarkan verifikasi manual kasir**; aplikasi tidak boleh mengklaim pembayaran otomatis terkonfirmasi.
- Data kasir lokal tidak boleh dimasukkan ke repository, screenshot publik, log debugging, atau issue GitHub.
- Backup ke luar HP secara rutin dan uji restore pada perangkat uji; ekspor CSV laporan **bukan** pengganti backup.

## Roadmap dan Status

> Checklist ini adalah **status aktual berbasis pengujian nyata**. Pengujian cetak kertas fisik tidak ditandai selesai sebelum perangkat printer tersedia dan diuji langsung.

- [x] **P0 — Toolchain & APK Baseline:** React, TypeScript, Vite, Tailwind CSS, Capacitor Android (`com.mamamin.pos`) berjalan online & offline di HP Android fisik via USB/ADB.
- [x] **P1a — SQLite Native & Persistensi Offline:** `@capacitor-community/sqlite` terpasang, migrasi skema relasional v1 (12 tabel, 7 indeks, `PRAGMA foreign_keys = ON`), operasi CRUD atomik, rollback transaksi, serta ketahanan data lintas *force-stop* & *cold start* offline telah lulus uji di HP fisik.
- [x] **P1b — Fondasi Struk 58 mm & Printer Mock:** Kontrak `PrinterAdapter`, `MockPrinterAdapter` (khusus dev), `ReceiptService`, payload ESC/POS dasar, serta preview struk 58 mm (Normal, `SALINAN`, `DIBATALKAN`) dari transaksi tersimpan di SQLite selesai dan teruji.
- [ ] **P1c — Koneksi Bluetooth Classic SPP & Cetak Fisik 58 mm:** *Pending hardware verification* (`BLOCKED` menunggu pengadaan unit printer thermal fisik; tidak menghambat pengembangan modul P2–P5).
- [x] **P2 — Master Menu, Modifier/Topping & Keranjang Kasir:** Manajemen kategori, produk, modifier kuantitas/porsi, kalkulasi pure integer Rupiah nonnegatif (zero floating-point), customizer modal bottom-sheet, bottom sticky cart bar, cart drawer, pencarian offline instan, toggle ketersediaan real-time, perlindungan soft-deactivation terhadap riwayat data, dan katalog menu resmi MamaMin (4 Kategori, 21 Produk, 4 Grup Opsi, 14 Topping Seblak) terkonfirmasi owner dan aktif di SQLite native. Teruji 85 automated unit tests dan berjalan di HP Android fisik POCO X6 Pro 5G.
- [x] **P3 — Checkout, Pembayaran Tunai & QRIS Manual, Riwayat Transaksi, Void & Struk Integration:** Checkout atomik SQLite (`withTransaction`), proteksi double-submit in-flight, nomor struk berurutan harian WIB (`MM-YYYYMMDD-NNNN`), snapshot harga beku per baris & modifier, pembayaran Tunai (kalkulasi kembalian integer Rupiah) & QRIS manual kasir, layar Riwayat Transaksi dengan filter tanggal/status, pembatalan beralasan (VOID) yang otomatis mengeluarkan transaksi dari omzet, serta format struk 58 mm (Normal, SALINAN, DIBATALKAN). Teruji 54 automated tests dan diverifikasi langsung pada perangkat fisik Xiaomi POCO X6 Pro 5G via USB/ADB.
- [x] **P4 — Pengeluaran Operasional & Rekap Laporan Bisnis:** Pencatatan pengeluaran kas kecil (petty cash) dengan validasi nominal integer Rupiah positif (> 0), tanggal bisnis WIB Asia/Jakarta, kategori operasional UMKM, keterangan wajib, pembatalan (VOID) beralasan, dan isolasi pengeluaran VOID dari rekap operasional; ringkasan laporan penjualan terpadu (Omzet PAID, transaksi berhasil vs VOID, rincian Tunai vs QRIS, pengeluaran kas kecil, selisih kas operasional dengan disclaimer edukasi akuntansi, dan estimasi kas di laci kasir); filter periode (Hari Ini, Kemarin, 7 Hari Terakhir, Bulan Ini, Kustom); ranking menu & topping terlaris (PAID only); serta ekspor 3 jenis CSV aman dengan proteksi formula injection ('=,+,-,@') dan UTF-8 BOM. Teruji 82 automated tests dan diverifikasi langsung pada perangkat fisik Xiaomi POCO X6 Pro 5G via USB/ADB.
- [x] **P5 — Keamanan Data & Pemulihan (Full Backup & Restore):** Ekspor lengkap 12 tabel SQLite native dalam format JSON terstruktur (`mamamin-backup-v1`) dengan verifikasi integritas Checksum SHA-256 (Web Crypto API); Android Sharesheet native (`Intent.ACTION_SEND` via `FileProvider`) untuk membagikan file backup langsung ke Google Drive, WhatsApp, Telegram, Bluetooth, atau Email ke luar sandbox HP; penyimpanan langsung ke folder publik `Download/` HP Android via `MediaStore.Downloads`; inspeksi file backup sebelum pemulihan (validasi keaslian checksum SHA-256, format skema, ringkasan transaksi PAID/VOID, omzet, pengeluaran kas kecil, dan produk); deteksi otomatis file backup lokal di perangkat; dialog konfirmasi ketik "PULIHKAN"; pemulihan database atomik dalam satu transaksi SQLite (`withTransaction`) dengan pembersihan anak-ke-induk, penyisipan induk-ke-anak, pengecekan `PRAGMA foreign_key_check` dan `PRAGMA integrity_check`, serta pencatatan audit log di `settings`. Teruji 98 automated tests dan diverifikasi langsung pada perangkat fisik Xiaomi POCO X6 Pro 5G via USB/ADB.
- [ ] **P6 — Rilis Produksi:** Pengujian end-to-end dengan printer fisik, *signed release APK*, uji upgrade tanpa kehilangan data, dan dokumentasi serah terima.

## Screenshot / Demo

Tambahkan screenshot UI **setelah aplikasinya benar-benar dibuat** dan gunakan data dummy; hindari nomor HP, transaksi asli, nama pelanggan, atau detail bisnis privat. Jangan tampilkan mockup sebagai fitur jadi.

## Referensi Resmi

- [Capacitor — dokumentasi](https://capacitorjs.com/docs)
- [Capacitor — instalasi](https://capacitorjs.com/docs/getting-started)
- [Capacitor — environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- [SQLite community plugin](https://github.com/capacitor-community/sqlite)
- [Tailwind CSS + Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Android — Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)
- [Android — app signing](https://developer.android.com/studio/publish/app-signing)

---

**MamaMin POS** — dibangun untuk menyelesaikan kebutuhan operasional nyata Kedai MamaMin dengan arsitektur yang sederhana, hemat, dan dapat dipelihara. Detail teknis dan keputusan yang masih terbuka tercatat secara transparan pada Blueprint.

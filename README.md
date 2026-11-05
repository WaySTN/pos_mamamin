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

> Checklist ini adalah **target**, bukan klaim hasil saat ini. Tandai hanya setelah terdapat bukti pengujian.

- [x] P0 — Toolchain React/Capacitor, Android debug APK berjalan di HP via USB.
- [ ] P1 — Proof of concept SQLite native dan cetak uji printer thermal fisik.
- [ ] P2 — Master menu, katalog, aturan topping seblak yang dikonfirmasi owner.
- [ ] P3 — Checkout atomik, metode pembayaran, riwayat, cetak dan cetak ulang.
- [ ] P4 — Pengeluaran dan laporan harian/bulanan akurat.
- [ ] P5 — Backup/restore, validasi, penanganan error dan pengujian offline.
- [ ] P6 — Signed release APK, upgrade tanpa kehilangan data, dokumentasi final.

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

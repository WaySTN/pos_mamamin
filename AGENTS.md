# AGENTS.md — Instruksi Wajib AI Agent untuk `pos_mamamin`

> Berlaku pada seluruh workspace. Dibaca bersama `docs/PROJECT_BLUEPRINT.md` **sebelum** menambah/mengubah kode. Bahasa komunikasi dan dokumentasi: **Bahasa Indonesia**; nama tipe/fungsi/file dan komentar teknis boleh berbahasa Inggris yang konsisten.

## 1. Misi dan batas produk

Bangun **MamaMin POS 1.0**: APK Android **offline-first**, **satu perangkat kasir aktif**, SQLite lokal, printer thermal Bluetooth Classic ESC/POS 58 mm, menu/varian/topping, checkout tunai dan QRIS manual, riwayat transaksi, pengeluaran, laporan harian/bulanan, backup/restore. Ini aplikasi bisnis riil, bukan hanya UI demo.

**Jangan** menambah backend server, Supabase/Firebase, akun online, payment gateway, marketplace, multi-cabang, inventori bahan, AI chatbot, atau fitur ekspansi lain tanpa persetujuan eksplisit. Jangan menganggap pengeluaran = HPP atau selisih kas = laba bersih.

## 2. Sumber kebenaran dan aturan keputusan

1. **Dokumen produk/teknis utama:** `docs/PROJECT_BLUEPRINT.md` (scope, model data, acceptance criteria, test/release gates).
2. **Aturan eksekusi:** file ini (`AGENTS.md`).
3. **Dokumentasi publik:** `README.md` harus selalu sesuai status implementasi sebenarnya.
4. Foto menu awal berasal dari owner melalui percakapan; **harga, ketersediaan, serta aturan seblak tetap harus dikonfirmasi** sebelum dipakai sebagai data produksi. Jangan mengarang harga seblak atau daftar topping.
5. Jika ada pilihan implementasi yang belum diputuskan, pilih pendekatan minimal yang aman dan **catat asumsi/keputusan di Blueprint**. Untuk hal yang berisiko mengubah pembayaran, data, atau harga usaha, jangan menebak: buat konfigurasi dan tandai sebagai blocking decision untuk aktivasi fitur itu.
6. Cek dokumentasi resmi dan kecocokan versi sebelum memasang plugin. Pastikan major `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`, dan `@capacitor-community/sqlite` kompatibel. Lock versi di `package-lock.json`.

## 3. Stack yang dikunci

- React + TypeScript + Vite, Tailwind CSS, Capacitor Android.
- SQLite native dengan `@capacitor-community/sqlite` (bukan `localStorage` atau IndexedDB sebagai database transaksi produksi).
- Bluetooth Classic SPP + ESC/POS via plugin/bridge Android **yang lolos uji printer fisik**; jangan berasumsi Web Bluetooth dapat menghubungkan printer Classic.
- TypeScript strict, ES modules, npm. Untuk unit test: Vitest; React Testing Library bila benar-benar perlu.
- React Router/Zustand hanya bila memberi manfaat nyata; prioritaskan dependensi minimal. Tidak perlu Next.js, Redux, ORM berat, Docker, server API, atau UI framework besar.

## 4. Aturan mengubah repository

- **Jangan hapus, overwrite, atau reset** `README.md`, `AGENTS.md`, `docs/`, `.git/`, atau file yang sudah dibuat pengguna. Repo sudah ada sebelum scaffolding. Jika `npm create vite` mendeteksi direktori tidak kosong, **jangan memilih opsi penghapusan**; scaffold di direktori sementara lalu merge selektif tanpa menimpa file tersebut, atau gunakan opsi aman yang eksplisit mempertahankan file.
- Ikuti target struktur pada Blueprint §14. Buat folder **saat dibutuhkan**, tidak perlu file kosong agar terlihat lengkap. Simpan akses SQLite di `database/`, logika murni di `domain/`, printer/backup di `services/`, UI per fitur di `features/`.
- Jangan hard-code semua logic dalam `App.tsx`; gunakan komponen kecil, services, dan repositories yang teruji.
- Jangan commit `node_modules`, build outputs, data transaksi nyata, file `.db`/WAL/SHM, backup `.json`/`.zip`, sertifikat/keystore `.jks`/`.keystore`, password, token, atau `local.properties`. Buat `.gitignore` eksplisit. **Jangan abaikan seluruh `android/`**: source native Android harus version-controlled kecuali generated build/secrets.
- Jangan menambahkan aset visual eksternal/logo tanpa memeriksa hak penggunaannya. Gunakan teks/ikon sederhana hingga branding final disediakan.

## 5. Invarian domain yang tidak boleh dilanggar

- **Uang**: integer rupiah nonnegatif, tidak menggunakan float; pembulatan tidak boleh mengubah total diam-diam.
- **Waktu**: simpan timestamp epoch UTC milidetik; hitung `business_date` dalam `Asia/Jakarta` dan gunakan untuk laporan. Tidak mengandalkan `toISOString().slice(0,10)` sebagai tanggal bisnis.
- **Transaksi**: penyimpanan header + item + modifier + nomor unik dilakukan dalam **SATU transaksi SQLite**. Simpan transaksi sebelum mencetak. Kegagalan print tidak boleh membuat transaksi baru; *reprint* menggunakan transaksi yang sama dan diberi label `SALINAN`; cetakan transaksi `VOID` harus ditandai `DIBATALKAN`.
- **Riwayat**: snapshot nama, harga dasar, harga opsi, dan total pada checkout; perubahan harga katalog tidak boleh mengubah transaksi lama.
- **Pembatalan**: `PAID` → `VOID` hanya dengan alasan; tidak menghapus transaksi atau menguranginya dua kali. Transaksi `VOID` dikecualikan dari omzet dan menu terlaris.
- **QRIS**: hanya tombol konfirmasi manual, **bukan** verifikasi otomatis dari bank. Simpan metode bayar dan status sesuai tindakan kasir.
- **Pengeluaran**: catat rupiah, tanggal bisnis, kategori, dan keterangan; laporan tidak boleh diberi label 'laba bersih' tanpa basis akuntansi.
- **Seblak**: setiap porsi dengan modifier berbeda harus menjadi baris transaksi tersendiri atau struktur yang mempertahankan modifier per porsi. Jangan tetapkan harga atau aturan topping sebelum owner menyetujuinya.
- **Backup**: harus dapat dipulihkan, divalidasi, dan disimpan **di luar sandbox HP**. Ekspor laporan CSV tidak cukup. Restore bersifat berisiko: perlu konfirmasi, validasi, backup pengaman, dan uji pemulihan.

## 6. Printer dan Android native

- Lakukan **printer proof-of-concept sedini mungkin**, paralel dengan SQLite. Pilih plugin/bridge dengan bukti kompatibilitas untuk Android API/perangkat target; jika belum ada printer, sediakan `MockPrinterAdapter` untuk UI, tetapi nyatakan jelas printer **BELUM TERVERIFIKASI**.
- Utamakan *paired devices* agar tidak perlu scan; untuk Android 12+ minta `BLUETOOTH_CONNECT` saat runtime. `BLUETOOTH_SCAN` hanya jika benar-benar melakukan discovery; izin versi lebih lama sesuai dokumentasi Android. Tangani izin ditolak, Bluetooth mati, printer mati, timeout, kertas habis, dan reprint.
- Status 'data terkirim ke socket/perangkat' **bukan bukti kertas fisik benar-benar tercetak**; tampilkan pesan yang jujur.
- Pastikan struk 58 mm terbaca: nama kedai, waktu WIB, nomor transaksi, item/qty/topping, metode, total, bayar dan kembalian tunai. Panjang baris mengikuti lebar karakter printer teruji.

## 7. Prosedur kerja wajib tiap tahap

1. **Audit awal:** baca seluruh tiga dokumen; periksa tree, `package.json`, git status, SDK/Node. Jangan berasumsi folder sudah kosong atau dependency sudah ada.
2. **Rencanakan satu fase** mengacu Blueprint §16: nyatakan target, file yang akan dibuat/diubah, risiko, dan acceptance criteria.
3. **Implementasikan vertikal end-to-end**, bukan membuat puluhan layar mockup tanpa data. Setiap tombol harus punya tindakan nyata atau jelas nonaktif dengan keterangan.
4. **Validasi lokal:** TypeScript/build/lint/test sesuai script yang tersedia; uji native di HP untuk SQLite/print/restore. Laporkan perintah dan hasil yang **benar-benar dijalankan**. Jangan mengaku sukses bila perangkat, printer, keystore, atau tools tidak ada.
5. **Update checklist README dan catatan keputusan Blueprint** hanya bila sudah terverifikasi. Cantumkan blocker dan next step konkret dalam jawaban kepada pengguna.
6. **Stop pada risiko destruktif**: jangan reset database, menghapus data usaha, mengganti package ID, atau membuat ulang signing key tanpa persetujuan dan backup.

## 8. Definition of Done — proyek benar-benar final

Proyek **belum final** bila hanya React `npm run build` berhasil. Syarat minimal:

- [ ] APK debug berjalan di HP Android via ADB, termasuk tanpa internet.
- [ ] SQLite menyimpan transaksi dan data tetap ada setelah aplikasi ditutup/dibuka ulang.
- [ ] Semua skenario hitung harga, qty, topping, tunai/QRIS, void, reprint lulus.
- [ ] Printer 58 mm fisik kompatibel, mencetak beberapa struk secara konsisten, termasuk kasus gangguan (atau release diblokir jelas jika hardware belum tersedia).
- [ ] Laporan harian/bulanan, metode bayar, menu terlaris dan pengeluaran cocok dengan data uji.
- [ ] Backup keluar HP → restore pada instalasi/perangkat uji berjalan; migrasi versi tidak merusak data.
- [ ] Build **signed release APK**, lalu diuji instal/upgrade dan operasi offline.
- [ ] Tidak ada data pelanggan, file rahasia, atau data transaksi asli masuk GitHub. README tidak mengklaim fitur yang belum selesai.

**Tidak boleh memalsukan screenshot, hasil test, atau status APK release.** Jika hanya bisa menyelesaikan sebagian, sampaikan batasan dengan jelas.

## 9. Referensi primer

- `docs/PROJECT_BLUEPRINT.md` — spesifikasi lengkap dan instruksi implementasi.
- https://capacitorjs.com/docs/getting-started
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://github.com/capacitor-community/sqlite
- https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
- https://developer.android.com/studio/publish/app-signing

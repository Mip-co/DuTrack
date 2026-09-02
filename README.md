# 💰 DuTrack

> Aplikasi pembukuan keuangan beasiswa — catat pengeluaran, scan struk dengan AI, dan generate laporan LPJ otomatis per semester.

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-dutrack.vercel.app-7C6AF5?style=for-the-badge)](https://dutrack.vercel.app)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![Gemini](https://img.shields.io/badge/AI-Gemini_3.1_Flash_Lite-4285F4?style=for-the-badge&logo=google)](https://aistudio.google.com)

---

## ✨ Fitur

| Fitur | Deskripsi |
|---|---|
| 📊 **Dashboard Bento** | Scholarship monitoring, saldo, tren keuangan, kategori |
| 💸 **Transaksi** | Tambah, edit, hapus, filter, search, pagination |
| 🤖 **Scan Struk AI** | Gemini Vision untuk ekstrak nominal, tanggal & kategori otomatis |
| 📷 **Scan Struk OCR** | Fallback Tesseract.js jika tanpa Gemini API Key |
| ☁️ **Cloud Sync** | Sinkronisasi data antar device via Supabase |
| 📅 **Filter Semester** | Semua halaman & export terfilter per semester akademik |
| 📋 **Export LPJ Beasiswa** | Generate XLSX siap submit per semester otomatis |
| 📄 **Export PDF** | Laporan lengkap dengan tabel & ringkasan |
| 🌙 **Dark / Light Mode** | Toggle tema sesuai preferensi |
| 🔒 **Mode Lokal** | Gunakan tanpa akun, data tersimpan di browser |

---

## 🛠️ Tech Stack

```
Frontend   → HTML, CSS, Vanilla JavaScript
Charts     → Chart.js
AI OCR     → Gemini 3.1 Flash Lite (Vision API)
OCR        → Tesseract.js (fallback)
Auth & DB  → Supabase (PostgreSQL + Row Level Security)
Storage    → Supabase Storage (foto struk)
Export     → SheetJS (xlsx-js-style), jsPDF, html2canvas
Hosting    → Vercel (auto-deploy dari GitHub)
```

---

## 🚀 Setup Supabase

> Setiap pengguna membuat project Supabase sendiri secara gratis.

### 1. Buat Akun & Project

1. Buka [supabase.com](https://supabase.com) → login / daftar
2. Klik **New Project** → isi nama, password database, region **(Singapore)**
3. Tunggu project selesai dibuat

---

### 2. Buat Tabel Database

Masuk ke **SQL Editor → New Query**, paste SQL berikut lalu klik **Run:**

```sql
-- Tabel transaksi
create table transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  type text not null check (type in ('income','expense')),
  amount numeric not null,
  description text,
  category text,
  date date not null,
  receipt_url text,
  created_at timestamptz default now()
);
alter table transactions enable row level security;
create policy "Users can manage own transactions"
  on transactions for all
  using (auth.uid() = user_id);

-- Tabel semester
create table semesters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  number integer not null,
  label text not null,
  start_month text not null,
  end_month text not null,
  created_at timestamptz default now()
);
alter table semesters enable row level security;
create policy "Users can manage own semesters"
  on semesters for all
  using (auth.uid() = user_id);
```

Jika berhasil, kedua tabel muncul di **Database → Tables**.

---

### 3. Buat Storage Bucket untuk Struk

Masuk ke **Storage → New Bucket:**

- Nama bucket: `receipts`
- Public bucket: **ON**

Tambahkan policy di **Storage → Policies → receipts:**

```sql
-- Upload
create policy "Users can upload receipts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Read
create policy "Public can view receipts"
  on storage.objects for select
  to public
  using (bucket_id = 'receipts');
```

---

### 4. Ambil URL & Publishable Key

| Field | Lokasi |
|---|---|
| **Project URL** | Settings → Integrations → Data API → API URL *(hapus `/rest/v1/` di akhir)* |
| **Publishable Key** | Settings → API Keys → tab **API Keys** → copy **Publishable key** (`sb_publishable_...`) |

> **Belum ada Publishable Key?** Klik **"Create new API Keys"** di tab API Keys — ini untuk project lama yang belum migrasi. Project baru sudah otomatis punya publishable key.

> ⚠️ Jangan gunakan **Secret key** di frontend. Secret key hanya untuk server-side.

---

### 5. Hubungkan ke DuTrack

1. Buka [dutrack.vercel.app](https://dutrack.vercel.app)
2. Pergi ke **Pengaturan → Konfigurasi Supabase**
3. Isi **Supabase URL** dan **Publishable Key**
4. Klik **Simpan & Hubungkan**
5. Muncul ✅ `Koneksi berhasil! Tabel transactions ditemukan.`

> **Catatan:** Tombol "Test Koneksi" kadang menampilkan gagal meski config benar. Gunakan langsung **Simpan & Hubungkan**.

---

### 6. Konfigurasi Auth

**Nonaktifkan konfirmasi email:**
```
Authentication → Sign In / Providers → Email → Confirm Email → OFF → Save
```

**Set Site URL:**
```
Authentication → URL Configuration → Site URL → https://dutrack.vercel.app
```

---

### 7. Register & Login

1. Buka app → klik **Daftar**
2. Isi email & password → **Daftar Sekarang**
3. Login — data otomatis tersinkronisasi ke cloud ☁️

---

## 🤖 Setup Gemini AI (Opsional)

Gemini AI meningkatkan akurasi scan struk secara signifikan — bisa baca foto buram, miring, dan auto-detect kategori. Tanpa key, OCR tetap berjalan dengan Tesseract.js.

### 1. Dapatkan API Key

1. Buka [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Login dengan akun Google
3. Klik **Create API Key** → copy key yang dihasilkan

> API Key Gemini gratis dengan kuota harian yang cukup untuk penggunaan personal.

### 2. Masukkan ke DuTrack

1. Buka **Pengaturan → Konfigurasi Gemini AI**
2. Paste API Key di field **Gemini API Key**
3. Klik **Simpan Key**
4. Muncul ✅ `AI aktif — scan struk menggunakan Gemini`

### 3. Perbandingan Gemini vs Tesseract

| | Gemini AI | Tesseract.js |
|---|---|---|
| Akurasi nominal | ✅ Tinggi | ⚠️ Sedang |
| Auto-detect kategori | ✅ Ya | ❌ Tidak |
| Auto-isi keterangan | ✅ Nama toko | ❌ Generik |
| Foto buram/miring | ✅ OK | ❌ Sering gagal |
| Butuh internet | Ya | Tidak |

---

## 📅 Setup Semester

### 1. Tambah Semester

1. Buka **Pengaturan → Manajemen Semester**
2. Isi nomor semester, label, bulan mulai & selesai
3. Klik **Simpan**

Contoh:
- Semester 4: Mar 2026 – Agu 2026
- Semester 5: Sep 2026 – Feb 2027

### 2. Pilih Semester Aktif

Pilih semester di dropdown topbar — semua halaman (dashboard, transaksi, analitik, export LPJ) otomatis terfilter ke rentang bulan semester tersebut.

---

## 📖 Cara Pakai

### ⌨️ Shortcut

| Shortcut | Aksi |
|---|---|
| `Ctrl+K` / `Cmd+K` | Buka modal tambah transaksi cepat |

### 🤖 Scan Struk dengan AI

1. Buka halaman **Scan Struk**
2. Upload / drag & drop foto struk
3. Jika Gemini aktif → AI ekstrak nominal, tanggal, keterangan & kategori otomatis
4. Periksa data, edit jika perlu
5. Klik **Simpan Transaksi**

> Tips: foto terang, teks jelas, tidak blur, posisi lurus — meski Gemini bisa handle foto yang kurang sempurna.

### 📋 Export LPJ Beasiswa

1. Pilih semester di dropdown topbar
2. Klik **Export → LPJ Beasiswa**
3. Isi dana beasiswa *(default Rp 8.400.000)*
4. Paste link bukti (GDrive / PDF) — opsional
5. Klik **Generate XLSX**

File hasil export berisi **3 sheet:**

| Sheet | Isi |
|---|---|
| 📊 Dashboard | KPI dana, tabel per kategori, ringkasan per bulan |
| 📂 Detail Transaksi | Semua transaksi per kategori + keterangan + link struk |
| 📋 LPJ | Tabel LPJ format beasiswa, kolom bukti ter-merge + link |

> **Catatan Windows:** File XLSX yang didownload dari browser mungkin diblokir Windows. Klik kanan file → Properties → centang **Unblock** → OK. Atau buka langsung dari Excel via File → Open.

### 🗂️ Mode Lokal

Pilih **"Lanjut tanpa akun"** di halaman login.
Data tersimpan di `localStorage` — tidak sinkron ke cloud, bisa hilang jika cache dihapus.

---

## ⚙️ Catatan Teknis

- `script.js` harus di-load **setelah** semua library (xlsx, jsPDF, html2canvas) di akhir `</body>` — bukan di `<head>`
- Gunakan **Chrome** untuk hasil terbaik; Edge/Firefox dengan Tracking Prevention aktif bisa mengganggu localStorage dan Supabase client
- Warning `Multiple GoTrueClient instances` di console adalah non-fatal, tidak mempengaruhi fungsi app
- Project Supabase **otomatis pause** setelah 7 hari tidak ada aktivitas — resume manual lewat dashboard
- Gemini API Key tersimpan di `localStorage` browser — tidak dikirim ke server manapun selain Google AI API

---

## 📦 Struktur File

```
DuTrack/
├── index.html          # App utama (single-file)
├── script.js           # Semua logika & fungsi
├── style.css           # Styling & tema
├── icon.png            # App icon
└── README.md           # Dokumentasi ini
```

---

*Made with ☕ for beasiswa reporting · Deployed on [Vercel](https://vercel.com) · Backend by [Supabase](https://supabase.com) · AI by [Gemini](https://aistudio.google.com)*
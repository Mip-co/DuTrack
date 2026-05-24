# 💰 DuTrack

> Aplikasi pembukuan keuangan beasiswa — catat pengeluaran, scan struk, dan generate laporan LPJ otomatis.
 
[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-dutrack.vercel.app-7C6AF5?style=for-the-badge)](https://dutrack.vercel.app)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)

---

## ✨ Fitur

| Fitur | Deskripsi |
|---|---|
| 📊 **Dashboard** | Saldo, pemasukan, pengeluaran, grafik tren & kategori |
| 💸 **Transaksi** | Tambah, edit, hapus, filter, search, pagination |
| 📷 **Scan Struk OCR** | Upload foto struk → auto-deteksi nominal & tanggal |
| ☁️ **Cloud Sync** | Sinkronisasi data antar device via Supabase |
| 📋 **Export LPJ Beasiswa** | Generate XLSX siap submit per semester otomatis |
| 📄 **Export PDF** | Laporan lengkap dengan tabel & ringkasan |
| 🌙 **Dark / Light Mode** | Toggle tema sesuai preferensi |
| 🔒 **Mode Lokal** | Gunakan tanpa akun, data tersimpan di browser |

---

## 🛠️ Tech Stack

```
Frontend   → HTML, CSS, Vanilla JavaScript
Charts     → Chart.js
OCR        → Tesseract.js
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
```

Jika berhasil, tabel `transactions` muncul di **Database → Tables**.

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

### 4. Ambil URL & Anon Key

| Field | Lokasi |
|---|---|
| **Project URL** | Settings → Integrations → Data API → API URL *(hapus `/rest/v1/` di akhir)* |
| **Anon Key** | Settings → API Keys → baris `anon public` |

> ⚠️ Jangan gunakan `service_role` key di frontend.

---

### 5. Hubungkan ke DuTrack

1. Buka [dutrack.vercel.app](https://dutrack.vercel.app)
2. Pergi ke **Pengaturan → Konfigurasi Supabase**
3. Isi **Supabase URL** dan **Anon Key**
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

## 📖 Cara Pakai

### ⌨️ Shortcut

| Shortcut | Aksi |
|---|---|
| `Ctrl+K` / `Cmd+K` | Buka modal tambah transaksi cepat |

### 📷 Scan Struk OCR

1. Buka halaman **Scan Struk**
2. Upload / drag & drop foto struk
3. App otomatis deteksi nominal & tanggal
4. Klik **Simpan Transaksi**

> Tips: foto terang, teks jelas, tidak blur, posisi lurus.

### 📋 Export LPJ Beasiswa

1. Klik **Export → LPJ Beasiswa**
2. Pilih semester *(otomatis terdeteksi dari data transaksi)*
3. Isi dana beasiswa per semester *(default Rp 8.400.000)*
4. Paste link bukti (GDrive / PDF) — opsional
5. Klik **Generate XLSX**

File hasil export berisi **3 sheet:**

| Sheet | Isi |
|---|---|
| 📊 Dashboard | KPI dana, tabel per kategori, ringkasan per bulan |
| 📂 Detail Transaksi | Semua transaksi per kategori + keterangan item + link struk |
| 📋 LPJ | Tabel LPJ format beasiswa, kolom bukti ter-merge + link |

### 🗂️ Mode Lokal

Pilih **"Lanjut tanpa akun"** di halaman login.
Data tersimpan di `localStorage` — tidak sinkron ke cloud, bisa hilang jika cache dihapus.

---

## ⚙️ Catatan Teknis

- `script.js` harus di-load **setelah** semua library (xlsx, jsPDF, html2canvas) di akhir `</body>` — bukan di `<head>`
- Gunakan **Chrome** untuk hasil terbaik; Edge/Firefox dengan Tracking Prevention aktif bisa mengganggu localStorage dan Supabase client
- Warning `Multiple GoTrueClient instances` di console adalah non-fatal, tidak mempengaruhi fungsi app
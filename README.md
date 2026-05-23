# DuTrack — Setup & Konfigurasi v2.0

Aplikasi pembukuan keuangan pribadi berbasis web. Dirancang khusus untuk pencatatan pengeluaran beasiswa per semester, lengkap dengan scan struk, cloud sync, dan export laporan LPJ otomatis.

**Website:**
```
https://mip-co.github.io/DuTrack/
```

---

## Fitur

- Dashboard saldo, pemasukan, pengeluaran, dan tabungan
- Tambah, edit, hapus transaksi dengan kategori
- Scan struk otomatis via OCR (Tesseract.js)
- Simpan foto struk ke Supabase Storage
- Export XLSX multi-sheet (Ringkasan, Transaksi, Per Kategori, Per Bulan)
- Export PDF laporan lengkap
- **Export LPJ Beasiswa** — format tabel siap submit per semester
- Dark mode / Light mode
- Login & register via Supabase Auth
- Mode lokal tanpa akun (data di browser)
- Sinkronisasi cloud antar device

---

## Tech Stack

- HTML, CSS, Vanilla JavaScript
- Chart.js — grafik dashboard
- Tesseract.js — OCR scan struk
- Supabase — Auth, Database, Storage
- SheetJS (xlsx-js-style) — export XLSX
- jsPDF + html2canvas — export PDF
- GitHub Pages — hosting

---

## Setup Supabase

### 1. Buat Akun & Project

1. Buka [supabase.com](https://supabase.com) → login / daftar
2. Klik **New Project**
3. Isi nama project, password database, dan region (pilih Singapore)
4. Tunggu project selesai dibuat

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
- Public bucket: **ON** (agar URL struk bisa diakses)

Tambahkan policy storage di **Storage → Policies → receipts:**

```sql
-- Allow authenticated users to upload
create policy "Users can upload receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read
create policy "Public can view receipts"
  on storage.objects for select
  to public
  using (bucket_id = 'receipts');
```

---

### 4. Ambil URL & Anon Key

Masuk ke **Project Settings → API Keys → Legacy anon, service_role API keys:**

| Field | Lokasi |
|---|---|
| **Project URL** | Settings → Integrations → Data API → API URL (hapus `/rest/v1/` di akhir) |
| **Anon Key** | Settings → API Keys → baris `anon public` |

> ⚠️ Jangan gunakan `service_role` key di frontend.

---

### 5. Konfigurasi di DuTrack

1. Buka app → **Pengaturan → Konfigurasi Supabase**
2. Isi **Supabase URL** dan **Anon Key**
3. Klik **Simpan & Hubungkan**
4. Jika berhasil muncul: `Koneksi berhasil! Tabel transactions ditemukan.`

> **Catatan:** Tombol "Test Koneksi" kadang menampilkan gagal meski config benar — ini bug minor. Gunakan langsung **Simpan & Hubungkan**.

---

### 6. Konfigurasi Auth

**Nonaktifkan konfirmasi email** (agar user bisa langsung login tanpa klik link):

```
Authentication → Sign In / Providers → Email → Confirm Email → OFF → Save
```

**Set Site URL:**

```
Authentication → URL Configuration → Site URL
→ https://mip-co.github.io/FinTrack/
```

---

### 7. Register & Login

1. Buka app → klik **Daftar**
2. Isi email dan password → klik **Daftar Sekarang**
3. Login dengan email dan password yang sama
4. Data otomatis tersinkronisasi ke Supabase

---

## Penggunaan

### Mode Lokal (Tanpa Akun)

Pilih **"Lanjut tanpa akun (mode lokal)"** di halaman login.
Data tersimpan di `localStorage` browser — tidak sinkron ke cloud, bisa hilang jika cache dihapus.

### Tambah Transaksi

- Klik tombol **+ Transaksi** atau tekan `Ctrl+K` / `Cmd+K`
- Isi tipe (pemasukan/pengeluaran), nominal, keterangan, kategori, tanggal
- Upload foto struk (opsional) — tersimpan otomatis ke Supabase Storage

### Scan Struk OCR

1. Buka halaman **Scan Struk**
2. Upload atau drag & drop foto struk
3. App otomatis mendeteksi nominal dan tanggal
4. Klik **Simpan Transaksi**

Tips OCR terbaik:
- Foto terang, teks jelas
- Hindari blur
- Posisi struk lurus

### Export Laporan

| Format | Isi |
|---|---|
| **XLSX** | 6 sheet: Ringkasan, Semua Transaksi, Pemasukan, Pengeluaran, Per Kategori, Per Bulan |
| **PDF** | Laporan lengkap: ringkasan, tabel per kategori, per bulan, daftar transaksi |
| **LPJ Beasiswa** | 3 sheet: Dashboard, Detail Transaksi per Kategori, Tabel LPJ siap submit |

### Export LPJ Beasiswa

1. Klik **Export → LPJ Beasiswa**
2. Pilih semester (otomatis terdeteksi dari data transaksi)
3. Isi dana beasiswa per semester (default Rp 8.400.000)
4. Paste link bukti (GDrive / PDF laporan) — opsional
5. Klik **Generate XLSX**

File yang dihasilkan berisi:
- **Sheet Dashboard** — KPI dana, total pengeluaran, sisa, % terpakai, tabel per kategori, ringkasan per bulan
- **Sheet Detail Transaksi** — semua transaksi dikelompokkan per kategori, lengkap dengan keterangan item dan link struk
- **Sheet LPJ** — format tabel LPJ standar beasiswa dengan kolom Bukti ter-merge dan link yang bisa diklik

---

## Deployment (GitHub Pages)

1. Buat repo baru di GitHub
2. Upload `index.html`, `script.js`, `style.css`
3. Buka **Settings → Pages → Source: Deploy from branch → main → / (root)**
4. Tunggu beberapa menit → app live di `https://<username>.github.io/<repo-name>`

---

## Catatan Teknis

- `script.js` harus di-load **setelah** semua library (xlsx, jsPDF, html2canvas) di akhir `</body>` — bukan di `<head>`
- Gunakan **Chrome** untuk hasil terbaik; Edge/Firefox dengan Tracking Prevention aktif bisa mengganggu localStorage dan Supabase client
- Warning `Multiple GoTrueClient instances` di console adalah non-fatal, tidak mempengaruhi fungsi app

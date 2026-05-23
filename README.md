# FinTrack — Setup & Konfigurasi ver 1.0

## 1. Buka Website FinTrack

Website:

```text
https://mip-co.github.io/FinTrack/
```

Saat pertama kali membuka website, login belum bisa digunakan sebelum konfigurasi Supabase dilakukan.

---

# 2. Membuat Akun Supabase

1. Buka:

```text
https://supabase.com
```

2. Login / daftar akun Supabase

3. Klik:

```text
New Project
```

4. Isi:

* Nama project
* Password database
* Region

5. Tunggu sampai project selesai dibuat

---

# 3. Membuat Database Table

## Masuk ke:

```text
Supabase Dashboard
→ SQL Editor
→ New Query
```

## Paste SQL berikut:

```sql
create table transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  type text not null check (type in ('income','expense')),
  amount numeric not null,
  description text,
  category text,
  date date not null,
  created_at timestamptz default now()
);

alter table transactions enable row level security;

create policy "Users can manage own transactions"
  on transactions for all
  using (auth.uid() = user_id);
```

## Klik:

```text
RUN
```

Jika berhasil, table `transactions` akan muncul di:

```text
Database → Tables
```

---

# 4. Mengambil Supabase URL & Anon Key

## Masuk ke:

```text
Project Settings
→ API
```

## Copy:

### Project URL

Contoh:

```text
https://xxxx.supabase.co
```

### anon public key

Key panjang diawali:

```text
eyJhbGciOi...
```

---

# 5. Konfigurasi di FinTrack

## Buka:

```text
Pengaturan → Konfigurasi Supabase
```

Isi:

* Supabase URL
  Bisa diambil dari:

  ```text
  Sidebar → Integration → Data API
  ```

* Anon Key
  Bisa diambil dari:

  ```text
  Project Settings → API Keys → Legacy anon
  ```

Lalu klik:

```text
Simpan & Hubungkan
```

Jika berhasil akan muncul:

```text
Koneksi berhasil
```

---

# 6. Menonaktifkan Confirm Email

Agar user bisa langsung login tanpa verifikasi email.

## Masuk ke:

Authentication
→ Sign In / Providers
→ User Signups

Cari:

```text
Confirm Email
```

Lalu:

```text
OFF
→ Save
```

---

# 7. Mengatur Site URL

## Masuk ke:

```text
Authentication
→ URL Configuration
```

Isi:

```text
Site URL
```

Dengan:

```text
https://mip-co.github.io/FinTrack/
```

Lalu:

```text
Save
```

---

# 8. Register Akun FinTrack

Kembali ke website FinTrack.

## Klik:

```text
Daftar
```

Isi:

* Email
* Password

Lalu klik:

```text
Daftar Sekarang
```

---

# 9. Login

Setelah berhasil register:

## Login menggunakan:

* Email
* Password

Jika berhasil:

* data otomatis tersinkronisasi ke Supabase
* transaksi tersimpan di cloud
* data bisa diakses antar device

---

# 10. Catatan

## Jika menggunakan:

```text
Lanjut tanpa akun (mode lokal)
```

Maka:

* data hanya tersimpan di browser
* tidak sinkron ke cloud
* data bisa hilang jika cache browser dihapus

---

# 11. OCR Scan Struk

Untuk hasil OCR terbaik:

* gunakan foto terang
* teks struk jelas
* hindari blur
* posisi struk lurus

---

# 12. Deployment

FinTrack berjalan menggunakan:

* HTML
* CSS
* Vanilla JavaScript
* Supabase
* GitHub Pages

Tanpa backend server tambahan.

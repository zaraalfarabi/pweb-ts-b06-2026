# RS Sehat Sentosa — Sistem Antrian Rumah Sakit

Praktikum Pemrograman Web Modul 3. Dibuat **native** (HTML, CSS, TypeScript) tanpa
framework/library JS maupun CSS, dan tanpa template.

## Pembagian tugas

| Anggota | Bagian | File |
|---|---|---|
| Orang 1 — Azza | Login, autentikasi & fondasi proyek | `login.html`, `css/login.css`, `src/login.ts`, `src/session.ts`, `tsconfig.json` |
| Orang 2 | Dashboard Admin & manajemen antrian | `index.html`, `css/dashboard.css`, `src/dashboard.ts` |
| Orang 3 | Operator, layar & ambil antrian | `operator.html`, `layar.html`, `ambil-antrian.html` + `.ts` masing-masing |

## Struktur folder

```
/                     File .html (login.html, index.html, operator.html, layar.html, ambil-antrian.html)
css/                  Satu file CSS per halaman (login.css, dashboard.css, ...)
src/                  Kode TypeScript (.ts) — SEMUA kode ditulis di sini
dist/                 Hasil kompilasi (.js) — jangan diedit manual
assets/               Gambar
tsconfig.json         Konfigurasi TypeScript (src/ -> dist/)
```

## Alur kompilasi

```bash
npm install        # sekali saja, memasang TypeScript
npm run build      # kompilasi semua src/*.ts ke dist/*.js
npm run watch      # kompilasi otomatis setiap file disimpan
```

Buka halaman dengan Live Server. File `.ts` baru di `src/` otomatis ikut dikompilasi.

## Aturan untuk anggota lain

1. **Hubungkan script dengan `defer`, `session.js` selalu paling atas:**
   ```html
   <script src="dist/session.js" defer></script>
   <script src="dist/dashboard.js" defer></script>
   ```
2. **Bungkus seluruh isi file `.ts` dalam IIFE.** Proyek ini tidak memakai ES module, jadi
   semua file berbagi scope global. Tanpa pembungkus, nama yang sama di dua file
   (misal `const form`) akan error saat kompilasi.
   ```ts
   (() => {
     const form = document.querySelector("form");
     // ...kode halaman
   })();
   ```
3. Halaman publik (`layar.html`, `ambil-antrian.html`) tidak perlu mengecek sesi.

## Fungsi bersama (`src/session.ts`)

Fungsi berikut global, bisa langsung dipanggil dari file `.ts` mana pun:

| Fungsi | Kegunaan |
|---|---|
| `getSession()` | Mengembalikan `{ token, role, firstName }` atau `null` jika belum login |
| `isAuthenticated()` | `true` jika sesi valid |
| `hasAdminAccess(role)` | `true` untuk `admin` dan `moderator` (moderator = admin) |
| `getHomePageForRole(role)` | `"index.html"` untuk admin/moderator, `"operator.html"` untuk user |
| `logout()` | Menghapus sesi lalu kembali ke `login.html` |
| `clearSession()` | Menghapus sesi tanpa redirect |

Contoh Auth Guard + Role Guard untuk `dashboard.ts` (Orang 2):

```ts
(() => {
  const session = getSession();
  if (!session) {
    window.location.replace("login.html");
    return;
  }
  if (!hasAdminAccess(session.role)) {
    window.location.replace(getHomePageForRole(session.role));
    return;
  }
  // tampilkan session.firstName, session.role, tombol logout -> logout()
})();
```

## Key Local Storage sesi

| Key | Isi |
|---|---|
| `queueToken` | `accessToken` dari DummyJSON |
| `queueRole` | `admin` / `moderator` / `user` |
| `queueFirstName` | Nama depan pengguna |
| `queueRememberUsername` | (opsional) username untuk fitur "Ingat saya" |

Key untuk data Jenis Antrian dan Tiket Antrian disepakati oleh Orang 2 & Orang 3.

## Detail login (Orang 1)

- `POST https://dummyjson.com/auth/login` dengan `username` & `password` → `accessToken`.
- Role diambil dari `GET https://dummyjson.com/auth/me` (header `Authorization: Bearer <token>`),
  cadangan `GET /users/{id}`, karena respons `/auth/login` DummyJSON tidak memuat `role`.
- Loading state: tombol berubah "Memverifikasi..." + spinner, input dikunci.
- Error handling (`try...catch`): kredensial salah, server tidak merespons (15 detik), koneksi gagal.
- Redirect: admin/moderator → `index.html`, user → `operator.html`. Jika sudah login,
  membuka `login.html` langsung diarahkan ke halaman sesuai role.
- Akun uji diambil dari `/users/filter?key=role&value=admin` dan `...value=user`,
  ditampilkan sebagai tombol di bawah form (klik untuk mengisi).

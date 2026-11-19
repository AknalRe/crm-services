---
name: anti-slop
description: >-
  Gunakan setiap kali membuat atau mengubah UI, copy, komentar, atau mockup Reneo CRM
  (komponen React, landing page, modal, dashboard). Melarang elemen macOS, ikon Sparkles,
  dekorasi AI generik, jargon teknis di halaman calon pembeli, dan kode berisik.
---

# Anti-Slop Reneo CRM

Setiap piksel, ikon, dan kalimat wajib punya fungsi nyata.

## 1. Visual Slop (Dilarang)

1. Tiga bulatan merah/kuning/hijau gaya macOS di window, dialog, landing, atau mockup.
2. **Ikon `Sparkles`, `Sparkle`, `WandSparkles`** (dilarang total tanpa pengecualian) serta ikon dekoratif tanpa fungsi (bintang, perisai, centang-lingkaran sebagai lencana kepercayaan palsu).
3. Emoji sebagai ikon UI atau penghias judul.
4. Kartu melayang tanpa fungsi, ilustrasi AI generik (orb/blob/mesh), gradient dekoratif multi-warna, dan kartu bersarang (card di dalam card).
5. Grid tiga kartu identik berisi ikon + judul + kalimat — gunakan kontainer terbagi (`divide-x`/`divide-y`) atau tabel/daftar yang padat.
6. Angka atau klaim fiktif tanpa sumber.

## 2. Copy Slop (Dilarang)

1. Kata kosong: `"seamless"`, `"dengan mulus"`, `"powerful"`, `"next-generation"`, `"cutting-edge"`, `"revolutionary"`, `"all-in-one"`.
2. **Halaman calon pembeli / landing page**: dilarang memakai istilah/kode teknis internal (`PostgreSQL`, `Redis`, `Docker`, `WAHA`, `@g.us`, `self-hosted`, `SSE`, `HttpOnly`, `RBAC`, `MCP`, `endpoint API`) — tulis manfaat bisnis konkret dalam bahasa sehari-hari.
3. Tombol memakai kata kerja konkret (*Kirim Permintaan*, *Coba Gratis 7 Hari*, *Simpan Kontak*).
4. Pesan error menyebut apa yang gagal dan langkah perbaikannya.

## 3. Layout & Mobile

1. Halaman publik wajib scrollable dan nyaman di layar ponsel (`text-sm`/`text-base` untuk body, tab horizontal scrollable di mobile, tombol minimal `40–46px`).
2. Hover tidak menggeser layout.

## 4. Checklist Sebelum Selesai

- [ ] Tidak ada `Sparkles`, `Sparkle`, `WandSparkles`, emoji ikon, atau bulatan macOS.
- [ ] Tidak ada lencana kepercayaan palsu, kartu bersarang, atau gradient dekoratif liar.
- [ ] Copy landing page bebas jargon teknis dan bebas kata kosong.
- [ ] Tampilan desktop & mobile terbaca nyaman.
- [ ] `npm test` (backend) dan `npm run build` (backend & frontend) lulus bersih.

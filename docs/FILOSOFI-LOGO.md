# Filosofi & Pembentukan Logo Reneo CRM

> **Reneo CRM**: Kelola pelanggan, bukan hanya percakapannya — pusat komunikasi dan relasi pelanggan dalam ekosistem **Reneo**.

Dokumen ini mencatat filosofi, tahapan pembentukan bentuk, dan spesifikasi teknis logo **Reneo CRM** agar tetap konsisten di seluruh permukaan aplikasi (sidebar, halaman login, landing page, favicon, dan App Store Reneo Panel).

---

## 1. DNA Visual Ekosistem Reneo

Sebagai produk utama layanan bisnis di ekosistem Reneo, **Reneo CRM** menetapkan standar visual yang juga diturunkan ke produk lain (seperti **Reneo SIDesa**):

| Elemen | Nilai | Peran & Makna |
| :--- | :--- | :--- |
| **Kanvas** | `viewBox="0 0 512 512"` | Grid persegi presisi untuk skalabilitas dari `16px` hingga cetak |
| **Wadah Squircle** | `x=40 y=40 w=432 h=432 rx=92` | Bingkai aplikasi yang ramah namun tegas |
| **Reneo Navy** | `#0B2A57` | Kepercayaan, ketenangan kendali, dan profesionalitas operasional |
| **Reneo Emerald** | `#10B981` | Respons cepat, koneksi aktif (pesan terkirim/terbalas), dan pertumbuhan bisnis |
| **Putih Bersih** | `#FFFFFF` | Kejernihan komunikasi dan fokus pada konteks pelanggan |

---

## 2. Tahap Pembentukan Logo (4 Lapisan)

Logo **Reneo CRM** disusun dari 4 lapisan geometris yang saling melengkapi:

### Tahap 1 — Wadah Squircle Navy (`#0B2A57`)
- **Bentuk**: Persegi sudut membulat `432 × 432` (`rx="92"`).
- **Makna**: Satu ruang kerja terpusat tempat seluruh kanal percakapan dan data pelanggan berkumpul tanpa tercecer.

### Tahap 2 — Balon Percakapan Belakang Emerald (`#10B981`)
- **Bentuk**: Balon pesan kanan atas (`x: 216–408, y: 106–286`) dengan ekor mengarah ke kanan bawah.
- **Makna**: Melambangkan pesan masuk dari pelanggan dan kanal aktif (WhatsApp, web chat, dll.) yang hidup dan bergerak dinamis.

### Tahap 3 — Balon Percakapan Utama Putih (`#FFFFFF`)
- **Bentuk**: Balon pesan utama di kiri depan (`x: 104–356, y: 154–408`) dengan ekor mengarah ke kiri bawah dan garis pemisah tebal `stroke="#0B2A57" stroke-width="18"`.
- **Makna**: Melambangkan respons tim yang jernih, terstruktur, dan terpisah rapi dari kebisingan kanal lain. Garis tepi navy menciptakan kontras tegas (*cutout*) terhadap balon hijau di belakangnya sehingga siluet dua arah komunikasi tetap terbaca jelas di ukuran kecil.

### Tahap 4 — Monogram "R" Reneo di Tengah Balon Utama
- **Bentuk**: Monogram **"R"** geometris berwarna **Reneo Navy (`#0B2A57`)**, diposisikan dengan `translate(83.3, 116.5) scale(0.56)` di dalam balon putih.
- **Makna**: Menyatukan dua hal sekaligus — komunikasi dua arah dan **kendali relasi pelanggan (Reneo)**. Celah horizontal putih di tengah huruf "R" mencerminkan jalur komunikasi yang lancar dan terarah.

---

## 3. Anatomi Geometri Monogram "R"

Monogram **"R"** dibuat dari primitif SVG murni (tanpa ketergantungan font):
- **Mangkuk Kanan**: `rect x="146" y="150" width="220" height="152" rx="62"`
- **Batang Vertikal Kiri**: `rect x="146" y="150" width="60" height="216"`
- **Kaki Diagonal**: `polygon points="238,296 300,296 378,366 310,366"`
- **Ruang Negatif (Potongan Putih)**: Bilah horizontal `height="16" rx="8"` pada `y="212"` dan potongan bawah `polygon points="206,302 244,302 300,366 206,366"`.

Struktur ini sengaja dibuat tebal dan geometris agar tetap terbaca utuh pada ukuran `16×16px` (favicon) maupun `512×512px` (splash/marketing).

---

## 4. Sumber Aset & Aturan Penggunaan

- **Komponen React**: `frontend/src/components/ReneoCrmLogo.tsx`
- **Ikon App Store Reneo Panel**: `public/icons/apps/reneo-crm.svg` (di repositori `homeserver-desktop`)

### Pedoman Praktis
1. **Konsistensi warna**: Jangan mengganti `#0B2A57` atau `#10B981` dengan gradient dekoratif.
2. **Kontras latar**: Karena wadah squircle sudah berwarna navy solid `#0B2A57`, logo dapat langsung dipakai di latar terang (`#FFFFFF` / `#F8FAFC`) maupun latar gelap (`#0F172A`) tanpa kotak tambahan.
3. **Skala minimum**: Hindari menampilkan logo di bawah `16px`.

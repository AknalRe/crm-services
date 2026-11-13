# CRM Services - WhatsApp Broadcast & Lead Tracking Hub 🚀

Sistem CRM berbasis **Docker** berkinerja tinggi (*high performance*) yang dibangun menggunakan **Fastify**, **Drizzle ORM**, **TypeScript**, **PostgreSQL**, dan **Redis (BullMQ)** untuk manajemen pelanggan, siaran WhatsApp (Broadcast Langsung, Terjadwal, & Ucapan Ulang Tahun Otomatis), pelacakan status lead (terkirim, sampai/centang dua, dibaca/centang biru), serta fitur obrolan pelanggan (Live Chat CRM).

Didukung oleh engine **WAHA (WhatsApp HTTP API)** dengan fleksibilitas:
1. **WAHA Internal (Bawaan Docker)**: Langsung jalan tanpa install apa-apa, tinggal scan QR di dashboard CRM.
2. **WAHA Eksternal / Service Notifikasi Reneo**: Cukup masukkan Base URL, API Key, dan nama sesi.

---

## ⚡ Tech Stack

| Layer | Teknologi | Deskripsi |
| :--- | :--- | :--- |
| **Backend Framework** | **Fastify (v4)** + **TypeScript** | Framework web Node.js tercepat dan efisien dengan overhead minimal |
| **Database ORM** | **Drizzle ORM** + `postgres.js` | ORM type-safe modern, super cepat dengan *zero-cost abstraction* |
| **Database** | **PostgreSQL 16** | Database relasional tangguh untuk kontak, kampanye, event status, dan chat |
| **Queue & Scheduler** | **BullMQ** + **Redis 7** | Antrean pengiriman pesan berurutan, pacing anti-ban, dan scheduler terjadwal |
| **Scheduler Harian** | **node-cron** | Robot ucapan ulang tahun otomatis harian setiap pagi |
| **Frontend UI** | **React 18** + **Vite** + **Tailwind CSS** | Dashboard modern, responsif, dan interaktif |
| **Web Server SPA** | **Nginx Alpine** | Reverse proxy untuk API & serving build produksi frontend |
| **WhatsApp Gateway** | **WAHA (WhatsApp HTTP API)** | Driver WhatsApp HTTP dengan webhook pesan & status centang (ack) |
| **Containerization** | **Docker & Docker Compose** | Multi-container orchestration (5 container terisolasi) |

---

## 🌟 Fitur Utama

### 1. Manajemen Data Pelanggan (CRM Contacts)
- Input data lengkap:
  - `nama_lengkap` (Nama Lengkap)
  - `nama_panggilan` (Nama Panggilan untuk sapaan akrab di template)
  - `tanggal_lahir` (Tanggal Lahir untuk robot ulang tahun)
  - `nomor_whatsapp` (Normalisasi otomatis ke format internasional `628...`)
  - `alamat` (Alamat Domisili / Pengiriman)
  - `tags` / Segmen Pelanggan (e.g. VIP, Retail, Leads, Loyal)
- Fitur pencarian cepat, filter berdasarkan tag segmen, serta **Import Pelanggan via CSV**.
- Opsi multi-select kontak untuk langsung melakukan broadcast ke kontak yang dipilih.

### 2. WhatsApp Broadcast Engine
- **3 Mode Siaran**:
  1. **Broadcast Langsung (Immediate)**: Kirim antrean pesan sekarang juga.
  2. **Siaran Terjadwal (Scheduled)**: Tentukan tanggal dan jam spesifik untuk dikirim secara otomatis.
  3. **Ucapan Ulang Tahun Otomatis (Birthday Bot)**: Sistem mengecek tanggal lahir setiap pagi (default jam 08:00 WIB) dan mengirim ucapan personal.
- **Pemilihan Target Penerima Fleksibel**:
  - Semua kontak.
  - Berdasarkan Tag Segmen (e.g. hanya tag `VIP`).
  - Pilih manual kontak tertentu dari daftar.
- **Template Pesan Dinamis**:
  - Variabel tags: `{nama_lengkap}`, `{nama_panggilan}`, `{alamat}`, `{nomor_whatsapp}`.
  - Dilengkapi fitur *Live Message Preview* interaktif.
- **Sistem Anti-Ban & Pacing Jeda**:
  - **Jeda Waktu per Pesan**: Delay detik antar pesan (disarankan 5–10 detik).
  - **Interval Istirahat Batch**: Pacing jeda istirahat (misal: jeda 30 detik tiap 10 pesan) plus jitter realistis agar nomor WhatsApp tidak terdeteksi bot/spam.

### 3. Dashboard Analitik & Lead Tracking (Delivered & Read Receipts)
- Ringkasan KPI:
  - Total Pelanggan Aktif
  - Pesan Terkirim (Sent ke server WhatsApp)
  - Pesan Sampai / Delivered (Centang Dua Abu-abu)
  - Pesan Dibaca / Read Receipts (Centang Dua Biru)
  - Delivery Rate (%) & Read Rate (%)
  - Pelanggan yang Berulang Tahun Hari Ini
- Real-time Lead Event Stream yang menangkap webhook WAHA saat pesan sampai dan dibaca pelanggan.

### 4. Live Chat CRM (Long-Term Vision)
- Antarmuka obrolan WhatsApp terintegrasi langsung di dalam CRM:
  - Panel daftar percakapan aktif dengan badge pesan belum dibaca.
  - Feed pesan interaktif (pesan masuk dari lead & pesan keluar dari tim/bot dengan tanda centang).
  - Kotak balas pesan langsung ke WhatsApp lead.
  - Kartu profil ringkas pelanggan di panel sebelah kanan.

### 5. Integrasi WAHA & Service Reneo WhatsApp
- QR Code scanner langsung tertanam di dalam aplikasi CRM (tidak perlu buka terminal).
- Pilihan koneksi:
  - **Mode Lokal**: Menggunakan container WAHA internal `http://waha:3000`.
  - **Mode Reneo / Eksternal**: Bawa API Key sendiri dan Base URL layanan Reneo.
- Tombol uji coba pengiriman pesan (Test Send) langsung dari dashboard.

---

## 🏗️ Struktur Direktori

```
crm-services/
├── docker-compose.yml       # Orkestrasi 5 container: Postgres, Redis, WAHA, Backend, Frontend
├── .env.example             # Variabel konfigurasi lingkungan
├── backend/                 # Fastify + Drizzle ORM + TypeScript + BullMQ
│   ├── drizzle.config.ts    # Konfigurasi Drizzle Kit
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts    # Drizzle Schema (contacts, campaigns, recipients, chats, settings)
│   │   │   └── index.ts     # Koneksi postgres.js & inisialisasi tabel otomatis
│   │   ├── services/        # WahaService, QueueService (BullMQ), BirthdayService, BroadcastService
│   │   ├── routes/          # Fastify Routes & WAHA Webhook Receiver
│   │   └── server.ts        # Fastify server bootstrap & graceful shutdown
│   └── Dockerfile
├── frontend/                # React (Vite) + Tailwind CSS + Lucide Icons + Nginx
│   ├── src/
│   │   ├── pages/           # Dashboard, Contacts, Broadcasts, Birthday, Tracking, Conversations, Settings
│   │   ├── components/      # Sidebar, Navbar, StatCard, QRCodeModal
│   │   └── services/api.ts  # Axios client
│   ├── nginx.conf           # Reverse proxy SPA & /api/
│   └── Dockerfile
```

---

## 🚀 Cara Menjalankan dengan Docker

### 1. Prasyarat
- Docker dan Docker Compose.

### 2. Jalankan Container
Salin `.env.example` ke `.env` (jika belum ada), lalu jalankan:
```bash
docker compose up -d --build
```

Container yang akan berjalan otomatis:
1. `crm_postgres`: Database PostgreSQL 16
2. `crm_redis`: Antrean BullMQ untuk broadcast terjadwal & pacing delay
3. `crm_waha`: Engine WhatsApp HTTP API
4. `crm_backend`: Fastify API & background worker (otomatis menginisialisasi tabel database saat start)
5. `crm_frontend`: Dashboard web Nginx + React

### 3. Akses Aplikasi
- **Dashboard CRM**: [http://localhost:8080](http://localhost:8080)
- **API Backend**: [http://localhost:5000/health](http://localhost:5000/health)
- **WAHA API**: [http://localhost:3000](http://localhost:3000)

---

## 📱 Panduan Tautkan WhatsApp (Scan QR)

1. Buka dashboard CRM di [http://localhost:8080](http://localhost:8080).
2. Klik tombol **"Scan QR"** di navbar atas atau sidebar.
3. Buka WhatsApp di smartphone Anda:
   - Ketuk menu titik tiga (Android) atau Pengaturan (iOS).
   - Pilih **Perangkat Tertaut (Linked Devices)**.
   - Ketuk **Tautkan Perangkat** dan arahkan kamera ke QR code di layar CRM.
4. Status WhatsApp akan berubah menjadi **"Terhubung (Online)"** dan sistem siap digunakan!

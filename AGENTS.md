# Reneo CRM — Aturan Proyek & Anti-Slop

Setiap perubahan UI, copy, maupun landing page wajib mengikuti skill `anti-slop` ([.agents/skills/anti-slop/SKILL.md](.agents/skills/anti-slop/SKILL.md)):

- **Dilarang total** ikon `Sparkles`, `Sparkle`, `WandSparkles`, emoji sebagai ikon UI, bulatan traffic light macOS, lencana kepercayaan palsu (perisai/bintang/centang dekoratif), dan kartu bersarang.
- **Landing page / halaman publik**: bebas jargon/kode teknis internal (`PostgreSQL`, `Redis`, `WAHA`, `@g.us`, `self-hosted`, `Docker`, `SSE`, `HttpOnly`, `RBAC`, `MCP`, `endpoint API`), gunakan bahasa manfaat bisnis yang jelas, mobile-first, dan ukuran teks nyaman dibaca.
- Sebelum rilis, jalankan `npm test && npm run build` di `backend/` dan `npm run build` di `frontend/`.

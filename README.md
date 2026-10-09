# MeetZone Base

> Base awal dan prototipe arsitektur video conference real-time menggunakan **Node.js**, **Express**, **Socket.IO**, dan **WebRTC Mesh**. Repositori ini dibuat sebagai fondasi awal pembelajaran dan pengembangan sistem komunikasi video peer-to-peer sebelum dievolusikan ke arsitektur SFU (Selective Forwarding Unit).

---

## 📋 Daftar Isi

1. [Gambaran Umum](#-gambaran-umum)
2. [Fitur Utama](#-fitur-utama)
3. [Arsitektur & Cara Kerja (WebRTC Mesh)](#-arsitektur--cara-kerja-webrtc-mesh)
4. [Struktur Proyek](#-struktur-proyek)
5. [Alur Aplikasi](#-alur-aplikasi)
6. [Spesifikasi Event Socket.IO](#-spesifikasi-event-socketio)
7. [Prasyarat & Instalasi](#-prasyarat--instalasi)
8. [Panduan Menjalankan](#-panduan-menjalankan)
9. [Konfigurasi TURN (Produksi)](#-konfigurasi-turn-produksi)
10. [Analisis Batasan Teknis & Roadmap](#-analisis-batasan-teknis--roadmap)
11. [Evolusi ke MeetZone Modern (SFU)](#-evolusi-ke-meetzone-modern-sfu)
12. [Lisensi](#-lisensi)

---

## 🌟 Gambaran Umum

**MeetZone Base** mendemonstrasikan implementasi minimalis sistem meeting online tanpa ketergantungan platform pihak ketiga berbayar. Sistem mengombinasikan:

- **Express.js** untuk menyajikan berkas frontend statis dan routing HTTP.
- **Socket.IO** sebagai kanal signaling dua arah berkecepatan tinggi.
- **WebRTC (Web Real-Time Communication)** untuk transmisi media audio/video langsung antar peramban (*peer-to-peer*).

Repositori ini **lengkap dan dapat dijalankan (end-to-end)**: server signaling, styling, dan logika WebRTC sisi klien (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`) sudah tersedia.

---

## ✨ Fitur Utama

- **Lobby & Room Generator**: Pembuatan kode ruang meeting acak (format `xxx-0000`) atau memasukkan ruang yang sudah ada, dengan penyimpanan nama pengguna di `localStorage`.
- **In-Memory Room Management**: Manajemen peserta ruang berbasis memori RAM di server.
- **WebRTC Signaling Pipeline**: Pertukaran session description (`offer`, `answer`) dan `ice-candidate` lengkap, menggunakan pola **Perfect Negotiation** untuk menangani tabrakan negosiasi (glare).
- **Pre-Join Screen**: Antarmuka pengujian input video/audio dan nama sebelum masuk ke ruang utama, dengan toggle mic/kamera langsung.
- **Dynamic Video Grid**: Tata letak grid video responsif yang menyesuaikan jumlah peserta (1–9+).
- **Kontrol Media Real-Time**: Sinkronisasi status mikrofon, kamera, dan screen sharing antar peserta.
- **Audio Activity (Speaking Indicator)**: Deteksi suara lokal & remote via `AudioContext` dan `AnalyserNode`, menampilkan sorotan pada tile yang sedang bersuara.
- **Kanal Chat Teks Real-Time**: Pengiriman pesan instan dalam ruang menggunakan Socket.IO broadcast.
- **Salin Link & Keluar**: Aksi salin tautan undangan dan keluar ruang dengan pembersihan koneksi otomatis.

---

## 🏗 Arsitektur & Cara Kerja (WebRTC Mesh)

Aplikasi ini menggunakan topologi **Full Mesh (P2P Mesh)**:

```text
[ Browser A ] <========== WebRTC Direct Stream ==========> [ Browser B ]
      \                                                          /
       \                                                        /
        \---> [ Node.js Signaling Server (Socket.IO) ] <-------/
```

### 1. Alur Signaling (Handshake)

1. **Join**: Klien baru menghubungkan Socket.IO dan memancarkan event `join-room`.
2. **Peer Discovery**: Server membalas dengan daftar peer yang sudah aktif di room tersebut (`others`).
3. **Offer**: Klien pemula membuat `RTCPeerConnection`, menambahkan track lokal, membuat `SDP Offer`, dan mengirimkannya ke peer target via server (`offer`).
4. **Answer**: Peer penerima menyetel remote description, membuat `SDP Answer`, dan mengirimkannya kembali (`answer`).
5. **ICE Candidates**: Kedua belah pihak saling bertukar kandidat alamat jaringan (`ice-candidate`) untuk melubangi firewall/NAT (*NAT traversal*).
6. **Direct Media**: Setelah jalur P2P terbentuk, aliran audio dan video mengalir langsung antar browser tanpa melewati server Node.js.

### 2. Perfect Negotiation

Untuk mencegah konflik saat kedua peer membuat penawaran bersamaan, setiap peer diberi peran `polite` / `impolite` berdasarkan perbandingan `socket.id`. Peer *impolite* mengabaikan offer yang bertabrakan, sedangkan peer *polite* melakukan *rollback*. Implementasi mengacu pada pola **"Perfect Negotiation"** dari spesifikasi WebRTC.

---

## 📁 Struktur Proyek

```text
meetzone-base/
├── .gitignore             # Mengabaikan node_modules/ dan file sementara
├── LICENSE                # Lisensi ISC
├── README.md              # Dokumentasi ini
├── package.json           # Definisi dependensi (Express 5, Socket.IO 4)
├── package-lock.json      # Kunci versi dependensi npm
├── server.js              # Server HTTP & WebSocket Signaling Socket.IO
└── public/                # Aset frontend statis
    ├── index.html         # Halaman lobi (input nama & kode room)
    ├── meeting.html        # Antarmuka ruang meeting & kontrol UI
    ├── meeting.js          # Logika WebRTC client, chat, screen share, grid
    └── style.css           # Styling lobby & ruang meeting
```

### Rincian File

- **`server.js`**:
  - Inisialisasi Express & Server Socket.IO dengan CORS permissive (`origin: '*'`).
  - Penyimpanan sesi kamar di objek memori:
    ```javascript
    rooms[roomId] = { participants: { socketId: { name, joinedAt } } };
    ```
  - Routing: `/` menyajikan `public/index.html`, `/meeting/:roomId` menyajikan `public/meeting.html`.
  - Relay event WebRTC dan sinkronisasi status peserta.

- **`public/index.html`**:
  - Halaman awal untuk pengguna.
  - Menyimpan nama lokal (`localStorage.getItem('mz-name')`).
  - Generator kode ruang acak otomatis.

- **`public/meeting.html`**:
  - Struktur DOM untuk layar pre-join (`#preJoin`) dan ruang meeting (`#meetingRoom`).
  - Komponen video grid (`#videoGrid`), sidebar chat (`#chatPanel`), dan toolbar kontrol.

- **`public/meeting.js`**:
  - Manajemen `RTCPeerConnection` per peer, negosiasi, dan relay ICE.
  - Capture media: `getUserMedia` (kamera/mic) dan `getDisplayMedia` (screen share).
  - Render grid dinamis, indikator bicara, chat, dan kontrol room.

- **`public/style.css`**:
  - Sistem desain gelap (dark theme) dengan variabel CSS, tata letak responsif, dan transisi halus.

---

## 🔄 Alur Aplikasi

```text
Lobby (index.html)
   │  isi nama + kode room → redirect /meeting/:roomId?name=...
   ▼
Pre-Join (meeting.html #preJoin)
   │  preview kamera/mic + toggle → klik "Gabung Sekarang"
   ▼
Ruang Meeting (#meetingRoom)
   │  init local tile → koneksi Socket.IO → join-room
   │  peer discovery → offer/answer/ICE → media P2P mengalir
   ▼
Kontrol: mic, kamera, share screen, chat, salin link, keluar
```

---

## 📡 Spesifikasi Event Socket.IO

| Event | Arah | Payload | Keterangan |
| :--- | :--- | :--- | :--- |
| `join-room` | Client → Server | `{ roomId, name }` | Mendaftarkan socket ke room (dengan callback) |
| `user-joined` | Server → Client | `{ id, name }` | Memberitahu peer lain ada pengguna baru |
| `user-left` | Server → Client | `{ id, name }` | Memberitahu peer lain bahwa peserta keluar |
| `offer` | Client → Server | `{ to, sdp }` | Mengirim SDP Offer ke peer tujuan |
| `offer` | Server → Client | `{ from, name, sdp }` | Meneruskan SDP Offer dari peer asal |
| `answer` | Client → Server | `{ to, sdp }` | Mengirim SDP Answer balasan |
| `answer` | Server → Client | `{ from, sdp }` | Meneruskan SDP Answer dari peer asal |
| `ice-candidate` | Client → Server | `{ to, candidate }` | Mengirim kandidat ICE |
| `ice-candidate` | Server → Client | `{ from, candidate }` | Meneruskan kandidat ICE dari peer asal |
| `chat-message` | Client → Server | `{ roomId, message }` | Mengirim pesan chat |
| `chat-message` | Server → Client | `{ id, name, message, time }` | Siaran pesan chat ke seluruh room |
| `media-state` | Client → Server | `{ roomId, micOn, camOn }` | Mengirim status audio/video |
| `peer-media-state` | Server → Client | `{ id, micOn, camOn }` | Meneruskan status media peer |
| `screen-sharing` | Client → Server | `{ roomId, active }` | Sinyal mulai/berhenti berbagi layar |
| `peer-screen-share` | Server → Client | `{ id, active }` | Meneruskan status share screen peer |
| `leave-room` | Client → Server | `{ roomId }` | Sinyal pengguna keluar secara eksplisit |

> **Catatan**: Server meneruskan status media dengan nama event berbeda (`peer-media-state`, `peer-screen-share`) agar klien dapat membedakan event keluar dari server dan event masuk dari peer lain.

---

## ⚙️ Prasyarat & Instalasi

### Prasyarat

- **Node.js** versi 18 LTS atau lebih baru.
- **npm** versi 9 atau lebih baru.
- Peramban modern (Chrome, Edge, Firefox, Safari) yang mendukung WebRTC.
- **HTTPS atau `localhost`** — API `getUserMedia`/`getDisplayMedia` hanya berjalan pada konteks aman (*secure context*).

### Instalasi

1. Clone repositori ini:
   ```bash
   git clone https://github.com/LT-SYAII/meetzone-base.git
   cd meetzone-base
   ```

2. Pasang dependensi:
   ```bash
   npm install
   ```

---

## 🚀 Panduan Menjalankan

1. Jalankan server:
   ```bash
   npm start
   ```
   *(Atau tentukan port khusus via environment variable: `PORT=4000 npm start`)*

2. Buka peramban:
   ```text
   http://localhost:3000
   ```

3. Uji koneksi multi-user:
   - Buka tab/jendela browser kedua (atau mode incognito).
   - Masukkan kode ruang yang sama.
   - Berikan izin akses kamera dan mikrofon.
   - Video kedua peserta akan muncul bersebelahan setelah negosiasi selesai.

---

## 🔐 Konfigurasi TURN (Produksi)

STUN publik saja tidak cukup untuk sebagian jaringan (mis. NAT simetris, firewall operator seluler). Untuk reliabilitas produksi, tambahkan server **TURN** (mis. [Coturn](https://github.com/coturn/coturn)) pada konfigurasi di `public/meeting.js`:

```javascript
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:turn.example.com:3478',
      username: 'user',
      credential: 'password',
    },
  ],
};
```

---

## ⚠️ Analisis Batasan Teknis & Roadmap

Sebagai prototipe dasar (*base*), implementasi ini memiliki sejumlah karakteristik arsitektural yang perlu dipahami:

1. **Konsumsi Bandwidth P2P Mesh ($N \times (N-1)$)**:
   - Dalam topologi mesh, setiap peserta mengirimkan $N-1$ video stream ke setiap peserta lain.
   - Ideal hanya untuk **2 sampai 4 peserta**. Untuk 5+ peserta, bandwidth upload klien dan utilisasi CPU akan melonjak drastis.
2. **Kebutuhan STUN/TURN**:
   - Untuk koneksi antar perangkat di jaringan internet publik (lintas NAT simetris / firewall operator), konfigurasi `iceServers` wajib menyertakan server TURN.
3. **Penyimpanan State In-Memory**:
   - Objek `rooms` berada di memori proses Node.js. Jika server restart, seluruh sesi meeting terhapus. Untuk arsitektur multi-server diperlukan Redis Adapter.
4. **Tanpa Persistensi & Autentikasi**:
   - Tidak ada basis data, akun pengguna, atau rekaman. Room bersifat sementara (*ephemeral*).

---

## 🚀 Evolusi ke MeetZone Modern (SFU)

Prototipe ini adalah batu loncatan awal. Untuk kebutuhan produksi skala besar, proyek MeetZone telah berevolusi ke arsitektur **SFU (Selective Forwarding Unit)** modern dengan:

- **Next.js (App Router) + React 19 + Tailwind CSS**
- **LiveKit SFU Engine**: Mengubah konsumsi bandwidth dari $O(N^2)$ menjadi $O(N)$ (1 upload, $N-1$ download).
- **SQLite Database** (`node:sqlite`) untuk multi-tenant SaaS, autentikasi sesi, ruang tunggu (*waiting room*), PIN passcode, dan pencatatan rekaman meeting.

---

## 📄 Lisensi

Proyek ini dirilis di bawah lisensi [ISC](./LICENSE) untuk keperluan pembelajaran, eksplorasi open-source, dan pengembangan mandiri.

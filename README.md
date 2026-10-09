# MeetZone Base

> Base awal dan prototipe arsitektur video conference real-time menggunakan **Node.js**, **Express**, **Socket.IO**, dan **WebRTC Mesh**. Repositori ini dibuat sebagai fondasi awal pembelajaran dan pengembangan sistem komunikasi video peer-to-peer sebelum dievolusikan ke arsitektur SFU (Selective Forwarding Unit).

---

## 📋 Daftar Isi

1. [Gambaran Umum](#-gambaran-umum)
2. [Fitur Utama](#-fitur-utama)
3. [Arsitektur & Cara Kerja (WebRTC Mesh)](#-arsitektur--cara-kerja-webrtc-mesh)
4. [Struktur Proyek](#-struktur-proyek)
5. [Spesifikasi Event Socket.IO](#-spesifikasi-event-socketio)
6. [Prasyarat & Instalasi](#-prasyarat--instalasi)
7. [Panduan Menjalankan](#-panduan-menjalankan)
8. [Analisis Batasan Teknis & Roadmap](#-analisis-batasan-teknis--roadmap)
9. [Evolusi ke MeetZone Modern (SFU)](#-evolusi-ke-meetzone-modern-sfu)

---

## 🌟 Gambaran Umum

**MeetZone Base** dirancang untuk mendemonstrasikan implementasi minimalis sistem meeting online tanpa ketergantungan pada platform pihak ketiga berbayar. Sistem mengombinasikan:
- **Express.js** untuk menyajikan berkas frontend statis dan routing HTTP.
- **Socket.IO** sebagai kanal signaling dua arah berkecepatan tinggi.
- **WebRTC (Web Real-Time Communication)** untuk transmisi media audio/video langsung antar peramban (peer-to-peer).

---

## ✨ Fitur Utama

- **Lobby & Room Generator**: Pembuatan kode ruang meeting acak (format `xxx-0000`) atau memasukkan ruang yang sudah ada.
- **In-Memory Room Management**: Manajemen peserta ruang berbasis memori RAM di server.
- **WebRTC Signaling Pipeline**: Pertukaran session description (`offer`, `answer`) dan `ice-candidate` otomatis.
- **Pre-Join Screen (UI Layout)**: Antarmuka pengujian input video/audio dan nama sebelum masuk ke ruang utama.
- **Kontrol Media Real-Time**: Sinyal status mikrofon, kamera, dan screen sharing antar peserta.
- **Kanal Chat Teks Real-Time**: Pengiriman pesan instan dalam ruang menggunakan Socket.IO broadcast.

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
5. **ICE Candidates**: Kedua belah pihak saling bertukar kandidat alamat jaringan (`ice-candidate`) untuk melubangi firewall/NAT.
6. **Direct Media**: Setelah jalur P2P terbentuk, aliran audio dan video mengalir langsung antar browser tanpa melewati server Node.js.

---

## 📁 Struktur Proyek

```text
online-meeting/
├── .gitignore             # Mengabaikan node_modules/ dan file sementara
├── package.json           # Definisi dependensi (Express 5, Socket.IO 4)
├── package-lock.json      # Kunci versi dependensi npm
├── server.js              # Server HTTP & WebSocket Signaling Socket.IO
└── public/                # Aset frontend statis
    ├── index.html         # Halaman lobi (input nama & kode room)
    └── meeting.html       # Antarmuka ruang meeting & kontrol UI
```

### Rincian File:

- **`server.js`**:
  - Inisialisasi Express & Server Socket.IO dengan CORS permissive (`origin: '*'`).
  - Penyimpanan sesi kamar di objek memori:
    ```javascript
    rooms[roomId] = { participants: { socketId: { name, joinedAt } } };
    ```
  - Routing: `/` menyajikan `public/index.html`, `/meeting/:roomId` menyajikan `public/meeting.html`.
  - Relay event WebRTC dan status peserta.

- **`public/index.html`**:
  - Halaman awal untuk pengguna.
  - Memiliki fitur penyimpanan nama lokal (`localStorage.getItem('mz-name')`).
  - Dilengkapi generator kode ruang acak otomatis.

- **`public/meeting.html`**:
  - Struktur DOM untuk layar pre-join (`#preJoin`) dan ruang meeting (`#meetingRoom`).
  - Komponen video grid responsif (`#videoGrid`).
  - Sidebar percakapan teks (`#chatPanel`).
  - Toolbar kontrol: mikrofon, kamera, share screen, chat toggle, dan tombol keluar.

---

## 📡 Spesifikasi Event Socket.IO

| Event | Arah | Payload | Keterangan |
| :--- | :--- | :--- | :--- |
| `join-room` | Client → Server | `{ roomId, name }` | Mendaftarkan socket ke room |
| `user-joined` | Server → Client | `{ id, name }` | Memberitahu peer lain ada pengguna baru |
| `offer` | Client ⇄ Server | `{ to, sdp }` | Relai SDP Offer ke peer tujuan |
| `answer` | Client ⇄ Server | `{ to, sdp }` | Relai SDP Answer balasan |
| `ice-candidate`| Client ⇄ Server | `{ to, candidate }` | Relai kandidat ICE NAT traversal |
| `chat-message` | Client ⇄ Server | `{ roomId, message }` | Siaran pesan chat ke seluruh room |
| `media-state`  | Client ⇄ Server | `{ roomId, micOn, camOn }` | Sinkronisasi status audio/video peer |
| `screen-sharing`| Client ⇄ Server | `{ roomId, active }` | Sinyal mulai/berhenti berbagi layar |
| `leave-room`   | Client → Server | `{ roomId }` | Sinyal pengguna keluar secara eksplisit |
| `user-left`    | Server → Client | `{ id, name }` | Memberitahu peserta lain bahwa peer putus |

---

## ⚙️ Prasyarat & Instalasi

### Prasyarat
- **Node.js** versi 18 LTS atau lebih baru.
- **npm** versi 9 atau lebih baru.

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
   node server.js
   ```
   *(Atau tentukan port khusus via environment variable: `PORT=4000 node server.js`)*

2. Buka peramban:
   ```text
   http://localhost:3000
   ```

3. Uji koneksi multi-user:
   - Buka tab/jendela browser kedua (atau mode incognito).
   - Masukkan kode ruang yang sama.
   - Berikan izin akses kamera dan mikrofon.

---

## ⚠️ Analisis Batasan Teknis & Roadmap

Sebagai prototipe dasar (base), implementasi ini memiliki sejumlah karakteristik arsitektural yang perlu dipahami:

1. **Konsumsi Bandwidth P2P Mesh ($N \times (N-1)$)**:
   - Dalam topologi mesh, setiap peserta mengirimkan $N-1$ video stream ke setiap peserta lain.
   - Ideal hanya untuk **2 sampai 4 peserta**. Untuk 5+ peserta, bandwidth upload klien dan utilisasi CPU akan melonjak drastis.
2. **Kebutuhan STUN/TURN**:
   - Untuk koneksi antar perangkat di jaringan internet publik (lintas NAT simetris / firewall operator), konfigurasi `iceServers` wajib menyertakan server TURN (Coturn).
3. **Penyimpanan State In-Memory**:
   - Objek `rooms` berada di memori proses Node.js. Jika server restart, seluruh sesi meeting terhapus. Untuk arsitektur multi-server diperlukan Redis Adapter.
4. **Kelengkapan Skrip Klien**:
   - Berkas `meeting.html` merujuk pada `meeting.js` dan `style.css`. Pengembang dapat melengkapi logika `RTCPeerConnection` sisi browser dan styling custom untuk menyempurnakan implementasi frontend.

---

## 🚀 Evolusi ke MeetZone Modern (SFU)

Prototipe ini adalah batu loncatan awal. Untuk kebutuhan produksi skala besar, proyek MeetZone telah berevolusi ke arsitektur **SFU (Selective Forwarding Unit)** modern dengan:
- **Next.js (App Router) + React 19 + Tailwind CSS**
- **LiveKit SFU Engine**: Mengubah konsumsi bandwidth dari $O(N^2)$ menjadi $O(N)$ (1 upload, $N-1$ download).
- **SQLite Database** (`node:sqlite`) untuk multi-tenant SaaS, autentikasi sesi, ruang tunggu (*waiting room*), PIN passcode, dan pencatatan rekaman meeting.

---

## 📄 Lisensi

Proyek ini dirilis di bawah lisensi [ISC](LICENSE) untuk keperluan pembelajaran, eksplorasi open-source, dan pengembangan mandiri.

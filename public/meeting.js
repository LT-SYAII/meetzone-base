/* ==========================================================================
   MeetZone — meeting.js
   Logika client: pre-join preview, signaling WebRTC (full-mesh),
   chat, screen share, dan render grid video.
   ========================================================================== */

(() => {
  'use strict';

  // ── Konfigurasi WebRTC ───────────────────────────────────────────────────
  // STUN publik untuk NAT traversal. Untuk jaringan ketat (NAT simetris),
  // tambahkan server TURN di array iceServers.
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // ── Ambil kode room & nama dari URL ──────────────────────────────────────
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const ROOM_ID = decodeURIComponent(pathParts[pathParts.length - 1] || '').toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const NAME_FROM_URL = params.get('name') || localStorage.getItem('mz-name') || '';

  // ── Elemen DOM ───────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const preJoinScreen = $('preJoin');
  const meetingRoom = $('meetingRoom');
  const previewVideo = $('previewVideo');
  const nameInput = $('nameInput');
  const previewMic = $('previewMic');
  const previewCam = $('previewCam');
  const joinNowBtn = $('joinNowBtn');
  const roomCodeEl = $('roomCode');
  const copyLinkBtn = $('copyLinkBtn');
  const videoGrid = $('videoGrid');
  const chatPanel = $('chatPanel');
  const chatMessages = $('chatMessages');
  const chatInput = $('chatInput');
  const sendChatBtn = $('sendChatBtn');
  const closeChatBtn = $('closeChatBtn');
  const micBtn = $('micBtn');
  const camBtn = $('camBtn');
  const screenBtn = $('screenBtn');
  const chatBtn = $('chatBtn');
  const leaveBtn = $('leaveBtn');
  const toastEl = $('toast');

  // ── State ────────────────────────────────────────────────────────────────
  let socket = null;
  let localStream = null;        // kamera + mikrofon
  let screenStream = null;       // layar (share screen)
  let micOn = true;
  let camOn = true;
  let joined = false;

  const peers = new Map();       // socketId -> peer object
  const audioCtx = createAudioCtx();
  const speakingTimers = new Map();

  // ═════════════════════════════════════════════════════════════════════════
  //  UTILITAS
  // ═════════════════════════════════════════════════════════════════════════
  function createAudioCtx() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      return Ctx ? new Ctx() : null;
    } catch { return null; }
  }

  function toast(msg, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => toastEl.classList.add('hidden'), 220);
    }, ms);
  }

  function initials(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  function t(key, values = {}) {
    // Placeholder i18n sederhana — saat ini hanya bahasa Indonesia.
    const dict = {
      you: 'Anda',
      joined: 'bergabung ke meeting',
      left: 'keluar dari meeting',
      denied: 'Akses kamera/mikrofon ditolak. Anda bisa tetap bergabung tanpa media.',
      noMedia: 'Tidak ada perangkat media terdeteksi.',
      copyOk: 'Link meeting disalin!',
      copyFail: 'Gagal menyalin link.',
      shareStart: 'Berbagi layar dimulai.',
      shareStop: 'Berbagi layar dihentikan.',
      nameReq: 'Nama tidak boleh kosong!',
      waitOffer: values.name + ' masuk',
      micOn: 'Mikrofon aktif',
      micOff: 'Mikrofon dimatikan',
      camOn: 'Kamera aktif',
      camOff: 'Kamera dimatikan',
    };
    return dict[key] || key;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  PRE-JOIN: preview media
  // ═════════════════════════════════════════════════════════════════════════
  nameInput.value = NAME_FROM_URL;
  roomCodeEl.textContent = ROOM_ID;

  async function initLocalMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      console.warn('[media] gagal akses kamera/mic:', err);
      toast(t('denied'), 4000);
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        localStream = new MediaStream();
      }
    }
    previewVideo.srcObject = localStream;
    previewVideo.muted = true;
    syncPreviewControls();
  }

  function hasVideo() {
    return !!(localStream && localStream.getVideoTracks().length);
  }

  function syncPreviewControls() {
    const vTrack = localStream && localStream.getVideoTracks()[0];
    const aTrack = localStream && localStream.getAudioTracks()[0];

    previewMic.classList.toggle('on', micOn);
    previewMic.classList.toggle('off', !micOn);
    previewMic.innerHTML = micOn
      ? '<i class="fa-solid fa-microphone"></i>'
      : '<i class="fa-solid fa-microphone-slash"></i>';

    previewCam.classList.toggle('on', camOn);
    previewCam.classList.toggle('off', !camOn);
    previewCam.innerHTML = camOn
      ? '<i class="fa-solid fa-video"></i>'
      : '<i class="fa-solid fa-video-slash"></i>';

    if (vTrack) vTrack.enabled = camOn;
    if (aTrack) aTrack.enabled = micOn;

    const camOffIcon = document.querySelector('.cam-off-icon');
    if (camOffIcon) camOffIcon.classList.toggle('hidden', camOn || !hasVideo());
  }

  previewMic.addEventListener('click', () => {
    micOn = !micOn;
    syncPreviewControls();
    emitMediaState();
  });

  previewCam.addEventListener('click', () => {
    camOn = !camOn;
    syncPreviewControls();
    emitMediaState();
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  GRID & TILE
  // ═════════════════════════════════════════════════════════════════════════
  function updateGridCount() {
    videoGrid.dataset.count = String(videoGrid.children.length);
  }

  function createTile({ id, name, isLocal }) {
    const tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.dataset.peerId = id;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) { video.muted = true; video.classList.add('mirror'); }

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = initials(name);

    const label = document.createElement('div');
    label.className = 'tile-label';
    label.innerHTML = `<i class="fa-solid fa-microphone"></i><span>${escapeHtml(isLocal ? t('you') : name)}</span>`;

    const badge = document.createElement('div');
    badge.className = 'tile-badge hidden';

    tile.append(video, avatar, label, badge);
    videoGrid.appendChild(tile);
    updateGridCount();

    return { tile, video, avatar, label, badge };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function setTileMediaState(node, { camOn: cam, micOn: mic }) {
    if (typeof cam === 'boolean') {
      node.video.classList.toggle('hidden', !cam);
      node.avatar.classList.toggle('hidden', cam);
    }
    if (typeof mic === 'boolean') {
      const icon = node.label.querySelector('i');
      icon.className = mic ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash muted';
    }
  }

  let localNode = null;

  function initLocalTile() {
    localNode = createTile({ id: socket.id, name: NAME_FROM_URL, isLocal: true });
    localNode.video.srcObject = localStream;
    setTileMediaState(localNode, { camOn: camOn && hasVideo(), micOn });
    attachSpeaking(localStream, localNode.tile, true);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  SPEAKING DETECTION (lokal & remote)
  // ═════════════════════════════════════════════════════════════════════════
  function attachSpeaking(stream, tileEl, isLocal) {
    if (!audioCtx || !stream || !stream.getAudioTracks().length) return;
    try {
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        if (!tileEl.isConnected) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        if (avg > 12) {
          tileEl.classList.add('speaking');
          clearTimeout(speakingTimers.get(tileEl));
          speakingTimers.set(tileEl, setTimeout(() => tileEl.classList.remove('speaking'), 500));
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { /* abaikan */ }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  SIGNALING & PEER CONNECTION
  // ═════════════════════════════════════════════════════════════════════════
  function connectSocket() {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('join-room', { roomId: ROOM_ID, name: NAME_FROM_URL }, (res) => {
        if (!res || res.error) {
          toast(res && res.error ? res.error : 'Gagal bergabung ke room.');
          return;
        }
        // Peer yang sudah ada -> kita (pendatang baru) yang memulai offer.
        (res.others || []).forEach((p) => getOrCreatePeer(p.id, p.name));
      });
    });

    socket.on('user-joined', ({ name }) => {
      toast(`${name || 'Seseorang'} ${t('joined')}`);
    });

    socket.on('user-left', ({ id, name }) => {
      toast(`${name || 'Seseorang'} ${t('left')}`);
      if (id) removePeer(id);
    });

    // ── Relay WebRTC ──
    socket.on('offer', async ({ from, name, sdp }) => {
      const peer = getOrCreatePeer(from, name);
      await handleSignal(peer, { type: 'offer', sdp });
    });

    socket.on('answer', async ({ from, sdp }) => {
      const peer = peers.get(from);
      if (!peer) return;
      await handleSignal(peer, { type: 'answer', sdp });
    });

    socket.on('ice-candidate', async ({ from, candidate }) => {
      const peer = peers.get(from);
      if (!peer) return;
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (e) {
        if (!peer.ignoreOffer) console.warn('[ice] gagal tambah kandidat', e);
      }
    });

    // ── Status media peer ──
    socket.on('peer-media-state', ({ id, micOn: m, camOn: c }) => {
      const peer = peers.get(id);
      if (peer) setTileMediaState(peer.node, { micOn: m, camOn: c });
    });

    socket.on('peer-screen-share', ({ id, active }) => {
      const peer = peers.get(id);
      if (!peer) return;
      peer.node.badge.classList.toggle('hidden', !active);
      if (active) peer.node.badge.textContent = 'Berbagi Layar';
    });

    // ── Chat ──
    socket.on('chat-message', (msg) => appendChat(msg));

    socket.on('disconnect', () => {
      toast('Koneksi ke server terputus.', 4000);
    });
  }

  function getOrCreatePeer(id, name) {
    if (peers.has(id)) {
      if (name) peers.get(id).name = name;
      return peers.get(id);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const node = createTile({ id, name: name || 'Peserta', isLocal: false });

    const peer = {
      id,
      name: name || 'Peserta',
      pc,
      node,
      stream: new MediaStream(),
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      // Perfect negotiation: satu pihak polite, satu impolite (berdasar id).
      polite: socket.id < id,
    };
    peers.set(id, peer);

    // Kirim track lokal ke peer
    if (localStream) {
      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
    }

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        socket.emit('offer', { to: id, sdp: pc.localDescription });
      } catch (e) {
        console.error('[negosiasi]', e);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { to: id, candidate });
    };

    pc.ontrack = ({ track, streams }) => {
      const [stream] = streams;
      if (stream) peer.stream = stream;
      node.video.srcObject = peer.stream;
      if (track.kind === 'audio') attachSpeaking(peer.stream, node.tile, false);
      if (track.kind === 'video') setTileMediaState(node, { camOn: true });
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) removePeer(id);
    };

    return peer;
  }

  // Perfect negotiation
  async function handleSignal(peer, description) {
    const pc = peer.pc;
    const readyForOffer =
      !peer.makingOffer &&
      (pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
    const offerCollision = description.type === 'offer' && !readyForOffer;

    peer.ignoreOffer = !peer.polite && offerCollision;
    if (peer.ignoreOffer) return;

    peer.isSettingRemoteAnswerPending = description.type === 'answer';
    try {
      await pc.setRemoteDescription(description);
      peer.isSettingRemoteAnswerPending = false;

      if (description.type === 'offer') {
        await pc.setLocalDescription();
        socket.emit('answer', { to: peer.id, sdp: pc.localDescription });
      }
    } catch (e) {
      if (!peer.ignoreOffer) console.error('[signal]', e);
    }
  }

  function removePeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    try { peer.pc.close(); } catch {}
    peer.node.tile.remove();
    peers.delete(id);
    updateGridCount();
  }

  function emitMediaState() {
    if (!joined || !socket) return;
    socket.emit('media-state', { roomId: ROOM_ID, micOn, camOn });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  CHAT
  // ═════════════════════════════════════════════════════════════════════════
  function appendChat(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg' + (msg.id === socket.id ? ' own' : '');
    wrap.innerHTML =
      `<span class="meta">${escapeHtml(msg.name || '')} · ${escapeHtml(msg.time || '')}</span>` +
      `<span class="bubble"></span>`;
    wrap.querySelector('.bubble').textContent = msg.message || '';
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChat() {
    const text = chatInput.value.trim();
    if (!text || !socket) return;
    socket.emit('chat-message', { roomId: ROOM_ID, message: text });
    chatInput.value = '';
  }

  sendChatBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  chatBtn.addEventListener('click', () => chatPanel.classList.toggle('hidden'));
  closeChatBtn.addEventListener('click', () => chatPanel.classList.add('hidden'));

  // ═════════════════════════════════════════════════════════════════════════
  //  KONTROL DALAM ROOM
  // ═════════════════════════════════════════════════════════════════════════
  micBtn.addEventListener('click', () => {
    micOn = !micOn;
    const tr = localStream && localStream.getAudioTracks()[0];
    if (tr) tr.enabled = micOn;
    micBtn.classList.toggle('on', micOn);
    micBtn.classList.toggle('off', !micOn);
    micBtn.innerHTML = micOn
      ? '<i class="fa-solid fa-microphone"></i>'
      : '<i class="fa-solid fa-microphone-slash"></i>';
    if (localNode) setTileMediaState(localNode, { micOn });
    emitMediaState();
  });

  camBtn.addEventListener('click', () => {
    camOn = !camOn;
    const tr = localStream && localStream.getVideoTracks()[0];
    if (tr) tr.enabled = camOn;
    camBtn.classList.toggle('on', camOn);
    camBtn.classList.toggle('off', !camOn);
    camBtn.innerHTML = camOn
      ? '<i class="fa-solid fa-video"></i>'
      : '<i class="fa-solid fa-video-slash"></i>';
    if (localNode) setTileMediaState(localNode, { camOn: camOn && hasVideo() });
    emitMediaState();
  });

  screenBtn.addEventListener('click', toggleScreenShare);

  copyLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast(t('copyOk'));
    } catch {
      const tmp = document.createElement('input');
      tmp.value = window.location.href;
      document.body.appendChild(tmp);
      tmp.select();
      try { document.execCommand('copy'); toast(t('copyOk')); }
      catch { toast(t('copyFail')); }
      tmp.remove();
    }
  });

  leaveBtn.addEventListener('click', () => {
    try { socket && socket.emit('leave-room', { roomId: ROOM_ID }); } catch {}
    cleanup();
    window.location.href = '/';
  });

  // ── Screen sharing ───────────────────────────────────────────────────────
  async function toggleScreenShare() {
    if (screenStream) return stopScreenShare();
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
    } catch {
      return; // user membatalkan
    }

    const screenTrack = screenStream.getVideoTracks()[0];
    for (const peer of peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(screenTrack);
    }

    // Ganti tampilan tile lokal dengan layar
    if (localNode) {
      localNode.video.srcObject = screenStream;
      localNode.video.classList.remove('mirror');
      localNode.badge.classList.remove('hidden');
      localNode.badge.textContent = 'Berbagi Layar';
    }

    socket && socket.emit('screen-sharing', { roomId: ROOM_ID, active: true });
    screenBtn.classList.add('active');
    toast(t('shareStart'));

    screenTrack.onended = stopScreenShare;
  }

  async function stopScreenShare() {
    if (!screenStream) return;
    screenStream.getTracks().forEach((tr) => tr.stop());
    screenStream = null;

    const camTrack = localStream && localStream.getVideoTracks()[0];
    for (const peer of peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(camTrack || null);
    }

    if (localNode) {
      localNode.video.srcObject = localStream;
      localNode.video.classList.add('mirror');
      localNode.badge.classList.add('hidden');
      setTileMediaState(localNode, { camOn: camOn && hasVideo(), micOn });
    }

    socket && socket.emit('screen-sharing', { roomId: ROOM_ID, active: false });
    screenBtn.classList.remove('active');
    toast(t('shareStop'));
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  JOIN & CLEANUP
  // ═════════════════════════════════════════════════════════════════════════
  joinNowBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { toast(t('nameReq')); return; }
    localStorage.setItem('mz-name', name);

    joinNowBtn.disabled = true;
    joinNowBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menghubungkan...';

    if (!localStream) await initLocalMedia();

    preJoinScreen.classList.add('hidden');
    meetingRoom.classList.remove('hidden');

    initLocalTile();
    connectSocket();
    joined = true;
  });

  function cleanup() {
    try { localStream && localStream.getTracks().forEach((tr) => tr.stop()); } catch {}
    try { screenStream && screenStream.getTracks().forEach((tr) => tr.stop()); } catch {}
    peers.forEach((p) => { try { p.pc.close(); } catch {} });
    peers.clear();
    try { socket && socket.disconnect(); } catch {}
  }

  window.addEventListener('beforeunload', cleanup);

  // ── Bootstrap: mulai preview media ───────────────────────────────────────
  initLocalMedia();
})();

import './style.css';
import { io } from 'socket.io-client';

// Config
const SERVER_URL = window.location.origin;
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const callScreen = document.getElementById('call-screen');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remotePlaceholder = document.getElementById('remote-placeholder');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const chatPanel = document.getElementById('chat-panel');
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const closeChatBtn = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const unreadBadge = document.getElementById('unread-badge');

// Controls
const audioBtn = document.getElementById('audio-btn');
const videoBtn = document.getElementById('video-btn');
const screenBtn = document.getElementById('screen-btn');
const recordBtn = document.getElementById('record-btn');
const leaveBtn = document.getElementById('leave-btn');

// State
let socket;
let localStream;
let remoteStream;
let peerConnection;
let roomId;
let userId;
let isScreenSharing = false;
let mediaRecorder;
let recordedChunks = [];
let isChatOpen = false;
let unreadCount = 0;

// Initialize
function init() {
  userId = 'user-' + Math.random().toString(36).substr(2, 9);

  joinBtn.addEventListener('click', joinRoom);

  // Controls Handlers
  audioBtn.addEventListener('click', toggleAudio);
  videoBtn.addEventListener('click', toggleVideo);
  screenBtn.addEventListener('click', toggleScreenShare);
  recordBtn.addEventListener('click', toggleRecording);
  leaveBtn.addEventListener('click', leaveCall);

  // Chat Handlers
  chatToggleBtn.addEventListener('click', toggleChat);
  closeChatBtn.addEventListener('click', toggleChat);
  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

async function joinRoom() {
  const room = roomInput.value.trim();
  if (!room) return alert('Please enter a room name');

  roomId = room;

  // UI Transition
  loginScreen.classList.add('hidden');
  callScreen.classList.remove('hidden');

  // Connect Socket
  socket = io(SERVER_URL);

  setupSocketListeners();

  try {
    // Check for Secure Context (Required for camera/mic on non-localhost)
    if (!window.isSecureContext && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      throw new Error('This app requires a Secure Context (HTTPS or localhost) to access your camera and microphone. Browsers block media access on insecure HTTP connections.');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Your browser does not support media devices access or it is blocked by security policies/insecure connection.');
    }

    // Get Media
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // Join
    socket.emit('join-room', roomId, userId);
    addSystemMessage(`Joined room: ${roomId}`);
  } catch (err) {
    console.error('Error accessing media:', err);
    alert(`Media Error: ${err.message || 'Could not access camera/microphone. Please ensure you have granted permissions and are using a secure connection (HTTPS).'}`);
  }
}

function setupSocketListeners() {
  socket.on('user-connected', async (newUserId) => {
    console.log('User connected:', newUserId);
    addSystemMessage('User connected');
    createPeerConnection(newUserId, true); // true = initiator
  });

  socket.on('user-disconnected', (id) => {
    console.log('User disconnected:', id);
    addSystemMessage('User disconnected');
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    remoteVideo.srcObject = null;
    remotePlaceholder.classList.remove('hidden');
  });

  socket.on('offer', async (payload) => {
    if (!peerConnection) createPeerConnection(payload.caller, false);

    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', {
      ...payload,
      sdp: answer
    });
  });

  socket.on('answer', async (payload) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  });

  socket.on('ice-candidate', async (payload) => {
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (e) {
        console.error('Error adding received ice candidate', e);
      }
    }
  });

  socket.on('chat-message', (data) => {
    addMessage(data.message, 'theirs');
    if (!isChatOpen) {
      unreadCount++;
      unreadBadge.textContent = unreadCount;
      unreadBadge.classList.remove('hidden');
    }
  });
}

function createPeerConnection(targetUserId, initiator) {
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  // Add local tracks
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    console.log('Got remote track');
    remoteVideo.srcObject = event.streams[0];
    remoteStream = event.streams[0];
    remotePlaceholder.classList.add('hidden');
  };

  // Handle ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        roomId,
        candidate: event.candidate
      });
    }
  };

  if (initiator) {
    createOffer(targetUserId);
  }
}

async function createOffer(targetUserId) {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('offer', {
    roomId,
    target: targetUserId,
    caller: userId,
    sdp: offer
  });
}

// Controls
function toggleAudio() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    if (audioTrack.enabled) {
      audioBtn.classList.remove('off');
      audioBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    } else {
      audioBtn.classList.add('off');
      audioBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
    }
  }
}

function toggleVideo() {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    if (videoTrack.enabled) {
      videoBtn.classList.remove('off');
      videoBtn.innerHTML = '<i class="fa-solid fa-video"></i>';
    } else {
      videoBtn.classList.add('off');
      videoBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
    }
  }
}

async function toggleScreenShare() {
  if (isScreenSharing) {
    // Stop sharing
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const videoTrack = camStream.getVideoTracks()[0];

    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);

    localVideo.srcObject = camStream;
    // Update localStream ref for subsequent toggles
    localStream.removeTrack(localStream.getVideoTracks()[0]);
    localStream.addTrack(videoTrack);

    screenBtn.classList.remove('active');
    isScreenSharing = false;
  } else {
    // Start sharing
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);

      localVideo.srcObject = screenStream;

      screenTrack.onended = () => {
        if (isScreenSharing) toggleScreenShare(); // Handle native stop button
      };

      screenBtn.classList.add('active'); // active logic visual
      isScreenSharing = true;
    } catch (err) {
      console.error('Error sharing screen:', err);
    }
  }
}

function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    recordBtn.classList.remove('recording-active');
  } else {
    if (!remoteStream) return alert('No active call to record.');

    recordedChunks = [];
    // Record combined stream? Or just remote. Usually just remote for meetings.
    // If we want both, we need to mix canvas. Simple: Record remote.
    mediaRecorder = new MediaRecorder(remoteStream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      addSystemMessage('Recording saved.');
    };

    mediaRecorder.start();
    recordBtn.classList.add('recording-active');
    addSystemMessage('Recording started...');
  }
}

function leaveCall() {
  if (socket) socket.disconnect();
  if (peerConnection) peerConnection.close();
  location.reload();
}

// Chat
function toggleChat() {
  isChatOpen = !isChatOpen;
  if (isChatOpen) {
    chatPanel.classList.remove('hidden');
    unreadCount = 0;
    unreadBadge.classList.add('hidden');
  } else {
    chatPanel.classList.add('hidden');
  }
}

function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  if (socket) {
    socket.emit('chat-message', { roomId, message: msg });
    addMessage(msg, 'mine');
    chatInput.value = '';
  }
}

function addMessage(text, type) {
  const div = document.createElement('div');
  div.classList.add('message', type);
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  // Optional: show toast or simplified message in chat
  // For now log
  console.log('System:', text);
  // Also add to chat as system?
  const div = document.createElement('div');
  div.style.alignSelf = 'center';
  div.style.color = '#94a3b8';
  div.style.fontSize = '0.8rem';
  div.textContent = text;
  chatMessages.appendChild(div);
}

// Start
init();

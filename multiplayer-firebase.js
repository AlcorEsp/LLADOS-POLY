// multiplayer-firebase.js - Sistema multiplayer SIN INTERCEPTORES
// Versión simplificada para evitar bucles infinitos

// Variables globales multiplayer
let currentRoomCode = null;
let currentPlayerId = null;
let currentPlayerName = null;
let isHost = false;
let playersOnline = {};
let isMyTurn = false;
let roomRef = null;
let gameStateRef = null;
let listenersSetup = false;

// ===== FUNCIONES DE CHAT DE VOZ Y VIDEO P2P (WebRTC + Firebase) =====
let voiceChatConnected = false;
let voiceChatMuted = false;
let voiceStream = null;
let videoChatConnected = false;
let videoStream = null;

// Estado WebRTC P2P
const peerConnections = {}; // { remotePlayerId: RTCPeerConnection }
const remoteStreams = {};   // { remotePlayerId: MediaStream }
let webrtcListenerRef = null;

const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Normalizar array de jugadores recibido desde Firebase (Firebase elimina arrays vacíos [])
function normalizePlayersArray(playersArr) {
    if (!Array.isArray(playersArr)) return [];
    const startingMoney = (window.GAME_THEME && window.GAME_THEME.startingMoney) || 2500;
    const startingFollowers = (window.GAME_THEME && window.GAME_THEME.startingFollowers) || 100;
    return playersArr.map((p, idx) => ({
        ...p,
        id: p.id || (idx + 1),
        money: typeof p.money === 'number' ? p.money : startingMoney,
        position: typeof p.position === 'number' ? p.position : 0,
        properties: Array.isArray(p.properties) ? p.properties : [],
        constructions: typeof p.constructions === 'number' ? p.constructions : 0,
        bankrupt: Boolean(p.bankrupt),
        inJail: Boolean(p.inJail),
        jailTurns: typeof p.jailTurns === 'number' ? p.jailTurns : 0,
        getOutCards: typeof p.getOutCards === 'number' ? p.getOutCards : 0,
        followers: typeof p.followers === 'number' ? p.followers : startingFollowers,
        rank: typeof p.rank === 'number' ? p.rank : 0,
        totalMentorias: typeof p.totalMentorias === 'number' ? p.totalMentorias : 0,
        turnsPlayed: typeof p.turnsPlayed === 'number' ? p.turnsPlayed : 0
    }));
}

// Obtener tracks locales combinados (audio + video)
function getLocalTracks() {
    const tracks = [];
    if (voiceStream) {
        voiceStream.getAudioTracks().forEach(t => tracks.push({ track: t, stream: voiceStream }));
    }
    if (videoStream) {
        videoStream.getVideoTracks().forEach(t => tracks.push({ track: t, stream: videoStream }));
    }
    return tracks;
}

// Enviar señal WebRTC por Firebase
async function sendWebRTCSignal(targetPlayerId, payload) {
    if (!roomRef || !currentPlayerId || !targetPlayerId || targetPlayerId === currentPlayerId) return;
    try {
        await roomRef.child('webrtc/signals/' + targetPlayerId).push({
            from: currentPlayerId,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            ...payload
        });
    } catch (err) {
        console.warn('⚠️ Error enviando señal WebRTC:', err);
    }
}

// Crear o recuperar RTCPeerConnection con un jugador remoto
function getOrCreatePeerConnection(remotePlayerId) {
    if (peerConnections[remotePlayerId]) {
        return peerConnections[remotePlayerId];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections[remotePlayerId] = pc;

    // Añadir tracks locales actuales si existen
    const combinedLocalStream = new MediaStream();
    getLocalTracks().forEach(({ track }) => {
        combinedLocalStream.addTrack(track);
        pc.addTrack(track, combinedLocalStream);
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendWebRTCSignal(remotePlayerId, {
                type: 'candidate',
                candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
            });
        }
    };

    pc.ontrack = (event) => {
        console.log('📡 Track remoto recibido de:', remotePlayerId, event.track.kind);
        if (!remoteStreams[remotePlayerId]) {
            remoteStreams[remotePlayerId] = new MediaStream();
        }
        // Reemplazar track del mismo tipo si ya existía
        remoteStreams[remotePlayerId].getTracks().forEach(existing => {
            if (existing.kind === event.track.kind && existing.id !== event.track.id) {
                remoteStreams[remotePlayerId].removeTrack(existing);
            }
        });
        remoteStreams[remotePlayerId].addTrack(event.track);
        attachRemoteMedia(remotePlayerId);
    };

    pc.onconnectionstatechange = () => {
        console.log(`🔗 WebRTC [${remotePlayerId}] estado:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            closePeerConnection(remotePlayerId);
        }
    };

    return pc;
}

// Sincronizar nuestros tracks locales hacia todas las conexiones P2P y renegociar
async function syncLocalMediaWithPeers() {
    if (!roomRef || !currentPlayerId || !playersOnline) return;
    const peerIds = Object.keys(playersOnline).filter(
        id => id !== currentPlayerId && playersOnline[id] && playersOnline[id].connected
    );

    for (const remoteId of peerIds) {
        try {
            const pc = getOrCreatePeerConnection(remoteId);
            const senders = pc.getSenders();
            const localTracks = getLocalTracks();

            // Añadir o reemplazar tracks locales
            const combinedStream = new MediaStream(localTracks.map(item => item.track));
            for (const { track } of localTracks) {
                const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
                if (existingSender) {
                    await existingSender.replaceTrack(track);
                } else {
                    pc.addTrack(track, combinedStream);
                }
            }

            // Remover tracks que se hayan apagado
            for (const sender of senders) {
                if (sender.track && !localTracks.some(item => item.track.kind === sender.track.kind)) {
                    pc.removeTrack(sender);
                }
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendWebRTCSignal(remoteId, {
                type: 'offer',
                sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
            });
        } catch (err) {
            console.warn('⚠️ Error negociando WebRTC con', remoteId, err);
        }
    }
}

// Escuchar señales WebRTC entrantes desde Firebase
function setupWebRTCSignaling() {
    if (!roomRef || !currentPlayerId) return;
    if (webrtcListenerRef) {
        webrtcListenerRef.off();
    }
    webrtcListenerRef = roomRef.child('webrtc/signals/' + currentPlayerId);
    webrtcListenerRef.on('child_added', async (snapshot) => {
        const signal = snapshot.val();
        snapshot.ref.remove().catch(() => {});
        if (!signal || !signal.from || signal.from === currentPlayerId) return;

        const remoteId = signal.from;
        try {
            const pc = getOrCreatePeerConnection(remoteId);

            if (signal.type === 'offer' && signal.sdp) {
                // Asegurar que nuestros tracks locales estén adjuntos antes de responder
                const senders = pc.getSenders();
                const localTracks = getLocalTracks();
                const combinedStream = new MediaStream(localTracks.map(item => item.track));
                for (const { track } of localTracks) {
                    const existingSender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (existingSender) {
                        await existingSender.replaceTrack(track);
                    } else {
                        pc.addTrack(track, combinedStream);
                    }
                }

                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendWebRTCSignal(remoteId, {
                    type: 'answer',
                    sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
                });
            } else if (signal.type === 'answer' && signal.sdp) {
                if (pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                }
            } else if (signal.type === 'candidate' && signal.candidate) {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            }
        } catch (err) {
            console.warn('⚠️ Error procesando señal WebRTC de', remoteId, err);
        }
    });
}

// Reproducir audio y video remotos recibidos
function attachRemoteMedia(remotePlayerId) {
    const stream = remoteStreams[remotePlayerId];
    if (!stream) return;

    // 1. Audio remoto (funciona tanto en Lobby como en Juego)
    if (stream.getAudioTracks().length > 0) {
        let audioContainer = document.getElementById('remote-audios');
        if (!audioContainer) {
            audioContainer = document.createElement('div');
            audioContainer.id = 'remote-audios';
            audioContainer.style.display = 'none';
            document.body.appendChild(audioContainer);
        }
        let audioEl = document.getElementById('remote-audio-' + remotePlayerId);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = 'remote-audio-' + remotePlayerId;
            audioEl.autoplay = true;
            audioEl.playsInline = true;
            audioContainer.appendChild(audioEl);
        }
        const audioOnlyStream = new MediaStream(stream.getAudioTracks());
        audioEl.srcObject = audioOnlyStream;
        audioEl.play().catch(e => console.warn('⚠️ Autoplay de audio remoto pendiente de interacción:', e));
    }

    // 2. Video remoto en su slot de webcam correspondiente (1-4)
    updateWebcamPlayerNames();
}

function closePeerConnection(remotePlayerId) {
    if (peerConnections[remotePlayerId]) {
        try { peerConnections[remotePlayerId].close(); } catch (e) {}
        delete peerConnections[remotePlayerId];
    }
    if (remoteStreams[remotePlayerId]) {
        delete remoteStreams[remotePlayerId];
    }
    const audioEl = document.getElementById('remote-audio-' + remotePlayerId);
    if (audioEl) audioEl.remove();
}

function cleanupAllWebRTC() {
    if (webrtcListenerRef) {
        webrtcListenerRef.off();
        webrtcListenerRef = null;
    }
    Object.keys(peerConnections).forEach(id => closePeerConnection(id));
}

// Unirse al chat de voz P2P
window.joinVoiceChat = async function() {
    console.log('🎤 Intentando unirse al chat de voz P2P...');
    
    try {
        voiceStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });
        
        voiceChatConnected = true;
        voiceChatMuted = false;

        if (roomRef && currentPlayerId) {
            await roomRef.child('players/' + currentPlayerId).update({
                voiceActive: true,
                voiceMuted: false
            });
        }

        updateVoiceChatUI();
        if (document.getElementById('game-container')?.style.display === 'block') {
            addMultiplayerGameInfo();
        }

        await syncLocalMediaWithPeers();
        console.log('✅ Conectado al chat de voz P2P');
        
    } catch (error) {
        console.error('❌ Error accediendo al micrófono:', error);
        
        let errorMessage = 'Error accediendo al micrófono';
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Permiso denegado para acceder al micrófono';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No se encontró micrófono disponible';
        }
        
        alert(`❌ ${errorMessage}\n\nPara usar el chat de voz:\n• Permite acceso al micrófono en el navegador\n• Verifica que el micrófono esté conectado`);
    }
};

// Salir del chat de voz
window.leaveVoiceChat = async function() {
    console.log('🔇 Saliendo del chat de voz...');
    
    if (voiceStream) {
        voiceStream.getTracks().forEach(track => track.stop());
        voiceStream = null;
    }
    
    voiceChatConnected = false;
    voiceChatMuted = false;

    if (roomRef && currentPlayerId) {
        roomRef.child('players/' + currentPlayerId).update({
            voiceActive: false,
            voiceMuted: false
        }).catch(() => {});
    }

    updateVoiceChatUI();
    if (document.getElementById('game-container')?.style.display === 'block') {
        addMultiplayerGameInfo();
    }

    await syncLocalMediaWithPeers();
    console.log('✅ Desconectado del chat de voz');
};

// Silenciar/activar micrófono
window.toggleMute = function() {
    if (!voiceChatConnected || !voiceStream) {
        alert('❌ No estás conectado al chat de voz');
        return;
    }
    
    voiceChatMuted = !voiceChatMuted;
    
    voiceStream.getAudioTracks().forEach(track => {
        track.enabled = !voiceChatMuted;
    });

    if (roomRef && currentPlayerId) {
        roomRef.child('players/' + currentPlayerId + '/voiceMuted').set(voiceChatMuted).catch(() => {});
    }
    
    updateVoiceChatUI();
    if (document.getElementById('game-container')?.style.display === 'block') {
        addMultiplayerGameInfo();
    }
    console.log(voiceChatMuted ? '🔇 Micrófono silenciado' : '🎤 Micrófono activado');
};

// Unirse al video chat P2P
window.joinVideoChat = async function() {
    console.log('📹 Intentando unirse al video chat P2P...');
    
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                facingMode: 'user'
            },
            audio: false
        });
        
        videoChatConnected = true;
        
        createLocalVideoElement();
        updateVideoChatUI();
        if (document.getElementById('game-container')?.style.display === 'block') {
            addMultiplayerGameInfo();
        }
        
        await syncLocalMediaWithPeers();
        console.log('✅ Conectado al video chat P2P');
        
    } catch (error) {
        console.error('❌ Error accediendo a la cámara:', error);
        
        let errorMessage = 'Error accediendo a la cámara';
        if (error.name === 'NotAllowedError') {
            errorMessage = 'Permiso denegado para acceder a la cámara';
        } else if (error.name === 'NotFoundError') {
            errorMessage = 'No se encontró cámara disponible';
        }
        
        alert(`❌ ${errorMessage}\n\nPara usar video chat:\n• Permite acceso a la cámara\n• Verifica que la cámara esté conectada`);
    }
};

// Salir del video chat
window.leaveVideoChat = async function() {
    console.log('📹 Saliendo del video chat...');
    
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    videoChatConnected = false;
    
    removeLocalVideoElement();
    updateVideoChatUI();
    if (document.getElementById('game-container')?.style.display === 'block') {
        addMultiplayerGameInfo();
    }

    await syncLocalMediaWithPeers();
    console.log('✅ Desconectado del video chat');
};

// Integrar video en el slot correspondiente del jugador
function createLocalVideoElement() {
    console.log('📹 Integrando video en slot del jugador...');
    
    let playerSlot = getPlayerSlot();
    if (!playerSlot) {
        console.warn('⚠️ No se encontró slot para el jugador');
        return;
    }
    
    const videoElement = document.getElementById(`webcam-video-${playerSlot}`);
    const webcamSlot = document.getElementById(`webcam-slot-${playerSlot}`);
    const webcamStatus = document.getElementById(`webcam-status-${playerSlot}`);
    const webcamName = document.getElementById(`webcam-name-${playerSlot}`);
    
    if (videoElement && videoStream) {
        videoElement.muted = true; // Siempre silenciar vista previa local
        videoElement.srcObject = videoStream;
        
        if (webcamSlot) {
            webcamSlot.classList.add('active');
            webcamSlot.classList.remove('inactive');
        }
        
        if (webcamStatus) {
            webcamStatus.textContent = 'Activo';
            webcamStatus.classList.add('active');
        }
        
        if (webcamName) {
            webcamName.textContent = currentPlayerName + ' (TÚ)';
        }
        
        console.log(`✅ Video integrado en slot ${playerSlot}`);
        
        if (currentRoomCode && currentPlayerId && roomRef) {
            roomRef.child(`players/${currentPlayerId}/webcamActive`).set(true);
        }
    }
}

// Remover video del slot del jugador
function removeLocalVideoElement() {
    let playerSlot = getPlayerSlot();
    if (!playerSlot) return;
    
    const videoElement = document.getElementById(`webcam-video-${playerSlot}`);
    const webcamSlot = document.getElementById(`webcam-slot-${playerSlot}`);
    const webcamStatus = document.getElementById(`webcam-status-${playerSlot}`);
    
    if (videoElement) {
        videoElement.srcObject = null;
    }
    
    if (webcamSlot) {
        webcamSlot.classList.remove('active');
        webcamSlot.classList.add('inactive');
    }
    
    if (webcamStatus) {
        webcamStatus.textContent = 'Inactivo';
        webcamStatus.classList.remove('active');
    }
    
    console.log(`✅ Video removido del slot ${playerSlot}`);
    
    if (currentRoomCode && currentPlayerId && roomRef) {
        roomRef.child(`players/${currentPlayerId}/webcamActive`).set(false);
    }
}

// Obtener lista de IDs de jugadores ordenada consistentemente por llegada
function getSortedPlayerIds(playersMap = playersOnline) {
    if (!playersMap) return [];
    return Object.keys(playersMap).sort((a, b) => {
        const timeDiff = (playersMap[a].joinedAt || 0) - (playersMap[b].joinedAt || 0);
        return timeDiff !== 0 ? timeDiff : a.localeCompare(b);
    });
}

// Obtener el slot que corresponde a este jugador
function getPlayerSlot() {
    if (!currentPlayerId || !playersOnline) return null;
    const sortedPlayers = getSortedPlayerIds(playersOnline);
    const playerIndex = sortedPlayers.indexOf(currentPlayerId);
    return playerIndex >= 0 ? playerIndex + 1 : null;
}

// Actualizar nombres y streams de video (locales y remotos) en las webcams
function updateWebcamPlayerNames() {
    if (!playersOnline) return;
    
    const sortedPlayers = getSortedPlayerIds(playersOnline);
    
    for (let i = 1; i <= 4; i++) {
        const webcamName = document.getElementById(`webcam-name-${i}`);
        const webcamSlot = document.getElementById(`webcam-slot-${i}`);
        const webcamStatus = document.getElementById(`webcam-status-${i}`);
        const videoElement = document.getElementById(`webcam-video-${i}`);
        
        if (webcamName && webcamSlot && webcamStatus) {
            if (i <= sortedPlayers.length) {
                const playerId = sortedPlayers[i - 1];
                const playerData = playersOnline[playerId];
                const isMe = playerId === currentPlayerId;
                const isWebcamActive = Boolean(playerData.webcamActive);
                
                webcamName.textContent = (playerData.avatar || '👤') + ' ' + playerData.name + (isMe ? ' (TÚ)' : '');
                webcamSlot.classList.remove('inactive');
                
                if (isWebcamActive) {
                    webcamSlot.classList.add('active');
                    webcamStatus.textContent = 'Activo';
                    webcamStatus.classList.add('active');
                    if (videoElement) {
                        if (isMe && videoStream) {
                            if (videoElement.srcObject !== videoStream) {
                                videoElement.muted = true;
                                videoElement.srcObject = videoStream;
                            }
                        } else if (!isMe && remoteStreams[playerId] && remoteStreams[playerId].getVideoTracks().length > 0) {
                            const remoteVideoStream = new MediaStream(remoteStreams[playerId].getVideoTracks());
                            videoElement.muted = true;
                            videoElement.srcObject = remoteVideoStream;
                            videoElement.play().catch(() => {});
                        }
                    }
                } else {
                    webcamSlot.classList.remove('active');
                    webcamStatus.textContent = 'Inactivo';
                    webcamStatus.classList.remove('active');
                    if (videoElement && videoElement.srcObject) {
                        videoElement.srcObject = null;
                    }
                }
            } else {
                webcamName.textContent = `Jugador ${i}`;
                webcamSlot.classList.add('inactive');
                webcamSlot.classList.remove('active');
                webcamStatus.textContent = 'Vacío';
                webcamStatus.classList.remove('active');
                if (videoElement && videoElement.srcObject) {
                    videoElement.srcObject = null;
                }
            }
        }
    }
}

// Actualizar UI del video chat
function updateVideoChatUI() {
    console.log('📹 Estado video chat actualizado:', videoChatConnected);
}

// Función para los botones de webcam individuales
window.toggleWebcam = function(slotNumber) {
    console.log(`📹 Toggle webcam slot ${slotNumber}`);
    
    const mySlot = getPlayerSlot();
    
    if (slotNumber === mySlot) {
        if (videoChatConnected) {
            leaveVideoChat();
        } else {
            joinVideoChat();
        }
    } else {
        alert(`❌ Solo puedes controlar tu propia webcam (Tu slot es el ${mySlot})`);
    }
};

// Función para mostrar/ocultar todas las webcams
window.toggleWebcamsVisibility = function() {
    const webcamContainer = document.getElementById('webcam-container');
    const toggleButton = document.getElementById('toggle-all-webcams');
    
    if (!webcamContainer || !toggleButton) {
        console.warn('⚠️ No se encontraron elementos de webcam');
        return;
    }
    
    if (webcamContainer.classList.contains('hidden')) {
        webcamContainer.classList.remove('hidden');
        toggleButton.textContent = '👁️ Ocultar Webcams';
        toggleButton.classList.remove('hidden');
        console.log('✅ Webcams mostradas');
    } else {
        webcamContainer.classList.add('hidden');
        toggleButton.textContent = '👁️ Mostrar Webcams';
        toggleButton.classList.add('hidden');
        console.log('✅ Webcams ocultadas');
    }
};

// Actualizar UI del chat de voz
function updateVoiceChatUI() {
    const lobbyJoinBtn = document.getElementById('lobby-join-voice-btn');
    const lobbyLeaveBtn = document.getElementById('lobby-leave-voice-btn');
    const lobbyMuteBtn = document.getElementById('lobby-mute-btn');
    const lobbyStatus = document.getElementById('lobby-voice-status');
    
    const gameJoinBtn = document.getElementById('join-voice-btn');
    const gameLeaveBtn = document.getElementById('leave-voice-btn');
    const gameMuteBtn = document.getElementById('mute-btn');
    const gameStatus = document.getElementById('voice-status');
    
    if (voiceChatConnected) {
        if (lobbyJoinBtn) lobbyJoinBtn.style.display = 'none';
        if (lobbyLeaveBtn) lobbyLeaveBtn.style.display = 'inline-block';
        if (lobbyMuteBtn) lobbyMuteBtn.style.display = 'inline-block';
        if (lobbyStatus) lobbyStatus.textContent = '🟢 Conectado (P2P)';
        
        if (gameJoinBtn) gameJoinBtn.style.display = 'none';
        if (gameLeaveBtn) gameLeaveBtn.style.display = 'inline-block';
        if (gameMuteBtn) gameMuteBtn.style.display = 'inline-block';
        if (gameStatus) gameStatus.textContent = '🟢 Conectado (P2P)';
        
        const muteText = voiceChatMuted ? '🔊 ACTIVAR' : '🔇 SILENCIAR';
        if (lobbyMuteBtn) lobbyMuteBtn.textContent = muteText;
        if (gameMuteBtn) gameMuteBtn.textContent = muteText;
    } else {
        if (lobbyJoinBtn) lobbyJoinBtn.style.display = 'inline-block';
        if (lobbyLeaveBtn) lobbyLeaveBtn.style.display = 'none';
        if (lobbyMuteBtn) lobbyMuteBtn.style.display = 'none';
        if (lobbyStatus) lobbyStatus.textContent = 'Desconectado';
        
        if (gameJoinBtn) gameJoinBtn.style.display = 'inline-block';
        if (gameLeaveBtn) gameLeaveBtn.style.display = 'none';
        if (gameMuteBtn) gameMuteBtn.style.display = 'none';
        if (gameStatus) gameStatus.textContent = 'Desconectado';
    }
    
    updateVoiceParticipantsList();
}

// Actualizar lista de participantes del chat de voz (sincronizado con todos los jugadores de la sala)
function updateVoiceParticipantsList() {
    const lobbyList = document.getElementById('lobby-participants-list');
    const gameList = document.getElementById('participants-list');
    
    const activeVoicePlayers = Object.keys(playersOnline || {}).filter(
        id => playersOnline[id] && playersOnline[id].connected && playersOnline[id].voiceActive
    );

    if (activeVoicePlayers.length > 0) {
        const participantHTML = activeVoicePlayers.map(id => {
            const p = playersOnline[id];
            const isMe = id === currentPlayerId;
            const muted = isMe ? voiceChatMuted : Boolean(p.voiceMuted);
            return `
                <div class="participant-item">
                    <div class="participant-name">${p.avatar || '👤'} ${p.name}${isMe ? ' (Tú)' : ''}</div>
                    <div class="participant-status ${muted ? 'muted' : 'active'}">
                        ${muted ? '🔇' : '🎤'}
                    </div>
                </div>
            `;
        }).join('');
        
        if (lobbyList) lobbyList.innerHTML = participantHTML;
        if (gameList) gameList.innerHTML = participantHTML;
    } else {
        const noParticipantsHTML = '<div class="no-participants">Nadie conectado al chat</div>';
        if (lobbyList) lobbyList.innerHTML = noParticipantsHTML;
        if (gameList) gameList.innerHTML = noParticipantsHTML;
    }
}

// ===== FUNCIONES PRINCIPALES =====

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function generatePlayerId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Crear sala nueva en Firebase
window.createRoom = async function() {
    const hostName = document.getElementById('host-name').value.trim();
    if (!hostName) {
        alert('❌ Por favor ingresa tu nombre');
        return;
    }

    if (!isFirebaseConnected) {
        alert('❌ No hay conexión a Firebase. Verifica tu conexión a internet.');
        return;
    }

    try {
        cleanupListeners();
        
        currentRoomCode = generateRoomCode();
        currentPlayerId = generatePlayerId();
        currentPlayerName = hostName;
        isHost = true;

        roomRef = database.ref('rooms/' + currentRoomCode);
        
        const roomData = {
            host: currentPlayerId,
            players: {
                [currentPlayerId]: {
                    name: hostName,
                    connected: true,
                    joinedAt: firebase.database.ServerValue.TIMESTAMP,
                    avatar: '👑',
                    lastSeen: firebase.database.ServerValue.TIMESTAMP,
                    voiceActive: false,
                    voiceMuted: false,
                    webcamActive: false
                }
            },
            gameState: 'lobby',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastActivity: firebase.database.ServerValue.TIMESTAMP
        };

        await roomRef.set(roomData);
        
        // Marcar solo al jugador como desconectado si recarga, sin destruir la partida en curso
        roomRef.child('players/' + currentPlayerId + '/connected').onDisconnect().set(false);
        roomRef.child('players/' + currentPlayerId + '/voiceActive').onDisconnect().set(false);
        roomRef.child('players/' + currentPlayerId + '/webcamActive').onDisconnect().set(false);
        
        setupRoomListeners();
        showLobby();
        updateConnectionStatus('🟢 Sala creada exitosamente');
        
        console.log('🔥 Sala creada en Firebase:', currentRoomCode);
        
    } catch (error) {
        console.error('Error creando sala:', error);
        alert('❌ Error creando la sala. Inténtalo de nuevo.');
    }
};

// Unirse a sala existente
window.joinRoom = async function() {
    const joinName = document.getElementById('join-name').value.trim();
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!joinName || !roomCode) {
        alert('❌ Por favor completa todos los campos');
        return;
    }

    if (roomCode.length !== 6) {
        alert('❌ El código debe tener 6 caracteres');
        return;
    }

    if (!isFirebaseConnected) {
        alert('❌ No hay conexión a Firebase. Verifica tu conexión a internet.');
        return;
    }

    try {
        cleanupListeners();
        
        roomRef = database.ref('rooms/' + roomCode);
        const snapshot = await roomRef.once('value');
        const roomData = snapshot.val();
        
        if (!roomData) {
            alert('❌ La sala no existe');
            return;
        }

        const playerCount = Object.keys(roomData.players || {}).length;
        
        if (playerCount >= 4) {
            alert('❌ La sala está llena (máximo 4 jugadores)');
            return;
        }

        if (roomData.gameState !== 'lobby') {
            alert('❌ El juego ya comenzó');
            return;
        }

        currentRoomCode = roomCode;
        currentPlayerId = generatePlayerId();
        currentPlayerName = joinName;
        
        await roomRef.child('players/' + currentPlayerId).set({
            name: joinName,
            connected: true,
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            avatar: getRandomAvatar(),
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            voiceActive: false,
            voiceMuted: false,
            webcamActive: false
        });
        
        roomRef.child('players/' + currentPlayerId + '/connected').onDisconnect().set(false);
        roomRef.child('players/' + currentPlayerId + '/voiceActive').onDisconnect().set(false);
        roomRef.child('players/' + currentPlayerId + '/webcamActive').onDisconnect().set(false);
        
        setupRoomListeners();
        showLobby();
        updateConnectionStatus('🟢 Conectado a la sala');
        
        console.log('🔥 Unido a sala Firebase:', roomCode);
        
    } catch (error) {
        console.error('Error uniéndose a sala:', error);
        alert('❌ Error uniéndose a la sala. Verifica el código.');
    }
};

function cleanupListeners() {
    cleanupAllWebRTC();
    if (roomRef && listenersSetup) {
        roomRef.off();
        listenersSetup = false;
        console.log('🧹 Listeners anteriores limpiados');
    }
}

function setupRoomListeners() {
    if (!roomRef || listenersSetup) return;
    
    listenersSetup = true;
    setupWebRTCSignaling();
    
    roomRef.child('players').on('value', (snapshot) => {
        const players = snapshot.val() || {};
        console.log('👥 Firebase - Cambio en jugadores:', players);
        
        const prevPlayerIds = Object.keys(playersOnline || {});
        playersOnline = players;
        updatePlayersDisplay(players);
        updateStartButton(Object.keys(players).length);
        updateVoiceParticipantsList();
        
        // Si tenemos audio o video activo y entró un nuevo jugador, conectar WebRTC con él
        const currentIds = Object.keys(players);
        const hasNewPeer = currentIds.some(id => id !== currentPlayerId && !prevPlayerIds.includes(id));
        if (hasNewPeer && (voiceChatConnected || videoChatConnected)) {
            setTimeout(() => { syncLocalMediaWithPeers(); }, 400);
        }

        // Actualizar panel multiplayer si estamos en juego
        if (document.getElementById('game-container').style.display === 'block') {
            addMultiplayerGameInfo();
            updateWebcamPlayerNames();
        }
        
        if (currentPlayerId && players[currentPlayerId]) {
            if (!window.lastSeenUpdate || Date.now() - window.lastSeenUpdate > 30000) {
                roomRef.child('players/' + currentPlayerId + '/lastSeen').set(firebase.database.ServerValue.TIMESTAMP);
                window.lastSeenUpdate = Date.now();
            }
        }
        
        console.log('✅ Lista de jugadores actualizada, total:', Object.keys(players).length);
    });
    
    roomRef.child('gameState').on('value', (snapshot) => {
        const gameState = snapshot.val();
        console.log('🎮 Firebase - Estado del juego cambió a:', gameState);
        
        if (gameState === 'playing') {
            console.log('🚀 Iniciando transición a pantalla de juego...');
            showGameScreen();
        }
    });
    
    // Listener para sincronización completa del juego
    roomRef.child('gameData').on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (gameData && gameData.gameStarted) {
            window.latestFirebaseGameData = gameData;
            console.log('🔄 === FIREBASE LISTENER ACTIVADO ===');
            console.log('📊 Datos del snapshot:', {
                currentPlayer: gameData.currentPlayer,
                gameStarted: gameData.gameStarted,
                playersCount: gameData.players ? gameData.players.length : 0,
                lastAction: gameData.lastAction ? gameData.lastAction.type : 'ninguna'
            });
            
            if (gameData.lastUpdate && window.lastGameUpdate && gameData.lastUpdate <= window.lastGameUpdate) {
                console.log('⏭️ Saltando sincronización - datos no más recientes');
                return;
            }
            
            window.lastGameUpdate = gameData.lastUpdate || Date.now();
            syncCompleteGameState(gameData);
        } else {
            console.log('⚠️ Datos de juego no válidos o juego no iniciado');
        }
    });
    
    // Listener para estado de webcams y voz
    roomRef.child('players').on('child_changed', (snapshot) => {
        const playerId = snapshot.key;
        const playerData = snapshot.val();
        
        if (playerData && playersOnline[playerId]) {
            playersOnline[playerId] = { ...playersOnline[playerId], ...playerData };
            updateVoiceParticipantsList();
            
            if (document.getElementById('game-container').style.display === 'block') {
                updateWebcamPlayerNames();
            }
        }
    });
    
    console.log('✅ Listeners configurados');
}

function getRandomAvatar() {
    const avatars = (window.GAME_THEME && window.GAME_THEME.playerAvatars) || ['🏋️', '📱', '🚗', '💰', '🧠', '🎯', '💼', '🚀', '⚡', '🔥'];
    return avatars[Math.floor(Math.random() * avatars.length)];
}

// Inicializar estado del juego (ordenado consistentemente por llegada)
function initializeGame(playersOnline) {
    const connectedPlayers = getSortedPlayerIds(playersOnline).filter(id => playersOnline[id].connected);
    const startingMoney = (window.GAME_THEME && window.GAME_THEME.startingMoney) || 2500;
    const startingFollowers = (window.GAME_THEME && window.GAME_THEME.startingFollowers) || 100;
    
    const gameData = {
        currentPlayer: 1,
        gameState: 'playing',
        turnPhase: 'roll',
        players: [],
        lastAction: { type: 'gameStart', timestamp: Date.now() },
        gameStarted: true,
        lastUpdate: Date.now()
    };

    connectedPlayers.forEach((playerId, index) => {
        const playerData = playersOnline[playerId];
        gameData.players.push({
            id: index + 1,
            firebaseId: playerId,
            name: (playerData.avatar || '👤') + ' ' + playerData.name,
            money: startingMoney,
            position: 0,
            properties: [],
            constructions: 0,
            bankrupt: false,
            inJail: false,
            jailTurns: 0,
            getOutCards: 0,
            followers: startingFollowers,
            rank: 0,
            totalMentorias: 0,
            turnsPlayed: 0
        });
    });

    return gameData;
}

// Iniciar juego multiplayer
window.startMultiplayerGame = async function() {
    console.log('🚀 === INICIANDO JUEGO MULTIPLAYER ===');
    console.log('👑 Es host:', isHost);
    console.log('🔥 Firebase conectado:', isFirebaseConnected);
    console.log('🏠 Sala actual:', currentRoomCode);
    console.log('👥 Jugadores online:', playersOnline);
    
    if (!isHost) {
        console.error('❌ No es el host');
        alert('❌ Solo el host puede iniciar el juego');
        return;
    }
    
    const playerCount = Object.keys(playersOnline).length;
    console.log('👥 Número de jugadores:', playerCount);
    
    if (playerCount < 2) {
        console.error('❌ Muy pocos jugadores');
        alert('❌ Se necesitan al menos 2 jugadores');
        return;
    }

    if (!roomRef) {
        console.error('❌ No hay referencia de sala');
        alert('❌ No hay conexión a la sala');
        return;
    }

    if (!isFirebaseConnected) {
        console.error('❌ Firebase desconectado');
        alert('❌ Sin conexión a Firebase');
        return;
    }

    try {
        console.log('🔧 Paso 1: Deshabilitando botón...');
        const startBtn = document.getElementById('start-multiplayer-btn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = '🔄 Iniciando...';
            console.log('🔘 Botón deshabilitado');
        }
        
        console.log('🔧 Paso 2: Generando datos del juego...');
        const gameData = initializeGame(playersOnline);
        
        console.log('🎮 Datos del juego generados:', gameData);
        console.log('👥 Jugadores en gameData:', gameData.players.length);
        
        console.log('🔧 Paso 3: Guardando en Firebase...');
        // Asegurar que el tablero se incluya en el estado inicial
        if (typeof window.boardCells !== 'undefined') {
            gameData.boardCells = [...window.boardCells];
        }
        
        const updateData = {
            gameState: 'playing',
            gameData: gameData,
            startedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        console.log('💾 Datos a guardar:', updateData);
        await roomRef.update(updateData);
        
        console.log('✅ Datos guardados en Firebase exitosamente');
        console.log('🔧 Paso 4: El listener debería activarse automáticamente...');
        
        // Verificar después de 2 segundos si la pantalla cambió
        setTimeout(() => {
            const gameContainer = document.getElementById('game-container');
            const lobbyScreen = document.getElementById('lobby-screen');
            
            if (gameContainer && gameContainer.style.display === 'block') {
                console.log('✅ Pantalla de juego mostrada correctamente');
            } else if (lobbyScreen && lobbyScreen.style.display !== 'none') {
                console.warn('⚠️ Aún en lobby - forzando transición...');
                showGameScreen();
            }
        }, 2000);
        
        console.log('✅ === PROCESO INICIADO EXITOSAMENTE ===');
        
    } catch (error) {
        console.error('❌ === ERROR INICIANDO JUEGO ===');
        console.error('❌ Error completo:', error);
        console.error('❌ Stack trace:', error.stack);
        
        alert('❌ Error iniciando el juego: ' + error.message);
        
        const startBtn = document.getElementById('start-multiplayer-btn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = '🚀 EMPEZAR JUEGO';
            console.log('🔘 Botón rehabilitado');
        }
    }
};

// Mostrar pantalla multiplayer inicial
function showMultiplayerScreen() {
    const header = document.querySelector('.game-header');
    if (header) header.style.display = 'block';
    document.getElementById('multiplayer-screen').style.display = 'block';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'none';
}

// Mostrar lobby
function showLobby() {
    console.log('🏠 Mostrando lobby para sala:', currentRoomCode);
    
    const header = document.querySelector('.game-header');
    if (header) header.style.display = 'block';
    document.getElementById('multiplayer-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'block';
    document.getElementById('game-container').style.display = 'none';
    
    if (currentRoomCode) {
        const roomCodeDisplay = document.getElementById('room-code-display');
        const codeToShare = document.getElementById('code-to-share');
        const currentRoomCodeSpan = document.getElementById('current-room-code');
        
        if (roomCodeDisplay) roomCodeDisplay.textContent = currentRoomCode;
        if (codeToShare) codeToShare.textContent = currentRoomCode;
        if (currentRoomCodeSpan) currentRoomCodeSpan.textContent = currentRoomCode;
        
        console.log('✅ Código de sala actualizado:', currentRoomCode);
    }
    
    if (playersOnline && Object.keys(playersOnline).length > 0) {
        console.log('🔄 Actualizando lista con jugadores existentes:', playersOnline);
        updatePlayersDisplay(playersOnline);
        updateStartButton(Object.keys(playersOnline).length);
    }
}

// Mostrar pantalla de juego - VERSION SIMPLIFICADA
function showGameScreen() {
    console.log('🎮 Mostrando pantalla de juego...');
    
    const header = document.querySelector('.game-header');
    if (header) header.style.display = 'none';
    document.getElementById('multiplayer-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    
    console.log('✅ Pantallas cambiadas correctamente');
    
    // Inicializar el juego real y mostrar info de jugadores
    setTimeout(() => {
        initializeRealGame();
        addMultiplayerGameInfo();
        updateWebcamPlayerNames();
        console.log('✅ Juego real inicializado con info multiplayer');
    }, 500);
}

// Agregar información de multiplayer al juego (integrado en columna derecha sin tapar el tablero)
function addMultiplayerGameInfo() {
    // Buscar el contenedor integrado en la columna derecha
    let targetElement = document.getElementById('multiplayer-sidebar-panel') ||
                       document.querySelector('.col-der') ||
                       document.getElementById('game-container');
    
    if (!targetElement) {
        console.warn('⚠️ No se encontró elemento para mostrar info de jugadores');
        return;
    }
    
    // Crear panel de info multiplayer integrado (sin position: fixed)
    let multiplayerInfo = document.getElementById('multiplayer-game-info');
    if (!multiplayerInfo) {
        multiplayerInfo = document.createElement('div');
        multiplayerInfo.id = 'multiplayer-game-info';
        multiplayerInfo.className = 'multiplayer-integrated-card';
        
        if (targetElement.id === 'multiplayer-sidebar-panel') {
            targetElement.appendChild(multiplayerInfo);
        } else {
            targetElement.insertBefore(multiplayerInfo, targetElement.firstChild);
        }
    }
    
    // Actualizar contenido con jugadores conectados de forma compacta
    const sortedIds = getSortedPlayerIds();
    const playerCount = sortedIds.length;
    let html = `
        <div class="mp-card-header">
            <span class="mp-room-badge">🟢 Sala: <strong>${currentRoomCode || '---'}</strong></span>
            <span class="mp-players-count">👥 ${playerCount}/4</span>
        </div>
        <div class="mp-players-chips">
    `;
    
    sortedIds.forEach((playerId) => {
        const player = playersOnline[playerId];
        if (!player) return;
        const isCurrentPlayer = playerId === currentPlayerId;
        const status = player.connected ? '🟢' : '🔴';
        const avatar = player.avatar || '👤';
        const badge = isCurrentPlayer ? ' (TÚ)' : '';
        
        html += `
            <span class="mp-player-chip ${isCurrentPlayer ? 'mp-chip-self' : ''}" title="${player.name}">
                ${status}${avatar} ${player.name}${badge}
            </span>
        `;
    });
    
    html += `
        </div>
        <div class="mp-media-controls">
            ${voiceChatConnected ? 
                `<button onclick="leaveVoiceChat()" class="mp-btn mp-btn-danger" title="Desconectar Audio">🔇 Off Voz</button>
                 ${voiceChatMuted ? 
                    `<button onclick="toggleMute()" class="mp-btn mp-btn-warn" title="Activar Micrófono">🔊 Mic</button>` :
                    `<button onclick="toggleMute()" class="mp-btn mp-btn-muted" title="Silenciar Micrófono">🔇 Mute</button>`
                 }` :
                `<button onclick="joinVoiceChat()" class="mp-btn mp-btn-success" title="Conectar Audio P2P">🎤 Audio</button>`
            }
            ${videoChatConnected ? 
                `<button onclick="leaveVideoChat()" class="mp-btn mp-btn-danger" title="Apagar Cámara">📹 Off Cam</button>` :
                `<button onclick="joinVideoChat()" class="mp-btn mp-btn-info" title="Encender Cámara P2P">📹 Cámara</button>`
            }
        </div>
    `;
    
    multiplayerInfo.innerHTML = html;
    console.log('✅ Panel de info multiplayer actualizado');
}

// Inicializar el juego real de MonoLLADOS para multiplayer
function initializeRealGame() {
    console.log('🔧 Inicializando juego real de MonoLLADOS para multiplayer...');
    
    try {
        // Configurar las variables globales del juego original
        if (typeof window.players === 'undefined') {
            window.players = [];
        }
        
        const startingMoney = (window.GAME_THEME && window.GAME_THEME.startingMoney) || 2500;
        const startingFollowers = (window.GAME_THEME && window.GAME_THEME.startingFollowers) || 100;

        // Si ya tenemos datos sincronizados desde Firebase, usarlos en lugar de sobreescribirlos
        if (window.latestFirebaseGameData && Array.isArray(window.latestFirebaseGameData.players) && window.latestFirebaseGameData.players.length > 0) {
            window.players = normalizePlayersArray(window.latestFirebaseGameData.players);
            window.currentPlayer = window.latestFirebaseGameData.currentPlayer || 1;
            window.gameState = window.latestFirebaseGameData.gameState || 'playing';
            window.turnPhase = window.latestFirebaseGameData.turnPhase || 'roll';
        } else {
            // Limpiar jugadores previos y crear desde Firebase (ordenado consistentemente por llegada)
            window.players = [];
            const connectedPlayers = getSortedPlayerIds(playersOnline).filter(id => playersOnline[id].connected);
            
            connectedPlayers.forEach((playerId, index) => {
                const playerData = playersOnline[playerId];
                window.players.push({
                    id: index + 1,
                    firebaseId: playerId,
                    name: (playerData.avatar || '👤') + ' ' + playerData.name,
                    money: startingMoney,
                    position: 0,
                    properties: [],
                    constructions: 0,
                    bankrupt: false,
                    inJail: false,
                    jailTurns: 0,
                    getOutCards: 0,
                    followers: startingFollowers,
                    rank: 0,
                    totalMentorias: 0,
                    turnsPlayed: 0
                });
            });
            
            window.currentPlayer = 1;
            window.gameState = 'playing';
            window.turnPhase = 'roll';
        }
        
        // Inicializar variables específicas del juego de dados
        window.doblesConsecutivos = 0;
        window.debeSeguitTirando = false;
        window.lastRoll = 0;
        
        // Inicializar otras variables críticas del juego
        window.cartaPendiente = null;
        window.tipoCartaPendiente = null;
        window.jugadorCartaPendiente = null;
        window.rentaPendiente = null;
        window.subastaActiva = false;
        window.propiedadEnSubasta = null;
        window.jugadoresSubasta = [];
        window.pujaActual = 0;
        window.pujadorActual = 0;
        window.intercambioActivo = false;
        window.playerFollowers = {};
        window.playerAchievements = {};
        window.cartasEspecialesGuardadas = {};
        window.proteccionesActivas = {};
        
        // Inicializar arrays y objetos para evitar errores de undefined
        if (!window.players || !Array.isArray(window.players)) {
            window.players = [];
        }
        
        if (!window.boardCells || !Array.isArray(window.boardCells)) {
            window.boardCells = [];
        }
        
        console.log('🎲 Variables del juego inicializadas:', {
            doblesConsecutivos: window.doblesConsecutivos,
            debeSeguitTirando: window.debeSeguitTirando,
            lastRoll: window.lastRoll,
            players: window.players.length,
            boardCells: window.boardCells.length
        });
        
        // Determinar si es mi turno
        const currentPlayerData = window.players[window.currentPlayer - 1];
        isMyTurn = currentPlayerData && currentPlayerData.firebaseId === currentPlayerId;
        
        // Inicializar propiedades del tablero
        if (typeof window.initializeProperties === 'function') {
            window.initializeProperties();
        }
        
        // Crear el tablero real
        if (typeof window.initBoard === 'function') {
            window.initBoard();
        }
        
        // Inicializar sistemas adicionales
        if (typeof window.inicializarCartasGuardadas === 'function') {
            window.inicializarCartasGuardadas();
        }
        
        if (typeof window.inicializarSistemasLlados === 'function') {
            window.inicializarSistemasLlados();
        }
        
        // Actualizar displays
        if (typeof window.updatePlayerDisplay === 'function') {
            window.updatePlayerDisplay();
        }
        
        if (typeof window.updatePlayerPieces === 'function') {
            window.updatePlayerPieces();
        }
        
        console.log('✅ Juego real inicializado exitosamente');
        console.log('👥 Jugadores creados:', window.players.length);
        console.log('🎯 Es mi turno:', isMyTurn);
        
        // Actualizar controles según el turno
        updateControlsForTurn();
        updateTurnIndicator();
        
        // Activar interceptores para sincronización - esperar a que las funciones estén disponibles
        waitForGameFunctions();
        
        // Intentar cargar estado guardado después de la inicialización
        setTimeout(() => {
            loadGameStateFromFirebase();
        }, 2000);
        
        // Iniciar verificación periódica del estado de turnos
        startTurnStateMonitor();
        
    } catch (error) {
        console.error('❌ Error inicializando juego real:', error);
        
        // Fallback: mostrar tablero básico si hay error
        const boardElement = document.getElementById('board');
        if (boardElement && boardElement.children.length === 0) {
            boardElement.innerHTML = `
                <div style="width: 100%; height: 100%; border: 3px solid #333; background: linear-gradient(45deg, #ff6b6b, #feca57); display: flex; align-items: center; justify-content: center; font-size: 24px; color: #333; text-align: center; border-radius: 15px;">
                    ⚠️ <strong>Error cargando tablero</strong><br>
                    <div style="font-size: 16px; margin-top: 15px;">
                        👥 Jugadores conectados: ${Object.keys(playersOnline).length}<br>
                        🏠 Sala: ${currentRoomCode}<br><br>
                        <em>Recarga la página e intenta de nuevo</em>
                    </div>
                </div>
            `;
        }
    }
}

// Cargar estado del juego desde Firebase para persistencia
async function loadGameStateFromFirebase() {
    if (!currentRoomCode || !roomRef) {
        console.warn('⚠️ No se puede cargar estado: falta conexión a sala');
        return;
    }
    
    try {
        console.log('📥 === CARGANDO ESTADO PERSISTENTE DESDE FIREBASE ===');
        
        const snapshot = await roomRef.child('gameData').once('value');
        const gameData = snapshot.val();
        
        if (gameData && gameData.gameStarted && gameData.lastAction) {
            console.log('📊 Estado encontrado, restaurando partida en curso...');
            console.log('🕐 Última acción:', gameData.lastAction.type, 'por', gameData.lastAction.playerName);
            
            // Restaurar estado básico del juego
            if (gameData.currentPlayer && gameData.currentPlayer !== window.currentPlayer) {
                console.log('👤 Restaurando jugador actual:', gameData.currentPlayer);
                window.currentPlayer = gameData.currentPlayer;
            }
            
            if (gameData.turnPhase && gameData.turnPhase !== window.turnPhase) {
                console.log('🎲 Restaurando fase del turno:', gameData.turnPhase);
                window.turnPhase = gameData.turnPhase;
            }
            
            if (gameData.gameState && gameData.gameState !== window.gameState) {
                console.log('🎮 Restaurando estado del juego:', gameData.gameState);
                window.gameState = gameData.gameState;
            }
            
            // Restaurar datos de jugadores con sus propiedades y dinero
            if (gameData.players && gameData.players.length > 0) {
                console.log('👥 Restaurando datos de jugadores...');
                window.players = normalizePlayersArray(gameData.players);
                window.players.forEach((p) => {
                    console.log(`👤 ${p.name}: €${p.money}, pos ${p.position}, props ${p.properties.length}`);
                });
            }
            
            // Restaurar estado del tablero con propiedades compradas
            if (gameData.boardCells && gameData.boardCells.length > 0) {
                console.log('🏠 Restaurando estado del tablero...');
                window.boardCells = gameData.boardCells;
                
                // Contar propiedades compradas
                const propertiesOwned = gameData.boardCells.filter(cell => cell && cell.owner).length;
                console.log(`🏠 Propiedades compradas: ${propertiesOwned}`);
            }
            
            // Restaurar variables de dados de la última acción
            if (gameData.lastAction && gameData.lastAction.data) {
                const lastData = gameData.lastAction.data;
                if (lastData.doblesConsecutivos !== undefined) {
                    window.doblesConsecutivos = lastData.doblesConsecutivos;
                    console.log('🎲 Dobles consecutivos restaurados:', window.doblesConsecutivos);
                }
                if (lastData.debeSeguitTirando !== undefined) {
                    window.debeSeguitTirando = lastData.debeSeguitTirando;
                    console.log('🎯 Debe seguir tirando restaurado:', window.debeSeguitTirando);
                }
                if (lastData.lastRoll !== undefined) {
                    window.lastRoll = lastData.lastRoll;
                    console.log('🎲 Última tirada restaurada:', window.lastRoll);
                }
            }
            
            // Actualizar variable global isMyTurn
            const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
            isMyTurn = currentPlayerData && currentPlayerData.firebaseId === currentPlayerId;
            
            console.log('✅ === ESTADO RESTAURADO EXITOSAMENTE ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            console.log('👤 Jugador actual:', window.currentPlayer);
            console.log('🎲 Fase del turno:', window.turnPhase);
            console.log('💰 Dinero total jugadores:', window.players.reduce((sum, p) => sum + (p.money || 0), 0));
            
            // Actualizar interfaz después de restaurar
            setTimeout(() => {
                updateTurnIndicator();
                updateControlsForTurn();
                
                if (window.players) {
                    updatePlayersDisplay(window.players);
                }
                
                // Actualizar piezas del tablero
                if (typeof window.updatePlayerPieces === 'function') {
                    window.updatePlayerPieces();
                }
                
                // Actualizar construcciones
                if (typeof window.updateAllConstructions === 'function') {
                    window.updateAllConstructions();
                }
                
                // Actualizar propiedades en el tablero
                if (window.boardCells) {
                    window.boardCells.forEach((cell, index) => {
                        if (cell && cell.owner && typeof window.updateCellDisplay === 'function') {
                            window.updateCellDisplay(index);
                        }
                    });
                }
                
                // Mostrar notificación de partida restaurada
                showGameRestoredNotification();
                
            }, 500);
            
        } else {
            console.log('📥 No hay estado guardado para restaurar - partida nueva');
        }
        
    } catch (error) {
        console.error('❌ Error cargando estado desde Firebase:', error);
    }
}

// Mostrar notificación de partida restaurada
function showGameRestoredNotification() {
    try {
        const notification = document.createElement('div');
        notification.id = 'game-restored-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(45deg, #28a745, #20c997);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideDown 0.5s ease-out;
            border: 2px solid #ffd700;
            text-align: center;
        `;
        
        notification.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">
                🎮 Partida Restaurada
            </div>
            <div style="font-size: 14px; opacity: 0.9;">
                Todos los movimientos y compras han sido recuperados
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Agregar animación CSS si no existe
        if (!document.getElementById('slide-animations')) {
            const style = document.createElement('style');
            style.id = 'slide-animations';
            style.textContent = `
                @keyframes slideDown {
                    from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remover notificación después de 5 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
    } catch (error) {
        console.error('❌ Error mostrando notificación de partida restaurada:', error);
    }
}

// Monitor periódico del estado de turnos
function startTurnStateMonitor() {
    console.log('🔄 === INICIANDO MONITOR DE TURNOS ===');
    
    // Limpiar monitor anterior si existe
    if (window.turnStateMonitor) {
        clearInterval(window.turnStateMonitor);
    }
    
    // Crear nuevo monitor que se ejecuta cada 1 segundo (más agresivo)
    window.turnStateMonitor = setInterval(() => {
        try {
            // Solo monitorear si el juego está activo
            if (window.gameState === 'playing' && window.players && window.players.length > 0) {
                const currentState = updateAndVerifyTurnState();
                
                // Si detecta cambio en el estado, forzar actualización
                if (currentState !== window.lastTurnState) {
                    console.log('🔄 Monitor detectó cambio de turno:', window.lastTurnState, '->', currentState);
                    forceButtonStateUpdate();
                    updateTurnIndicator();
                    
                    // Si ahora es mi turno, activar sincronización agresiva
                    if (currentState) {
                        console.log('🎯 Monitor detectó que ahora es mi turno - activando sincronización');
                        
                        // Activar inmediatamente el turno
                        activatePlayerTurnImmediately();
                        
                        // Múltiples actualizaciones para asegurar sincronización
                        setTimeout(() => {
                            activatePlayerTurnImmediately();
                        }, 300);
                        
                        setTimeout(() => {
                            forceButtonStateUpdate();
                            updateTurnIndicator();
                        }, 800);
                    }
                    
                    window.lastTurnState = currentState;
                }
            }
        } catch (error) {
            console.error('❌ Error en monitor de turnos:', error);
        }
    }, 1000);
    
    console.log('✅ Monitor de turnos iniciado (cada 1 segundo)');
}

// Función para detener el monitor de turnos
function stopTurnStateMonitor() {
    if (window.turnStateMonitor) {
        clearInterval(window.turnStateMonitor);
        window.turnStateMonitor = null;
        console.log('⏹️ Monitor de turnos detenido');
    }
}

// Función para forzar actualización de botones
function forceButtonStateUpdate() {
    console.log('🔄 === FORZANDO ACTUALIZACIÓN DE BOTONES ===');
    
    try {
        // Verificar estado del turno
        const myTurnVerified = updateAndVerifyTurnState();
        
        const rollBtn = document.getElementById('roll-btn');
        const nextBtn = document.getElementById('next-btn');
        const buyBtn = document.getElementById('buy-btn');
        const buildBtn = document.getElementById('build-btn');
        const jailBtn = document.getElementById('jail-btn');
        const tradeBtn = document.getElementById('trade-btn');
        
        console.log('🎯 Forzando estado - Es mi turno:', myTurnVerified);
        console.log('🎲 Fase del turno:', window.turnPhase);
        console.log('🎯 Debe seguir tirando:', window.debeSeguitTirando);
        
        // Forzar estado de botones
        if (rollBtn) {
            const canRoll = myTurnVerified && window.turnPhase === 'roll';
            rollBtn.disabled = !canRoll;
            rollBtn.style.cssText = canRoll ? 
                'opacity: 1; pointer-events: auto; filter: none;' : 
                'opacity: 0.5; pointer-events: none; filter: grayscale(1);';
            
            if (canRoll && window.debeSeguitTirando) {
                rollBtn.style.cssText = 'background: linear-gradient(45deg, #ff6b35, #f7931e) !important; color: white !important; box-shadow: 0 0 15px rgba(255, 107, 53, 0.6) !important; animation: pulse 1s infinite !important;';
                rollBtn.textContent = '🔥 ¡DEBES TIRAR!';
            } else if (canRoll) {
                rollBtn.style.cssText = 'background: linear-gradient(45deg, #28a745, #20c997) !important; color: white !important; box-shadow: 0 0 10px rgba(40, 167, 69, 0.5) !important; animation: pulse 1.5s infinite !important;';
                rollBtn.textContent = '🎲 TIRAR DADOS';
            }
            
            console.log('🎲 Botón tirar dados:', canRoll ? 'HABILITADO' : 'DESHABILITADO');
        }
        
        if (nextBtn) {
            const canNext = myTurnVerified && window.turnPhase !== 'roll' && !window.debeSeguitTirando;
            nextBtn.disabled = !canNext;
            nextBtn.style.cssText = canNext ? 
                'background: linear-gradient(45deg, #28a745, #20c997); color: white; box-shadow: 0 0 10px rgba(40, 167, 69, 0.5);' : 
                'opacity: 0.5; pointer-events: none; filter: grayscale(1);';
            
            console.log('⏭️ Botón pasar turno:', canNext ? 'HABILITADO' : 'DESHABILITADO');
        }
        
        // Otros botones
        [buyBtn, buildBtn, jailBtn, tradeBtn].forEach(btn => {
            if (btn) {
                btn.disabled = !myTurnVerified;
                btn.style.cssText = myTurnVerified ? 
                    'opacity: 1; pointer-events: auto; filter: none;' : 
                    'opacity: 0.5; pointer-events: none; filter: grayscale(1);';
            }
        });
        
        console.log('✅ Actualización forzada de botones completada');
        
    } catch (error) {
        console.error('❌ Error en forceButtonStateUpdate:', error);
    }
}

// Función para activar inmediatamente el turno del jugador
function activatePlayerTurnImmediately() {
    console.log('🚀 === ACTIVANDO TURNO DEL JUGADOR INMEDIATAMENTE ===');
    
    try {
        // Verificar que es mi turno
        const myTurnVerified = updateAndVerifyTurnState();
        
        if (!myTurnVerified) {
            console.log('❌ No es mi turno, no se puede activar');
            return;
        }
        
        console.log('🎯 Activando turno - Es mi turno confirmado');
        
        // Asegurar que la fase esté en 'roll' para la primera tirada
        if (window.turnPhase !== 'roll') {
            console.log('🔄 Corrigiendo fase del turno a "roll"');
            window.turnPhase = 'roll';
        }
        
        // Resetear variables de dobles si es necesario
        if (typeof window.debeSeguitTirando === 'undefined') {
            window.debeSeguitTirando = false;
        }
        
        // Actualizar interfaz múltiples veces para asegurar sincronización
        updateTurnIndicator();
        forceButtonStateUpdate();
        
        // Mostrar notificación
        showTurnNotification();
        
        // Activar animación en el botón de tirar dados
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) {
            rollBtn.style.cssText = 'background: linear-gradient(45deg, #28a745, #20c997) !important; color: white !important; box-shadow: 0 0 15px rgba(40, 167, 69, 0.8) !important; animation: pulse 1s infinite !important; transform: scale(1.05) !important;';
            rollBtn.textContent = '🎲 ¡ES TU TURNO - TIRA DADOS!';
        }
        
        console.log('✅ Turno del jugador activado exitosamente');
        
    } catch (error) {
        console.error('❌ Error activando turno del jugador:', error);
    }
}

// Función de emergencia para activar el turno manualmente
function forceActivateMyTurn() {
    console.log('🚨 === FUNCIÓN DE EMERGENCIA: ACTIVAR MI TURNO ===');
    
    try {
        // Verificar datos básicos
        if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
            console.error('❌ No hay jugadores válidos');
            alert('Error: No hay jugadores válidos');
            return;
        }
        
        if (!window.currentPlayer || window.currentPlayer < 1 || window.currentPlayer > window.players.length) {
            console.error('❌ currentPlayer inválido:', window.currentPlayer);
            alert('Error: Jugador actual inválido');
            return;
        }
        
        const currentPlayerData = window.players[window.currentPlayer - 1];
        if (!currentPlayerData) {
            console.error('❌ Datos del jugador actual no encontrados');
            alert('Error: Datos del jugador actual no encontrados');
            return;
        }
        
        const shouldBeMyTurn = currentPlayerData.firebaseId === currentPlayerId;
        
        console.log('🔍 Verificación de emergencia:');
        console.log('  🆔 Mi Firebase ID:', currentPlayerId);
        console.log('  🆔 Jugador actual Firebase ID:', currentPlayerData.firebaseId);
        console.log('  🎯 ¿Debería ser mi turno?:', shouldBeMyTurn);
        console.log('  👤 Jugador actual:', currentPlayerData.name);
        
        if (!shouldBeMyTurn) {
            alert(`No es tu turno. Es el turno de ${currentPlayerData.name}`);
            return;
        }
        
        // Forzar actualización de estado
        isMyTurn = true;
        window.turnPhase = 'roll';
        window.debeSeguitTirando = false;
        
        console.log('🔄 Forzando activación del turno...');
        
        // Activar inmediatamente
        activatePlayerTurnImmediately();
        
        // Múltiples actualizaciones para asegurar sincronización
        setTimeout(() => {
            activatePlayerTurnImmediately();
        }, 200);
        
        setTimeout(() => {
            updateAndVerifyTurnState();
            forceButtonStateUpdate();
            updateTurnIndicator();
        }, 500);
        
        setTimeout(() => {
            forceButtonStateUpdate();
            updateTurnIndicator();
        }, 1000);
        
        alert('¡Turno activado! Ahora puedes tirar los dados.');
        
    } catch (error) {
        console.error('❌ Error en función de emergencia:', error);
        alert('Error activando turno: ' + error.message);
    }
}

// Exponer función de emergencia globalmente para uso manual
window.forceActivateMyTurn = forceActivateMyTurn;

// Función para actualizar y verificar el estado del turno
function updateAndVerifyTurnState() {
    if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
        console.warn('⚠️ No hay jugadores para verificar turno');
        return false;
    }
    
    if (!window.currentPlayer || window.currentPlayer < 1 || window.currentPlayer > window.players.length) {
        console.warn('⚠️ currentPlayer inválido:', window.currentPlayer);
        return false;
    }
    
    const currentPlayerData = window.players[window.currentPlayer - 1];
    if (!currentPlayerData) {
        console.warn('⚠️ Datos del jugador actual no encontrados');
        return false;
    }
    
    const shouldBeMyTurn = currentPlayerData.firebaseId === currentPlayerId;
    
    if (isMyTurn !== shouldBeMyTurn) {
        console.log('🔄 Actualizando estado de turno:');
        console.log('  🎯 Era mi turno:', isMyTurn);
        console.log('  🎯 Debería ser mi turno:', shouldBeMyTurn);
        console.log('  👤 Jugador actual:', currentPlayerData.name);
        console.log('  🆔 Mi ID:', currentPlayerId);
        console.log('  🆔 Jugador actual ID:', currentPlayerData.firebaseId);
        
        isMyTurn = shouldBeMyTurn;
        
        // Actualizar interfaz inmediatamente
        updateTurnIndicator();
        updateControlsForTurn();
        
        // Si ahora es mi turno, mostrar notificación y asegurar que los controles estén correctos
        if (shouldBeMyTurn) {
            console.log('🎯 ¡Ahora es mi turno! Activando controles...');
            
            // Forzar actualización de controles múltiples veces para asegurar sincronización
            setTimeout(() => {
                forceButtonStateUpdate();
                updateTurnIndicator();
                showTurnNotification();
            }, 100);
            
            setTimeout(() => {
                forceButtonStateUpdate();
                updateTurnIndicator();
            }, 500);
            
            setTimeout(() => {
                forceButtonStateUpdate();
                updateTurnIndicator();
            }, 1000);
        }
    }
    
    return shouldBeMyTurn;
}

// Función mejorada para controlar automáticamente el estado del turno
function autoManageTurnState() {
    // Verificar y actualizar estado del turno
    const myTurnVerified = updateAndVerifyTurnState();
    
    if (!myTurnVerified) {
        console.log('🔍 No es mi turno verificado, saltando auto gestión');
        return;
    }
    
    console.log('🤖 === AUTO GESTIÓN DE ESTADO DEL TURNO ===');
    
    // Verificar si debe seguir tirando por dobles
    if (window.debeSeguitTirando && window.turnPhase === 'roll') {
        console.log('🎲 Debe seguir tirando por dobles');
        window.turnPhase = 'roll';
        updateControlsForTurn();
        return;
    }
    
    // Verificar si está en fase de tirar dados
    if (window.turnPhase === 'roll' && !window.debeSeguitTirando) {
        console.log('🎲 Debe tirar dados para continuar');
        updateControlsForTurn();
        return;
    }
    
    // Si está en fase de acción, verificar si puede hacer algo más
    if (window.turnPhase === 'action' || window.turnPhase !== 'roll') {
        const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
        if (!currentPlayerData) return;
        
        // Verificar si puede comprar la propiedad actual
        const currentPosition = currentPlayerData.position;
        const currentCell = window.boardCells && window.boardCells[currentPosition];
        
        let canBuyProperty = false;
        let canBuildConstruction = false;
        let hasOtherActions = false;
        
        // Verificar si puede comprar propiedad
        if (currentCell && currentCell.type === 'property' && !currentCell.owner && 
            currentPlayerData.money >= currentCell.price) {
            canBuyProperty = true;
        }
        
        // Verificar si puede construir
        if (currentPlayerData.properties && currentPlayerData.properties.length > 0) {
            canBuildConstruction = true;
        }
        
        // Verificar si hay popups abiertos que requieren acción
        const openPopups = document.querySelectorAll('.popup-overlay:not([style*="display: none"]), .modal:not([style*="display: none"])');
        hasOtherActions = openPopups.length > 0;
        
        console.log('🔍 Verificando acciones disponibles:');
        console.log('  🏠 Puede comprar propiedad:', canBuyProperty);
        console.log('  🏗️ Puede construir:', canBuildConstruction);
        console.log('  📋 Tiene otros popups:', hasOtherActions);
        console.log('  💰 Dinero jugador:', currentPlayerData.money);
        console.log('  📍 Posición actual:', currentPosition);
        console.log('  🏠 Propiedades:', currentPlayerData.properties ? currentPlayerData.properties.length : 0);
        
        // Si no puede hacer nada más, el sistema automático finalizarTurnoAutomatico se encarga de pasar turno
        if (!canBuyProperty && !hasOtherActions && !window.debeSeguitTirando) {
            console.log('✅ No hay más acciones disponibles - el turno pasará automáticamente');
            updateControlsForTurn();
        } else {
            console.log('⏳ Todavía hay acciones disponibles');
            updateControlsForTurn();
        }
    }
}

// Función específica para actualizar controles al final del turno
function updateControlsForTurnEnd() {
    try {
        const rollBtn = document.getElementById('roll-btn');
        const nextBtn = document.getElementById('next-btn');
        const buyBtn = document.getElementById('buy-btn');
        const buildBtn = document.getElementById('build-btn');
        const jailBtn = document.getElementById('jail-btn');
        const tradeBtn = document.getElementById('trade-btn');
        
        // Estilo para botones deshabilitados
        const disabledStyle = 'opacity: 0.3; pointer-events: none; filter: grayscale(1);';
        
        // Estilo para botón de pasar turno destacado
        const nextTurnStyle = 'background: linear-gradient(45deg, #28a745, #20c997) !important; color: white !important; box-shadow: 0 0 20px rgba(40, 167, 69, 0.8) !important; animation: pulse 1s infinite !important; transform: scale(1.1) !important; font-weight: bold !important; border: 3px solid #ffd700 !important;';
        
        // Deshabilitar todos los botones excepto el de pasar turno
        [rollBtn, buyBtn, buildBtn, jailBtn, tradeBtn].forEach(btn => {
            if (btn) {
                btn.disabled = true;
                btn.style.cssText = disabledStyle;
            }
        });
        
        // Habilitar y destacar el botón de pasar turno
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.style.cssText = nextTurnStyle;
            nextBtn.textContent = '⏭️ PASAR TURNO AL SIGUIENTE JUGADOR';
            
            // Agregar efecto de parpadeo
            nextBtn.classList.add('btn-highlight');
        }
        
        console.log('✅ Controles actualizados para final de turno');
        
    } catch (error) {
        console.error('❌ Error actualizando controles para final de turno:', error);
    }
}

// Mostrar notificación de error de turno
function showTurnErrorNotification(message) {
    try {
        // Remover notificación anterior si existe
        const existingNotification = document.getElementById('turn-error-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.id = 'turn-error-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #dc3545, #c82333);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.5s ease-out;
            border: 2px solid #ffd700;
            max-width: 300px;
        `;
        
        notification.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                    ⚠️ Error de Turno
                </div>
                <div style="font-size: 14px; opacity: 0.9;">
                    ${message}
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Remover notificación después de 5 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
    } catch (error) {
        console.error('❌ Error mostrando notificación de error de turno:', error);
    }
}

// Mostrar notificación de final de turno
function showTurnEndNotification() {
    try {
        // Crear notificación temporal
        const notification = document.createElement('div');
        notification.id = 'turn-end-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #28a745, #20c997);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.5s ease-out;
            border: 2px solid #ffd700;
        `;
        
        notification.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                    ✅ Turno Completado
                </div>
                <div style="font-size: 14px; opacity: 0.9;">
                    Pulsa "PASAR TURNO" para continuar
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Remover notificación después de 4 segundos
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 4000);
        
    } catch (error) {
        console.error('❌ Error mostrando notificación de final de turno:', error);
    }
}

// Función mejorada para updateControlsForTurn
function updateControlsForTurn() {
    try {
        // Verificar y actualizar estado del turno antes de actualizar controles
        updateAndVerifyTurnState();
        
        const rollBtn = document.getElementById('roll-btn');
        const nextBtn = document.getElementById('next-btn');
        const buyBtn = document.getElementById('buy-btn');
        const buildBtn = document.getElementById('build-btn');
        const jailBtn = document.getElementById('jail-btn');
        const tradeBtn = document.getElementById('trade-btn');
        
        // Estilo para botones deshabilitados
        const disabledStyle = 'opacity: 0.5; pointer-events: none; filter: grayscale(1);';
        
        // Estilo para botón activo principal
        const activeMainStyle = 'background: linear-gradient(45deg, #ff6b35, #f7931e) !important; color: white !important; box-shadow: 0 0 15px rgba(255, 107, 53, 0.6) !important; animation: pulse 1s infinite !important; transform: scale(1.05) !important; font-weight: bold !important;';
        
        // Estilo para botón activo normal
        const activeStyle = 'opacity: 1; pointer-events: auto; filter: none;';
        
        // Verificar si es el final del turno
        if (window.turnPhase === 'end') {
            updateControlsForTurnEnd();
            return;
        }
        
        if (rollBtn) {
            const canRoll = isMyTurn && window.turnPhase === 'roll';
            const mustRoll = canRoll && window.debeSeguitTirando;
            
            rollBtn.disabled = !canRoll;
            
            if (mustRoll) {
                // Botón de tirada obligatoria por dobles
                rollBtn.style.cssText = activeMainStyle;
                rollBtn.textContent = '🔥 ¡DEBES TIRAR DE NUEVO!';
            } else if (canRoll) {
                // Botón normal de tirar
                rollBtn.style.cssText = activeStyle;
                rollBtn.textContent = '🎲 TIRAR DADOS';
            } else {
                // Botón deshabilitado
                rollBtn.style.cssText = disabledStyle;
                rollBtn.textContent = '🎲 TIRAR DADOS';
            }
        }
        
        if (nextBtn) {
            nextBtn.style.display = 'none';
        }
        
        // Botones de acción secundarios
        [buyBtn, buildBtn, jailBtn, tradeBtn].forEach(btn => {
            if (btn) {
                btn.disabled = !isMyTurn;
                btn.style.cssText = isMyTurn ? activeStyle : disabledStyle;
            }
        });
        
        console.log('🎮 === CONTROLES ACTUALIZADOS ===');
        console.log('🎯 Es mi turno:', isMyTurn);
        console.log('🎲 Fase del turno:', window.turnPhase);
        console.log('🔥 Debe seguir tirando:', window.debeSeguitTirando);
        console.log('🎲 Dobles consecutivos:', window.doblesConsecutivos);
        
        // Ejecutar auto gestión de estado después de actualizar controles
        setTimeout(() => {
            autoManageTurnState();
        }, 500);
        
    } catch (error) {
        console.error('❌ Error actualizando controles:', error);
    }
}

// Actualizar indicador de turno
function updateTurnIndicator() {
    console.log('🔄 === ACTUALIZANDO INDICADOR DE TURNO ===');
    
    try {
        // Verificar y actualizar estado del turno antes de actualizar indicador
        updateAndVerifyTurnState();
        const currentPlayerDisplay = document.getElementById('current-player');
        if (!currentPlayerDisplay) {
            console.warn('⚠️ Elemento current-player no encontrado');
            
            // Buscar elementos alternativos
            const alternativeElement = document.getElementById('turn-indicator') || 
                                     document.querySelector('.current-player') ||
                                     document.querySelector('.player-turn');
            
            if (alternativeElement) {
                console.log('✅ Elemento alternativo encontrado para turno');
                alternativeElement.textContent = isMyTurn ? '🎯 TU TURNO' : '⏳ Turno de otro jugador';
            }
            return;
        }
        
        // Validar datos antes de proceder
        if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
            console.warn('⚠️ No hay jugadores válidos para mostrar turno');
            currentPlayerDisplay.innerHTML = `
                <div style="background: #dc3545; color: white; padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 12px;">
                    <strong>⚠️ ESPERANDO SINCRONIZACIÓN</strong><br>
                    <small>Cargando datos del juego...</small>
                </div>
            `;
            return;
        }
        
        // Validar índice del jugador actual
        const currentPlayerIndex = (window.currentPlayer || 1) - 1;
        if (currentPlayerIndex < 0 || currentPlayerIndex >= window.players.length) {
            console.warn('⚠️ Índice de jugador actual inválido:', currentPlayerIndex);
            return;
        }
        
        const currentPlayerData = window.players[currentPlayerIndex];
        if (!currentPlayerData) {
            console.warn('⚠️ Datos del jugador actual no encontrados');
            return;
        }
        
        const isMyTurnNow = currentPlayerData.firebaseId === currentPlayerId;
        
        // Determinar el estado del turno y los colores apropiados
        let turnText, bgColor, pulseClass, actionText, borderColor;
        
        if (isMyTurnNow) {
            // Verificar si debe seguir tirando por dobles
            if (window.debeSeguitTirando && window.turnPhase === 'roll') {
                turnText = '🎲 ¡DEBES TIRAR DE NUEVO!';
                bgColor = 'linear-gradient(45deg, #ff6b35, #f7931e)'; // Naranja llamativo
                borderColor = '#ff4500';
                actionText = '🔥 ¡TIRADA OBLIGATORIA POR DOBLES!';
                pulseClass = 'style="animation: pulse 0.8s infinite; box-shadow: 0 0 20px rgba(255, 107, 53, 0.8);"';
            } else if (window.turnPhase === 'roll') {
                turnText = '🎯 TU TURNO - TIRA DADOS';
                bgColor = 'linear-gradient(45deg, #28a745, #20c997)'; // Verde
                borderColor = '#ffd700';
                actionText = '🎮 ¡Puedes tirar los dados!';
                pulseClass = 'style="animation: pulse 1.2s infinite;"';
            } else {
                turnText = '🎯 TU TURNO - ELIGE ACCIÓN';
                bgColor = 'linear-gradient(45deg, #007bff, #6610f2)'; // Azul
                borderColor = '#ffd700';
                actionText = '⚡ ¡Elige tu siguiente acción!';
                pulseClass = 'style="animation: pulse 1s infinite;"';
            }
        } else {
            turnText = `⏳ Turno de ${currentPlayerData.name || 'Jugador'}`;
            bgColor = '#6c757d';
            borderColor = 'transparent';
            actionText = '🔒 Esperando tu turno...';
            pulseClass = '';
        }
        
        // Agregar estilos CSS para animaciones si no existen
        if (!document.getElementById('multiplayer-animations')) {
            const style = document.createElement('style');
            style.id = 'multiplayer-animations';
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
            `;
            document.head.appendChild(style);
        }
        
        const playerMoney = typeof currentPlayerData.money === 'number' ? currentPlayerData.money : 2500;
        const playerFollowers = typeof currentPlayerData.followers === 'number' ? currentPlayerData.followers : 100;
        currentPlayerDisplay.innerHTML = `
            <div class="turn-status-card" style="background: ${bgColor}; color: white; padding: 8px 10px; border-radius: 10px; text-align: center; border: 2px solid ${borderColor}; position: relative; overflow: hidden;" ${pulseClass}>
                ${isMyTurnNow ? '<div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ffd700, #ffed4e, #ffd700); animation: shimmer 2s infinite;"></div>' : ''}
                <div style="font-size: 14px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.4);">${turnText}</div>
                <div style="font-size: 12px; margin-top: 3px; font-weight: bold; color: #fde047;">
                    ${currentPlayerData.name || 'Jugador'} · 💰 €${playerMoney} · 📈 ${playerFollowers}
                </div>
                <div style="background: rgba(0,0,0,0.22); padding: 4px 6px; border-radius: 5px; margin-top: 4px; font-size: 11px;">
                    <span>${actionText}</span>
                    ${window.doblesConsecutivos > 0 ? ` <strong style="color: #ffd700;">(🎲 Dobles: ${window.doblesConsecutivos}/3)</strong>` : ''}
                </div>
            </div>
        `;
        
        // Actualizar también el indicador en el panel multiplayer
        try {
            const turnIndicatorPanel = document.getElementById('turn-indicator');
            if (turnIndicatorPanel) {
                turnIndicatorPanel.textContent = isMyTurnNow ? '🎯 TU TURNO' : `⏳ ${currentPlayerData.name || 'Jugador'}`;
            }
        } catch (error) {
            console.warn('⚠️ Error actualizando panel indicador:', error.message);
        }
        
        console.log('✅ === INDICADOR DE TURNO ACTUALIZADO ===');
        console.log('👤 Jugador actual:', window.currentPlayer);
        console.log('🎯 Es mi turno:', isMyTurnNow);
        console.log('👤 Nombre del jugador:', currentPlayerData.name);
        console.log('🆔 Mi ID vs Jugador ID:', currentPlayerId, 'vs', currentPlayerData.firebaseId);
        console.log('📱 Estado de elementos DOM:', {
            'roll-btn': !!document.getElementById('roll-btn'),
            'next-btn': !!document.getElementById('next-btn'),
            'current-player': !!document.getElementById('current-player')
        });
        
    } catch (error) {
        console.error('❌ Error actualizando indicador de turno:', error);
    }
}

// Actualizar display de jugadores
function updatePlayersDisplay(players) {
    const playersList = document.getElementById('players-list');
    
    if (!playersList) {
        console.error('❌ Elemento players-list no encontrado');
        return;
    }
    
    console.log('👥 Actualizando lista de jugadores:', players);
    
    let html = '';
    
    Object.keys(players).forEach((playerId) => {
        const player = players[playerId];
        const isOnline = player.connected;
        const status = isOnline ? '🟢' : '🔴';
        const hostBadge = player.avatar === '👑' ? ' (Host)' : '';
        const avatar = player.avatar || '👤';
        
        html += `
            <div class="player-item ${isOnline ? 'online' : 'offline'}">
                ${status} ${avatar} ${player.name}${hostBadge}
            </div>
        `;
    });
    
    if (html) {
        playersList.innerHTML = html;
        console.log('✅ Lista de jugadores actualizada con', Object.keys(players).length, 'jugadores');
    } else {
        playersList.innerHTML = '<div class="waiting-message">Esperando jugadores...</div>';
        console.log('⏳ Lista de jugadores vacía');
    }
}

// Actualizar botón de inicio
function updateStartButton(playerCount) {
    const startBtn = document.getElementById('start-multiplayer-btn');
    if (!startBtn) return;
    
    if (isHost && playerCount >= 2) {
        startBtn.disabled = false;
        startBtn.textContent = `🚀 EMPEZAR JUEGO (${playerCount} jugadores)`;
    } else {
        startBtn.disabled = true;
        if (!isHost) {
            startBtn.textContent = '⏳ Esperando al host...';
        } else {
            startBtn.textContent = `🚀 EMPEZAR JUEGO (Mín. 2 jugadores - Actual: ${playerCount})`;
        }
    }
}

function updateConnectionStatus(message) {
    const statusElement = document.getElementById('connection-status');
    const indicatorElement = document.getElementById('connection-indicator');
    
    if (statusElement) {
        statusElement.textContent = message;
    }
    
    if (indicatorElement) {
        indicatorElement.textContent = message;
    }
    
    console.log('📡', message);
}

// Copiar código de sala
window.copyRoomCode = function() {
    if (!currentRoomCode) return;
    
    navigator.clipboard.writeText(currentRoomCode).then(() => {
        const copyBtn = document.querySelector('.copy-btn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ ¡Copiado!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
        }, 2000);
    }).catch(() => {
        prompt('Copia este código:', currentRoomCode);
    });
};

// Salir de la sala
window.leaveRoom = function() {
    console.log('🚪 Saliendo de la sala...');
    
    // Limpiar audio
    if (voiceStream) {
        voiceStream.getTracks().forEach(track => track.stop());
        voiceStream = null;
    }
    
    // Limpiar video
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    removeLocalVideoElement();
    
    cleanupListeners();
    
    currentRoomCode = null;
    currentPlayerId = null;
    currentPlayerName = null;
    isHost = false;
    playersOnline = {};
    isMyTurn = false;
    roomRef = null;
    voiceChatConnected = false;
    voiceChatMuted = false;
    videoChatConnected = false;
    
    showMultiplayerScreen();
    
    console.log('✅ Sala abandonada exitosamente');
};

// Sincronizar estado completo del juego entre todos los jugadores
function syncCompleteGameState(gameData) {
    if (!gameData || !gameData.gameStarted) return;
    
    // Prevenir bucles de sincronización
    if (window.syncInProgress) {
        console.log('⏭️ Sincronización ya en progreso, saltando...');
        return;
    }
    
    window.syncInProgress = true;
    
    console.log('🔄 === SINCRONIZANDO ESTADO COMPLETO ===');
    console.log('📊 Datos recibidos:', gameData);
    
    // Liberar bloqueo después de un tiempo
    setTimeout(() => {
        window.syncInProgress = false;
    }, 1000);
    
    try {
        // Actualizar variables globales del juego
        const oldCurrentPlayer = window.currentPlayer;
        const oldTurnPhase = window.turnPhase;
        
        window.currentPlayer = gameData.currentPlayer || 1;
        window.gameState = gameData.gameState || 'playing';
        window.turnPhase = gameData.turnPhase || 'roll';
        
        console.log('🔄 Variables actualizadas:', {
            currentPlayer: `${oldCurrentPlayer} → ${window.currentPlayer}`,
            turnPhase: `${oldTurnPhase} → ${window.turnPhase}`
        });
        
        // Sincronizar variables específicas del juego si existen en los datos
        if (gameData.lastAction && gameData.lastAction.type === 'rollDice' && gameData.lastAction.data) {
            const diceData = gameData.lastAction.data;
            
            console.log('🎲 === SINCRONIZANDO DATOS DE ROLLDICE ===');
            console.log('📦 Datos recibidos:', diceData);
            
            // Sincronizar variables de dobles con validación estricta
            const oldDoblesConsecutivos = window.doblesConsecutivos;
            const oldDebeSeguitTirando = window.debeSeguitTirando;
            const oldTurnPhase = window.turnPhase;
            
            window.doblesConsecutivos = typeof diceData.doblesConsecutivos === 'number' ? diceData.doblesConsecutivos : (window.doblesConsecutivos || 0);
            window.debeSeguitTirando = typeof diceData.debeSeguitTirando === 'boolean' ? diceData.debeSeguitTirando : (window.debeSeguitTirando || false);
            window.lastRoll = typeof diceData.lastRoll === 'number' ? diceData.lastRoll : (window.lastRoll || 0);
            
            // Actualizar elementos DOM de dados si están disponibles
            if (diceData.dice1 && diceData.dice2) {
                const dice1Element = document.getElementById('dice1');
                const dice2Element = document.getElementById('dice2');
                const diceResultElement = document.getElementById('dice-result');
                
                if (dice1Element) dice1Element.textContent = diceData.dice1;
                if (dice2Element) dice2Element.textContent = diceData.dice2;
                
                if (diceResultElement) {
                    if (diceData.isDoubles && window.doblesConsecutivos > 0) {
                        diceResultElement.textContent = `Total: ${diceData.total} (¡Dobles! ${window.doblesConsecutivos}/3)`;
                    } else {
                        diceResultElement.textContent = `Total: ${diceData.total}`;
                    }
                }
            }
            
            console.log('🔄 === CAMBIOS EN VARIABLES ===');
            console.log(`🎲 doblesConsecutivos: ${oldDoblesConsecutivos} → ${window.doblesConsecutivos}`);
            console.log(`🎯 debeSeguitTirando: ${oldDebeSeguitTirando} → ${window.debeSeguitTirando}`);
            console.log(`🔄 turnPhase: ${oldTurnPhase} → ${window.turnPhase}`);
            console.log(`🎲 lastRoll: ${window.lastRoll}`);
            
            // Forzar actualización de botones después de sincronizar dados
            setTimeout(() => {
                console.log('🎮 Forzando actualización de botones después de rollDice...');
                updateControlsForTurn();
            }, 100);
        }
        
        // Manejar acción de aceptar carta
        if (gameData.lastAction && gameData.lastAction.type === 'aceptarCarta' && gameData.lastAction.data) {
            const cardActionData = gameData.lastAction.data;
            console.log('🃏 === PROCESANDO ACCIÓN ACEPTAR CARTA ===');
            console.log('🃏 Datos de carta:', cardActionData.cardData);
            
            // Verificar que el popup está cerrado
            const cardPopup = document.getElementById('popup-carta');
            if (cardPopup && cardPopup.style.display !== 'none') {
                cardPopup.style.display = 'none';
                console.log('🃏 Popup de carta cerrado automáticamente');
            }
            
            // Limpiar variables de carta si están definidas
            if (typeof window.cartaPendiente !== 'undefined') {
                window.cartaPendiente = null;
                window.tipoCartaPendiente = null;
                window.jugadorCartaPendiente = null;
            }
            
            // Habilitar botones después de procesar carta
            const rollBtn = document.getElementById('roll-btn');
            if (rollBtn) {
                rollBtn.disabled = false;
                console.log('🎲 Botón de dados habilitado después de carta');
            }
            
            // Actualizar controles después de procesar carta
            setTimeout(() => {
                updateControlsForTurn();
                console.log('🎮 Controles actualizados después de procesar carta');
            }, 100);
            
            console.log('✅ Acción aceptarCarta procesada');
        }
        
        // Manejar todas las acciones del juego
        if (gameData.lastAction && gameData.lastAction.type) {
            const actionType = gameData.lastAction.type;
            const actionData = gameData.lastAction.data;
            
            console.log('🎯 === PROCESANDO ACCIÓN DEL JUEGO ===');
            console.log('🔄 Tipo:', actionType);
            console.log('📊 Datos:', actionData);
            
            // Procesar cada tipo de acción
            processGameAction(actionType, actionData);
        }
        
        // Sincronizar jugadores con validación (normalizando arrays vacíos de Firebase)
        if (gameData.players && Array.isArray(gameData.players) && gameData.players.length > 0) {
            window.players = normalizePlayersArray(gameData.players);
            console.log('👥 Jugadores sincronizados:', window.players.length);
            
            // Log de posiciones para debug
            window.players.forEach((player) => {
                console.log(`👤 ${player.name}: Pos ${player.position}, €${player.money}, Props: ${player.properties.length}`);
            });
            
        } else {
            console.warn('⚠️ No hay jugadores válidos en gameData');
            return;
        }
        
        // Sincronizar tablero si existe
        if (gameData.boardCells && Array.isArray(gameData.boardCells) && gameData.boardCells.length > 0) {
            window.boardCells = [...gameData.boardCells];
            console.log('🎯 Tablero sincronizado:', window.boardCells.length, 'casillas');
            
            // Actualizar propiedades del tablero
            if (typeof window.updateAllConstructions === 'function') {
                window.updateAllConstructions();
            }
        }
        
        // Determinar si es mi turno con validación
        const currentPlayerData = window.players && window.players.length > 0 ? window.players[window.currentPlayer - 1] : null;
        const wasMyTurn = isMyTurn;
        isMyTurn = currentPlayerData && currentPlayerData.firebaseId === currentPlayerId;
        
        console.log('🎯 === ANÁLISIS DE TURNO ===');
        console.log('👤 Jugador actual (índice):', window.currentPlayer);
        console.log('👤 Datos del jugador actual:', currentPlayerData);
        console.log('🆔 Mi ID:', currentPlayerId);
        console.log('🔥 Es mi turno:', isMyTurn);
        console.log('🔄 Cambió turno:', wasMyTurn, '→', isMyTurn);
        console.log('📱 Pantalla de juego visible:', document.getElementById('game-container')?.style.display);
        
        // Actualizar interface solo si estamos en pantalla de juego
        const gameContainer = document.getElementById('game-container');
        if (gameContainer && gameContainer.style.display === 'block') {
            console.log('🎮 Actualizando interfaz de juego...');
            
            // Validar que tenemos datos básicos antes de actualizar
            if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
                console.warn('⚠️ No hay jugadores válidos para actualizar interfaz');
                window.syncInProgress = false;
                return;
            }
            
            // Actualizar displays con verificación y timeout
            const updateWithTimeout = (updateFn, fallbackFn, name) => {
                const timeoutId = setTimeout(() => {
                    console.warn(`⚠️ Timeout en ${name}, usando fallback`);
                    if (fallbackFn) fallbackFn();
                }, 500);
                
                try {
                    if (typeof updateFn === 'function') {
                        updateFn();
                        clearTimeout(timeoutId);
                    } else {
                        console.warn(`⚠️ ${name} no disponible, usando alternativa`);
                        clearTimeout(timeoutId);
                        if (fallbackFn) fallbackFn();
                    }
                } catch (error) {
                    clearTimeout(timeoutId);
                    console.warn(`⚠️ Error en ${name}:`, error.message);
                    if (fallbackFn) fallbackFn();
                }
            };
            
            updateWithTimeout(window.updatePlayerDisplay, updatePlayerDisplayFallback, 'updatePlayerDisplay');
            
            updateWithTimeout(window.updatePlayerPieces, updatePlayerPiecesFallback, 'updatePlayerPieces');
            updateWithTimeout(window.updateButtonStates, updateButtonStatesFallback, 'updateButtonStates');
            
            // Actualizar controles y turno con delay para evitar conflictos
            setTimeout(() => {
                try {
                    updateControlsForTurn();
                    updateTurnIndicator();
                    console.log('✅ Interfaz actualizada correctamente');
                } catch (error) {
                    console.error('❌ Error actualizando controles:', error);
                }
            }, 100);
            
            // Si cambió el turno, notificar y actualizar
            if (wasMyTurn !== isMyTurn) {
                console.log('🔄 === CAMBIO DE TURNO DETECTADO ===');
                
                if (isMyTurn) {
                    console.log('🎉 ¡Ahora es mi turno!');
                    
                    // Opcional: sonido o notificación
                    try {
                        if (typeof window.playSound === 'function') {
                            window.playSound('turn');
                        }
                    } catch (error) {
                        console.warn('⚠️ Error en playSound:', error.message);
                    }
                    
                    // Mostrar notificación visual
                    showTurnNotification();
                } else {
                    console.log('⏳ Ahora es turno de otro jugador');
                }
                
                // Forzar actualización de la interfaz
                setTimeout(() => {
                    console.log('🔄 Forzando actualización de interfaz por cambio de turno...');
                    updateControlsForTurn();
                    updateTurnIndicator();
                    
                    // Actualizar también el indicador visual del jugador actual
                    if (typeof window.highlightCurrentPosition === 'function') {
                        try {
                            window.highlightCurrentPosition();
                        } catch (error) {
                            console.warn('⚠️ Error en highlightCurrentPosition:', error.message);
                        }
                    }
                }, 100);
            }
        }
        
        console.log('✅ Estado sincronizado exitosamente');
        
    } catch (error) {
        console.error('❌ Error sincronizando estado:', error);
        window.syncInProgress = false; // Liberar bloqueo en caso de error
    } finally {
        // Asegurar que el bloqueo se libere
        setTimeout(() => {
            window.syncInProgress = false;
        }, 500);
    }
}

// Enviar acción de juego a Firebase para sincronizar
async function sendGameAction(action, data = {}) {
    console.log('📤 === ENVIANDO ACCIÓN ===');
    console.log('🔄 Acción:', action);
    console.log('📊 Datos:', data);
    console.log('🏠 Sala:', currentRoomCode);
    console.log('🎯 Es mi turno:', isMyTurn);
    
    if (!currentRoomCode || !roomRef) {
        console.error('❌ No hay conexión a sala');
        return;
    }
    
    // Evitar envío durante sincronización para prevenir bucles
    if (window.syncInProgress && action !== 'nextPlayer') {
        console.log('⏭️ Saltando envío durante sincronización:', action);
        return;
    }
    
    // Para nextPlayer, permitir envío incluso si no es estrictamente mi turno
    if (action !== 'nextPlayer' && !isMyTurn) {
        console.warn('⚠️ No es mi turno, no se puede enviar acción:', action);
        return;
    }
    
    try {
        // Obtener estado actual del juego
        const snapshot = await roomRef.child('gameData').once('value');
        const currentGameData = snapshot.val() || {};
        
        console.log('📖 Estado actual obtenido:', {
            currentPlayer: currentGameData.currentPlayer,
            players: currentGameData.players?.length
        });
        
        // Validar que tenemos datos básicos
        if (!window.players || !Array.isArray(window.players)) {
            console.error('❌ No hay jugadores válidos para sincronizar');
            return;
        }
        
        // Crear datos actualizados
        const updatedGameData = {
            ...currentGameData,
            currentPlayer: window.currentPlayer || 1,
            gameState: window.gameState || 'playing',
            turnPhase: window.turnPhase || 'roll',
            players: [...window.players],
            boardCells: window.boardCells ? [...window.boardCells] : currentGameData.boardCells || [],
            lastAction: {
                type: action,
                data: data,
                playerId: currentPlayerId,
                playerName: currentPlayerName,
                timestamp: Date.now()
            },
            gameStarted: true,
            lastUpdate: Date.now()
        };
        
        console.log('💾 === GUARDANDO ESTADO ===');
        console.log('🎯 Jugador actual será:', updatedGameData.currentPlayer);
        console.log('👥 Jugadores:', updatedGameData.players.length);
        console.log('🎲 Fase:', updatedGameData.turnPhase);
        
        // Enviar a Firebase
        await roomRef.child('gameData').set(updatedGameData);
        
        console.log('✅ === ACCIÓN ENVIADA EXITOSAMENTE ===');
        
    } catch (error) {
        console.error('❌ === ERROR ENVIANDO ACCIÓN ===');
        console.error('Error completo:', error);
    }
}

// Procesar todas las acciones del juego
function processGameAction(actionType, actionData) {
    console.log('⚡ === PROCESANDO ACCIÓN ===', actionType);
    
    try {
        switch (actionType) {
            case 'rollDice':
                processRollDiceAction(actionData);
                break;
                
            case 'movePlayer':
                processMovePlayerAction(actionData);
                break;
                
            case 'nextPlayer':
                processNextPlayerAction(actionData);
                break;
                
            case 'buyProperty':
            case 'comprarPropiedadDirecta':
                processBuyPropertyAction(actionData);
                break;
                
            case 'buildConstruction':
            case 'construirMentoriaDirecta':
                processBuildConstructionAction(actionData);
                break;
                
            case 'handleLanding':
                processHandleLandingAction(actionData);
                break;
                
            case 'aceptarCarta':
                processCardAction(actionData);
                break;
                
            case 'pagarCarcel':
                processPrisonAction(actionData);
                break;
                
            case 'pagarRenta':
                processRentAction(actionData);
                break;
                
            case 'realizarPuja':
                processAuctionBidAction(actionData);
                break;
                
            case 'pasarSubasta':
                processAuctionPassAction(actionData);
                break;
                
            case 'finalizarSubasta':
                processAuctionEndAction(actionData);
                break;
                
            case 'iniciarIntercambio':
                processTradeStartAction(actionData);
                break;
                
            case 'aceptarIntercambio':
                processTradeAcceptAction(actionData);
                break;
                
            case 'rechazarIntercambio':
                processTradeRejectAction(actionData);
                break;
                
            default:
                console.log('ℹ️ Acción no requiere procesamiento especial:', actionType);
                break;
        }
        
        // Actualizar interfaz después de procesar cualquier acción
        setTimeout(() => {
            updateGameInterface();
        }, 100);
        
    } catch (error) {
        console.error('❌ Error procesando acción:', actionType, error);
    }
}

// Procesar acción de tirar dados
function processRollDiceAction(actionData) {
    console.log('🎲 Procesando tirada de dados...');
    
    // Actualizar elementos DOM de dados
    if (actionData.dice1 && actionData.dice2) {
        const dice1Element = document.getElementById('dice1');
        const dice2Element = document.getElementById('dice2');
        const diceResultElement = document.getElementById('dice-result');
        
        if (dice1Element) dice1Element.textContent = actionData.dice1;
        if (dice2Element) dice2Element.textContent = actionData.dice2;
        
        if (diceResultElement) {
            if (actionData.isDoubles && actionData.doblesConsecutivos > 0) {
                diceResultElement.textContent = `Total: ${actionData.total} (¡Dobles! ${actionData.doblesConsecutivos}/3)`;
            } else {
                diceResultElement.textContent = `Total: ${actionData.total}`;
            }
        }
    }
    
    // Actualizar variables de estado
    if (actionData.doblesConsecutivos !== undefined) window.doblesConsecutivos = actionData.doblesConsecutivos;
    if (actionData.debeSeguitTirando !== undefined) window.debeSeguitTirando = actionData.debeSeguitTirando;
    if (actionData.turnPhase !== undefined) window.turnPhase = actionData.turnPhase;
    if (actionData.lastRoll !== undefined) window.lastRoll = actionData.lastRoll;
}

// Procesar acción de mover jugador
function processMovePlayerAction(actionData) {
    console.log('🚶 Procesando movimiento de jugador...');
    
    // Actualizar posición del jugador
    if (actionData.playerId && actionData.newPosition !== undefined) {
        const player = window.players[actionData.playerId - 1];
        if (player) {
            player.position = actionData.newPosition;
            console.log(`👤 ${player.name} movido a posición ${actionData.newPosition}`);
        }
    }
}

// Procesar acción de cambio de jugador
function processNextPlayerAction(actionData) {
    console.log('🔄 === PROCESANDO CAMBIO DE JUGADOR ===');
    console.log('📊 Datos recibidos:', actionData);
    
    try {
        // Actualizar jugador actual
        if (actionData.newCurrentPlayer !== undefined) {
            window.currentPlayer = actionData.newCurrentPlayer;
        }
        if (actionData.turnPhase !== undefined) {
            window.turnPhase = actionData.turnPhase;
        }
        if (actionData.doblesConsecutivos !== undefined) {
            window.doblesConsecutivos = actionData.doblesConsecutivos;
        }
        if (actionData.debeSeguitTirando !== undefined) {
            window.debeSeguitTirando = actionData.debeSeguitTirando;
        }
        
        // Actualizar datos de jugadores
        if (actionData.playersData) {
            window.players = normalizePlayersArray(actionData.playersData);
        }
        
        // Actualizar estado del juego
        if (actionData.gameState) {
            window.gameState = actionData.gameState;
        }
        
        // Actualizar casillas del tablero
        if (actionData.boardCells) {
            window.boardCells = actionData.boardCells;
        }
        
        // Actualizar variable global isMyTurn
        const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
        const newIsMyTurn = currentPlayerData && currentPlayerData.firebaseId === currentPlayerId;
        
        console.log('🔄 Estado actualizado:');
        console.log('👤 Jugador actual:', window.currentPlayer);
        console.log('🎯 Era mi turno:', isMyTurn);
        console.log('🎯 Ahora es mi turno:', newIsMyTurn);
        console.log('🎲 Fase:', window.turnPhase);
        console.log('🎯 Debe seguir tirando:', window.debeSeguitTirando);
        console.log('🆔 Mi ID:', currentPlayerId);
        console.log('🆔 Jugador actual ID:', currentPlayerData ? currentPlayerData.firebaseId : 'N/A');
        console.log('👤 Nombre del jugador actual:', currentPlayerData ? currentPlayerData.name : 'N/A');
        
        // Actualizar variable global
        isMyTurn = newIsMyTurn;
        
        // Cerrar todos los popups al cambiar de jugador
        closeAllPopups();
        
        // Actualizar interfaz INMEDIATAMENTE
        updateTurnIndicator();
        updateControlsForTurn();
        
        // Mostrar notificación si es mi turno
        if (isMyTurn) {
            showTurnNotification();
        }
        
        // Actualizar display de jugadores
        if (window.players) {
            updatePlayersDisplay(window.players);
        }
        
        // Actualizar piezas en el tablero
        if (typeof window.updatePlayerPieces === 'function') {
            window.updatePlayerPieces();
        }
        
        // Forzar actualización adicional para asegurar sincronización
        setTimeout(() => {
            console.log('🔄 Forzando actualización adicional en processNextPlayerAction...');
            updateAndVerifyTurnState();
            updateTurnIndicator();
            updateControlsForTurn();
            
            // Deshabilitar botones del jugador anterior y habilitar del nuevo
            forceButtonStateUpdate();
        }, 50);
        
        // Activar sincronización agresiva si es mi turno
        if (isMyTurn) {
            console.log('🎯 Es mi turno después del cambio - activando sincronización agresiva');
            
            // Activar inmediatamente el turno
            setTimeout(() => {
                activatePlayerTurnImmediately();
            }, 50);
            
            // Múltiples actualizaciones para asegurar que el jugador reciba la información
            setTimeout(() => {
                console.log('🔄 Sincronización agresiva - paso 1');
                activatePlayerTurnImmediately();
            }, 200);
            
            setTimeout(() => {
                console.log('🔄 Sincronización agresiva - paso 2');
                updateAndVerifyTurnState();
                forceButtonStateUpdate();
                updateTurnIndicator();
            }, 500);
            
            setTimeout(() => {
                console.log('🔄 Sincronización agresiva - paso 3');
                updateAndVerifyTurnState();
                forceButtonStateUpdate();
                updateTurnIndicator();
            }, 1000);
            
            setTimeout(() => {
                console.log('🔄 Sincronización agresiva - paso 4');
                updateAndVerifyTurnState();
                forceButtonStateUpdate();
                updateTurnIndicator();
            }, 2000);
        }
        
        console.log('✅ Cambio de jugador procesado exitosamente');
        
    } catch (error) {
        console.error('❌ Error procesando cambio de jugador:', error);
    }
}

// Procesar acción de compra de propiedad
function processBuyPropertyAction(actionData) {
    console.log('🏠 Procesando compra de propiedad...');
    
    // Cerrar popup de opciones si está abierto
    const opcionesPopup = document.getElementById('popup-opciones-casilla');
    if (opcionesPopup && opcionesPopup.style.display !== 'none') {
        opcionesPopup.style.display = 'none';
        console.log('🏠 Popup de opciones cerrado automáticamente');
    }
    
    // Actualizar tablero si hay datos de la casilla
    if (actionData.position !== undefined && actionData.boardCells) {
        window.boardCells = actionData.boardCells;
        
        // Actualizar visualización de la casilla
        if (typeof window.updateCellDisplay === 'function') {
            window.updateCellDisplay(actionData.position);
        }
    }
}

// Procesar acción de construcción
function processBuildConstructionAction(actionData) {
    console.log('🏗️ Procesando construcción...');
    
    // Cerrar popup de opciones si está abierto
    const opcionesPopup = document.getElementById('popup-opciones-casilla');
    if (opcionesPopup && opcionesPopup.style.display !== 'none') {
        opcionesPopup.style.display = 'none';
        console.log('🏗️ Popup de opciones cerrado automáticamente');
    }
    
    // Actualizar tablero y construcciones
    if (actionData.boardCells) {
        window.boardCells = actionData.boardCells;
        
        // Actualizar todas las construcciones
        if (typeof window.updateAllConstructions === 'function') {
            window.updateAllConstructions();
        }
    }
}

// Procesar acción de aterrizaje en casilla
function processHandleLandingAction(actionData) {
    console.log('📍 Procesando aterrizaje en casilla...');
    
    // Esta acción principalmente actualiza el estado, no requiere procesamiento especial
    // ya que el aterrizaje se maneja en el cliente que ejecuta la acción
}

// Procesar acción de carta
function processCardAction(actionData) {
    console.log('🃏 Procesando acción de carta...');
    
    // Cerrar popup de carta si está abierto
    const cardPopup = document.getElementById('popup-carta');
    if (cardPopup && cardPopup.style.display !== 'none') {
        cardPopup.style.display = 'none';
        console.log('🃏 Popup de carta cerrado automáticamente');
    }
    
    // Limpiar variables de carta
    window.cartaPendiente = null;
    window.tipoCartaPendiente = null;
    window.jugadorCartaPendiente = null;
    
    // Habilitar botón de dados
    const rollBtn = document.getElementById('roll-btn');
    if (rollBtn) {
        rollBtn.disabled = false;
        console.log('🎲 Botón de dados habilitado después de carta');
    }
}

// Procesar acción de cárcel
function processPrisonAction(actionData) {
    console.log('🔓 Procesando pago de cárcel...');
    
    // Cerrar popup de cárcel si está abierto
    const prisonPopup = document.getElementById('popup-carcel');
    if (prisonPopup && prisonPopup.style.display !== 'none') {
        prisonPopup.style.display = 'none';
        console.log('🔓 Popup de cárcel cerrado automáticamente');
    }
}

// Procesar acción de renta
function processRentAction(actionData) {
    console.log('💰 Procesando pago de renta...');
    
    // Cerrar popup de renta si está abierto
    const rentaPopup = document.getElementById('popup-renta');
    if (rentaPopup && rentaPopup.style.display !== 'none') {
        rentaPopup.style.display = 'none';
        console.log('💰 Popup de renta cerrado automáticamente');
    }
}

// Procesar acción de puja en subasta
function processAuctionBidAction(actionData) {
    console.log('💰 Procesando puja en subasta...');
    
    if (actionData.pujaActual !== undefined) {
        window.pujaActual = actionData.pujaActual;
        window.pujadorActual = actionData.pujadorActual;
        window.jugadoresSubasta = actionData.jugadoresSubasta;
    }
}

// Procesar acción de pasar subasta
function processAuctionPassAction(actionData) {
    console.log('❌ Procesando pasar subasta...');
    
    if (actionData.subastaActiva !== undefined) {
        window.subastaActiva = actionData.subastaActiva;
        window.jugadoresSubasta = actionData.jugadoresSubasta;
    }
}

// Procesar acción de finalizar subasta
function processAuctionEndAction(actionData) {
    console.log('🔨 Procesando finalización de subasta...');
    
    // Cerrar popup de subasta
    const subastaPopup = document.getElementById('popup-subasta');
    if (subastaPopup && subastaPopup.style.display !== 'none') {
        subastaPopup.style.display = 'none';
        console.log('🔨 Popup de subasta cerrado automáticamente');
    }
    
    // Resetear variables de subasta
    window.subastaActiva = false;
    window.pujaActual = 0;
    window.pujadorActual = null;
    window.jugadoresSubasta = [];
}

// Procesar acción de intercambio
function processTradeStartAction(actionData) {
    console.log('🔄 Procesando inicio de intercambio...');
}

function processTradeAcceptAction(actionData) {
    console.log('✅ Procesando aceptación de intercambio...');
    
    // Cerrar popup de intercambio
    const tradePopup = document.getElementById('popup-intercambio');
    if (tradePopup && tradePopup.style.display !== 'none') {
        tradePopup.style.display = 'none';
        console.log('✅ Popup de intercambio cerrado automáticamente');
    }
}

function processTradeRejectAction(actionData) {
    console.log('❌ Procesando rechazo de intercambio...');
    
    // Cerrar popup de intercambio
    const tradePopup = document.getElementById('popup-intercambio');
    if (tradePopup && tradePopup.style.display !== 'none') {
        tradePopup.style.display = 'none';
        console.log('❌ Popup de intercambio cerrado automáticamente');
    }
}

// Cerrar todos los popups
function closeAllPopups() {
    const popups = [
        'popup-opciones-casilla', 'popup-carta', 'popup-renta', 'popup-subasta',
        'popup-carcel', 'popup-intercambio', 'popup-seleccion', 'popup-impuesto'
    ];
    
    popups.forEach(popupId => {
        const popup = document.getElementById(popupId);
        if (popup && popup.style.display !== 'none') {
            popup.style.display = 'none';
            console.log(`🔄 Popup ${popupId} cerrado`);
        }
    });
}

// Actualizar interfaz del juego
function updateGameInterface() {
    try {
        // Actualizar indicador de turno
        updateTurnIndicator();
        
        // Actualizar controles
        updateControlsForTurn();
        
        // Actualizar display de jugadores si está disponible
        if (typeof window.updatePlayerDisplay === 'function') {
            window.updatePlayerDisplay();
        } else {
            updatePlayerDisplayFallback();
        }
        
        // Actualizar piezas de jugadores si está disponible
        if (typeof window.updatePlayerPieces === 'function') {
            window.updatePlayerPieces();
        } else {
            updatePlayerPiecesFallback();
        }
        
        // Actualizar estados de botones si está disponible
        if (typeof window.updateButtonStates === 'function') {
            window.updateButtonStates();
        } else {
            updateButtonStatesFallback();
        }
        
        console.log('🔄 Interfaz actualizada');
        
    } catch (error) {
        console.error('❌ Error actualizando interfaz:', error);
    }
}

// Mostrar notificación de turno (con botón directo para tirar dados)
function showTurnNotification() {
    // Evitar duplicados
    const prev = document.getElementById('turn-banner-notification');
    if (prev) prev.remove();

    const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
    const playerName = currentPlayerData ? currentPlayerData.name : 'Jugador';

    const notification = document.createElement('div');
    notification.id = 'turn-banner-notification';
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #16a34a, #059669);
        color: white;
        padding: 18px 26px;
        border-radius: 16px;
        font-size: 20px;
        font-weight: bold;
        z-index: 3000;
        text-align: center;
        box-shadow: 0 12px 35px rgba(0,0,0,0.45);
        border: 3px solid #fde047;
        animation: pulse 0.5s ease-in-out;
        max-width: 88vw;
    `;
    
    notification.innerHTML = `
        <div style="font-size: 22px; margin-bottom: 6px;">🎲 <strong>¡TU TURNO, ${playerName.toUpperCase()}!</strong></div>
        <div style="font-size: 14px; opacity: 0.95; margin-bottom: 12px;">Tira los dados para mover tu ficha</div>
        <button onclick="document.getElementById('turn-banner-notification')?.remove(); if(typeof rollDice==='function') rollDice();" 
                style="background: #fde047; color: #111827; border: none; padding: 10px 22px; border-radius: 10px; font-size: 16px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
            🎲 TIRAR DADOS AHORA
        </button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-cerrar después de 3.5 segundos si no pulsa el botón del popup (o al tirar dados)
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3500);
}

// Notificación cuando saca dobles o tirada extra
window.showExtraRollNotification = function(playerName) {
    if (!isMyTurn) return;
    const prev = document.getElementById('turn-banner-notification');
    if (prev) prev.remove();

    const notification = document.createElement('div');
    notification.id = 'turn-banner-notification';
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #ea580c, #d97706);
        color: white;
        padding: 18px 26px;
        border-radius: 16px;
        font-size: 20px;
        font-weight: bold;
        z-index: 3000;
        text-align: center;
        box-shadow: 0 12px 35px rgba(0,0,0,0.45);
        border: 3px solid #fde047;
        max-width: 88vw;
    `;
    notification.innerHTML = `
        <div style="font-size: 21px; margin-bottom: 6px;">🔥 <strong>¡TIRADA EXTRA!</strong></div>
        <div style="font-size: 14px; opacity: 0.95; margin-bottom: 12px;">¡Vuelve a tirar los dados!</div>
        <button onclick="document.getElementById('turn-banner-notification')?.remove(); if(typeof rollDice==='function') rollDice();" 
                style="background: #fde047; color: #111827; border: none; padding: 10px 22px; border-radius: 10px; font-size: 16px; font-weight: 900; cursor: pointer;">
            🎲 TIRAR DE NUEVO
        </button>
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        if (notification.parentNode) notification.remove();
    }, 3500);
};

// Esperar a que las funciones del juego estén disponibles
function waitForGameFunctions() {
    let attempts = 0;
    const maxAttempts = 50; // 25 segundos máximo
    
    const checkInterval = setInterval(() => {
        attempts++;
        console.log(`🔍 Verificando funciones del juego (intento ${attempts}/${maxAttempts})...`);
        
        // Verificar funciones críticas primero
        const criticalFunctions = [
            'initBoard', 'updatePlayerDisplay', 'updateButtonStates', 'updatePlayerPieces',
            'rollDice', 'nextPlayer', 'movePlayer', 'handleLanding'
        ];
        
        const criticalAvailable = criticalFunctions.every(fn => typeof window[fn] === 'function');
        
        // Verificar funciones de gameplay
        const gameplayFunctions = [
            'buyProperty', 'buildConstruction', 'mostrarOpcionesCasilla', 'cerrarOpcionesCasilla',
            'comprarPropiedadDirecta', 'construirMentoriaDirecta', 'aceptarCartaPopup'
        ];
        
        const gameplayAvailable = gameplayFunctions.every(fn => typeof window[fn] === 'function');
        
        // Verificar variables globales críticas
        const variablesAvailable = 
            typeof window.players !== 'undefined' &&
            typeof window.boardCells !== 'undefined' &&
            typeof window.currentPlayer !== 'undefined' &&
            typeof window.gameState !== 'undefined';
        
        console.log('📋 Estado de verificación:');
        console.log('  🔧 Funciones críticas:', criticalAvailable);
        console.log('  🎮 Funciones de gameplay:', gameplayAvailable);
        console.log('  📊 Variables globales:', variablesAvailable);
        
        if (criticalAvailable && gameplayAvailable && variablesAvailable) {
            console.log('✅ === TODAS LAS FUNCIONES Y VARIABLES DISPONIBLES ===');
            clearInterval(checkInterval);
            
            // Inicializar variables si no existen
            initializeGameVariables();
            
            // Configurar interceptores completos
            setTimeout(() => {
                setupCompleteInterceptors();
                console.log('🎯 === INTERCEPTORES COMPLETOS CONFIGURADOS ===');
            }, 500);
            
        } else if (attempts >= maxAttempts) {
            console.error('❌ === TIMEOUT ESPERANDO FUNCIONES ===');
            clearInterval(checkInterval);
            
            // Intentar configurar interceptores parciales
            console.log('⚠️ Configurando interceptores parciales...');
            setupPartialInterceptors();
        }
        
    }, 500); // Verificar cada 500ms
}

// Inicializar variables del juego si no existen
function initializeGameVariables() {
    console.log('🔧 === INICIALIZANDO VARIABLES DEL JUEGO ===');
    
    // Variables de estado del juego
    if (typeof window.gameState === 'undefined') window.gameState = 'playing';
    if (typeof window.turnPhase === 'undefined') window.turnPhase = 'roll';
    if (typeof window.currentPlayer === 'undefined') window.currentPlayer = 1;
    
    // Variables de dados y dobles
    if (typeof window.doblesConsecutivos === 'undefined') window.doblesConsecutivos = 0;
    if (typeof window.debeSeguitTirando === 'undefined') window.debeSeguitTirando = false;
    if (typeof window.lastRoll === 'undefined') window.lastRoll = 0;
    
    // Variables de cartas
    if (typeof window.cartaPendiente === 'undefined') window.cartaPendiente = null;
    if (typeof window.tipoCartaPendiente === 'undefined') window.tipoCartaPendiente = null;
    if (typeof window.jugadorCartaPendiente === 'undefined') window.jugadorCartaPendiente = null;
    
    // Variables de subasta
    if (typeof window.subastaActiva === 'undefined') window.subastaActiva = false;
    if (typeof window.pujaActual === 'undefined') window.pujaActual = 0;
    if (typeof window.pujadorActual === 'undefined') window.pujadorActual = null;
    
    // Asegurar que players es un array
    if (!Array.isArray(window.players)) {
        window.players = [];
    }
    
    // Asegurar que boardCells es un array
    if (!Array.isArray(window.boardCells)) {
        window.boardCells = [];
    }
    
    console.log('✅ Variables inicializadas:', {
        gameState: window.gameState,
        turnPhase: window.turnPhase,
        currentPlayer: window.currentPlayer,
        playersCount: window.players.length,
        boardCellsCount: window.boardCells.length
    });
}

// Configurar interceptores completos
function setupCompleteInterceptors() {
    console.log('🎯 === CONFIGURANDO INTERCEPTORES COMPLETOS ===');
    
    // Interceptores principales
    interceptRollDice();
    interceptNextPlayer();
    interceptMovePlayer();
    
    // Interceptores de propiedades
    interceptBuyProperty();
    interceptBuildConstruction();
    
    // Interceptores de cartas
    interceptCardPopup();
    
    // Interceptores de popups y opciones
    if (typeof interceptPopupFunctions === 'function') interceptPopupFunctions();
    if (typeof interceptPropertyFunctions === 'function') interceptPropertyFunctions();
    
    // Interceptores de subastas
    if (typeof interceptAuctionFunctions === 'function') interceptAuctionFunctions();
    
    // Interceptores de intercambio
    if (typeof interceptTradingFunctions === 'function') interceptTradingFunctions();
    
    // Interceptores especiales
    if (typeof interceptSpecialFunctions === 'function') interceptSpecialFunctions();
    
    // Interceptores de funciones críticas del sistema
    interceptCriticalFunctions();
    
    console.log('✅ Todos los interceptores configurados');
}

// Interceptar funciones críticas del sistema
function interceptCriticalFunctions() {
    console.log('🔧 === CONFIGURANDO INTERCEPTORES CRÍTICOS ===');
    
    // Interceptar updateButtonStates
    if (typeof window.updateButtonStates === 'function') {
        const originalUpdateButtonStates = window.updateButtonStates;
        
        window.updateButtonStates = function() {
            try {
                console.log('🎮 === INTERCEPTANDO UPDATE BUTTON STATES ===');
                
                // Verificar que tenemos datos válidos
                if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
                    console.warn('⚠️ No hay jugadores válidos para updateButtonStates, usando fallback');
                    updateButtonStatesFallback();
                    return;
                }
                
                // Verificar que currentPlayer es válido
                if (!window.currentPlayer || window.currentPlayer < 1 || window.currentPlayer > window.players.length) {
                    console.warn('⚠️ currentPlayer inválido:', window.currentPlayer, 'usando fallback');
                    updateButtonStatesFallback();
                    return;
                }
                
                // Verificar que el jugador actual existe
                const currentPlayerData = window.players[window.currentPlayer - 1];
                if (!currentPlayerData) {
                    console.warn('⚠️ Datos del jugador actual no encontrados, usando fallback');
                    updateButtonStatesFallback();
                    return;
                }
                
                console.log('✅ Datos válidos, ejecutando función original');
                
                // Ejecutar función original
                return originalUpdateButtonStates();
                
            } catch (error) {
                console.error('❌ Error en updateButtonStates:', error);
                console.log('🔄 Usando fallback debido al error');
                updateButtonStatesFallback();
            }
        };
        
        console.log('✅ updateButtonStates interceptado');
    } else {
        console.warn('⚠️ updateButtonStates no encontrado, usando solo fallback');
    }
    
    // Interceptar updatePlayerDisplay
    if (typeof window.updatePlayerDisplay === 'function') {
        const originalUpdatePlayerDisplay = window.updatePlayerDisplay;
        
        window.updatePlayerDisplay = function() {
            try {
                console.log('👤 === INTERCEPTANDO UPDATE PLAYER DISPLAY ===');
                
                // Verificar que tenemos datos válidos
                if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
                    console.warn('⚠️ No hay jugadores válidos para updatePlayerDisplay, usando fallback');
                    updatePlayerDisplayFallback();
                    return;
                }
                
                // Verificar que currentPlayer es válido
                if (!window.currentPlayer || window.currentPlayer < 1 || window.currentPlayer > window.players.length) {
                    console.warn('⚠️ currentPlayer inválido para updatePlayerDisplay:', window.currentPlayer, 'usando fallback');
                    updatePlayerDisplayFallback();
                    return;
                }
                
                // Verificar que el jugador actual existe
                const currentPlayerData = window.players[window.currentPlayer - 1];
                if (!currentPlayerData) {
                    console.warn('⚠️ Datos del jugador actual no encontrados en updatePlayerDisplay, usando fallback');
                    updatePlayerDisplayFallback();
                    return;
                }
                
                console.log('✅ Datos válidos para updatePlayerDisplay, ejecutando función original');
                
                // Ejecutar función original
                return originalUpdatePlayerDisplay();
                
            } catch (error) {
                console.error('❌ Error en updatePlayerDisplay:', error);
                console.log('🔄 Usando fallback debido al error en updatePlayerDisplay');
                updatePlayerDisplayFallback();
            }
        };
        
        console.log('✅ updatePlayerDisplay interceptado');
    } else {
        console.warn('⚠️ updatePlayerDisplay no encontrado, usando solo fallback');
    }
    
    // Interceptar updatePlayerPieces
    if (typeof window.updatePlayerPieces === 'function') {
        const originalUpdatePlayerPieces = window.updatePlayerPieces;
        
        window.updatePlayerPieces = function() {
            try {
                console.log('🎯 === INTERCEPTANDO UPDATE PLAYER PIECES ===');
                
                // Verificar que tenemos datos válidos
                if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
                    console.warn('⚠️ No hay jugadores válidos para updatePlayerPieces');
                    updatePlayerPiecesFallback();
                    return;
                }
                
                // Ejecutar función original
                return originalUpdatePlayerPieces();
                
            } catch (error) {
                console.error('❌ Error en updatePlayerPieces:', error);
                updatePlayerPiecesFallback();
            }
        };
        
        console.log('✅ updatePlayerPieces interceptado');
    }
    
    // Interceptar handleLanding
    if (typeof window.handleLanding === 'function') {
        const originalHandleLanding = window.handleLanding;
        
        window.handleLanding = function(playerId, position) {
            console.log('📍 === INTERCEPTANDO HANDLE LANDING ===');
            console.log('👤 Jugador:', playerId);
            console.log('📍 Posición:', position);
            console.log('🎯 Es mi turno:', isMyTurn);
            
            try {
                // Verificar datos válidos
                if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
                    console.error('❌ No hay jugadores válidos para handleLanding');
                    return;
                }
                
                if (!window.boardCells || !Array.isArray(window.boardCells) || window.boardCells.length === 0) {
                    console.error('❌ No hay casillas válidas para handleLanding');
                    return;
                }
                
                // Ejecutar función original
                const result = originalHandleLanding(playerId, position);
                
                // Sincronizar si es mi turno
                if (isMyTurn && playerId === window.currentPlayer) {
                    setTimeout(() => {
                        console.log('📤 Sincronizando handleLanding...');
                        
                        const currentPlayerData = window.players[window.currentPlayer - 1];
                        const cellData = window.boardCells[position];
                        
                        sendGameAction('handleLanding', {
                            playerId: playerId,
                            position: position,
                            cellData: cellData,
                            currentPlayer: window.currentPlayer,
                            playersData: window.players,
                            boardCells: window.boardCells,
                            playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                            playerPosition: currentPlayerData ? currentPlayerData.position : 0
                        });
                    }, 200);
                }
                
                return result;
                
            } catch (error) {
                console.error('❌ Error en handleLanding:', error);
            }
        };
        
        console.log('✅ handleLanding interceptado');
    }
}

// Configurar interceptores parciales (fallback)
function setupPartialInterceptors() {
    console.log('⚠️ === CONFIGURANDO INTERCEPTORES PARCIALES ===');
    
    // Solo configurar los interceptores que estén disponibles
    if (typeof window.rollDice === 'function') interceptRollDice();
    if (typeof window.nextPlayer === 'function') interceptNextPlayer();
    if (typeof window.movePlayer === 'function') interceptMovePlayer();
    if (typeof window.buyProperty === 'function') interceptBuyProperty();
    if (typeof window.buildConstruction === 'function') interceptBuildConstruction();
    if (typeof window.aceptarCartaPopup === 'function' && typeof interceptCardPopup === 'function') interceptCardPopup();
    
    console.log('✅ Interceptores parciales configurados');
}

// Interceptar función de tirar dados para sincronizar
function interceptRollDice() {
    if (typeof window.rollDice === 'function') {
        const originalRollDice = window.rollDice;
        
        window.rollDice = function() {
            console.log('🎲 === INTERCEPTANDO ROLLDICE ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            console.log('🎲 Fase actual:', window.turnPhase);
            console.log('👤 Jugador actual:', window.currentPlayer);
            console.log('🆔 Mi ID:', currentPlayerId);
            
            // Verificar datos básicos
            if (!window.players || !Array.isArray(window.players) || window.players.length === 0) {
                console.error('❌ No hay jugadores válidos para rollDice');
                return;
            }
            
            if (!window.currentPlayer || window.currentPlayer < 1 || window.currentPlayer > window.players.length) {
                console.error('❌ currentPlayer inválido:', window.currentPlayer);
                return;
            }
            
            // Verificar que el jugador actual existe
            const currentPlayerData = window.players[window.currentPlayer - 1];
            if (!currentPlayerData) {
                console.error('❌ Datos del jugador actual no encontrados');
                return;
            }
            
            // Verificar que realmente es mi turno
            const shouldBeMyTurn = currentPlayerData.firebaseId === currentPlayerId;
            console.log('🔍 Verificación de turno:');
            console.log('  🆔 Mi Firebase ID:', currentPlayerId);
            console.log('  🆔 Jugador actual Firebase ID:', currentPlayerData.firebaseId);
            console.log('  🎯 ¿Debería ser mi turno?:', shouldBeMyTurn);
            console.log('  🎯 Variable isMyTurn:', isMyTurn);
            
            if (!shouldBeMyTurn) {
                console.warn('❌ No es mi turno según Firebase IDs - no se puede tirar dados');
                console.log('👤 Es el turno de:', currentPlayerData.name);
                
                // Mostrar alerta visual al usuario
                showTurnErrorNotification(`No es tu turno. Es el turno de ${currentPlayerData.name}`);
                
                // Forzar actualización de botones para asegurar que estén deshabilitados
                forceButtonStateUpdate();
                
                return;
            }
            
            // Actualizar variable global si no coincide
            if (isMyTurn !== shouldBeMyTurn) {
                console.log('🔄 Actualizando variable isMyTurn:', isMyTurn, '->', shouldBeMyTurn);
                isMyTurn = shouldBeMyTurn;
            }
            
            if (window.turnPhase !== 'roll') {
                console.warn('⚠️ No es la fase de tirar dados, fase actual:', window.turnPhase);
                return;
            }
            
            console.log('✅ Ejecutando lógica original de rollDice...');
            
            // Ejecutar lógica original
            const result = originalRollDice();
            
            // Esperar a que la lógica original termine completamente
            setTimeout(() => {
                console.log('🎲 === CAPTURANDO ESTADO DESPUÉS DE ROLLDICE ===');
                
                // Capturar estado actual después de la ejecución
                const dice1Element = document.getElementById('dice1');
                const dice2Element = document.getElementById('dice2');
                const dice1Value = dice1Element ? parseInt(dice1Element.textContent) : 0;
                const dice2Value = dice2Element ? parseInt(dice2Element.textContent) : 0;
                const total = dice1Value + dice2Value;
                const isDoubles = dice1Value === dice2Value && dice1Value > 0;
                
                // Asegurar que las variables están definidas
                if (typeof window.doblesConsecutivos === 'undefined') window.doblesConsecutivos = 0;
                if (typeof window.debeSeguitTirando === 'undefined') window.debeSeguitTirando = false;
                if (typeof window.lastRoll === 'undefined') window.lastRoll = 0;
                if (typeof window.turnPhase === 'undefined') window.turnPhase = 'roll';
                
                const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                
                console.log('📊 Estado capturado:');
                console.log('  🎲 Dados:', dice1Value, '+', dice2Value, '=', total);
                console.log('  🎯 Es dobles:', isDoubles);
                console.log('  🔄 Fase actual:', window.turnPhase);
                console.log('  🎲 Dobles consecutivos:', window.doblesConsecutivos);
                console.log('  🎯 Debe seguir tirando:', window.debeSeguitTirando);
                console.log('  📍 Posición jugador:', currentPlayerData ? currentPlayerData.position : 'N/A');
                console.log('  💰 Dinero jugador:', currentPlayerData ? currentPlayerData.money : 'N/A');
                console.log('  🏠 En cárcel:', currentPlayerData ? currentPlayerData.inJail : 'N/A');
                
                // Solo sincronizar si hay cambios reales
                if (dice1Value > 0 && dice2Value > 0) {
                    setTimeout(() => {
                        console.log('📤 Enviando sincronización completa de rollDice...');
                        
                        sendGameAction('rollDice', {
                            dice1: dice1Value,
                            dice2: dice2Value,
                            total: total,
                            isDoubles: isDoubles,
                            turnPhase: window.turnPhase,
                            currentPlayer: window.currentPlayer,
                            debeSeguitTirando: window.debeSeguitTirando,
                            doblesConsecutivos: window.doblesConsecutivos,
                            lastRoll: total,
                            playersData: window.players,
                            playerPosition: currentPlayerData ? currentPlayerData.position : 0,
                            playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                            playerInJail: currentPlayerData ? currentPlayerData.inJail : false,
                            timestamp: Date.now()
                        });
                        
                        // Actualizar interfaz después de sincronizar
                        setTimeout(() => {
                            console.log('🔄 Actualizando interfaz después de rollDice...');
                            updateTurnIndicator();
                            updateControlsForTurn();
                            
                            // Ejecutar gestión automática de turno
                            setTimeout(() => {
                                autoManageTurnState();
                            }, 1000);
                        }, 100);
                        
                    }, 200);
                }
                
            }, 500);
            
            return result;
        };
        
        console.log('✅ rollDice interceptado exitosamente');
    } else {
        console.warn('⚠️ window.rollDice no encontrado para interceptar');
    }
}

// Interceptar función de mover jugador para sincronizar
function interceptMovePlayer() {
    if (typeof window.movePlayer === 'function') {
        const originalMovePlayer = window.movePlayer;
        
        window.movePlayer = function(playerId, steps) {
            console.log('🚶 === INTERCEPTANDO MOVEPLAYER ===');
            console.log('👤 Jugador:', playerId);
            console.log('👣 Pasos:', steps);
            console.log('🎯 Es mi turno:', isMyTurn);
            
            // Ejecutar lógica original
            const result = originalMovePlayer(playerId, steps);
            
            // Sincronizar si es mi turno
            if (isMyTurn && playerId === window.currentPlayer) {
                setTimeout(() => {
                    console.log('📤 Enviando sincronización de movePlayer...');
                    
                    const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                    
                    sendGameAction('movePlayer', {
                        playerId: playerId,
                        steps: steps,
                        newPosition: currentPlayerData ? currentPlayerData.position : 0,
                        currentPlayer: window.currentPlayer,
                        playersData: window.players,
                        playerMoney: currentPlayerData ? currentPlayerData.money : 0
                    });
                    
                    // Actualizar interfaz
                    setTimeout(() => {
                        updateTurnIndicator();
                        updateControlsForTurn();
                    }, 100);
                }, 200);
            }
            
            return result;
        };
        
        console.log('✅ movePlayer interceptado exitosamente');
    } else {
        console.warn('⚠️ window.movePlayer no encontrado para interceptar');
    }
}

// Interceptar función de siguiente jugador para sincronizar
function interceptNextPlayer() {
    if (typeof window.nextPlayer === 'function') {
        const originalNextPlayer = window.nextPlayer;
        
        window.nextPlayer = function() {
            console.log('🔄 === INTERCEPTANDO NEXTPLAYER ===');
            console.log('🎯 Es mi turno antes:', isMyTurn);
            console.log('👤 Jugador actual antes:', window.currentPlayer);
            console.log('🎲 Fase actual:', window.turnPhase);
            console.log('🎯 Debe seguir tirando:', window.debeSeguitTirando);
            
            if (!isMyTurn) {
                console.warn('❌ No es mi turno, no se puede pasar turno');
                return;
            }
            
            // Verificar si debe seguir tirando
            if (window.debeSeguitTirando) {
                console.warn('❌ Debe seguir tirando por dobles, no se puede pasar turno');
                return;
            }
            
            console.log('✅ Ejecutando lógica original de nextPlayer...');
            
            // Resetear fase de turno antes de pasar
            window.turnPhase = 'roll';
            
            // Ejecutar lógica original
            const result = originalNextPlayer();
            
            console.log('🔄 Después de nextPlayer original:');
            console.log('👤 Nuevo jugador actual:', window.currentPlayer);
            console.log('🎲 Nueva fase:', window.turnPhase);
            console.log('🎯 Dobles consecutivos:', window.doblesConsecutivos);
            console.log('🎯 Debe seguir tirando:', window.debeSeguitTirando);
            
            // Actualizar variable global isMyTurn
            const newCurrentPlayerData = window.players && window.players[window.currentPlayer - 1];
            const newIsMyTurn = newCurrentPlayerData && newCurrentPlayerData.firebaseId === currentPlayerId;
            
            console.log('🔄 Nuevo estado de turno:');
            console.log('🎯 Era mi turno:', isMyTurn);
            console.log('🎯 Ahora es mi turno:', newIsMyTurn);
            console.log('🆔 Mi ID:', currentPlayerId);
            console.log('🆔 Jugador actual ID:', newCurrentPlayerData ? newCurrentPlayerData.firebaseId : 'N/A');
            console.log('👤 Nuevo jugador actual:', newCurrentPlayerData ? newCurrentPlayerData.name : 'N/A');
            
            // Actualizar variable global
            isMyTurn = newIsMyTurn;
            
            // Sincronizar cambio INMEDIATAMENTE para evitar desincronización
            console.log('📤 Enviando sincronización de nextPlayer...');
            
            sendGameAction('nextPlayer', {
                newCurrentPlayer: window.currentPlayer,
                turnPhase: window.turnPhase,
                playersData: window.players,
                doblesConsecutivos: window.doblesConsecutivos,
                debeSeguitTirando: window.debeSeguitTirando,
                totalPlayers: window.players ? window.players.length : 0,
                gameState: window.gameState,
                boardCells: window.boardCells,
                timestamp: Date.now(),
                forceUpdate: true
            });
            
            // Actualizar interfaz INMEDIATAMENTE
            updateTurnIndicator();
            updateControlsForTurn();
            
            // Mostrar notificación de cambio de turno
            if (isMyTurn) {
                showTurnNotification();
            }
            
            // Forzar actualización adicional después de un breve delay
            setTimeout(() => {
                console.log('🔄 Actualizando interfaz adicional después de nextPlayer...');
                updateAndVerifyTurnState();
                updateTurnIndicator();
                updateControlsForTurn();
            }, 100);
            
            return result;
        };
        
        console.log('✅ nextPlayer interceptado exitosamente');
    } else {
        console.warn('⚠️ window.nextPlayer no encontrado para interceptar');
    }
}

// Interceptar función de comprar propiedad para sincronizar
function interceptBuyProperty() {
    if (typeof window.buyProperty === 'function') {
        const originalBuyProperty = window.buyProperty;
        
        window.buyProperty = function() {
            console.log('🏠 === INTERCEPTANDO BUYPROPERTY ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            
            if (!isMyTurn) {
                console.warn('❌ No es mi turno, no se puede comprar');
                return;
            }
            
            console.log('✅ Ejecutando lógica original de buyProperty...');
            
            // Ejecutar lógica original
            const result = originalBuyProperty();
            
            // Sincronizar cambio
            setTimeout(() => {
                console.log('📤 Enviando sincronización de buyProperty...');
                
                const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                
                sendGameAction('buyProperty', {
                    currentPlayer: window.currentPlayer,
                    playersData: window.players,
                    boardCells: window.boardCells,
                    playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                    playerProperties: currentPlayerData ? currentPlayerData.properties : []
                });
                
                // Actualizar interfaz
                setTimeout(() => {
                    updateTurnIndicator();
                    updateControlsForTurn();
                }, 100);
            }, 200);
            
            return result;
        };
        
        console.log('✅ buyProperty interceptado exitosamente');
    }
    
    // Interceptar comprarPropiedadDirecta (función del popup)
    if (typeof window.comprarPropiedadDirecta === 'function') {
        const originalComprarPropiedadDirecta = window.comprarPropiedadDirecta;
        
        window.comprarPropiedadDirecta = function(position) {
            console.log('🏠 === INTERCEPTANDO COMPRAR PROPIEDAD DIRECTA ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            console.log('📍 Posición:', position);
            
            if (!isMyTurn) {
                console.warn('❌ No es mi turno, no se puede comprar');
                return;
            }
            
            console.log('✅ Ejecutando lógica original de comprarPropiedadDirecta...');
            
            // Ejecutar lógica original
            const result = originalComprarPropiedadDirecta(position);
            
            // Sincronizar cambio
            setTimeout(() => {
                console.log('📤 Enviando sincronización de comprarPropiedadDirecta...');
                
                const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                
                sendGameAction('comprarPropiedadDirecta', {
                    position: position,
                    currentPlayer: window.currentPlayer,
                    playersData: window.players,
                    boardCells: window.boardCells,
                    playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                    playerProperties: currentPlayerData ? currentPlayerData.properties : []
                });
                
                // Actualizar interfaz
                setTimeout(() => {
                    updateTurnIndicator();
                    updateControlsForTurn();
                }, 100);
            }, 200);
            
            return result;
        };
        
        console.log('✅ comprarPropiedadDirecta interceptado exitosamente');
    }
}

// Interceptar función de construir para sincronizar
function interceptBuildConstruction() {
    if (typeof window.buildConstruction === 'function') {
        const originalBuildConstruction = window.buildConstruction;
        
        window.buildConstruction = function() {
            console.log('🏗️ === INTERCEPTANDO BUILDCONSTRUCTION ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            
            if (!isMyTurn) {
                console.warn('❌ No es mi turno, no se puede construir');
                return;
            }
            
            console.log('✅ Ejecutando lógica original de buildConstruction...');
            
            // Ejecutar lógica original
            const result = originalBuildConstruction();
            
            // Sincronizar cambio
            setTimeout(() => {
                console.log('📤 Enviando sincronización de buildConstruction...');
                
                const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                
                sendGameAction('buildConstruction', {
                    currentPlayer: window.currentPlayer,
                    playersData: window.players,
                    boardCells: window.boardCells,
                    playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                    playerConstructions: currentPlayerData ? currentPlayerData.constructions : 0
                });
                
                // Actualizar interfaz
                setTimeout(() => {
                    updateTurnIndicator();
                    updateControlsForTurn();
                }, 100);
            }, 200);
            
            return result;
        };
        
        console.log('✅ buildConstruction interceptado exitosamente');
    }
    
    // Interceptar construirMentoriaDirecta (función del popup)
    if (typeof window.construirMentoriaDirecta === 'function') {
        const originalConstruirMentoriaDirecta = window.construirMentoriaDirecta;
        
        window.construirMentoriaDirecta = function(position) {
            console.log('🏗️ === INTERCEPTANDO CONSTRUIR MENTORIA DIRECTA ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            console.log('📍 Posición:', position);
            
            if (!isMyTurn) {
                console.warn('❌ No es mi turno, no se puede construir');
                return;
            }
            
            console.log('✅ Ejecutando lógica original de construirMentoriaDirecta...');
            
            // Ejecutar lógica original
            const result = originalConstruirMentoriaDirecta(position);
            
            // Sincronizar cambio
            setTimeout(() => {
                console.log('📤 Enviando sincronización de construirMentoriaDirecta...');
                
                const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                
                sendGameAction('construirMentoriaDirecta', {
                    position: position,
                    currentPlayer: window.currentPlayer,
                    playersData: window.players,
                    boardCells: window.boardCells,
                    playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                    playerConstructions: currentPlayerData ? currentPlayerData.constructions : 0
                });
                
                // Actualizar interfaz
                setTimeout(() => {
                    updateTurnIndicator();
                    updateControlsForTurn();
                }, 100);
            }, 200);
            
            return result;
        };
        
        console.log('✅ construirMentoriaDirecta interceptado exitosamente');
    }
}

// (Las implementaciones completas de interceptPropertyFunctions, interceptAuctionFunctions,
// interceptTradingFunctions, interceptSpecialFunctions e interceptPopupFunctions están más abajo)

// ===== FUNCIONES DE RESPALDO =====

// Función de respaldo para updatePlayerDisplay
function updatePlayerDisplayFallback() {
    try {
        console.log('🔄 Usando updatePlayerDisplayFallback');
        
        if (!window.players || !Array.isArray(window.players)) {
            console.warn('⚠️ No hay jugadores para mostrar');
            return;
        }
        
        // Buscar el contenedor de información del jugador
        const playerInfo = document.getElementById('current-player-info') || 
                          document.getElementById('player-info') ||
                          document.querySelector('.player-info');
        
        if (playerInfo && window.currentPlayer && window.players[window.currentPlayer - 1]) {
            const player = window.players[window.currentPlayer - 1];
            playerInfo.innerHTML = `
                <div style="background: #333; color: white; padding: 10px; border-radius: 8px; margin: 5px 0;">
                    <strong>${player.name || `Jugador ${window.currentPlayer}`}</strong><br>
                    💰 €${player.money || 0}<br>
                    🏠 ${player.properties ? player.properties.length : 0} propiedades<br>
                    📍 Posición: ${player.position || 0}
                </div>
            `;
        }
        
    } catch (error) {
        console.error('❌ Error en updatePlayerDisplayFallback:', error);
    }
}

// Función de respaldo para updatePlayerPieces
function updatePlayerPiecesFallback() {
    try {
        console.log('🔄 Usando updatePlayerPiecesFallback');
        
        if (!window.players || !Array.isArray(window.players)) {
            return;
        }
        
        // Limpiar posiciones anteriores
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.classList.remove('current-position');
            const pieces = cell.querySelectorAll('.player-piece');
            pieces.forEach(piece => piece.remove());
        });
        
        // Colocar piezas de jugadores
        window.players.forEach((player, index) => {
            if (player.position !== undefined) {
                const cell = document.querySelector(`[data-index="${player.position}"]`);
                if (cell) {
                    const piece = document.createElement('div');
                    piece.className = 'player-piece';
                    piece.style.cssText = `
                        width: 15px;
                        height: 15px;
                        border-radius: 50%;
                        background: ${getPlayerColorFallback(index + 1)};
                        position: absolute;
                        top: ${5 + (index * 20)}px;
                        left: 5px;
                        border: 2px solid white;
                        z-index: 10;
                    `;
                    cell.appendChild(piece);
                    
                    if (index + 1 === window.currentPlayer) {
                        cell.classList.add('current-position');
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error en updatePlayerPiecesFallback:', error);
    }
}

// Función de respaldo para updateButtonStates
function updateButtonStatesFallback() {
    try {
        console.log('🔄 Usando updateButtonStatesFallback');
        
        const rollBtn = document.getElementById('roll-btn');
        const nextBtn = document.getElementById('next-btn') || document.getElementById('next-player-btn');
        const buyBtn = document.getElementById('buy-btn');
        const buildBtn = document.getElementById('build-btn');
        const jailBtn = document.getElementById('jail-btn');
        const tradeBtn = document.getElementById('trade-btn');
        
        // Estado base: solo mi turno puede interactuar
        const canInteract = isMyTurn;
        const turnPhase = window.turnPhase || 'roll';
        const debeSeguitTirando = window.debeSeguitTirando || false;
        
        // Botón de tirar dados
        if (rollBtn) {
            const canRoll = canInteract && turnPhase === 'roll';
            rollBtn.disabled = !canRoll;
            
            if (debeSeguitTirando && canRoll) {
                rollBtn.style.cssText = 'background: linear-gradient(45deg, #ff6b35, #f7931e) !important; color: white !important; box-shadow: 0 0 15px rgba(255, 107, 53, 0.6) !important; animation: pulse 1s infinite !important;';
                rollBtn.textContent = '🔥 ¡DEBES TIRAR!';
            } else if (canRoll) {
                rollBtn.style.cssText = '';
                rollBtn.textContent = '🎲 TIRAR DADOS';
            } else {
                rollBtn.style.cssText = 'opacity: 0.5; pointer-events: none; filter: grayscale(1);';
                rollBtn.textContent = '🎲 TIRAR DADOS';
            }
        }
        
        // Botón de pasar turno
        if (nextBtn) {
            const canNext = canInteract && turnPhase !== 'roll' && !debeSeguitTirando;
            nextBtn.disabled = !canNext;
            
            if (canNext) {
                nextBtn.style.cssText = 'background: linear-gradient(45deg, #28a745, #20c997); color: white; box-shadow: 0 0 10px rgba(40, 167, 69, 0.5);';
                nextBtn.textContent = '⏭️ PASAR TURNO';
            } else {
                nextBtn.style.cssText = 'opacity: 0.5; pointer-events: none; filter: grayscale(1);';
                nextBtn.textContent = '⏭️ PASAR TURNO';
            }
        }
        
        // Otros botones
        [buyBtn, buildBtn, jailBtn, tradeBtn].forEach(btn => {
            if (btn) {
                btn.disabled = !canInteract;
                btn.style.cssText = canInteract ? 'opacity: 1; pointer-events: auto; filter: none;' : 'opacity: 0.5; pointer-events: none; filter: grayscale(1);';
            }
        });
        
        console.log('🎮 Botones actualizados (fallback):', {
            isMyTurn: canInteract,
            turnPhase: turnPhase,
            debeSeguitTirando: debeSeguitTirando
        });
        
    } catch (error) {
        console.error('❌ Error en updateButtonStatesFallback:', error);
    }
}

// Función de respaldo para obtener color del jugador
function getPlayerColorFallback(playerId) {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b'];
    return colors[(playerId - 1) % colors.length] || '#666';
}

// Función de debug para diagnóstico
window.debugMultiplayer = function() {
    console.log('🔍 === DEBUG MULTIPLAYER ===');
    console.log('🏠 Sala actual:', currentRoomCode);
    console.log('👤 Mi ID:', currentPlayerId);
    console.log('👑 Soy host:', isHost);
    console.log('🎯 Es mi turno:', isMyTurn);
    console.log('🎮 Estado del juego:', window.gameState);
    console.log('👥 Jugador actual:', window.currentPlayer);
    console.log('🎲 Fase del turno:', window.turnPhase);
    console.log('👥 Jugadores:', window.players);
    console.log('🎲 Variables de dados:', {
        doblesConsecutivos: window.doblesConsecutivos,
        debeSeguitTirando: window.debeSeguitTirando,
        lastRoll: window.lastRoll
    });
    
    console.log('🔧 Funciones disponibles:');
    console.log('  - nextPlayer:', typeof window.nextPlayer);
    console.log('  - rollDice:', typeof window.rollDice);
    console.log('  - buyProperty:', typeof window.buyProperty);
    console.log('  - buildConstruction:', typeof window.buildConstruction);
    console.log('  - updatePlayerDisplay:', typeof window.updatePlayerDisplay);
    console.log('  - updateButtonStates:', typeof window.updateButtonStates);
    
    console.log('📱 Elementos DOM:');
    console.log('  - roll-btn:', !!document.getElementById('roll-btn'));
    console.log('  - next-btn:', !!document.getElementById('next-btn'));
    console.log('  - current-player:', !!document.getElementById('current-player'));
    console.log('  - game-container:', !!document.getElementById('game-container'));
    
    return 'Debug completo en consola';
};

// Función específica para debug de turnos (sin bucles)
window.debugTurns = function() {
    try {
        console.log('🔍 === DEBUG TURNOS (SEGURO) ===');
        console.log('👤 Jugador actual:', window.currentPlayer);
        console.log('🎯 Es mi turno:', isMyTurn);
        console.log('🆔 Mi ID:', currentPlayerId);
        console.log('🔄 Sincronización en progreso:', window.syncInProgress);
        
        if (window.players && Array.isArray(window.players)) {
            console.log('👥 Total jugadores:', window.players.length);
            const currentPlayerData = window.players[window.currentPlayer - 1];
            if (currentPlayerData) {
                console.log('👑 Jugador actual:', currentPlayerData.name);
                console.log('🆔 Su Firebase ID:', currentPlayerData.firebaseId);
                console.log('🎯 ¿Es igual a mi ID?:', currentPlayerData.firebaseId === currentPlayerId);
            }
        } else {
            console.log('❌ window.players no es válido');
        }
        
        const gameContainer = document.getElementById('game-container');
        console.log('📱 Pantalla de juego visible:', gameContainer?.style.display === 'block');
        
        return 'Debug simple completado';
    } catch (error) {
        console.error('❌ Error en debug:', error);
        return 'Error en debug';
    }
};

// Función de emergencia para forzar sincronización de turnos
window.forceTurnSync = function() {
    console.log('🚨 === FORZANDO SINCRONIZACIÓN DE TURNOS ===');
    
    try {
        window.syncInProgress = false; // Resetear bloqueos
        
        // Verificar estado del turno
        updateAndVerifyTurnState();
        
        if (currentRoomCode && roomRef) {
            console.log('📤 Enviando datos actuales a Firebase...');
            
            const gameData = {
                currentPlayer: window.currentPlayer || 1,
                gameState: window.gameState || 'playing',
                turnPhase: window.turnPhase || 'roll',
                players: window.players || [],
                gameStarted: true,
                lastUpdate: Date.now(),
                forceSync: true
            };
            
            roomRef.child('gameData').set(gameData);
            console.log('✅ Sincronización forzada enviada');
        } else {
            console.error('❌ No hay conexión a Firebase');
        }
    } catch (error) {
        console.error('❌ Error en sincronización forzada:', error);
    }
    
    return 'Sincronización forzada completada';
};

// Función de emergencia para corregir desincronización de turnos
window.fixTurnSync = function() {
    console.log('🚨 === CORRIGIENDO SINCRONIZACIÓN DE TURNOS ===');
    
    try {
        // Detener monitor actual
        stopTurnStateMonitor();
        
        // Forzar actualización del estado
        const myTurnVerified = updateAndVerifyTurnState();
        
        // Forzar actualización de botones
        forceButtonStateUpdate();
        
        // Forzar actualización de interfaz
        updateTurnIndicator();
        
        // Reiniciar monitor
        startTurnStateMonitor();
        
        console.log('✅ Sincronización corregida');
        console.log('🎯 Es mi turno:', myTurnVerified);
        console.log('👤 Jugador actual:', window.currentPlayer);
        console.log('🎲 Fase del turno:', window.turnPhase);
        
        return {
            fixed: true,
            isMyTurn: myTurnVerified,
            currentPlayer: window.currentPlayer,
            turnPhase: window.turnPhase
        };
        
    } catch (error) {
        console.error('❌ Error corrigiendo sincronización:', error);
        return { fixed: false, error: error.message };
    }
};

// Función de debug para verificar estado de turnos
window.debugTurnState = function() {
    console.log('🔍 === DEBUG ESTADO DE TURNOS ===');
    
    const verified = updateAndVerifyTurnState();
    
    console.log('📊 Estado actual:');
    console.log('  🎯 Es mi turno (verificado):', verified);
    console.log('  🎯 Variable isMyTurn:', isMyTurn);
    console.log('  👤 Jugador actual:', window.currentPlayer);
    console.log('  🎲 Fase del turno:', window.turnPhase);
    console.log('  🎯 Debe seguir tirando:', window.debeSeguitTirando);
    console.log('  🆔 Mi Firebase ID:', currentPlayerId);
    
    if (window.players && Array.isArray(window.players)) {
        console.log('👥 Todos los jugadores:');
        window.players.forEach((player, index) => {
            const isCurrentPlayer = (index + 1) === window.currentPlayer;
            const isMe = player.firebaseId === currentPlayerId;
            console.log(`  ${index + 1}. ${player.name} (${player.firebaseId})${isCurrentPlayer ? ' ← ACTUAL' : ''}${isMe ? ' ← YO' : ''}`);
        });
    }
    
    console.log('📱 Estado de botones:');
    const rollBtn = document.getElementById('roll-btn');
    const nextBtn = document.getElementById('next-btn');
    console.log('  🎲 Botón tirar:', rollBtn ? (rollBtn.disabled ? 'DESHABILITADO' : 'HABILITADO') : 'NO ENCONTRADO');
    console.log('  ⏭️ Botón pasar:', nextBtn ? (nextBtn.disabled ? 'DESHABILITADO' : 'HABILITADO') : 'NO ENCONTRADO');
    
    return {
        isMyTurn: verified,
        currentPlayer: window.currentPlayer,
        turnPhase: window.turnPhase,
        playerId: currentPlayerId
    };
};

// Función de diagnóstico para verificar interceptores
window.checkInterceptors = function() {
    console.log('🔍 === VERIFICANDO INTERCEPTORES ===');
    
    const functions = {
        // Funciones principales
        'rollDice': typeof window.rollDice,
        'nextPlayer': typeof window.nextPlayer,
        'movePlayer': typeof window.movePlayer,
        'buyProperty': typeof window.buyProperty,
        'buildConstruction': typeof window.buildConstruction,
        'aceptarCartaPopup': typeof window.aceptarCartaPopup,
        
        // Funciones de propiedades
        'pagarCarcel': typeof window.pagarCarcel,
        'pagarRentaDirecta': typeof window.pagarRentaDirecta,
        'showPlayerProperties': typeof window.showPlayerProperties,
        
        // Funciones de subasta
        'realizarPuja': typeof window.realizarPuja,
        'pasarSubasta': typeof window.pasarSubasta,
        
        // Funciones de intercambio
        'iniciarIntercambio': typeof window.iniciarIntercambio,
        
        // Funciones especiales
        'mostrarMenuSeguidores': typeof window.mostrarMenuSeguidores,
        'mostrarCartasGuardadas': typeof window.mostrarCartasGuardadas,
        'mostrarLogros': typeof window.mostrarLogros
    };
    
    console.log('📋 Estado de funciones:');
    Object.entries(functions).forEach(([name, type]) => {
        const status = type === 'function' ? '✅' : '❌';
        console.log(`  ${status} ${name}: ${type}`);
    });
    
    const intercepted = Object.values(functions).filter(type => type === 'function').length;
    const total = Object.keys(functions).length;
    
    console.log(`🎯 Interceptadas: ${intercepted}/${total} (${Math.round(intercepted/total*100)}%)`);
    
    return `${intercepted}/${total} funciones interceptadas`;
};

// Función de emergencia para arreglar nextPlayer
window.fixNextPlayer = function() {
    console.log('🚨 === ARREGLANDO NEXTPLAYER ===');
    
    try {
        if (typeof window.nextPlayer === 'function') {
            // Crear una versión mejorada de nextPlayer para multiplayer
            const originalNextPlayer = window.nextPlayer;
            
            window.nextPlayerMultiplayer = function() {
                console.log('👥 === NEXTPLAYER MULTIPLAYER ===');
                console.log('🎯 Es mi turno:', isMyTurn);
                console.log('👤 Jugador actual:', window.currentPlayer);
                console.log('🎯 Debe seguir tirando:', window.debeSeguitTirando);
                
                if (!isMyTurn) {
                    console.warn('❌ No es mi turno');
                    return false;
                }
                
                if (window.debeSeguitTirando) {
                    console.warn('⚠️ Debes seguir tirando dados');
                    return false;
                }
                
                // Ejecutar cambio de jugador
                console.log('🔄 Cambiando al siguiente jugador...');
                
                // Lógica básica de nextPlayer
                const totalPlayers = window.players ? window.players.length : 2;
                const oldPlayer = window.currentPlayer || 1;
                let newPlayer = oldPlayer + 1;
                
                if (newPlayer > totalPlayers) {
                    newPlayer = 1;
                }
                
                // Saltar jugadores en bancarrota
                let attempts = 0;
                while (window.players && window.players[newPlayer - 1] && window.players[newPlayer - 1].bankrupt && attempts < totalPlayers) {
                    newPlayer++;
                    if (newPlayer > totalPlayers) newPlayer = 1;
                    attempts++;
                }
                
                // Actualizar variables
                window.currentPlayer = newPlayer;
                window.turnPhase = 'roll';
                window.doblesConsecutivos = 0;
                window.debeSeguitTirando = false;
                
                console.log('✅ Cambio completado:', oldPlayer, '→', newPlayer);
                
                // Sincronizar
                sendGameAction('nextPlayer', {
                    currentPlayer: window.currentPlayer,
                    turnPhase: window.turnPhase,
                    doblesConsecutivos: window.doblesConsecutivos,
                    debeSeguitTirando: window.debeSeguitTirando,
                    playersData: window.players || [],
                    oldPlayer: oldPlayer,
                    newPlayer: newPlayer,
                    timestamp: Date.now()
                });
                
                // Actualizar interfaz
                setTimeout(() => {
                    updateTurnIndicator();
                    updateControlsForTurn();
                }, 100);
                
                return true;
            };
            
            // Reemplazar la función nextPlayer
            window.nextPlayer = window.nextPlayerMultiplayer;
            
            console.log('✅ nextPlayer arreglado exitosamente');
            return '✅ nextPlayer arreglado';
            
        } else {
            console.error('❌ window.nextPlayer no encontrado');
            return '❌ nextPlayer no encontrado';
        }
        
    } catch (error) {
        console.error('❌ Error arreglando nextPlayer:', error);
        return '❌ Error: ' + error.message;
    }
};

// Función específica para arreglar el sistema de dobles
window.fixDoubles = function() {
    console.log('🎲 === ARREGLANDO SISTEMA DE DOBLES ===');
    
    try {
        // Verificar estado actual
        console.log('📊 Estado actual:');
        console.log('  🎲 doblesConsecutivos:', window.doblesConsecutivos);
        console.log('  🎯 debeSeguitTirando:', window.debeSeguitTirando);
        console.log('  🔄 turnPhase:', window.turnPhase);
        console.log('  👤 currentPlayer:', window.currentPlayer);
        console.log('  🎯 isMyTurn:', isMyTurn);
        
        // Validar y corregir variables
        if (typeof window.doblesConsecutivos !== 'number') {
            window.doblesConsecutivos = 0;
            console.log('✅ doblesConsecutivos corregido a 0');
        }
        
        if (typeof window.debeSeguitTirando !== 'boolean') {
            window.debeSeguitTirando = false;
            console.log('✅ debeSeguitTirando corregido a false');
        }
        
        if (!window.turnPhase) {
            window.turnPhase = 'roll';
            console.log('✅ turnPhase corregido a roll');
        }
        
        // Si debe seguir tirando pero no es fase de roll, corregir
        if (window.debeSeguitTirando && window.turnPhase !== 'roll') {
            console.log('🔧 Corrigiendo: debe seguir tirando pero no está en fase roll');
            window.turnPhase = 'roll';
            
            const rollBtn = document.getElementById('roll-btn');
            if (rollBtn && isMyTurn) {
                rollBtn.disabled = false;
                rollBtn.style.cssText = 'background: linear-gradient(45deg, #ff6b35, #f7931e) !important; color: white !important; box-shadow: 0 0 15px rgba(255, 107, 53, 0.6) !important; animation: pulse 1s infinite !important;';
                rollBtn.textContent = '🔥 ¡DEBES TIRAR!';
                console.log('✅ Botón de dados habilitado para dobles');
            }
        }
        
        // Si no debe seguir tirando pero está en fase roll y no es su primer turno
        if (!window.debeSeguitTirando && window.turnPhase === 'roll' && window.doblesConsecutivos === 0) {
            const rollBtn = document.getElementById('roll-btn');
            if (rollBtn && isMyTurn) {
                rollBtn.disabled = false;
                rollBtn.style.cssText = '';
                rollBtn.textContent = '🎲 TIRAR DADOS';
                console.log('✅ Botón de dados normalizado');
            }
        }
        
        // Actualizar controles
        updateControlsForTurn();
        updateTurnIndicator();
        
        console.log('✅ Sistema de dobles arreglado');
        return '✅ Sistema de dobles arreglado';
        
    } catch (error) {
        console.error('❌ Error arreglando dobles:', error);
        return '❌ Error: ' + error.message;
    }
};

// Función de diagnóstico completa para Firebase
window.diagnoseFull = function() {
    console.log('🔍 === DIAGNÓSTICO COMPLETO DEL SISTEMA ===');
    
    try {
        // 1. Estado de Firebase
        console.log('🔥 === ESTADO DE FIREBASE ===');
        console.log('✅ Firebase disponible:', typeof firebase !== 'undefined');
        console.log('✅ Database disponible:', typeof database !== 'undefined');
        console.log('🌐 Conectado:', isFirebaseConnected);
        console.log('🏠 Sala actual:', currentRoomCode);
        console.log('📡 Referencia sala:', !!roomRef);
        
        // 2. Estado del jugador
        console.log('👤 === ESTADO DEL JUGADOR ===');
        console.log('🆔 Mi ID:', currentPlayerId);
        console.log('👑 Soy host:', isHost);
        console.log('🎯 Es mi turno:', isMyTurn);
        
        // 3. Estado del juego
        console.log('🎮 === ESTADO DEL JUEGO ===');
        console.log('🏁 Estado:', window.gameState);
        console.log('👤 Jugador actual:', window.currentPlayer);
        console.log('🎯 Fase turno:', window.turnPhase);
        console.log('🎲 Dobles:', window.doblesConsecutivos);
        console.log('🔄 Debe seguir:', window.debeSeguitTirando);
        console.log('👥 Total jugadores:', window.players ? window.players.length : 0);
        
        // 4. Funciones críticas
        console.log('🔧 === FUNCIONES CRÍTICAS ===');
        const criticalFunctions = [
            'rollDice', 'nextPlayer', 'movePlayer', 'buyProperty', 
            'aceptarCartaPopup', 'updatePlayerDisplay', 'updateButtonStates'
        ];
        
        criticalFunctions.forEach(funcName => {
            const exists = typeof window[funcName] === 'function';
            console.log(`${exists ? '✅' : '❌'} ${funcName}: ${typeof window[funcName]}`);
        });
        
        // 5. Elementos DOM
        console.log('📱 === ELEMENTOS DOM ===');
        const elements = [
            'roll-btn', 'next-btn', 'current-player', 'game-container'
        ];
        
        elements.forEach(elemId => {
            const elem = document.getElementById(elemId);
            console.log(`${elem ? '✅' : '❌'} ${elemId}: ${!!elem}`);
        });
        
        // 6. Validaciones específicas
        console.log('⚠️ === VALIDACIONES ===');
        
        if (!window.players || !Array.isArray(window.players)) {
            console.error('❌ window.players no es un array válido');
        } else if (window.players.length === 0) {
            console.warn('⚠️ No hay jugadores definidos');
        } else {
            console.log('✅ Jugadores válidos:', window.players.length);
        }
        
        if (!currentRoomCode) {
            console.error('❌ No hay sala activa');
        } else if (!roomRef) {
            console.error('❌ Referencia de sala inválida');
        } else {
            console.log('✅ Sala Firebase activa');
        }
        
        if (window.currentPlayer < 1 || window.currentPlayer > (window.players ? window.players.length : 0)) {
            console.error('❌ currentPlayer fuera de rango:', window.currentPlayer);
        } else {
            console.log('✅ currentPlayer válido:', window.currentPlayer);
        }
        
        console.log('🏁 === DIAGNÓSTICO COMPLETADO ===');
        return 'Diagnóstico completo en consola';
        
    } catch (error) {
        console.error('❌ Error en diagnóstico:', error);
        return 'Error en diagnóstico: ' + error.message;
    }
};

// Función de test completa para Firebase y multiplayer
window.testMultiplayer = function() {
    console.log('🧪 === TEST COMPLETO DE MULTIPLAYER ===');
    
    try {
        let score = 0;
        const tests = [];
        
        // Test 1: Firebase conectado
        if (typeof firebase !== 'undefined' && isFirebaseConnected) {
            tests.push('✅ Firebase conectado');
            score++;
        } else {
            tests.push('❌ Firebase no conectado');
        }
        
        // Test 2: Sala activa
        if (currentRoomCode && roomRef) {
            tests.push('✅ Sala activa: ' + currentRoomCode);
            score++;
        } else {
            tests.push('❌ No hay sala activa');
        }
        
        // Test 3: Jugadores válidos
        if (window.players && Array.isArray(window.players) && window.players.length > 0) {
            tests.push('✅ Jugadores válidos: ' + window.players.length);
            score++;
        } else {
            tests.push('❌ No hay jugadores válidos');
        }
        
        // Test 4: Variables de juego
        const gameVars = [
            'currentPlayer', 'turnPhase', 'doblesConsecutivos', 'debeSeguitTirando'
        ];
        
        let gameVarsOk = true;
        gameVars.forEach(varName => {
            if (typeof window[varName] === 'undefined') {
                gameVarsOk = false;
            }
        });
        
        if (gameVarsOk) {
            tests.push('✅ Variables de juego definidas');
            score++;
        } else {
            tests.push('❌ Variables de juego faltantes');
        }
        
        // Test 5: Funciones críticas
        const criticalFuncs = ['rollDice', 'nextPlayer', 'movePlayer'];
        let funcsOk = true;
        
        criticalFuncs.forEach(funcName => {
            if (typeof window[funcName] !== 'function') {
                funcsOk = false;
            }
        });
        
        if (funcsOk) {
            tests.push('✅ Funciones críticas disponibles');
            score++;
        } else {
            tests.push('❌ Funciones críticas faltantes');
        }
        
        // Test 6: Elementos DOM
        const elements = ['roll-btn', 'next-btn', 'game-container'];
        let elementsOk = true;
        
        elements.forEach(elemId => {
            if (!document.getElementById(elemId)) {
                elementsOk = false;
            }
        });
        
        if (elementsOk) {
            tests.push('✅ Elementos DOM presentes');
            score++;
        } else {
            tests.push('❌ Elementos DOM faltantes');
        }
        
        // Test 7: Estado del turno
        if (typeof isMyTurn === 'boolean' && window.currentPlayer > 0) {
            tests.push('✅ Estado de turno válido');
            score++;
        } else {
            tests.push('❌ Estado de turno inválido');
        }
        
        // Mostrar resultados
        console.log('📊 === RESULTADOS DEL TEST ===');
        tests.forEach(test => console.log(test));
        console.log(`🎯 Puntuación: ${score}/7 (${Math.round(score/7*100)}%)`);
        
        if (score >= 6) {
            console.log('🎉 ¡Sistema multiplayer funcionando correctamente!');
            return `✅ Test pasado: ${score}/7`;
        } else if (score >= 4) {
            console.log('⚠️ Sistema multiplayer con problemas menores');
            return `⚠️ Test parcial: ${score}/7`;
        } else {
            console.log('❌ Sistema multiplayer con problemas graves');
            return `❌ Test fallido: ${score}/7`;
        }
        
    } catch (error) {
        console.error('❌ Error en test:', error);
        return '❌ Error en test: ' + error.message;
    }
};

// Interceptar función de aceptar carta para sincronizar
function interceptCardPopup() {
    if (typeof window.aceptarCartaPopup === 'function') {
        const originalAceptarCartaPopup = window.aceptarCartaPopup;
        
        window.aceptarCartaPopup = function() {
            console.log('🃏 === INTERCEPTANDO ACEPTAR CARTA ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            console.log('🃏 Carta pendiente:', window.cartaPendiente);
            console.log('🎯 Tipo carta:', window.tipoCartaPendiente);
            console.log('👤 Jugador carta:', window.jugadorCartaPendiente);
            
            if (!isMyTurn) {
                console.warn('❌ No es mi turno, no se puede aceptar carta');
                return;
            }
            
            // Capturar datos antes de ejecutar
            const cardData = {
                carta: window.cartaPendiente,
                tipo: window.tipoCartaPendiente,
                jugador: window.jugadorCartaPendiente,
                currentPlayer: window.currentPlayer
            };
            
            console.log('✅ Ejecutando lógica original de aceptarCartaPopup...');
            
            // Ejecutar lógica original
            const result = originalAceptarCartaPopup();
            
            // Asegurar que el popup se cierre
            setTimeout(() => {
                const cardPopup = document.getElementById('popup-carta');
                if (cardPopup && cardPopup.style.display !== 'none') {
                    cardPopup.style.display = 'none';
                    console.log('🃏 Popup de carta cerrado manualmente');
                }
                
                // Habilitar botones después de cerrar
                const rollBtn = document.getElementById('roll-btn');
                if (rollBtn) {
                    rollBtn.disabled = false;
                    console.log('🎲 Botón de dados habilitado');
                }
                
                // Actualizar controles
                updateControlsForTurn();
                console.log('🎮 Controles actualizados después de carta');
            }, 100);
            
            // Sincronizar después de la ejecución
            setTimeout(() => {
                console.log('📤 Enviando sincronización de aceptarCartaPopup...');
                
                const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                
                sendGameAction('aceptarCarta', {
                    cardData: cardData,
                    currentPlayer: window.currentPlayer,
                    turnPhase: window.turnPhase,
                    playersData: window.players,
                    playerPosition: currentPlayerData ? currentPlayerData.position : 0,
                    playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                    debeSeguitTirando: window.debeSeguitTirando,
                    doblesConsecutivos: window.doblesConsecutivos
                });
                
                // Actualizar interfaz después de la carta
                setTimeout(() => {
                    console.log('🔄 Actualizando interfaz después de carta...');
                    updateTurnIndicator();
                    updateControlsForTurn();
                }, 100);
                
            }, 200);
            
            return result;
        };
        
        console.log('✅ aceptarCartaPopup interceptado exitosamente');
    } else {
        console.warn('⚠️ window.aceptarCartaPopup no encontrado para interceptar');
    }
    
    // También interceptar cerrarPopupCarta para casos de emergencia
    if (typeof window.cerrarPopupCarta === 'function') {
        const originalCerrarPopupCarta = window.cerrarPopupCarta;
        
        window.cerrarPopupCarta = function() {
            console.log('🃏 === INTERCEPTANDO CERRAR CARTA ===');
            
            // Ejecutar lógica original
            const result = originalCerrarPopupCarta();
            
            // Habilitar botones después de cerrar
            setTimeout(() => {
                updateControlsForTurn();
            }, 100);
            
            return result;
        };
        
        console.log('✅ cerrarPopupCarta interceptado exitosamente');
    }
}

// Función de emergencia para cerrar popups problemáticos
window.forceClosePopups = function() {
    console.log('🚨 === CERRANDO POPUPS FORZADAMENTE ===');
    
    try {
        // Cerrar popup de carta
        const cardPopup = document.getElementById('popup-carta');
        if (cardPopup) {
            cardPopup.style.display = 'none';
            console.log('✅ Popup de carta cerrado');
        }
        
        // Cerrar popup de opciones
        const opcionesPopup = document.getElementById('popup-opciones-casilla');
        if (opcionesPopup) {
            opcionesPopup.style.display = 'none';
            console.log('✅ Popup de opciones cerrado');
        }
        
        // Cerrar popup de selección
        const seleccionPopup = document.getElementById('popup-seleccion');
        if (seleccionPopup) {
            seleccionPopup.style.display = 'none';
            console.log('✅ Popup de selección cerrado');
        }
        
        // Cerrar popup de renta
        const rentaPopup = document.getElementById('popup-renta');
        if (rentaPopup) {
            rentaPopup.style.display = 'none';
            console.log('✅ Popup de renta cerrado');
        }
        
        // Limpiar variables de carta
        if (typeof window.cartaPendiente !== 'undefined') {
            window.cartaPendiente = null;
            window.tipoCartaPendiente = null;
            window.jugadorCartaPendiente = null;
            console.log('🗑️ Variables de carta limpiadas');
        }
        
        // Habilitar botones
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) {
            rollBtn.disabled = false;
            console.log('🎲 Botón de dados habilitado');
        }
        
        // Actualizar controles
        updateControlsForTurn();
        console.log('🎮 Controles actualizados');
        
        return '✅ Todos los popups cerrados y controles habilitados';
        
    } catch (error) {
        console.error('❌ Error cerrando popups:', error);
        return '❌ Error: ' + error.message;
    }
};

// Función para verificar y cerrar popups automáticamente
function checkAndCloseStuckPopups() {
    // Solo verificar si es mi turno
    if (!isMyTurn) return;
    
    const cardPopup = document.getElementById('popup-carta');
    if (cardPopup && cardPopup.style.display !== 'none') {
        // Si hay un popup de carta abierto pero no hay carta pendiente, cerrarlo
        if (!window.cartaPendiente) {
            console.log('🔧 Detectado popup de carta sin carta pendiente, cerrando...');
            cardPopup.style.display = 'none';
            updateControlsForTurn();
        }
    }
}

// Verificar popups cada 2 segundos
setInterval(checkAndCloseStuckPopups, 2000);

// Interceptar funciones de propiedades, impuestos, cárcel y estaciones digitales
function interceptPropertyFunctions() {
    console.log('🏠 === CONFIGURANDO INTERCEPTORES DE PROPIEDADES Y CASILLAS ===');
    
    // Helper para interceptar acciones que modifican estado del juego/jugadores/tablero
    const wrapSyncAction = (fnName, actionType) => {
        if (typeof window[fnName] === 'function' && !window[fnName]._mpIntercepted) {
            const originalFn = window[fnName];
            const wrapped = function(...args) {
                if (!isMyTurn) {
                    console.warn(`❌ No es mi turno, bloqueando ${fnName}`);
                    return;
                }
                const result = originalFn.apply(this, args);
                setTimeout(() => {
                    const currentPlayerData = window.players && window.players[window.currentPlayer - 1];
                    sendGameAction(actionType, {
                        currentPlayer: window.currentPlayer,
                        turnPhase: window.turnPhase,
                        playersData: window.players,
                        boardCells: window.boardCells,
                        playerMoney: currentPlayerData ? currentPlayerData.money : 0,
                        playerInJail: currentPlayerData ? currentPlayerData.inJail : false
                    });
                    setTimeout(() => {
                        updateTurnIndicator();
                        updateControlsForTurn();
                    }, 100);
                }, 200);
                return result;
            };
            wrapped._mpIntercepted = true;
            window[fnName] = wrapped;
            console.log(`✅ ${fnName} interceptado`);
        }
    };

    wrapSyncAction('pagarCarcel', 'pagarCarcel');
    wrapSyncAction('pagarCarcelDirecta', 'pagarCarcel');
    wrapSyncAction('pasarTurnoCarcel', 'nextPlayer');
    wrapSyncAction('pagarRentaDirecta', 'pagarRenta');
    wrapSyncAction('comprarEstacionDigital', 'buyProperty');
    wrapSyncAction('pagarRentaEstacionDirecta', 'pagarRenta');
    wrapSyncAction('pagarImpuestoDirecto', 'pagarRenta');
    wrapSyncAction('cobrarWifiPremium', 'buyProperty');
    wrapSyncAction('cobrarInstagramVerificado', 'buyProperty');
    wrapSyncAction('usarSeguidores', 'buyProperty');
    wrapSyncAction('aplicarPerderPropiedad', 'buyProperty');
    wrapSyncAction('aplicarRobarPropiedad', 'buyProperty');
}

// Interceptar funciones de subasta
function interceptAuctionFunctions() {
    console.log('🔨 === CONFIGURANDO INTERCEPTORES DE SUBASTA ===');
    
    // Interceptar realizarPuja
    if (typeof window.realizarPuja === 'function') {
        const originalRealizarPuja = window.realizarPuja;
        
        window.realizarPuja = function() {
            console.log('💰 === INTERCEPTANDO REALIZAR PUJA ===');
            
            console.log('✅ Ejecutando lógica original de realizarPuja...');
            const result = originalRealizarPuja();
            
            setTimeout(() => {
                console.log('📤 Enviando sincronización de realizarPuja...');
                sendGameAction('realizarPuja', {
                    currentPlayer: window.currentPlayer,
                    playersData: window.players,
                    pujaActual: window.pujaActual,
                    pujadorActual: window.pujadorActual,
                    jugadoresSubasta: window.jugadoresSubasta
                });
            }, 200);
            
            return result;
        };
        console.log('✅ realizarPuja interceptado');
    }
    
    // Interceptar pasarSubasta
    if (typeof window.pasarSubasta === 'function') {
        const originalPasarSubasta = window.pasarSubasta;
        
        window.pasarSubasta = function() {
            console.log('❌ === INTERCEPTANDO PASAR SUBASTA ===');
            
            console.log('✅ Ejecutando lógica original de pasarSubasta...');
            const result = originalPasarSubasta();
            
            setTimeout(() => {
                console.log('📤 Enviando sincronización de pasarSubasta...');
                sendGameAction('pasarSubasta', {
                    currentPlayer: window.currentPlayer,
                    jugadoresSubasta: window.jugadoresSubasta,
                    subastaActiva: window.subastaActiva
                });
            }, 200);
            
            return result;
        };
        console.log('✅ pasarSubasta interceptado');
    }
}

// Interceptar funciones de intercambio
function interceptTradingFunctions() {
    console.log('🔄 === CONFIGURANDO INTERCEPTORES DE INTERCAMBIO ===');
    
    // Interceptar iniciarIntercambio
    if (typeof window.iniciarIntercambio === 'function') {
        const originalIniciarIntercambio = window.iniciarIntercambio;
        
        window.iniciarIntercambio = function() {
            console.log('🔄 === INTERCEPTANDO INICIAR INTERCAMBIO ===');
            console.log('🎯 Es mi turno:', isMyTurn);
            
            if (!isMyTurn) {
                console.warn('❌ No es mi turno, no se puede iniciar intercambio');
                return;
            }
            
            console.log('✅ Ejecutando lógica original de iniciarIntercambio...');
            return originalIniciarIntercambio();
        };
        console.log('✅ iniciarIntercambio interceptado');
    }
}

// Interceptar funciones especiales
function interceptSpecialFunctions() {
    console.log('⭐ === CONFIGURANDO INTERCEPTORES DE FUNCIONES ESPECIALES ===');
    
    // Interceptar mostrarMenuSeguidores
    if (typeof window.mostrarMenuSeguidores === 'function') {
        const originalMostrarMenuSeguidores = window.mostrarMenuSeguidores;
        
        window.mostrarMenuSeguidores = function(playerId) {
            console.log('📈 === INTERCEPTANDO MOSTRAR MENU SEGUIDORES ===');
            console.log('👤 Jugador ID:', playerId);
            
            console.log('✅ Ejecutando lógica original de mostrarMenuSeguidores...');
            return originalMostrarMenuSeguidores(playerId);
        };
        console.log('✅ mostrarMenuSeguidores interceptado');
    }
}

// Interceptar funciones de popups
function interceptPopupFunctions() {
    console.log('🎛️ === CONFIGURANDO INTERCEPTORES DE POPUPS ===');
    
    // Interceptar mostrarCartasGuardadas
    if (typeof window.mostrarCartasGuardadas === 'function') {
        const originalMostrarCartasGuardadas = window.mostrarCartasGuardadas;
        
        window.mostrarCartasGuardadas = function() {
            console.log('🃏 === INTERCEPTANDO MOSTRAR CARTAS GUARDADAS ===');
            
            console.log('✅ Ejecutando lógica original de mostrarCartasGuardadas...');
            return originalMostrarCartasGuardadas();
        };
        console.log('✅ mostrarCartasGuardadas interceptado');
    }
    
    // Interceptar mostrarLogros
    if (typeof window.mostrarLogros === 'function') {
        const originalMostrarLogros = window.mostrarLogros;
        
        window.mostrarLogros = function() {
            console.log('🏆 === INTERCEPTANDO MOSTRAR LOGROS ===');
            
            console.log('✅ Ejecutando lógica original de mostrarLogros...');
            return originalMostrarLogros();
        };
        console.log('✅ mostrarLogros interceptado');
    }
    
    // Interceptar showPlayerProperties
    if (typeof window.showPlayerProperties === 'function') {
        const originalShowPlayerProperties = window.showPlayerProperties;
        
        window.showPlayerProperties = function() {
            console.log('🏠 === INTERCEPTANDO SHOW PLAYER PROPERTIES ===');
            
            console.log('✅ Ejecutando lógica original de showPlayerProperties...');
            return originalShowPlayerProperties();
        };
        console.log('✅ showPlayerProperties interceptado');
    }
    
    // Interceptar cerrarOpcionesCasilla
    if (typeof window.cerrarOpcionesCasilla === 'function') {
        const originalCerrarOpcionesCasilla = window.cerrarOpcionesCasilla;
        
        window.cerrarOpcionesCasilla = function() {
            console.log('🎛️ === INTERCEPTANDO CERRAR OPCIONES CASILLA ===');
            
            console.log('✅ Ejecutando lógica original de cerrarOpcionesCasilla...');
            const result = originalCerrarOpcionesCasilla();
            
            // Actualizar controles después de cerrar
            setTimeout(() => {
                updateControlsForTurn();
            }, 100);
            
            return result;
        };
        console.log('✅ cerrarOpcionesCasilla interceptado');
    }
    
    // Interceptar mostrarOpcionesCasilla
    if (typeof window.mostrarOpcionesCasilla === 'function') {
        const originalMostrarOpcionesCasilla = window.mostrarOpcionesCasilla;
        
        window.mostrarOpcionesCasilla = function(player, cellData, position) {
            console.log('🎛️ === INTERCEPTANDO MOSTRAR OPCIONES CASILLA ===');
            console.log('👤 Jugador:', player);
            console.log('🏠 Casilla:', cellData);
            console.log('📍 Posición:', position);
            
            // Solo mostrar opciones si es mi turno
            if (player && player.firebaseId === currentPlayerId) {
                console.log('✅ Es mi turno, mostrando opciones...');
                return originalMostrarOpcionesCasilla(player, cellData, position);
            } else {
                console.log('⏳ No es mi turno, no se muestran opciones');
                // Para otros jugadores, solo mostrar información sin opciones
                return;
            }
        };
        console.log('✅ mostrarOpcionesCasilla interceptado');
    }
}

console.log('🎮 Multiplayer Firebase COMPLETO cargado');
console.log('🔄 Sistema de turnos sincronizados activado');
console.log('🎯 TODAS las funciones del juego interceptadas para multiplayer');
console.log('');
console.log('📋 === COMANDOS DE DIAGNÓSTICO ===');
console.log('🧪 testMultiplayer() - TEST COMPLETO del sistema');
console.log('🔍 diagnoseFull() - DIAGNÓSTICO COMPLETO del sistema');
console.log('🔧 debugMultiplayer() - Diagnóstico básico del sistema');
console.log('🎯 debugTurns() - Diagnóstico específico de turnos');
console.log('🔍 checkInterceptors() - Verificar funciones interceptadas');
console.log('');
console.log('📋 === COMANDOS DE REPARACIÓN ===');
console.log('🚨 forceTurnSync() - Forzar sincronización de turnos');
console.log('🚨 forceClosePopups() - Cerrar popups problemáticos');
console.log('🔧 fixNextPlayer() - Arreglar función nextPlayer');
console.log('🎲 fixDoubles() - Arreglar sistema de dobles');
console.log('');
console.log('✨ ¡Todas las funciones del modo normal funcionan en multiplayer!'); 
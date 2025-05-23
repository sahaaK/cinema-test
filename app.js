
   const LOCAL_STORAGE_KEYS = {
    MOVIES: 'movies',
    CURRENT_PARTY: 'currentParty'
};

// DOM Elements
const elements = {
    partySection: document.getElementById('partySection'),
    homeContent: document.getElementById('homeContent'),
    joinPartyModal: document.getElementById('joinPartyModal'),
    createPartyModal: document.getElementById('createPartyModal'),
    uploadModal: document.getElementById('uploadModal'),
    partyVideo: document.getElementById('partyVideo'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendMessageBtn: document.getElementById('sendMessageBtn'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    syncBtn: document.getElementById('syncBtn'),
    leavePartyBtn: document.getElementById('leavePartyBtn'),
    currentTime: document.getElementById('currentTime'),
    duration: document.getElementById('duration'),
    partyId: document.getElementById('partyId'),
    partyMembers: document.getElementById('partyMembers'),
    partyMovie: document.getElementById('partyMovie'),
    inviteLink: document.getElementById('inviteLink'),
    copyInviteBtn: document.getElementById('copyInviteBtn'),
    progressBar: document.querySelector('.progress-bar'),
    uploadBtn: document.getElementById('uploadBtn'),
    createPartyBtn: document.getElementById('createPartyBtn'),
    createPartyBtn2: document.getElementById('createPartyBtn2'),
    joinPartyBtn: document.getElementById('joinPartyBtn'),
    cancelJoinBtn: document.getElementById('cancelJoinBtn'),
    confirmJoinBtn: document.getElementById('confirmJoinBtn'),
    cancelCreateBtn: document.getElementById('cancelCreateBtn'),
    confirmCreateBtn: document.getElementById('confirmCreateBtn'),
    cancelUploadBtn: document.getElementById('cancelUploadBtn'),
    confirmUploadBtn: document.getElementById('confirmUploadBtn'),
    partyCode: document.getElementById('partyCode'),
    partyName: document.getElementById('partyName'),
    selectMovie: document.getElementById('selectMovie'),
    movieTitle: document.getElementById('movieTitle'),
    movieFile: document.getElementById('movieFile'),
    movieThumbnail: document.getElementById('movieThumbnail')
};

// State
const state = {
    currentParty: null,
    isHost: false,
    members: [],
    movies: [],
    userId: `user_${Math.random().toString(36).substr(2, 8)}`,
    userName: 'Anonymous',
    socket: null,
    videoInterval: null,
    movieRef: null,
    partiesRef: null,
    currentPartyRef: null,
    chatRef: null
};

// Utility functions
const utils = {
    formatTime: (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s].map(unit => unit.toString().padStart(2, '0')).join(':');
    },
    generateId: (prefix = '') => {
        return `${prefix}${Math.random().toString(36).substr(2, 8)}`;
    },
    toggleModal: (modal, show) => {
        modal.classList.toggle('hidden', !show);
    },
    clearForm: (form) => {
        if (form.tagName === 'FORM') {
            form.reset();
        } else if (form instanceof HTMLInputElement || form instanceof HTMLSelectElement) {
            form.value = '';
        }
    }
};

// Movie functions
const movieManager = {
    loadMovies: async () => {
        try {
            state.movieRef = database.ref('movies');
            
            // Load from Firebase
            const snapshot = await state.movieRef.once('value');
            const firebaseMovies = snapshot.val() || {};
            
            // Convert to array
            state.movies = Object.values(firebaseMovies);
            
            // If no movies in Firebase, use mock movies (for demo)
            if (state.movies.length === 0) {
                state.movies = [
                    { 
                        id: '1', 
                        title: 'Inception', 
                        url: 'https://example.com/videos/inception.mp4', 
                        thumbnail: 'https://example.com/thumbnails/inception.jpg' 
                    },
                    { 
                        id: '2', 
                        title: 'The Shawshank Redemption', 
                        url: 'https://example.com/videos/shawshank.mp4', 
                        thumbnail: 'https://example.com/thumbnails/shawshank.jpg' 
                    }
                ];
                await state.movieRef.set(state.movies.reduce((acc, movie) => {
                    acc[movie.id] = movie;
                    return acc;
                }, {}));
            }
            
            movieManager.updateMovieSelect();
        } catch (error) {
            console.error('Error loading movies:', error);
        }
    },
    updateMovieSelect: () => {
        elements.selectMovie.innerHTML = '<option value="">Select a movie</option>';
        state.movies.forEach(movie => {
            const option = document.createElement('option');
            option.value = movie.id;
            option.textContent = movie.title;
            elements.selectMovie.appendChild(option);
        });
    },
    uploadMovie: async () => {
        const title = elements.movieTitle.value.trim();
        const file = elements.movieFile.files[0];
        const thumbnailFile = elements.movieThumbnail.files[0];
        
        if (!title || !file) {
            alert(title ? 'Please select a movie file' : 'Please enter a movie title');
            return false;
        }
        
        try {
            // Upload movie file to Firebase Storage
            const movieId = utils.generateId('movie-');
            const movieStorageRef = storage.ref(`movies/${movieId}/${file.name}`);
            await movieStorageRef.put(file);
            const movieUrl = await movieStorageRef.getDownloadURL();
            
            // Upload thumbnail if provided
            let thumbnailUrl = '';
            if (thumbnailFile) {
                const thumbnailStorageRef = storage.ref(`movies/${movieId}/thumbnail_${thumbnailFile.name}`);
                await thumbnailStorageRef.put(thumbnailFile);
                thumbnailUrl = await thumbnailStorageRef.getDownloadURL();
            }
            
            // Create movie object
            const newMovie = {
                id: movieId,
                title: title,
                url: movieUrl,
                thumbnail: thumbnailUrl
            };
            
            // Save to Firebase Database
            await database.ref(`movies/${movieId}`).set(newMovie);
            
            // Update local state
            state.movies.push(newMovie);
            movieManager.updateMovieSelect();
            
            // Clear form
            utils.clearForm(elements.movieTitle);
            utils.clearForm(elements.movieFile);
            utils.clearForm(elements.movieThumbnail);
            
            return true;
        } catch (error) {
            console.error('Error uploading movie:', error);
            alert('Failed to upload movie. Please try again.');
            return false;
        }
    }
};

// Party functions
const partyManager = {
    joinParty: async (partyId, isHost = false) => {
        try {
            state.partiesRef = database.ref('parties');
            state.currentPartyRef = database.ref(`parties/${partyId}`);
            
            // Get party data
            const snapshot = await state.currentPartyRef.once('value');
            let party = snapshot.val();
            
            if (!party && isHost) {
                // Create new party if host and party doesn't exist
                const movieId = elements.selectMovie.value;
                const selectedMovie = state.movies.find(m => m.id === movieId);
                if (!selectedMovie) throw new Error('Movie not found');
                
                party = {
                    id: partyId,
                    name: elements.partyName.value.trim(),
                    movie: selectedMovie,
                    members: {
                        [state.userId]: {
                            id: state.userId,
                            name: `${state.userName} (Host)`,
                            isHost: true
                        }
                    },
                    currentTime: 0,
                    isPlaying: false,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                };
                
                await state.currentPartyRef.set(party);
            } else if (!party) {
                throw new Error('Party not found');
            }
            
            // If not host, add user to members
            if (!isHost) {
                await state.currentPartyRef.child(`members/${state.userId}`).set({
                    id: state.userId,
                    name: state.userName,
                    isHost: false
                });
            }
            
            // Update state
            state.currentParty = party;
            state.isHost = isHost;
            state.members = Object.values(party.members || {});
            
            // Set up chat
            state.chatRef = database.ref(`parties/${partyId}/chat`);
            
            // Listen for party updates
            state.currentPartyRef.on('value', partyManager.handlePartyUpdate);
            
            // Listen for chat messages
            state.chatRef.on('child_added', partyManager.handleChatMessage);
            
            // Update UI
            elements.partySection.classList.remove('hidden');
            elements.homeContent.classList.add('hidden');
            
            elements.partyId.textContent = party.id;
            elements.partyMembers.textContent = Object.keys(party.members || {}).length;
            elements.partyMovie.textContent = party.movie.title;
            
            // Set up video
            elements.partyVideo.src = party.movie.url;
            elements.partyVideo.load();
            
            // Set invite link
            elements.inviteLink.value = `${window.location.origin}?party=${party.id}`;
            
            // Start video sync
            partyManager.startVideoSync();
            
            // Set initial video state
            if (party.isPlaying) {
                elements.partyVideo.play();
            } else {
                elements.partyVideo.pause();
            }
            elements.partyVideo.currentTime = party.currentTime || 0;
            
            // Store in localStorage
            localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_PARTY, JSON.stringify({
                id: party.id,
                isHost: isHost
            }));
            
            return true;
        } catch (error) {
            console.error('Error joining party:', error);
            alert(`Failed to join party: ${error.message}`);
            return false;
        }
    },
    handlePartyUpdate: (snapshot) => {
        const party = snapshot.val();
        if (!party) return;
        
        // Update members list
        state.members = Object.values(party.members || {});
        elements.partyMembers.textContent = state.members.length;
        
        // Update video state if not host
        if (!state.isHost) {
            if (party.isPlaying && elements.partyVideo.paused) {
                elements.partyVideo.play();
            } else if (!party.isPlaying && !elements.partyVideo.paused) {
                elements.partyVideo.pause();
            }
            
            // Only sync if difference is significant (> 1 second)
            if (Math.abs(elements.partyVideo.currentTime - party.currentTime) > 1) {
                elements.partyVideo.currentTime = party.currentTime;
            }
        }
    },
    handleChatMessage: (snapshot) => {
        const message = snapshot.val();
        chatManager.addMessage(message.user, message.text);
    },
    startVideoSync: () => {
        if (state.videoInterval) clearInterval(state.videoInterval);
        
        state.videoInterval = setInterval(() => {
            if (state.isHost && elements.partyVideo.readyState > 0) {
                // Update party state in Firebase
                state.currentPartyRef.update({
                    currentTime: elements.partyVideo.currentTime,
                    isPlaying: !elements.partyVideo.paused
                });
            }
        }, 1000);
    },
    leaveParty: async () => {
        if (confirm('Are you sure you want to leave the party?')) {
            try {
                // Remove user from members
                if (state.currentPartyRef) {
                    await state.currentPartyRef.child(`members/${state.userId}`).remove();
                    
                    // If host, delete the party if no members left
                    if (state.isHost) {
                        const snapshot = await state.currentPartyRef.child('members').once('value');
                        if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
                            await state.currentPartyRef.remove();
                        }
                    }
                }
                
                // Clean up listeners
                if (state.currentPartyRef) state.currentPartyRef.off();
                if (state.chatRef) state.chatRef.off();
                if (state.videoInterval) clearInterval(state.videoInterval);
                
                // Reset video
                elements.partyVideo.pause();
                elements.partyVideo.src = '';
                
                // Reset state
                state.currentParty = null;
                state.isHost = false;
                state.members = [];
                state.currentPartyRef = null;
                state.chatRef = null;
                
                // Update UI
                elements.partySection.classList.add('hidden');
                elements.homeContent.classList.remove('hidden');
                elements.chatMessages.innerHTML = '';
                
                // Remove from localStorage
                localStorage.removeItem(LOCAL_STORAGE_KEYS.CURRENT_PARTY);
            } catch (error) {
                console.error('Error leaving party:', error);
            }
        }
    },
    sendChatMessage: async (message) => {
        if (!state.chatRef || !message.trim()) return;
        
        try {
            await state.chatRef.push({
                user: state.isHost ? `${state.userName} (Host)` : state.userName,
                text: message.trim(),
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    },
    updateVideoState: async (isPlaying, currentTime) => {
        if (!state.isHost || !state.currentPartyRef) return;
        
        try {
            await state.currentPartyRef.update({
                isPlaying: isPlaying,
                currentTime: currentTime
            });
        } catch (error) {
            console.error('Error updating video state:', error);
        }
    }
};

// Chat functions
const chatManager = {
    addMessage: (user, message) => {
        const messageElement = document.createElement('div');
        messageElement.className = 'bg-gray-700 p-2 rounded mb-2';
        messageElement.innerHTML = `<strong class="text-indigo-400">${user}:</strong> ${message}`;
        elements.chatMessages.appendChild(messageElement);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    },
    sendMessage: () => {
        const message = elements.chatInput.value.trim();
        if (!message) return;
        
        partyManager.sendChatMessage(message);
        elements.chatInput.value = '';
    }
};

// Video functions
const videoManager = {
    togglePlayPause: () => {
        if (elements.partyVideo.paused) {
            elements.partyVideo.play();
        } else {
            elements.partyVideo.pause();
        }
        partyManager.updateVideoState(!elements.partyVideo.paused, elements.partyVideo.currentTime);
    },
    syncVideo: () => {
        if (!state.isHost) {
            elements.partyVideo.currentTime = state.currentParty?.currentTime || 0;
            if (state.currentParty?.isPlaying) {
                elements.partyVideo.play();
            } else {
                elements.partyVideo.pause();
            }
            alert('Video synced with host');
        } else {
            alert('You are the host, others will sync with you');
        }
    },
    handleVideoPlay: () => {
        elements.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
        partyManager.updateVideoState(true, elements.partyVideo.currentTime);
    },
    handleVideoPause: () => {
        elements.playPauseBtn.innerHTML = '<i class="fas fa-play"></i> Play';
        partyManager.updateVideoState(false, elements.partyVideo.currentTime);
    },
    updateVideoProgress: () => {
        const percent = (elements.partyVideo.currentTime / elements.partyVideo.duration) * 100;
        elements.progressBar.style.width = `${percent}%`;
        elements.currentTime.textContent = utils.formatTime(elements.partyVideo.currentTime);
        
        // If host, update the current time in Firebase
        if (state.isHost) {
            partyManager.updateVideoState(!elements.partyVideo.paused, elements.partyVideo.currentTime);
        }
    },
    updateVideoDuration: () => {
        elements.duration.textContent = utils.formatTime(elements.partyVideo.duration);
    }
};

// Event handlers
const eventHandlers = {
    handleJoinParty: async () => {
        const code = elements.partyCode.value.trim();
        if (!code) {
            alert('Please enter a party code');
            return;
        }
        
        // Prompt for username
        const userName = prompt('Enter your name:', 'Anonymous');
        if (!userName) return;
        
        state.userName = userName;
        
        if (await partyManager.joinParty(code, false)) {
            utils.toggleModal(elements.joinPartyModal, false);
            utils.clearForm(elements.partyCode);
        }
    },
    handleCreateParty: async () => {
        const name = elements.partyName.value.trim();
        const movieId = elements.selectMovie.value;
        
        if (!name || !movieId) {
            alert(name ? 'Please select a movie' : 'Please enter a party name');
            return;
        }
        
        // Prompt for username
        const userName = prompt('Enter your name:', 'Anonymous');
        if (!userName) return;
        
        state.userName = userName;
        
        const partyId = utils.generateId('party-');
        if (await partyManager.joinParty(partyId, true)) {
            utils.toggleModal(elements.createPartyModal, false);
            utils.clearForm(elements.partyName);
            utils.clearForm(elements.selectMovie);
        }
    },
    handleUploadMovie: async () => {
        if (await movieManager.uploadMovie()) {
            utils.toggleModal(elements.uploadModal, false);
            alert('Movie uploaded successfully!');
        }
    },
    copyInviteLink: () => {
        elements.inviteLink.select();
        document.execCommand('copy');
        alert('Invite link copied to clipboard!');
    }
};

// Initialize event listeners
const initEventListeners = () => {
    // Modal buttons
    elements.uploadBtn.addEventListener('click', () => utils.toggleModal(elements.uploadModal, true));
    elements.createPartyBtn.addEventListener('click', () => utils.toggleModal(elements.createPartyModal, true));
    elements.createPartyBtn2.addEventListener('click', () => utils.toggleModal(elements.createPartyModal, true));
    elements.joinPartyBtn.addEventListener('click', () => utils.toggleModal(elements.joinPartyModal, true));
    
    // Modal actions
    elements.cancelJoinBtn.addEventListener('click', () => utils.toggleModal(elements.joinPartyModal, false));
    elements.confirmJoinBtn.addEventListener('click', eventHandlers.handleJoinParty);
    elements.cancelCreateBtn.addEventListener('click', () => utils.toggleModal(elements.createPartyModal, false));
    elements.confirmCreateBtn.addEventListener('click', eventHandlers.handleCreateParty);
    elements.cancelUploadBtn.addEventListener('click', () => utils.toggleModal(elements.uploadModal, false));
    elements.confirmUploadBtn.addEventListener('click', eventHandlers.handleUploadMovie);
    
    // Party controls
    elements.playPauseBtn.addEventListener('click', videoManager.togglePlayPause);
    elements.syncBtn.addEventListener('click', videoManager.syncVideo);
    elements.leavePartyBtn.addEventListener('click', partyManager.leaveParty);
    elements.copyInviteBtn.addEventListener('click', eventHandlers.copyInviteLink);
    
    // Chat
    elements.sendMessageBtn.addEventListener('click', chatManager.sendMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') chatManager.sendMessage();
    });
    
    // Video events
    elements.partyVideo.addEventListener('play', videoManager.handleVideoPlay);
    elements.partyVideo.addEventListener('pause', videoManager.handleVideoPause);
    elements.partyVideo.addEventListener('timeupdate', videoManager.updateVideoProgress);
    elements.partyVideo.addEventListener('loadedmetadata', videoManager.updateVideoDuration);
};

// Initialize the app
const init = async () => {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    
    await movieManager.loadMovies();
    
    // Check if rejoining a party from URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const partyIdFromUrl = urlParams.get('party');
    const storedParty = localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT_PARTY);
    
    if (partyIdFromUrl) {
        // Prompt for username when joining from URL
        const userName = prompt('Enter your name:', 'Anonymous');
        if (userName) {
            state.userName = userName;
            await partyManager.joinParty(partyIdFromUrl, false);
        }
    } else if (storedParty) {
        const partyData = JSON.parse(storedParty);
        // Prompt for username when rejoining
        const userName = prompt('Enter your name:', 'Anonymous');
        if (userName) {
            state.userName = userName;
            await partyManager.joinParty(partyData.id, partyData.isHost);
        }
    }
    
    initEventListeners();
};

// Start the app
document.addEventListener('DOMContentLoaded', init);
        // DOM Elements


// State
let playlist = [];
let currentSongIndex = -1;
let currentPreviewSong = null;
let isPlaying = false;
let currentFilter = 'all'; // 'all' | 'downloaded'
let currentSearchTermInPlaylist = '';
let currentSort = 'newest';

// Playback Modes: 'sequential' | 'shuffle' | 'repeat_one' | 'stop_at_end'
let playbackMode = 'sequential';

// Search results state (pagination: 8 initially, up to 16 total)
let currentSearchResults = [];
let displayedSearchResultsCount = 8;

// Pure HTML5 Audio Engine
const audio = document.getElementById('main-audio');

// DOM Elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const searchSubmitBtn = document.getElementById('search-submit-btn');
const searchResultsContainer = document.getElementById('search-results-container');
const searchResultsList = document.getElementById('search-results-list');
const resultQueryText = document.getElementById('result-query-text');
const resultsCountBadge = document.getElementById('results-count-badge');
const loadMoreContainer = document.getElementById('load-more-container');
const btnLoadMore = document.getElementById('btn-load-more');
const loadMoreRemaining = document.getElementById('load-more-remaining');

const playlistTbody = document.getElementById('playlist-tbody');
const playlistCount = document.getElementById('playlist-count');
const statTotal = document.getElementById('stat-total');
const statOffline = document.getElementById('stat-offline');
const emptyPlaylist = document.getElementById('empty-playlist');
const emptyPlaylistDesc = document.getElementById('empty-playlist-desc');

const playlistFilterInput = document.getElementById('playlist-filter-input');
const clearFilterBtn = document.getElementById('clear-filter-btn');
const playlistSortSelect = document.getElementById('playlist-sort-select');
const selectPlayMode = document.getElementById('select-play-mode');

const playerThumb = document.getElementById('player-thumb');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerSourceBadge = document.getElementById('player-source-badge');
const playerSourceText = document.getElementById('player-source-text');
const playerVinyl = document.getElementById('player-vinyl');

const ctrlPlay = document.getElementById('ctrl-play');
const ctrlPrev = document.getElementById('ctrl-prev');
const ctrlNext = document.getElementById('ctrl-next');
const ctrlModeQuick = document.getElementById('ctrl-mode-quick');
const ctrlModeIcon = document.getElementById('ctrl-mode-icon');
const ctrlRepeatQuick = document.getElementById('ctrl-repeat-quick');
const playerModePill = document.getElementById('player-mode-pill');
const ctrlVolumeBtn = document.getElementById('ctrl-volume-btn');
const volumeSlider = document.getElementById('volume-slider');

const progressWrapper = document.getElementById('progress-wrapper');
const progressFill = document.getElementById('progress-fill');
const progressThumb = document.getElementById('progress-thumb');
const currentTimeLabel = document.getElementById('current-time');
const totalTimeLabel = document.getElementById('total-time');
const downloadCurrentBtn = document.getElementById('download-current-btn');
const toastEl = document.getElementById('toast');

const badgeTotal = document.getElementById('badge-total');
const badgeOffline = document.getElementById('badge-offline');

// --- 1. Audio Engine Listeners ---
audio.addEventListener('play', () => setPlayingState(true));
audio.addEventListener('pause', () => setPlayingState(false));
audio.addEventListener('ended', handleTrackEnded);
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('waiting', () => {
  playerSourceText.textContent = 'Đang tải âm thanh...';
});
audio.addEventListener('canplay', () => {
  const currentSong = currentSongIndex >= 0 ? playlist[currentSongIndex] : currentPreviewSong;
  if (currentSong) {
    playerSourceText.textContent = currentSong.downloaded ? 'Offline MP3 (Máy)' : (currentPreviewSong ? 'Đang nghe thử' : 'Online Stream');
  }
});
audio.addEventListener('error', (e) => {
  console.error('Audio playback error:', e);
  setPlayingState(false);
  showToast('Đang kết nối lại luồng âm thanh, vui lòng thử lại...', 'error');
});

// --- 2. Unified Playback Functions ---
function playSong(song, shouldPlay = true) {
  if (!song) return;

  playerThumb.src = song.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop';
  playerTitle.textContent = song.title;
  playerArtist.textContent = song.artist || 'Nghệ sĩ';

  const songId = song.id || song.videoId;
  const isOffline = song.downloaded && song.localFile;

  playerSourceText.textContent = isOffline ? 'Offline MP3 (Máy)' : (currentPreviewSong ? 'Đang nghe thử' : 'Đang kết nối âm thanh...');
  playerSourceBadge.querySelector('.badge-dot').className = 'badge-dot active';

  // Target stream URL
  const targetSrc = isOffline ? song.localFile : `/api/stream/${songId}`;

  if (audio.src !== window.location.origin + targetSrc && audio.getAttribute('src') !== targetSrc) {
    audio.src = targetSrc;
    audio.load();
  }

  if (shouldPlay) {
    audio.play().catch(e => {
      console.log('Play request pending/interrupted:', e.message);
    });
  }

  updateActiveRowInTable();
  updatePreviewButtonsState();
  updateMediaSession(song);
}

// MediaSession API for mobile lockscreen and Bluetooth earphones
function updateMediaSession(song) {
  if ('mediaSession' in navigator && song) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist || 'Music Xuân Công',
      album: 'Music Xuân Công Playlist',
      artwork: [
        { src: song.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=512&auto=format&fit=crop', sizes: '512x512', type: 'image/jpeg' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
    navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime && audio.duration) {
        audio.currentTime = details.seekTime;
      }
    });
  }
}

function loadSongIntoPlayer(index, shouldPlay = true) {
  if (index < 0 || index >= playlist.length) return;
  currentSongIndex = index;
  currentPreviewSong = null;
  const song = playlist[index];
  playSong(song, shouldPlay);
}

function togglePlayPause() {
  if (currentSongIndex === -1 && !currentPreviewSong) {
    if (playlist.length > 0) {
      loadSongIntoPlayer(0, true);
    }
    return;
  }

  if (audio.paused) {
    audio.play().catch(e => console.log(e));
  } else {
    audio.pause();
  }
}

function setPlayingState(playing) {
  isPlaying = playing;
  if (playing) {
    ctrlPlay.innerHTML = '<i class="fa-solid fa-pause"></i>';
    ctrlPlay.classList.add('playing');
    playerVinyl.classList.add('spinning');
  } else {
    ctrlPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
    ctrlPlay.classList.remove('playing');
    playerVinyl.classList.remove('spinning');
  }
  updateActiveRowInTable();
}

// --- 3. Chế độ khi nghe hết 1 bài (Playback Modes) ---
function handleTrackEnded() {
  if (currentPreviewSong) {
    if (playbackMode === 'repeat_one') {
      audio.currentTime = 0;
      audio.play();
    } else {
      setPlayingState(false);
    }
    return;
  }

  if (playlist.length === 0) {
    setPlayingState(false);
    return;
  }

  console.log(`Bài kết thúc. Xử lý theo chế độ: ${playbackMode}`);

  switch (playbackMode) {
    case 'repeat_one': // Lặp lại chính bài đó
      audio.currentTime = 0;
      audio.play();
      break;

    case 'shuffle': // Nhảy ngẫu nhiên (loạn xạ)
      let randomIdx = Math.floor(Math.random() * playlist.length);
      if (playlist.length > 1 && randomIdx === currentSongIndex) {
        randomIdx = (randomIdx + 1) % playlist.length;
      }
      loadSongIntoPlayer(randomIdx, true);
      break;

    case 'stop_at_end': // Dừng khi hết bài
      setPlayingState(false);
      showToast('Đã dừng phát (chế độ Dừng khi hết bài)', 'info');
      break;

    case 'sequential': // Phát tiếp theo bình thường
    default:
      if (currentSongIndex + 1 < playlist.length) {
        loadSongIntoPlayer(currentSongIndex + 1, true);
      } else {
        loadSongIntoPlayer(0, true); // Quay lại bài đầu tiên
      }
      break;
  }
}

function setPlaybackMode(mode) {
  playbackMode = mode;
  selectPlayMode.value = mode;

  let labelText = '';
  let iconClass = '';
  switch (mode) {
    case 'shuffle':
      labelText = 'Chế độ: Nhảy loạn xạ (Ngẫu nhiên)';
      iconClass = 'fa-solid fa-shuffle';
      ctrlModeQuick.classList.add('active');
      ctrlRepeatQuick.classList.remove('active');
      break;
    case 'repeat_one':
      labelText = 'Chế độ: Lặp lại 1 bài';
      iconClass = 'fa-solid fa-repeat-1';
      ctrlModeQuick.classList.remove('active');
      ctrlRepeatQuick.classList.add('active');
      break;
    case 'stop_at_end':
      labelText = 'Chế độ: Dừng khi hết bài';
      iconClass = 'fa-solid fa-stop';
      ctrlModeQuick.classList.remove('active');
      ctrlRepeatQuick.classList.remove('active');
      break;
    case 'sequential':
    default:
      labelText = 'Chế độ: Phát liên tiếp (Tuần tự)';
      iconClass = 'fa-solid fa-arrows-split-up-and-left';
      ctrlModeQuick.classList.remove('active');
      ctrlRepeatQuick.classList.remove('active');
      break;
  }

  playerModePill.textContent = labelText;
  ctrlModeIcon.className = iconClass;
  showToast(labelText, 'info');
}

ctrlModeQuick.addEventListener('click', () => {
  const modes = ['sequential', 'shuffle', 'repeat_one', 'stop_at_end'];
  const nextIdx = (modes.indexOf(playbackMode) + 1) % modes.length;
  setPlaybackMode(modes[nextIdx]);
});

ctrlRepeatQuick.addEventListener('click', () => {
  if (playbackMode === 'repeat_one') {
    setPlaybackMode('sequential');
  } else {
    setPlaybackMode('repeat_one');
  }
});

selectPlayMode.addEventListener('change', (e) => {
  setPlaybackMode(e.target.value);
});

function playNext() {
  if (playlist.length === 0) return;
  if (playbackMode === 'shuffle') {
    let nextIdx = Math.floor(Math.random() * playlist.length);
    if (playlist.length > 1 && nextIdx === currentSongIndex) {
      nextIdx = (nextIdx + 1) % playlist.length;
    }
    loadSongIntoPlayer(nextIdx, true);
  } else {
    const nextIdx = (currentSongIndex + 1) % playlist.length;
    loadSongIntoPlayer(nextIdx, true);
  }
}

function playPrev() {
  if (playlist.length === 0) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const prevIdx = (currentSongIndex - 1 + playlist.length) % playlist.length;
  loadSongIntoPlayer(prevIdx, true);
}

function updateProgress() {
  const current = audio.currentTime || 0;
  const total = audio.duration || 0;

  currentTimeLabel.textContent = formatTime(current);
  if (total && !isNaN(total)) {
    totalTimeLabel.textContent = formatTime(total);
    const pct = Math.min(100, Math.max(0, (current / total) * 100));
    progressFill.style.width = pct + '%';
    progressThumb.style.left = pct + '%';
  }
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

progressWrapper.addEventListener('click', (e) => {
  const rect = progressWrapper.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
  }
});

// Volume control
volumeSlider.addEventListener('input', (e) => {
  const vol = parseInt(e.target.value);
  applyVolume(vol);
});

function applyVolume(vol) {
  audio.volume = vol / 100;
  if (vol === 0) {
    ctrlVolumeBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
  } else if (vol < 50) {
    ctrlVolumeBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
  } else {
    ctrlVolumeBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
  }
}

let lastVolume = 80;
ctrlVolumeBtn.addEventListener('click', () => {
  if (volumeSlider.value > 0) {
    lastVolume = volumeSlider.value;
    volumeSlider.value = 0;
    applyVolume(0);
  } else {
    volumeSlider.value = lastVolume || 80;
    applyVolume(volumeSlider.value);
  }
});

ctrlPlay.addEventListener('click', togglePlayPause);
ctrlNext.addEventListener('click', playNext);
ctrlPrev.addEventListener('click', playPrev);

// --- 4. Header Badges: Bấm vào cuộn xuống Playlist để thao tác ---
function scrollToPlaylist(targetFilter = 'all') {
  currentFilter = targetFilter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === targetFilter);
  });
  renderPlaylist();

  const playlistSection = document.querySelector('.playlist-section');
  playlistSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  playlistSection.style.transition = 'box-shadow 0.4s ease';
  playlistSection.style.boxShadow = '0 0 30px rgba(99, 102, 241, 0.45)';
  setTimeout(() => {
    playlistSection.style.boxShadow = '';
  }, 1200);

  showToast(`Đã chuyển tới Playlist (${targetFilter === 'downloaded' ? 'Đã tải offline' : 'Tất cả bài hát'})`, 'info');
}

badgeTotal.addEventListener('click', () => scrollToPlaylist('all'));
badgeOffline.addEventListener('click', () => scrollToPlaylist('downloaded'));

// --- 5. Fetch & Render Playlist với Bộ lọc & Sắp xếp ---
async function fetchPlaylist() {
  try {
    const res = await fetch('/api/playlist');
    const data = await res.json();
    if (data.success) {
      playlist = data.data || [];
      renderPlaylist();
      updateStats();
    }
  } catch (err) {
    console.error('Failed to fetch playlist:', err);
  }
}

function renderPlaylist() {
  let list = [...playlist];

  // 1. Tab filter
  if (currentFilter === 'downloaded') {
    list = list.filter(s => s.downloaded);
  }

  // 2. Keyword filter
  if (currentSearchTermInPlaylist) {
    const term = currentSearchTermInPlaylist.toLowerCase();
    list = list.filter(s => 
      (s.title && s.title.toLowerCase().includes(term)) ||
      (s.artist && s.artist.toLowerCase().includes(term)) ||
      (s.query && s.query.toLowerCase().includes(term))
    );
  }

  // 3. Sort
  switch (currentSort) {
    case 'oldest':
      list.sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0));
      break;
    case 'title_asc':
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    case 'artist_asc':
      list.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
      break;
    case 'newest':
    default:
      list.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0));
      break;
  }

  playlistCount.textContent = `${list.length} bài hát`;

  if (list.length === 0) {
    emptyPlaylist.classList.remove('hidden');
    if (currentSearchTermInPlaylist) {
      emptyPlaylistDesc.textContent = `Không tìm thấy bài hát nào khớp với từ khóa "${currentSearchTermInPlaylist}".`;
    } else if (currentFilter === 'downloaded') {
      emptyPlaylistDesc.textContent = 'Bạn chưa tải bài hát nào về máy. Hãy bấm nút icon tải xuống để lưu offline nhé!';
    } else {
      emptyPlaylistDesc.textContent = 'Hãy gõ một câu bạn nhớ vào ô tìm kiếm ở trên để nghe thử và thêm bài vào danh sách nhé!';
    }
    playlistTbody.innerHTML = '';
    return;
  }

  emptyPlaylist.classList.add('hidden');
  playlistTbody.innerHTML = list.map((song, idx) => {
    const originalIndex = playlist.findIndex(s => s.id === song.id);
    const isCurrent = currentSongIndex === originalIndex;
    const isSongPlaying = isCurrent && isPlaying;

    const sourceTag = song.downloaded
      ? `<span class="source-tag source-offline"><i class="fa-solid fa-hard-drive"></i> Offline</span>`
      : `<span class="source-tag source-online"><i class="fa-solid fa-globe"></i> Online</span>`;

    const downloadBtn = song.downloaded
      ? `<span class="row-btn" title="Đã lưu offline"><i class="fa-solid fa-check" style="color:#10B981;"></i></span>`
      : `<button class="row-btn btn-download" onclick="downloadSong('${song.id}', event)" title="Tải về máy nghe offline"><i class="fa-solid fa-cloud-arrow-down"></i></button>`;

    return `
      <tr class="playlist-row ${isCurrent ? 'active' : ''}" onclick="loadSongIntoPlayer(${originalIndex}, true)">
        <td class="col-idx">
          <div class="song-idx-wrap">
            ${isSongPlaying ? `
              <div class="active-bars">
                <span></span><span></span><span></span>
              </div>
            ` : `
              <span class="idx-num">${idx + 1}</span>
              <i class="fa-solid fa-play idx-play"></i>
            `}
          </div>
        </td>
        <td>
          <div class="song-cell">
            <img src="${song.thumbnail || 'https://via.placeholder.com/44'}" class="table-thumb" alt="Thumb">
            <div class="song-meta-wrap">
              <span class="song-name" title="${song.title}">${song.title}</span>
              <span class="song-artist-name">${song.artist || 'Nghệ sĩ'}</span>
            </div>
          </div>
        </td>
        <td class="col-duration">${song.duration || '--:--'}</td>
        <td class="col-source">${sourceTag}</td>
        <td class="col-actions">
          <div class="row-actions">
            ${downloadBtn}
            <button class="row-btn btn-del" onclick="deleteSong('${song.id}', event)" title="Xóa khỏi Playlist">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateActiveRowInTable() {
  const rows = document.querySelectorAll('.playlist-row');
  rows.forEach((row, idx) => {
    row.classList.toggle('active', idx === currentSongIndex);
  });
}

function updateStats() {
  statTotal.textContent = playlist.length;
  statOffline.textContent = playlist.filter(s => s.downloaded).length;
}

playlistFilterInput.addEventListener('input', (e) => {
  currentSearchTermInPlaylist = e.target.value.trim();
  clearFilterBtn.style.display = currentSearchTermInPlaylist ? 'block' : 'none';
  renderPlaylist();
});

clearFilterBtn.addEventListener('click', () => {
  playlistFilterInput.value = '';
  currentSearchTermInPlaylist = '';
  clearFilterBtn.style.display = 'none';
  renderPlaylist();
});

playlistSortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderPlaylist();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderPlaylist();
  });
});

// --- 6. Search & Confirm Workflow (Max 16, Show 8 + Xem thêm) ---
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  searchSubmitBtn.disabled = true;
  searchSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tìm...';
  
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.success) {
      currentSearchResults = data.results || [];
      displayedSearchResultsCount = 8;
      renderSearchResults(query);
    } else {
      showToast(data.message || 'Lỗi khi tìm kiếm', 'error');
    }
  } catch (err) {
    showToast('Không thể kết nối đến máy chủ tìm kiếm', 'error');
  } finally {
    searchSubmitBtn.disabled = false;
    searchSubmitBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Tìm kiếm';
  }
});

function renderSearchResults(query) {
  resultQueryText.textContent = `cho "${query}"`;
  resultsCountBadge.textContent = `${currentSearchResults.length} bài hát tìm được`;
  searchResultsContainer.classList.remove('hidden');

  if (currentSearchResults.length === 0) {
    searchResultsList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94A3B8; padding: 20px;">Không tìm thấy bài hát nào khớp. Bạn thử gõ một câu ngắn hơn xem sao nhé!</div>`;
    loadMoreContainer.classList.add('hidden');
    return;
  }

  const visibleItems = currentSearchResults.slice(0, displayedSearchResultsCount);

  searchResultsList.innerHTML = visibleItems.map(item => {
    const isAlreadyInPlaylist = playlist.some(s => s.id === item.id || s.videoId === item.videoId);
    const isPreviewing = currentPreviewSong && (currentPreviewSong.id === item.id || currentPreviewSong.videoId === item.videoId) && isPlaying;

    return `
      <div class="candidate-card" id="card-${item.id}">
        <div class="candidate-thumb-wrapper">
          <img src="${item.thumbnail}" class="candidate-thumb" alt="${item.title}">
          <span class="candidate-duration">${item.duration}</span>
        </div>
        <div class="candidate-info">
          <h4 class="candidate-title" title="${item.title}">${item.title}</h4>
          <span class="candidate-artist"><i class="fa-solid fa-microphone-lines"></i> ${item.artist}</span>
        </div>
        <div class="candidate-actions">
          <button class="btn-preview ${isPreviewing ? 'playing' : ''}" onclick="previewSong(${JSON.stringify(item).replace(/"/g, '&quot;')})">
            <i class="fa-solid ${isPreviewing ? 'fa-pause' : 'fa-play'}"></i> Nghe thử
          </button>
          <button class="btn-add-playlist ${isAlreadyInPlaylist ? 'added' : ''}" 
                  id="btn-add-${item.id}"
                  ${isAlreadyInPlaylist ? 'disabled' : ''}
                  onclick="confirmAddToPlaylist(${JSON.stringify(item).replace(/"/g, '&quot;')})">
            <i class="fa-solid ${isAlreadyInPlaylist ? 'fa-check' : 'fa-plus'}"></i> 
            ${isAlreadyInPlaylist ? 'Đã trong list' : 'Thêm Playlist'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (currentSearchResults.length > displayedSearchResultsCount) {
    const remaining = currentSearchResults.length - displayedSearchResultsCount;
    loadMoreRemaining.textContent = remaining;
    loadMoreContainer.classList.remove('hidden');
  } else {
    loadMoreContainer.classList.add('hidden');
  }

  searchResultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

btnLoadMore.addEventListener('click', () => {
  displayedSearchResultsCount = currentSearchResults.length;
  renderSearchResults(searchInput.value.trim());
  showToast('Đã mở rộng toàn bộ 16 bài hát kết quả tìm kiếm!', 'info');
});

function previewSong(song) {
  if (currentPreviewSong && (currentPreviewSong.id === song.id || currentPreviewSong.videoId === song.videoId) && isPlaying) {
    togglePlayPause();
    return;
  }

  currentPreviewSong = song;
  currentSongIndex = -1;
  playSong(song, true);
  showToast(`Đang nghe thử: "${song.title}"`);
  updatePreviewButtonsState();
}

function updatePreviewButtonsState() {
  document.querySelectorAll('.btn-preview').forEach(btn => {
    btn.classList.remove('playing');
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Nghe thử';
  });

  if (currentPreviewSong && isPlaying) {
    const activeCard = document.getElementById(`card-${currentPreviewSong.id || currentPreviewSong.videoId}`);
    if (activeCard) {
      const activeBtn = activeCard.querySelector('.btn-preview');
      if (activeBtn) {
        activeBtn.classList.add('playing');
        activeBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Tạm dừng';
      }
    }
  }
}

async function confirmAddToPlaylist(song) {
  const songId = song.id || song.videoId;
  const addBtn = document.getElementById(`btn-add-${songId}`);
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang thêm...';
  }

  try {
    const res = await fetch('/api/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...song,
        query: searchInput.value.trim()
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Đã thêm "${song.title}" vào Playlist!`, 'success');
      if (addBtn) {
        addBtn.className = 'btn-add-playlist added';
        addBtn.innerHTML = '<i class="fa-solid fa-check"></i> Đã trong list';
      }
      fetchPlaylist();
    } else {
      showToast(data.message || 'Lỗi thêm bài hát', 'error');
      if (addBtn) addBtn.disabled = false;
    }
  } catch (err) {
    showToast('Lỗi kết nối khi thêm vào playlist', 'error');
    if (addBtn) addBtn.disabled = false;
  }
}

// --- 7. Delete & Download Actions ---
async function deleteSong(songId, event) {
  event.stopPropagation();
  if (!confirm('Bạn có chắc muốn xóa bài này khỏi Playlist không?')) return;

  try {
    const res = await fetch(`/api/playlist/${songId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa bài hát khỏi Playlist');
      if (currentSongIndex >= 0 && playlist[currentSongIndex]?.id === songId) {
        audio.pause();
        setPlayingState(false);
        currentSongIndex = -1;
      }
      fetchPlaylist();
    }
  } catch (err) {
    showToast('Lỗi khi xóa bài hát', 'error');
  }
}

async function downloadSong(songId, event) {
  if (event) event.stopPropagation();
  showToast('Đang tải bài hát về máy, chỉ mất khoảng 2-3 giây...', 'info');

  try {
    const res = await fetch(`/api/download/${songId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Đã tải xong: "${data.song?.title || 'Bài hát'}"! Giờ có thể nghe offline`, 'success');
      fetchPlaylist();
    } else {
      showToast(data.message || 'Lỗi khi tải bài hát', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi tải bài hát', 'error');
  }
}

downloadCurrentBtn.addEventListener('click', () => {
  const currentSong = currentSongIndex >= 0 ? playlist[currentSongIndex] : currentPreviewSong;
  if (!currentSong) {
    showToast('Chưa có bài nào đang phát', 'info');
    return;
  }
  downloadSong(currentSong.id || currentSong.videoId);
});

// Quick tags click
document.querySelectorAll('.tag-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    searchInput.value = btn.dataset.query;
    clearSearchBtn.style.display = 'block';
    searchForm.dispatchEvent(new Event('submit'));
  });
});

searchInput.addEventListener('input', () => {
  clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  searchInput.focus();
});

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  }
});

// Toast notification helper
function showToast(message, type = 'info') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3500);
}

// Initial Boot
fetchPlaylist();

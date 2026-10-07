const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const yts = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3300;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

const PLAYLIST_FILE = path.join(__dirname, 'data', 'playlist.json');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const YTDLP_BIN = process.platform === 'win32'
  ? path.join(__dirname, 'yt-dlp.exe')
  : (fs.existsSync(path.join(__dirname, 'yt-dlp')) ? path.join(__dirname, 'yt-dlp') : 'yt-dlp');

// Helper to read playlist
function readPlaylist() {
  try {
    if (!fs.existsSync(PLAYLIST_FILE)) {
      fs.writeFileSync(PLAYLIST_FILE, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(PLAYLIST_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading playlist:', err.message);
    return [];
  }
}

// Helper to write playlist
function writePlaylist(list) {
  try {
    fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing playlist:', err.message);
    return false;
  }
}

// Find if local audio file exists for a songId
function findLocalAudioFile(songId) {
  const possibleExts = ['.mp4', '.m4a', '.mp3', '.webm', '.opus'];
  for (const ext of possibleExts) {
    const fPath = path.join(DOWNLOADS_DIR, `${songId}${ext}`);
    if (fs.existsSync(fPath)) {
      return {
        fullPath: fPath,
        relPath: `/downloads/${songId}${ext}`,
        ext
      };
    }
  }
  return null;
}

// Active downloading promises to prevent duplicate downloads
const activeDownloads = new Map();

// Robust download function using execFile and android player client
function downloadAudio(songId) {
  const existing = findLocalAudioFile(songId);
  if (existing) {
    return Promise.resolve(existing);
  }

  if (activeDownloads.has(songId)) {
    return activeDownloads.get(songId);
  }

  const p = new Promise((resolve, reject) => {
    const outputPattern = path.join(DOWNLOADS_DIR, `${songId}.%(ext)s`);
    const args = [
      '--extractor-args', 'youtube:player_client=android,web',
      '-f', 'ba[ext=m4a]/ba/b',
      '-o', outputPattern,
      '--no-playlist',
      `https://www.youtube.com/watch?v=${songId}`
    ];

    console.log(`[Download] Đang tải audio cho ${songId}...`);
    execFile(YTDLP_BIN, args, (error, stdout, stderr) => {
      activeDownloads.delete(songId);
      if (error) {
        console.error(`[Download Error] ${songId}:`, error.message);
        return reject(new Error('Lỗi khi tải file: ' + error.message));
      }

      const found = findLocalAudioFile(songId);
      if (found) {
        console.log(`[Download Success] Đã lưu file: ${found.relPath}`);
        resolve(found);
      } else {
        reject(new Error('Tải xong nhưng không tìm thấy file audio trên đĩa'));
      }
    });
  });

  activeDownloads.set(songId, p);
  return p;
}

// 1. Get Playlist
app.get('/api/playlist', (req, res) => {
  const playlist = readPlaylist();
  // Auto-sync downloaded status with files on disk
  let changed = false;
  playlist.forEach(s => {
    const f = findLocalAudioFile(s.id || s.videoId);
    if (f && (!s.downloaded || !s.localFile)) {
      s.downloaded = true;
      s.localFile = f.relPath;
      changed = true;
    }
  });
  if (changed) writePlaylist(playlist);

  res.json({ success: true, data: playlist });
});

// 2. Add Song to Playlist
app.post('/api/playlist', (req, res) => {
  const { id, title, artist, duration, thumbnail, videoId, query } = req.body;
  if (!id && !videoId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin bài hát (id / videoId)' });
  }

  const songId = id || videoId;
  const playlist = readPlaylist();

  // Check if exists
  const existingIndex = playlist.findIndex(s => s.id === songId || s.videoId === songId);
  if (existingIndex !== -1) {
    return res.json({ 
      success: true, 
      message: 'Bài hát đã có sẵn trong Playlist!', 
      song: playlist[existingIndex],
      alreadyExists: true 
    });
  }

  const local = findLocalAudioFile(songId);

  const newSong = {
    id: songId,
    videoId: songId,
    title: title || 'Không rõ tên bài hát',
    artist: artist || 'Chưa rõ nghệ sĩ',
    duration: duration || '0:00',
    thumbnail: thumbnail || '',
    query: query || '',
    addedAt: new Date().toISOString(),
    downloaded: !!local,
    localFile: local ? local.relPath : null
  };

  playlist.unshift(newSong);
  writePlaylist(playlist);

  res.json({ success: true, message: 'Đã thêm vào Playlist thành công!', song: newSong, playlist });
});

// 3. Delete Song
app.delete('/api/playlist/:id', (req, res) => {
  const songId = req.params.id;
  let playlist = readPlaylist();
  
  const song = playlist.find(s => s.id === songId);
  playlist = playlist.filter(s => s.id !== songId);
  writePlaylist(playlist);

  // If local file exists, remove it
  const local = findLocalAudioFile(songId);
  if (local) {
    try { fs.unlinkSync(local.fullPath); } catch (e) {}
  }

  res.json({ success: true, message: 'Đã xóa bài hát khỏi Playlist', playlist });
});

// 4. Search Songs (by title, lyric, artist) - up to 16 items
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query || !query.trim()) {
    return res.json({ success: true, results: [] });
  }

  try {
    const cleanQ = query.trim();
    const searchTerms = cleanQ.toLowerCase().startsWith('bài hát') || cleanQ.toLowerCase().startsWith('lời') 
      ? cleanQ 
      : `${cleanQ} audio`;

    const r = await yts(searchTerms);
    const videos = (r.videos || []).slice(0, 16).map(v => ({
      id: v.videoId,
      videoId: v.videoId,
      title: v.title,
      artist: v.author?.name || 'YouTube Music',
      duration: v.timestamp || '0:00',
      thumbnail: v.thumbnail || '',
      views: v.views ? v.views.toLocaleString('vi-VN') : '',
      ago: v.ago || ''
    }));

    res.json({ success: true, query: cleanQ, results: videos });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, message: 'Lỗi tìm kiếm: ' + err.message });
  }
});

// 5. Download MP3 / Audio offline
app.post('/api/download/:id', async (req, res) => {
  const songId = req.params.id;
  const playlist = readPlaylist();
  const song = playlist.find(s => s.id === songId);

  try {
    const file = await downloadAudio(songId);
    if (song) {
      song.downloaded = true;
      song.localFile = file.relPath;
      writePlaylist(playlist);
    }
    return res.json({ success: true, message: 'Đã tải bài hát về máy thành công!', file, song });
  } catch (err) {
    console.error('Download error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Direct Audio Stream Endpoint (Chỉ nghe âm thanh, không cần video)
app.get('/api/stream/:id', async (req, res) => {
  const songId = req.params.id;
  
  // 1. If file exists on disk, serve instantly
  const existing = findLocalAudioFile(songId);
  if (existing) {
    return res.sendFile(existing.fullPath);
  }

  // 2. Fetch and cache in background, then serve
  try {
    console.log(`[Stream] Đang chuẩn bị audio cho bài ${songId}...`);
    const file = await downloadAudio(songId);
    return res.sendFile(file.fullPath);
  } catch (err) {
    console.error('[Stream Error]', err.message);
    return res.status(500).send('Không thể phát bài hát này: ' + err.message);
  }
});

// 7. Status check
app.get('/api/status', (req, res) => {
  const playlist = readPlaylist();
  res.json({
    status: 'online',
    totalSongs: playlist.length,
    downloadedCount: playlist.filter(s => s.downloaded).length
  });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🎵 Music Xuân Công đang chạy tại:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`===============================================`);
});

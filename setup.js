const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running setup build for platform:', process.platform);

if (process.platform !== 'win32') {
  const ytDlpPath = path.join(__dirname, 'yt-dlp');
  if (!fs.existsSync(ytDlpPath)) {
    console.log('Downloading standalone yt-dlp binary for Linux...');
    try {
      execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp && chmod a+rx yt-dlp', { stdio: 'inherit' });
      console.log('yt-dlp Linux binary downloaded successfully.');
    } catch (err) {
      console.error('Failed to download yt-dlp:', err.message);
    }
  }
} else {
  console.log('Windows platform detected, using existing yt-dlp.exe.');
}

// Ensure data and downloads directories exist
const dataDir = path.join(__dirname, 'data');
const dlDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });
if (!fs.existsSync(path.join(dataDir, 'playlist.json'))) {
  fs.writeFileSync(path.join(dataDir, 'playlist.json'), '[]', 'utf8');
}

console.log('Setup completed successfully.');

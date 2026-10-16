// State
let serverPort = 0;
let currentFolder = '';
let mediaData = null;
let selectedDate = null;
let currentFilter = 'all'; // 'all' | 'motion' | 'regular'
let currentVideoList = [];
let currentVideoIndex = -1;
let currentClip = null;
let isDraggingTimeline = false;
let playbackSpeeds = [0.5, 1.0, 1.5, 2.0, 4.0, 8.0];
let currentSpeedIndex = 1;
let isFlipped = true; // Default 180 degree flip

// DOM Elements
const video = document.getElementById('main-video');
const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnBackward = document.getElementById('btn-backward-10');
const btnForward = document.getElementById('btn-forward-10');
const btnPrevClip = document.getElementById('btn-prev-clip');
const btnNextClip = document.getElementById('btn-next-clip');
const btnSpeed = document.getElementById('btn-speed');
const btnVolume = document.getElementById('btn-volume');
const iconVolOn = document.getElementById('icon-vol-on');
const iconVolMute = document.getElementById('icon-vol-mute');
const btnFlip = document.getElementById('btn-flip');
const btnSnapshot = document.getElementById('btn-snapshot');
const btnExport = document.getElementById('btn-export');
const btnFullscreen = document.getElementById('btn-fullscreen');
const clipScrubber = document.getElementById('clip-scrubber');
const currentClipTime = document.getElementById('current-clip-time');
const currentClipDuration = document.getElementById('current-clip-duration');
const overlayDate = document.getElementById('overlay-date');
const overlayTime = document.getElementById('overlay-time');
const overlayType = document.getElementById('overlay-type');
const playerSpinner = document.getElementById('player-spinner');
const snapshotFlash = document.getElementById('snapshot-flash');
const statusBadge = document.getElementById('status-badge');
const folderNameLabel = document.getElementById('current-folder-name');
const btnChangeFolder = document.getElementById('btn-change-folder');

// Timeline Elements
const timelineBar = document.getElementById('timeline-bar');
const timelineSegmentsLayer = document.getElementById('timeline-segments-layer');
const timelineMotionLayer = document.getElementById('timeline-motion-layer');
const timelineNeedle = document.getElementById('timeline-needle');
const timelineTooltip = document.getElementById('timeline-tooltip');
const timelineHoverIndicator = document.getElementById('timeline-hover-time');

// Tabs & Views
const tabTimeline = document.getElementById('tab-timeline');
const tabPhotos = document.getElementById('tab-photos');
const viewTimeline = document.getElementById('view-timeline');
const viewPhotos = document.getElementById('view-photos');
const snapshotsCountBadge = document.getElementById('snapshots-count-badge');
const datesListEl = document.getElementById('dates-list');
const clipsListEl = document.getElementById('clips-list');
const clipsCountEl = document.getElementById('clips-count');
const photosGrid = document.getElementById('photos-grid');

// Modal
const photoModal = document.getElementById('photo-modal');
const modalImg = document.getElementById('modal-img');
const modalTime = document.getElementById('modal-time');
const modalClose = document.getElementById('modal-close');
const modalBtnFinder = document.getElementById('modal-btn-finder');
const modalBtnDownload = document.getElementById('modal-btn-download');
let activeModalPhoto = null;

// Helpers
function formatSeconds(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function format24hSeconds(sec) {
  sec = Math.max(0, Math.floor(sec)) % 86400;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setFlipState(flipped) {
  isFlipped = flipped;
  video.classList.toggle('flipped', isFlipped);
  if (btnFlip) {
    btnFlip.classList.toggle('active', isFlipped);
  }
  document.querySelectorAll('.photo-card img').forEach(img => {
    img.classList.toggle('flipped', isFlipped);
  });
  if (modalImg) {
    modalImg.classList.toggle('flipped', isFlipped);
  }
}

// App Initialization
async function init() {
  serverPort = await window.electronAPI.getServerPort();
  currentFolder = await window.electronAPI.getDefaultFolder();
  folderNameLabel.textContent = currentFolder.split(/[\\/]/).pop() || 'files';
  
  setFlipState(true); // Default 180 flip
  await loadAndScanFolder(currentFolder);
  setupEventListeners();
}

async function loadAndScanFolder(folderPath) {
  statusBadge.textContent = 'Scanning...';
  try {
    mediaData = await window.electronAPI.scanFolder(folderPath);
    const dateKeys = Object.keys(mediaData.dates);
    if (dateKeys.length === 0) {
      statusBadge.textContent = 'No media found';
      return;
    }

    selectedDate = dateKeys[0];
    statusBadge.textContent = `${mediaData.totalVideos} Videos • ${mediaData.totalPhotos} Photos`;
    renderSidebarDates();
    selectDate(selectedDate);
  } catch (err) {
    statusBadge.textContent = 'Error scanning';
    console.error(err);
  }
}

// Render Dates in Sidebar
function renderSidebarDates() {
  datesListEl.innerHTML = '';
  const dateKeys = Object.keys(mediaData.dates);

  dateKeys.forEach(date => {
    const d = mediaData.dates[date];
    const item = document.createElement('div');
    item.className = `sidebar-item ${date === selectedDate ? 'active' : ''}`;
    item.innerHTML = `
      <span>${date}</span>
      <span class="count-tag">${d.videos.length} clips</span>
    `;
    item.addEventListener('click', () => selectDate(date));
    datesListEl.appendChild(item);
  });
}

function selectDate(date) {
  selectedDate = date;
  renderSidebarDates();
  applyFilterAndRender();
  renderTimelineLayers();
  renderPhotosGrid();

  const totalSnapshots = mediaData.dates[selectedDate] ? mediaData.dates[selectedDate].photos.length : 0;
  snapshotsCountBadge.textContent = totalSnapshots;

  if (currentVideoList.length > 0) {
    playVideoByIndex(0);
  }
}

// Filter Clips
function applyFilterAndRender() {
  if (!mediaData || !selectedDate || !mediaData.dates[selectedDate]) return;

  const allClips = mediaData.dates[selectedDate].videos;
  if (currentFilter === 'motion') {
    currentVideoList = allClips.filter(c => c.recordType === 'motion');
  } else if (currentFilter === 'regular') {
    currentVideoList = allClips.filter(c => c.recordType === 'regular');
  } else {
    currentVideoList = [...allClips];
  }

  clipsCountEl.textContent = currentVideoList.length;
  renderClipsList();
}

function renderClipsList() {
  clipsListEl.innerHTML = '';
  currentVideoList.forEach((clip, index) => {
    const row = document.createElement('div');
    row.className = `clip-row ${index === currentVideoIndex ? 'active' : ''}`;
    row.innerHTML = `
      <span class="clip-badge ${clip.recordType}">${clip.recordType === 'motion' ? 'M' : 'R'}</span>
      <span class="clip-time">${clip.startTime} - ${clip.endTime}</span>
    `;
    row.addEventListener('click', () => playVideoByIndex(index));
    clipsListEl.appendChild(row);
  });
}

// Video Playback
function playVideoByIndex(index, seekSec = 0) {
  if (index < 0 || index >= currentVideoList.length) return;
  currentVideoIndex = index;
  currentClip = currentVideoList[index];

  renderClipsList();
  
  // Highlight active row in sidebar scroll
  const activeRow = clipsListEl.children[index];
  if (activeRow) {
    activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  overlayDate.textContent = currentClip.date;
  overlayTime.textContent = currentClip.startTime;
  overlayType.textContent = currentClip.recordType === 'motion' ? 'Motion Alert' : 'Continuous';
  overlayType.className = `overlay-tag type-tag ${currentClip.recordType}`;

  playerSpinner.classList.remove('hidden');

  const streamUrl = `http://127.0.0.1:${serverPort}/video?file=${encodeURIComponent(currentClip.filePath)}`;
  video.src = streamUrl;
  video.playbackRate = playbackSpeeds[currentSpeedIndex];

  video.onloadedmetadata = () => {
    playerSpinner.classList.add('hidden');
    clipScrubber.max = video.duration || currentClip.duration;
    currentClipDuration.textContent = formatSeconds(video.duration || currentClip.duration);
    if (seekSec > 0) {
      video.currentTime = Math.min(seekSec, video.duration - 0.5);
    }
    video.play().catch(() => {});
  };
}

// 24-Hour Timeline Rendering
function renderTimelineLayers() {
  timelineSegmentsLayer.innerHTML = '';
  timelineMotionLayer.innerHTML = '';

  if (!mediaData || !selectedDate || !mediaData.dates[selectedDate]) return;

  const dateData = mediaData.dates[selectedDate];

  // Draw continuous video segments
  dateData.videos.forEach(v => {
    const startPct = (v.startSec / 86400) * 100;
    const durationPct = Math.max(0.1, (v.duration / 86400) * 100);
    const chunk = document.createElement('div');
    chunk.className = `timeline-chunk ${v.recordType}`;
    chunk.style.left = `${startPct}%`;
    chunk.style.width = `${durationPct}%`;
    chunk.title = `${v.startTime} - ${v.endTime} (${v.recordType})`;
    timelineSegmentsLayer.appendChild(chunk);
  });

  // Draw motion detection photo markers
  dateData.photos.forEach(p => {
    const pct = (p.secFromMidnight / 86400) * 100;
    const marker = document.createElement('div');
    marker.className = 'motion-marker';
    marker.style.left = `${pct}%`;
    marker.title = `Motion snapshot: ${p.time}`;
    timelineMotionLayer.appendChild(marker);
  });
}

// Timeline Click & Drag Seeking
function seekTimelineAtEvent(e) {
  const rect = timelineBar.getBoundingClientRect();
  const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const pct = clickX / rect.width;
  const targetSec = Math.floor(pct * 86400);

  // Position needle
  timelineNeedle.style.left = `${pct * 100}%`;

  if (!mediaData || !selectedDate) return;
  const videos = mediaData.dates[selectedDate].videos;

  // Find clip containing targetSec
  let targetIndex = videos.findIndex(v => targetSec >= v.startSec && targetSec < v.endSec);

  if (targetIndex !== -1) {
    const clip = videos[targetIndex];
    const offset = targetSec - clip.startSec;
    // Map to current filtered video list if possible
    const filteredIdx = currentVideoList.findIndex(v => v.id === clip.id);
    if (filteredIdx !== -1) {
      if (filteredIdx === currentVideoIndex) {
        video.currentTime = offset;
      } else {
        playVideoByIndex(filteredIdx, offset);
      }
    } else {
      // Switch filter to all if needed
      currentFilter = 'all';
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));
      applyFilterAndRender();
      const newIdx = currentVideoList.findIndex(v => v.id === clip.id);
      playVideoByIndex(newIdx !== -1 ? newIdx : 0, offset);
    }
  } else {
    // Jump to nearest upcoming clip
    const nextClip = videos.find(v => v.startSec > targetSec);
    if (nextClip) {
      const filteredIdx = currentVideoList.findIndex(v => v.id === nextClip.id);
      if (filteredIdx !== -1) {
        playVideoByIndex(filteredIdx, 0);
      }
    }
  }
}

// Render Photos Gallery
function renderPhotosGrid() {
  photosGrid.innerHTML = '';
  if (!mediaData || !selectedDate || !mediaData.dates[selectedDate]) return;

  const photos = mediaData.dates[selectedDate].photos;
  if (photos.length === 0) {
    photosGrid.innerHTML = '<div style="color: var(--mac-text-secondary); grid-column: 1/-1; text-align: center; padding: 40px;">No motion snapshots for this date.</div>';
    return;
  }

  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    const photoUrl = `http://127.0.0.1:${serverPort}/photo?file=${encodeURIComponent(photo.filePath)}`;
    card.innerHTML = `
      <div class="photo-card-img-wrap">
        <img src="${photoUrl}" class="${isFlipped ? 'flipped' : ''}" loading="lazy" alt="Snapshot at ${photo.time}">
      </div>
      <div class="photo-card-info">
        <span class="photo-card-time">${photo.time}</span>
        <span class="photo-card-badge">Motion</span>
      </div>
    `;
    card.addEventListener('click', () => openPhotoModal(photo, photoUrl));
    photosGrid.appendChild(card);
  });
}

function openPhotoModal(photo, photoUrl) {
  activeModalPhoto = photo;
  modalImg.src = photoUrl;
  modalImg.classList.toggle('flipped', isFlipped);
  modalTime.textContent = `${photo.date} • ${photo.time} (Motion Sensor Alert)`;
  photoModal.classList.remove('hidden');
}

// Snapshot Capture from Video
async function captureVideoSnapshot() {
  if (!video || video.readyState < 2) return;

  // Flash effect
  snapshotFlash.classList.add('active');
  setTimeout(() => snapshotFlash.classList.remove('active'), 250);

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1920;
  canvas.height = video.videoHeight || 1080;
  const ctx = canvas.getContext('2d');

  if (isFlipped) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const currentAbsoluteSec = currentClip ? (currentClip.startSec + video.currentTime) : 0;
  const defaultName = `snapshot_${selectedDate}_${format24hSeconds(currentAbsoluteSec).replace(/:/g, '-')}.jpg`;

  statusBadge.textContent = 'Saving snapshot...';
  const result = await window.electronAPI.saveSnapshot(dataUrl, defaultName);
  if (result.success) {
    statusBadge.textContent = 'Snapshot saved!';
  } else if (!result.canceled) {
    statusBadge.textContent = 'Error saving snapshot';
  } else {
    statusBadge.textContent = 'Ready';
  }
}

// Export Video MP4
async function exportCurrentVideo() {
  if (!currentClip) return;
  statusBadge.textContent = 'Exporting MP4...';
  const result = await window.electronAPI.exportVideo(currentClip.filePath);
  if (result.success) {
    statusBadge.textContent = 'Export complete!';
  } else if (!result.canceled) {
    statusBadge.textContent = 'Export failed';
  } else {
    statusBadge.textContent = 'Ready';
  }
}

// Event Listeners Setup
function setupEventListeners() {
  // Video Time Update & Seamless Playback
  video.addEventListener('timeupdate', () => {
    clipScrubber.value = video.currentTime;
    currentClipTime.textContent = formatSeconds(video.currentTime);

    if (currentClip) {
      const absoluteSec = currentClip.startSec + video.currentTime;
      overlayTime.textContent = format24hSeconds(absoluteSec);

      // Move 24h timeline needle
      const needlePct = (absoluteSec / 86400) * 100;
      timelineNeedle.style.left = `${needlePct}%`;
    }
  });

  video.addEventListener('ended', () => {
    // Seamless continuous playback: automatically advance to next segment!
    if (currentVideoIndex < currentVideoList.length - 1) {
      playVideoByIndex(currentVideoIndex + 1);
    }
  });

  video.addEventListener('play', () => {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  });

  video.addEventListener('pause', () => {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  });

  video.addEventListener('waiting', () => {
    playerSpinner.classList.remove('hidden');
  });

  video.addEventListener('playing', () => {
    playerSpinner.classList.add('hidden');
  });

  // Play / Pause Button
  btnPlayPause.addEventListener('click', () => {
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  // Backward / Forward 10s
  btnBackward.addEventListener('click', () => {
    video.currentTime = Math.max(0, video.currentTime - 10);
  });

  btnForward.addEventListener('click', () => {
    video.currentTime = Math.min(video.duration, video.currentTime + 10);
  });

  // Previous / Next Clip
  btnPrevClip.addEventListener('click', () => {
    if (currentVideoIndex > 0) {
      playVideoByIndex(currentVideoIndex - 1);
    }
  });

  btnNextClip.addEventListener('click', () => {
    if (currentVideoIndex < currentVideoList.length - 1) {
      playVideoByIndex(currentVideoIndex + 1);
    }
  });

  // Scrubber within clip
  clipScrubber.addEventListener('input', () => {
    video.currentTime = parseFloat(clipScrubber.value);
  });

  // Speed Toggle
  btnSpeed.addEventListener('click', () => {
    currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
    const speed = playbackSpeeds[currentSpeedIndex];
    btnSpeed.textContent = `${speed.toFixed(1)}x`;
    video.playbackRate = speed;
  });

  // Volume & Mute Toggle
  if (btnVolume) {
    btnVolume.addEventListener('click', () => {
      video.muted = !video.muted;
      iconVolOn.classList.toggle('hidden', video.muted);
      iconVolMute.classList.toggle('hidden', !video.muted);
    });
  }

  // Flip Toggle
  if (btnFlip) {
    btnFlip.addEventListener('click', () => {
      setFlipState(!isFlipped);
    });
  }

  // Snapshot & Export
  btnSnapshot.addEventListener('click', captureVideoSnapshot);
  btnExport.addEventListener('click', exportCurrentVideo);

  // Fullscreen
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.querySelector('.player-container').requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 24-Hour Timeline Events
  timelineBar.addEventListener('mousedown', (e) => {
    isDraggingTimeline = true;
    seekTimelineAtEvent(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingTimeline) {
      seekTimelineAtEvent(e);
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingTimeline = false;
  });

  // Hover Tooltip on Timeline
  timelineBar.addEventListener('mousemove', (e) => {
    const rect = timelineBar.getBoundingClientRect();
    const hoverX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const hoverSec = Math.floor((hoverX / rect.width) * 86400);
    const timeStr = format24hSeconds(hoverSec);

    timelineHoverIndicator.textContent = timeStr;
    timelineTooltip.classList.remove('hidden');
    timelineTooltip.style.left = `${hoverX}px`;
    timelineTooltip.querySelector('.tooltip-time').textContent = timeStr;

    // Check if hover matches a recording
    if (mediaData && selectedDate) {
      const match = mediaData.dates[selectedDate].videos.find(v => hoverSec >= v.startSec && hoverSec < v.endSec);
      timelineTooltip.querySelector('.tooltip-type').textContent = match ? (match.recordType === 'motion' ? 'Motion Alert' : 'Recorded Clip') : 'No Recording';
    }
  });

  timelineBar.addEventListener('mouseleave', () => {
    timelineTooltip.classList.add('hidden');
    timelineHoverIndicator.textContent = '--:--:--';
  });

  // Filter Pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      applyFilterAndRender();
      if (currentVideoList.length > 0) {
        playVideoByIndex(0);
      }
    });
  });

  // Tab View Switcher
  tabTimeline.addEventListener('click', () => {
    tabTimeline.classList.add('active');
    tabPhotos.classList.remove('active');
    viewTimeline.classList.add('active');
    viewPhotos.classList.remove('active');
  });

  tabPhotos.addEventListener('click', () => {
    tabPhotos.classList.add('active');
    tabTimeline.classList.remove('active');
    viewPhotos.classList.add('active');
    viewTimeline.classList.remove('active');
  });

  // Modal Lightbox Handlers
  modalClose.addEventListener('click', () => photoModal.classList.add('hidden'));
  photoModal.addEventListener('click', (e) => {
    if (e.target === photoModal) photoModal.classList.add('hidden');
  });

  modalBtnFinder.addEventListener('click', () => {
    if (activeModalPhoto) {
      window.electronAPI.revealInFinder(activeModalPhoto.filePath);
    }
  });

  modalBtnDownload.addEventListener('click', async () => {
    if (!activeModalPhoto) return;
    const response = await fetch(modalImg.src);
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onloadend = async () => {
      await window.electronAPI.saveSnapshot(reader.result, activeModalPhoto.filename);
    };
    reader.readAsDataURL(blob);
  });

  // Folder Change Button
  btnChangeFolder.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectFolder();
    if (selected) {
      currentFolder = selected;
      folderNameLabel.textContent = currentFolder.split(/[\\/]/).pop() || 'Folder';
      await loadAndScanFolder(currentFolder);
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      btnPlayPause.click();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (e.shiftKey) {
        btnPrevClip.click();
      } else {
        btnBackward.click();
      }
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      if (e.shiftKey) {
        btnNextClip.click();
      } else {
        btnForward.click();
      }
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      if (btnVolume) btnVolume.click();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      captureVideoSnapshot();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      setFlipState(!isFlipped);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      btnFullscreen.click();
    } else if (e.key === 'Escape') {
      if (!photoModal.classList.contains('hidden')) {
        photoModal.classList.add('hidden');
      }
    }
  });

  // Native Menu Listeners
  if (window.electronAPI.onLoadFolder) {
    window.electronAPI.onLoadFolder(async (folder) => {
      if (folder) {
        currentFolder = folder;
        folderNameLabel.textContent = currentFolder.split(/[\\/]/).pop() || 'Folder';
        await loadAndScanFolder(currentFolder);
      }
    });
  }

  if (window.electronAPI.onTriggerFlip) {
    window.electronAPI.onTriggerFlip(() => {
      setFlipState(!isFlipped);
    });
  }

  // Drag and Drop folder support
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const targetPath = droppedFile.path;
      if (targetPath) {
        currentFolder = targetPath;
        folderNameLabel.textContent = currentFolder.split(/[\\/]/).pop() || 'Folder';
        await loadAndScanFolder(currentFolder);
      }
    }
  });
}

// Start app
window.addEventListener('DOMContentLoaded', init);

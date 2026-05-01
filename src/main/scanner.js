const fs = require('fs');
const path = require('path');

function scanDirectory(rootDir) {
  const result = {
    folderPath: rootDir,
    dates: {}, // date -> { videos: [], photos: [], channels: new Set() }
    totalVideos: 0,
    totalPhotos: 0
  };

  if (!fs.existsSync(rootDir)) {
    return result;
  }

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        parseFile(fullPath, result);
      }
    }
  }

  walk(rootDir);

  // Convert Sets to Arrays and sort items chronologically
  const sortedDates = {};
  const dateKeys = Object.keys(result.dates).sort();

  for (const dateKey of dateKeys) {
    const d = result.dates[dateKey];
    d.channels = Array.from(d.channels).sort();
    d.videos.sort((a, b) => a.startSec - b.startSec);
    d.photos.sort((a, b) => a.secFromMidnight - b.secFromMidnight);
    sortedDates[dateKey] = d;
  }

  result.dates = sortedDates;
  return result;
}

function parseFile(filePath, result) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.dav' && ext !== '.jpg' && ext !== '.jpeg') {
    return;
  }

  const parts = filePath.split(path.sep);
  const dateIdx = parts.findIndex(p => /^\d{4}-\d{2}-\d{2}$/.test(p));
  const date = dateIdx !== -1 ? parts[dateIdx] : 'Unknown Date';
  const channel = (dateIdx !== -1 && parts[dateIdx + 1] && /^\d+$/.test(parts[dateIdx + 1])) ? parts[dateIdx + 1] : '001';
  const filename = path.basename(filePath);

  if (!result.dates[date]) {
    result.dates[date] = {
      date,
      videos: [],
      photos: [],
      channels: new Set()
    };
  }
  result.dates[date].channels.add(channel);

  if (ext === '.dav') {
    // Dahua naming pattern: 00.00.00-00.05.00[R][0@0][0].dav
    const m = filename.match(/^(\d{2})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\[([A-Za-z0-9])\]/);
    let startTime = '00:00:00';
    let endTime = '00:05:00';
    let startSec = 0;
    let endSec = 300;
    let recordType = 'regular';

    if (m) {
      startTime = `${m[1]}:${m[2]}:${m[3]}`;
      endTime = `${m[4]}:${m[5]}:${m[6]}`;
      startSec = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
      endSec = parseInt(m[4], 10) * 3600 + parseInt(m[5], 10) * 60 + parseInt(m[6], 10);
      if (endSec === 0 && startSec > 0) {
        endSec = startSec + 300;
      }
      recordType = m[7] === 'M' ? 'motion' : 'regular';
    }

    const duration = Math.max(1, endSec - startSec);
    result.dates[date].videos.push({
      id: `vid_${date}_${channel}_${startSec}`,
      type: 'video',
      recordType,
      date,
      channel,
      startTime,
      endTime,
      startSec,
      endSec,
      duration,
      filename,
      filePath,
      sizeBytes: fs.statSync(filePath).size
    });
    result.totalVideos++;
  } else if (ext === '.jpg' || ext === '.jpeg') {
    // Path structure: .../jpg/04/24/19[M][0@0][0].jpg
    const parent = parts[parts.length - 2];
    const grandParent = parts[parts.length - 3];
    let timeStr = '00:00:00';
    let secFromMidnight = 0;
    let recordType = 'snapshot';

    const m = filename.match(/^(\d{2})\[([A-Za-z0-9])\]/);
    if (m && /^\d{2}$/.test(grandParent) && /^\d{2}$/.test(parent)) {
      timeStr = `${grandParent}:${parent}:${m[1]}`;
      secFromMidnight = parseInt(grandParent, 10) * 3600 + parseInt(parent, 10) * 60 + parseInt(m[1], 10);
      recordType = m[2] === 'M' ? 'motion' : 'snapshot';
    }

    result.dates[date].photos.push({
      id: `img_${date}_${channel}_${secFromMidnight}`,
      type: 'photo',
      recordType,
      date,
      channel,
      time: timeStr,
      secFromMidnight,
      filename,
      filePath,
      sizeBytes: fs.statSync(filePath).size
    });
    result.totalPhotos++;
  }
}

module.exports = {
  scanDirectory
};

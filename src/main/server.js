const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

class MediaServer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.resolve(__dirname, '../../.cache/mp4');
    this.thumbDir = options.thumbDir || path.resolve(__dirname, '../../.cache/thumbnails');
    this.port = 0;
    this.server = null;
    this.inFlightConversions = new Map();

    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.mkdirSync(this.thumbDir, { recursive: true });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        console.log(`[MediaServer] Running on http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }

  getHash(str) {
    return crypto.createHash('md5').update(str).digest('hex');
  }

  async handleRequest(req, res) {
    try {
      const parsedUrl = new URL(req.url, 'http://127.0.0.1');
      const pathname = parsedUrl.pathname;
      const filePath = parsedUrl.searchParams.get('file');

      // Allow CORS for local requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (!filePath || !fs.existsSync(filePath)) {
        res.statusCode = 404;
        return res.end('File not found');
      }

      if (pathname === '/video') {
        await this.handleVideo(filePath, req, res, parsedUrl.searchParams.get('transcode') === '1');
      } else if (pathname === '/thumb') {
        await this.handleThumbnail(filePath, req, res);
      } else if (pathname === '/photo') {
        this.handleStaticPhoto(filePath, req, res);
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    } catch (err) {
      console.error('[MediaServer] Request error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error: ' + err.message);
      }
    }
  }

  async handleVideo(filePath, req, res, forceH264 = false) {
    const hash = this.getHash(filePath + (forceH264 ? '_h264' : ''));
    const mp4Path = path.join(this.cacheDir, `${hash}.mp4`);

    if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size === 0) {
      if (this.inFlightConversions.has(hash)) {
        await this.inFlightConversions.get(hash);
      } else {
        const convPromise = this.remuxToMp4(filePath, mp4Path, forceH264);
        this.inFlightConversions.set(hash, convPromise);
        try {
          await convPromise;
        } finally {
          this.inFlightConversions.delete(hash);
        }
      }
    }

    this.serveFileWithRange(mp4Path, 'video/mp4', req, res);
  }

  remuxToMp4(davPath, destMp4Path, forceH264 = false) {
    return new Promise((resolve, reject) => {
      const tempPath = destMp4Path + '.tmp.mp4';
      let args;
      if (forceH264) {
        args = [
          '-hide_banner', '-y',
          '-i', davPath,
          '-c:v', 'h264_videotoolbox',
          '-b:v', '2500k',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          tempPath
        ];
      } else {
        args = [
          '-hide_banner', '-y',
          '-i', davPath,
          '-c', 'copy',
          '-tag:v', 'hvc1',
          '-movflags', '+faststart',
          tempPath
        ];
      }

      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
          try {
            fs.renameSync(tempPath, destMp4Path);
            resolve(destMp4Path);
          } catch (e) {
            reject(e);
          }
        } else {
          // If copy failed, retry with h264 if not already tried
          if (!forceH264) {
            console.warn('[MediaServer] Fast remux failed, falling back to h264 transcode:', stderr.slice(-300));
            this.remuxToMp4(davPath, destMp4Path, true).then(resolve).catch(reject);
          } else {
            reject(new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-300)}`));
          }
        }
      });
      proc.on('error', reject);
    });
  }

  async handleThumbnail(filePath, req, res) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      return this.handleStaticPhoto(filePath, req, res);
    }

    const hash = this.getHash(filePath);
    const thumbPath = path.join(this.thumbDir, `${hash}.jpg`);

    if (!fs.existsSync(thumbPath)) {
      await new Promise((resolve) => {
        const tempPath = thumbPath + '.tmp.jpg';
        const proc = spawn('ffmpeg', [
          '-hide_banner', '-y',
          '-ss', '00:00:01',
          '-i', filePath,
          '-vframes', '1',
          '-update', '1',
          '-q:v', '3',
          tempPath
        ]);
        proc.on('close', code => {
          if (code === 0 && fs.existsSync(tempPath)) {
            try { fs.renameSync(tempPath, thumbPath); } catch (e) {}
          }
          resolve();
        });
        proc.on('error', () => resolve());
      });
    }

    if (fs.existsSync(thumbPath)) {
      this.serveFileWithRange(thumbPath, 'image/jpeg', req, res);
    } else {
      res.statusCode = 404;
      res.end('Thumbnail could not be generated');
    }
  }

  handleStaticPhoto(filePath, req, res) {
    this.serveFileWithRange(filePath, 'image/jpeg', req, res);
  }

  serveFileWithRange(filePath, contentType, req, res) {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  }
}

module.exports = MediaServer;

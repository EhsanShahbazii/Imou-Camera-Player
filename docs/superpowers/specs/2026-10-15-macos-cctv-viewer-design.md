# macOS Native CCTV / DAV Camera Footage Viewer

## Overview
A lightweight, high-performance desktop application built with Electron for macOS, designed to view and manage security camera footage (Dahua/DVR `.dav` format and `.jpg` event snapshots). The app mimics the native look and feel of macOS apps like Apple Photos and QuickTime Player, featuring a 24-hour timeline scrubber, continuous playback of 5-minute video chunks, motion detection event markers, snapshot saving, and instant MP4 export.

## Problem Statement
Standard media players on macOS (QuickTime, Safari, default Electron Chromium) cannot natively play `.dav` surveillance video containers. Security camera dumps contain dozens of 5-minute `.dav` files organized across deep date/hour directory trees (`YYYY-MM-DD/channel/dav/hour/...`), alongside `.jpg` event snapshots. Users need a unified, elegant, and native macOS desktop app to browse these chronologically, scrub through the day on a timeline, seamlessly watch contiguous segments without interruption, and export clips or snapshots.

## Technical Architecture

### 1. Main Process (Node.js / Electron)
- **Filesystem Scanner**: Recursively scans camera directories (defaulting to `./files`, customizable via native macOS directory picker).
  - Parses Dahua file naming: `HH.MM.SS-HH.MM.SS[R][0@0][0].dav` (recording segments) and `SS[M][0@0][0].jpg` (motion detection snapshots).
  - Indexes events by date, hour, minute, second, and duration.
- **Local Media Streaming Engine**:
  - Implements an internal localhost HTTP server supporting HTTP 206 Partial Content (Range requests) for smooth video seeking.
  - Transparently executes on-demand remuxing (`ffmpeg -i input.dav -c copy -movflags +faststart output.mp4`) into a background cache (`.cache/mp4`). Because the video stream is HEVC (H.265) and audio is AAC, remuxing without re-encoding takes ~0.05 seconds for 5-minute clips.
  - Serves MP4 streams directly to the frontend HTML5 `<video>` player.
- **Thumbnail Generator**:
  - Extracts representative video frames using `ffmpeg -ss 00:00:01 -i input.dav -vframes 1 -q:v 2` and caches them for timeline/gallery hover previews.
- **IPC Interface**:
  - `open-directory`: Invokes `dialog.showOpenDialog` for directory selection and triggers re-scanning.
  - `export-mp4`: Invokes `dialog.showSaveDialog` and runs `ffmpeg -y -i input.dav -c copy destination.mp4` to quickly save clips to user's desired location.
  - `save-snapshot`: Saves a still frame (either from frontend canvas or ffmpeg high-resolution extraction) to the user's computer.
  - `get-media-index`: Delivers structured hierarchy of dates, channels, video clips, and motion photos.

### 2. Renderer Process (macOS Native UI)
- **Window Shell & Styling**:
  - Uses `titleBarStyle: 'hiddenInset'` and macOS vibrancy / frosted glass (`vibrancy: 'under-window'`).
  - Native Apple SF Pro Typography and Cupertino spacing.
  - Integrated traffic light window controls.
- **Header Toolbar**:
  - Left: Folder switcher button (`Open Folder...`) with active path label.
  - Center: Segmented view switchers (`All`, `Videos`, `Snapshots`).
  - Right: Date selector and quick search/filter.
- **Sidebar**:
  - Collapsible macOS-style sidebar showing indexed Dates (e.g. `2000-01-09`), camera channels, and total clip/photo counts.
- **Primary Player & Stage**:
  - Responsive 16:9 video container with dark backdrop.
  - Overlay glass control bar:
    - Play / Pause (toggleable via Spacebar).
    - Skip backward 10s / forward 10s (Left/Right arrow keys).
    - Next clip / Previous clip.
    - Playback Speed: 0.5x, 1x, 2x, 4x, 8x.
    - Volume & Fullscreen toggles.
    - Snapshot camera button (captures current video frame at native resolution).
    - Export MP4 button (exports active segment).
- **Interactive 24-Hour Timeline Bar**:
  - Displays hours 00:00 through 23:59.
  - Continuous recorded chunks highlighted in sleek blue blocks.
  - Motion detection snapshots displayed as orange/amber badge markers directly above the timeline.
  - Scrubbing indicator with time tooltip that automatically maps to the corresponding clip and time offset.
- **Seamless Playback Engine**:
  - Video `ended` event automatically cues and starts playback of the immediately following segment, creating an uninterrupted DVR watching experience.
- **Photo Viewer / Lightbox**:
  - Dedicated gallery view for motion detection snapshots.
  - Lightbox with zoom, previous/next, timestamp display, and export to disk.

## Error Handling & Edge Cases
- **Missing FFmpeg**: Main process checks `which ffmpeg` on launch. If missing, presents a friendly native modal explaining how to install it via Homebrew (`brew install ffmpeg`).
- **Corrupt DAV / Index files**: If a segment fails remuxing, an error notification is shown and playback gracefully proceeds or lets the user skip.
- **Rapid Scrubbing**: The local streaming server queues and cancels obsolete remux subprocesses to prevent zombie ffmpeg processes.

## Verification & Testing
1. Verify scanning and index parsing against the actual `./files` directory (80+ items, DAV segments and JPGs).
2. Test instant remuxing and streaming in the Electron video player.
3. Test timeline scrubbing and seamless transition across consecutive 5-minute clips.
4. Test snapshot capture and MP4 export functionality.
5. Verify macOS UI aesthetics (traffic lights, vibrancy, dark/light theme, keyboard shortcuts).

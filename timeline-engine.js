/**
 * Fixzology AI Studio - Deterministic Timeline State Engine
 */
export class TimelineEngine {
  constructor() {
    this.project = this.createEmptyProject('New Fixzology Project');
    this.undoStack = [];
    this.redoStack = [];
    this.objectUrls = new Map(); // assetId -> local blob URL (never duplicated on disk)
  }

  createEmptyProject(title) {
    return {
      schemaVersion: '1.0.0',
      id: 'proj_' + Date.now(),
      title,
      aspectRatio: '16:9',
      fps: 30,
      updatedAt: new Date().toISOString(),
      assets: [],
      tracks: [
        { id: 'track_text', name: 'Text / हिंदी Title', type: 'text', locked: false, muted: false },
        { id: 'track_video_1', name: 'Video Track 1', type: 'video', locked: false, muted: false },
        { id: 'track_audio_1', name: 'Audio / Voice', type: 'audio', locked: false, muted: false }
      ],
      clips: []
    };
  }

  snapshot() {
    this.undoStack.push(JSON.stringify(this.project));
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.undoStack.pop());
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop());
    return true;
  }

  importLocalFile(file) {
    this.snapshot();
    const assetId = 'asset_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const blobUrl = URL.createObjectURL(file);
    this.objectUrls.set(assetId, blobUrl);

    const isAudio = file.type.startsWith('audio/');
    const isImage = file.type.startsWith('image/');
    const mediaType = isAudio ? 'audio' : isImage ? 'image' : 'video';
    const targetTrackId = isAudio ? 'track_audio_1' : 'track_video_1';

    const assetMeta = {
      id: assetId,
      name: file.name,
      type: mediaType,
      sizeBytes: file.size,
      mimeType: file.type
    };
    this.project.assets.push(assetMeta);

    const trackEnd = this.project.clips
      .filter((c) => c.trackId === targetTrackId)
      .reduce((max, c) => Math.max(max, c.startSec + c.durationSec), 0);

    const clip = {
      id: 'clip_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      assetId,
      trackId: targetTrackId,
      label: file.name,
      type: mediaType,
      startSec: Number(trackEnd.toFixed(2)),
      durationSec: 5.0,
      inPointSec: 0,
      color: isAudio ? '#00D2D3' : '#7C5CFF'
    };
    this.project.clips.push(clip);
    return clip;
  }

  addTextClip(textContent, startSec) {
    this.snapshot();
    const clip = {
      id: 'txt_' + Date.now(),
      trackId: 'track_text',
      label: textContent.slice(0, 22),
      type: 'text',
      textContent,
      startSec: Number(startSec.toFixed(2)),
      durationSec: 4.0,
      color: '#3B82F6'
    };
    this.project.clips.push(clip);
    return clip;
  }

  splitClipAt(clipId, playheadSec) {
    const idx = this.project.clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return false;
    const clip = this.project.clips[idx];
    const track = this.project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return false;

    const offset = playheadSec - clip.startSec;
    if (offset <= 0.15 || offset >= clip.durationSec - 0.15) return false;

    this.snapshot();
    const firstHalf = { ...clip, durationSec: Number(offset.toFixed(2)) };
    const secondHalf = {
      ...clip,
      id: 'clip_' + Date.now(),
      startSec: Number(playheadSec.toFixed(2)),
      durationSec: Number((clip.durationSec - offset).toFixed(2)),
      inPointSec: Number(((clip.inPointSec || 0) + offset).toFixed(2))
    };

    this.project.clips.splice(idx, 1, firstHalf, secondHalf);
    return true;
  }

  deleteClip(clipId) {
    const clip = this.project.clips.find((c) => c.id === clipId);
    if (!clip) return false;
    const track = this.project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return false;

    this.snapshot();
    this.project.clips = this.project.clips.filter((c) => c.id !== clipId);
    return true;
  }
}
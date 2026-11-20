/**
 * Fixzology AI Studio - Real-Time Multi-Track Canvas Compositor
 * Renders Video, Image, Text (Hindi/English), Color Grading, Crop, Transform & Transitions.
 */
export class StudioCompositor {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
  }

  syncMediaPlayback(playheadSec, isPlaying) {
    for (const clip of this.engine.project.clips) {
      if (!clip.assetId) continue;
      const media = this.engine.mediaElements.get(clip.assetId);
      if (!media || !media.element || (clip.type !== 'video' && clip.type !== 'audio')) continue;

      const el = media.element;
      const track = this.engine.project.tracks.find((t) => t.id === clip.trackId);
      const isWithin = playheadSec >= clip.startSec && playheadSec < clip.startSec + clip.durationSec;

      if (isWithin && !track?.muted) {
        const speed = clip.props?.speed || 1;
        const targetSourceTime = (clip.inPointSec || 0) + (playheadSec - clip.startSec) * speed;
        el.playbackRate = speed;
        el.volume = Math.min(1, Math.max(0, clip.props?.volume ?? 1));

        if (Math.abs(el.currentTime - targetSourceTime) > 0.25) {
          el.currentTime = Math.min(el.duration || targetSourceTime, targetSourceTime);
        }
        if (isPlaying && el.paused) {
          el.play().catch(() => {});
        } else if (!isPlaying && !el.paused) {
          el.pause();
        }
      } else if (!el.paused) {
        el.pause();
      }
    }
  }

  renderFrame(playheadSec) {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Render order: Video/Image tracks first, Text track on top
    const activeClips = this.engine.project.clips
      .filter((c) => playheadSec >= c.startSec && playheadSec <= c.startSec + c.durationSec)
      .sort((a, b) => (a.type === 'text' ? 1 : b.type === 'text' ? -1 : 0));

    for (const clip of activeClips) {
      const p = clip.props || {};
      const elapsed = playheadSec - clip.startSec;

      // Transition opacity calculation (Fade / Dissolve)
      let transAlpha = 1;
      if (p.transitionIn === 'fade' && elapsed < 0.6) {
        transAlpha = Math.max(0, elapsed / 0.6);
      }

      ctx.save();
      ctx.globalAlpha = (p.opacity ?? 1) * transAlpha;
      ctx.filter = `brightness(${p.brightness ?? 100}%) contrast(${p.contrast ?? 100}%) saturate(${p.saturation ?? 100}%)`;

      const centerX = width / 2 + (p.posX || 0);
      const centerY = height / 2 + (p.posY || 0);
      ctx.translate(centerX, centerY);
      ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
      const totalScale = (p.scale || 1) * (p.cropZoom || 1);
      ctx.scale(totalScale, totalScale);

      if (clip.type === 'video' || clip.type === 'image') {
        const media = this.engine.mediaElements.get(clip.assetId);
        const el = media?.element;
        if (el) {
          const srcW = el.videoWidth || el.naturalWidth || width;
          const srcH = el.videoHeight || el.naturalHeight || height;
          const ratio = Math.min(width / srcW, height / srcH);
          const drawW = srcW * ratio;
          const drawH = srcH * ratio;
          ctx.drawImage(el, -drawW / 2, -drawH / 2, drawW, drawH);
        }
      } else if (clip.type === 'text') {
        const fontSize = clip.fontSize || 42;
        ctx.font = `700 ${fontSize}px "Segoe UI", "Noto Sans Devanagari", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const text = clip.textContent || '';
        const metrics = ctx.measureText(text);
        const padX = 24;
        const padY = 14;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
        ctx.fillRect(-metrics.width / 2 - padX, -fontSize / 2 - padY, metrics.width + padX * 2, fontSize + padY * 2);

        ctx.fillStyle = clip.textColor || '#FFFFFF';
        ctx.fillText(text, 0, 0);
      }

      ctx.restore();
    }

    ctx.restore();
  }
}

import { FixzologyProject } from '@fixzology/core';
import { ActiveClipFrameState } from './playbackWorker';

export class MultiTrackCompositor {
  private videoElements = new Map<string, HTMLVideoElement>();
  private imageElements = new Map<string, HTMLImageElement>();

  /**
   * किसी भी इम्पोर्ट की गई मीडिया को प्रीलोड करके कैश करता है ताकि स्क्रबिंग तेज रहे
   */
  public async preloadAssets(project: FixzologyProject): Promise<void> {
    const tasks: Promise<void>[] = [];

    for (const asset of Object.values(project.assets)) {
      if (asset.mimeType.startsWith('video/') && !this.videoElements.has(asset.id)) {
        tasks.push(
          new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = asset.proxyUri || asset.sourceUri;
            video.muted = true; // ऑडियो Web Audio API से कंट्रोल होगा
            video.playsInline = true;
            video.preload = 'auto';
            video.onloadeddata = () => {
              this.videoElements.set(asset.id, video);
              resolve();
            };
            video.onerror = () => resolve();
          })
        );
      } else if (asset.mimeType.startsWith('image/') && !this.imageElements.has(asset.id)) {
        tasks.push(
          new Promise((resolve) => {
            const img = new Image();
            img.src = asset.sourceUri;
            img.onload = () => {
              this.imageElements.set(asset.id, img);
              resolve();
            };
            img.onerror = () => resolve();
          })
        );
      }
    }

    await Promise.all(tasks);
  }

  /**
   * सभी वीडियो/इमेज एलिमेंट्स को सटीक sourceTimeMs पर सीक (seek) करता है
   */
  public async syncMediaElements(activeStates: ActiveClipFrameState[]): Promise<void> {
    const seekPromises: Promise<void>[] = [];

    for (const state of activeStates) {
      const assetId = state.clip.assetId;
      if (!assetId) continue;

      const video = this.videoElements.get(assetId);
      if (video) {
        const targetSec = state.sourceTimeMs / 1000;
        // केवल तभी सीक करें जब अंतर 1 फ्रेम (~33ms) से ज्यादा हो
        if (Math.abs(video.currentTime - targetSec) > 0.033) {
          seekPromises.push(
            new Promise((resolve) => {
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
              };
              video.addEventListener('seeked', onSeeked);
              video.currentTime = Math.min(targetSec, video.duration || targetSec);
            })
          );
        }
      }
    }

    await Promise.all(seekPromises);
  }

  /**
   * कैनवास पर सभी लेयर्स (Video, Image, Color Filters, Hindi/Devanagari Text) रेंडर करता है
   */
  public renderFrame(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    activeStates: ActiveClipFrameState[]
  ): void {
    // 1. बैकग्राउंड क्लियर करें
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 2. हर एक्टिव लेयर को नीचे से ऊपर रेंडर करें
    for (const state of activeStates) {
      const { clip, transform, localTimeMs } = state;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity));

      // सेंटर पिवट पर Transform (Position, Scale, Rotation) लागू करें
      ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.scale(transform.scale, transform.scale);

      // Non-destructive Color Adjustments लागू करें
      const c = clip.colorAdjustments;
      const brightness = 100 + c.exposure * 50;
      const contrast = 100 + c.contrast;
      const saturate = 100 + c.saturation;
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;

      // A. Video या Image रेंडरिंग
      if (clip.assetId) {
        const video = this.videoElements.get(clip.assetId);
        const image = this.imageElements.get(clip.assetId);

        if (video && video.readyState >= 2) {
          this.drawAspectFit(ctx, video, video.videoWidth, video.videoHeight, width, height);
        } else if (image && image.complete) {
          this.drawAspectFit(ctx, image, image.naturalWidth, image.naturalHeight, width, height);
        }
      }

      // B. Text & Title रेंडरिंग (Devanagari / Hindi / English Unicode सपोर्ट)
      if (clip.textConfig && clip.textConfig.content.trim().length > 0) {
        ctx.filter = 'none';
        const tc = clip.textConfig;
        let displayText = tc.content;

        // Typewriter एनिमेशन सपोर्ट
        if (tc.animation === 'typewriter') {
          const progress = Math.min(1, localTimeMs / Math.min(1500, clip.durationMs));
          const charCount = Math.floor(displayText.length * progress);
          displayText = displayText.slice(0, charCount);
        } else if (tc.animation === 'fade') {
          const fadeAlpha = Math.min(1, localTimeMs / 400);
          ctx.globalAlpha *= fadeAlpha;
        }

        ctx.font = `600 ${tc.fontSize}px "${tc.fontFamily}", "Noto Sans Devanagari", sans-serif`;
        ctx.textAlign = tc.alignment;
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(displayText);
        const padX = 20;
        const padY = 12;
        const boxW = metrics.width + padX * 2;
        const boxH = tc.fontSize * 1.4 + padY;

        if (tc.backgroundColor) {
          ctx.fillStyle = tc.backgroundColor;
          ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
        }

        ctx.fillStyle = tc.color;
        ctx.fillText(displayText, 0, 0);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  private drawAspectFit(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
    canvasW: number,
    canvasH: number
  ) {
    if (!srcW || !srcH) return;
    const scale = Math.min(canvasW / srcW, canvasH / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  }
}

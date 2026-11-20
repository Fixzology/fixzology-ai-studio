import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { FixzologyProject } from '@fixzology/core';
import { resolveTimelineFrameState } from './playbackWorker';
import { MultiTrackCompositor } from './compositor';

export interface ExportOptions {
  width: number;
  height: number;
  fps: 24 | 25 | 30 | 50 | 60;
  bitrateBps: number; // जैसे 1080p High के लिए 8_000_000 (8 Mbps)
  fileName: string;
}

export interface ExportProgress {
  percentage: number;
  currentFrame: number;
  totalFrames: number;
  status: 'PREPARING' | 'ENCODING' | 'MUXING' | 'COMPLETED' | 'CANCELLED' | 'ERROR';
  errorMessage?: string;
}

/**
 * चेक करता है कि यूजर का डिवाइस/ब्राउज़र चुने हुए Resolution और Codec को सपोर्ट करता है या नहीं
 */
export async function checkExportSupport(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<{ supported: boolean; reason?: string }> {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      reason: 'इस ब्राउज़र या डिवाइस में WebCodecs (Hardware VideoEncoder) उपलब्ध नहीं है।',
    };
  }

  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.4d002a', // H.264 Main Profile Level 4.2 (1080p/4K compatible)
      width,
      height,
      bitrate,
      framerate: fps,
    });

    if (!support.supported) {
      return {
        supported: false,
        reason: `यह डिवाइस ${width}x${height} @ ${fps}fps H.264 एक्सपोर्ट को सपोर्ट नहीं करता। कृपया 1080p या 720p चुनें।`,
      };
    }

    return { supported: true };
  } catch (err) {
    return {
      supported: false,
      reason: err instanceof Error ? err.message : 'Codec capability check failed',
    };
  }
}

/**
 * असली MP4 वीडियो एक्सपोर्ट इंजन (Zero-Server, Offline Hardware Accelerated)
 */
export class OfflineMp4Exporter {
  private abortController: AbortController | null = null;

  public cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  public async exportProject(
    project: FixzologyProject,
    options: ExportOptions,
    onProgress: (progress: ExportProgress) => void
  ): Promise<{ blob: Blob; fileName: string; sizeBytes: number }> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // 1. H.264 कोडेक के लिए Width और Height को Even (सम संख्या) रखें
    const width = options.width % 2 === 0 ? options.width : options.width - 1;
    const height = options.height % 2 === 0 ? options.height : options.height - 1;

    onProgress({ percentage: 0, currentFrame: 0, totalFrames: 0, status: 'PREPARING' });

    // 2. हार्डवेयर सपोर्ट वेरिफाई करें (कभी भी फेक प्रॉमिस न करें)
    const capCheck = await checkExportSupport(width, height, options.fps, options.bitrateBps);
    if (!capCheck.supported) {
      onProgress({
        percentage: 0,
        currentFrame: 0,
        totalFrames: 0,
        status: 'ERROR',
        errorMessage: capCheck.reason,
      });
      throw new Error(capCheck.reason);
    }

    // 3. कुल टाइमलाइन ड्यूरेशन और फ्रेम्स की गिनती निकालें
    let totalDurationMs = 0;
    for (const clip of Object.values(project.clips)) {
      const end = clip.startTimeMs + clip.durationMs;
      if (end > totalDurationMs) totalDurationMs = end;
    }

    if (totalDurationMs <= 0) {
      throw new Error('टाइमलाइन खाली है। एक्सपोर्ट करने के लिए कम से कम एक क्लिप जोड़ें।');
    }

    const frameIntervalMs = 1000 / options.fps;
    const totalFrames = Math.ceil(totalDurationMs / frameIntervalMs);

    // 4. OffscreenCanvas और Compositor तैयार करें
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D OffscreenCanvas context initialize नहीं हो सका।');
    }

    const compositor = new MultiTrackCompositor();
    await compositor.preloadAssets(project);

    // 5. MP4 Muxer और Hardware VideoEncoder सेटअप करें
    const muxerTarget = new ArrayBufferTarget();
    const muxer = new Muxer({
      target: muxerTarget,
      video: {
        codec: 'avc',
        width,
        height,
      },
      fastStart: 'in-memory',
    });

    let encoderError: Error | null = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });

    videoEncoder.configure({
      codec: 'avc1.4d002a',
      width,
      height,
      bitrate: options.bitrateBps,
      framerate: options.fps,
    });

    // 6. Frame-by-Frame Deterministic Rendering Loop
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal.aborted) {
        videoEncoder.close();
        onProgress({
          percentage: Math.round((frameIdx / totalFrames) * 100),
          currentFrame: frameIdx,
          totalFrames,
          status: 'CANCELLED',
        });
        throw new Error('Export cancelled by user');
      }

      if (encoderError) {
        throw encoderError;
      }

      const currentTimeMs = frameIdx * frameIntervalMs;
      const activeStates = resolveTimelineFrameState(project, currentTimeMs);

      await compositor.syncMediaElements(activeStates);
      compositor.renderFrame(ctx, width, height, activeStates);

      // WebCodecs VideoFrame बनाएं (microseconds में timestamp)
      const timestampUs = Math.round(currentTimeMs * 1000);
      const durationUs = Math.round(frameIntervalMs * 1000);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: durationUs,
      });

      // हर 2 सेकंड पर एक Keyframe डालें ताकि वीडियो सीक करने में स्मूथ रहे
      const isKeyFrame = frameIdx % (options.fps * 2) === 0;
      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });

      // GPU मेमोरी लीक रोकने के लिए तुरंत close() करें (6GB RAM Android के लिए बेहद जरूरी)
      videoFrame.close();

      // अगर एनकोडर क्यू भर रही है तो थोड़ा रुकें (Backpressure control)
      if (videoEncoder.encodeQueueSize > 10) {
        await videoEncoder.flush();
      }

      onProgress({
        percentage: Math.min(99, Math.round(((frameIdx + 1) / totalFrames) * 100)),
        currentFrame: frameIdx + 1,
        totalFrames,
        status: 'ENCODING',
      });
    }

    // 7. सभी बचे हुए फ्रेम्स फ्लश करें और MP4 फाइल फाइनल करें
    onProgress({
      percentage: 99,
      currentFrame: totalFrames,
      totalFrames,
      status: 'MUXING',
    });

    await videoEncoder.flush();
    videoEncoder.close();
    muxer.finalize();

    const finalBuffer = muxerTarget.buffer;
    const blob = new Blob([finalBuffer], { type: 'video/mp4' });
    const safeName = options.fileName.endsWith('.mp4')
      ? options.fileName
      : `${options.fileName}.mp4`;

    onProgress({
      percentage: 100,
      currentFrame: totalFrames,
      totalFrames,
      status: 'COMPLETED',
    });

    return {
      blob,
      fileName: safeName,
      sizeBytes: blob.size,
    };
  }
}

/**
 * एक्सपोर्ट हुई असली MP4 फाइल को यूजर के डिवाइस पर डाउनलोड कराता है
 */
export function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

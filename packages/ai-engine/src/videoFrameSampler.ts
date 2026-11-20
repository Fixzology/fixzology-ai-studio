export interface SampledVideoContext {
  assetId: string;
  fileName: string;
  durationMs: number;
  width: number;
  height: number;
  sampledFramesBase64: Array<{ timestampMs: number; jpegBase64: string }>;
}

/**
 * किसी लोकल वीडियो से तय संख्या में Keyframes (Base64 JPEG) निकालता है
 * ताकि बिना भारी सर्वर के AI वीडियो का Pacing, Color और Scene समझ सके।
 */
export async function sampleVideoForAI(
  assetId: string,
  fileName: string,
  videoUrl: string,
  maxFrames = 6
): Promise<SampledVideoContext> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = async () => {
      const durationMs = Math.round((video.duration || 1) * 1000);
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;

      // AI विश्लेषण के लिए 360p स्केल काफी है (तेज़ और कम डेटा खर्च)
      const scale = Math.min(1, 360 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }

      const frames: Array<{ timestampMs: number; jpegBase64: string }> = [];
      const count = Math.min(maxFrames, Math.max(2, Math.ceil(durationMs / 2000)));

      for (let i = 0; i < count; i++) {
        const targetMs = Math.round(((i + 0.5) / count) * durationMs);
        await seekVideo(video, targetMs / 1000);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        frames.push({
          timestampMs: targetMs,
          jpegBase64: dataUrl.split(',')[1],
        });
      }

      resolve({
        assetId,
        fileName,
        durationMs,
        width,
        height,
        sampledFramesBase64: frames,
      });
    };

    video.onerror = () => reject(new Error(`वीडियो लोड नहीं हो सका: ${fileName}`));
  });
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.min(timeSec, Math.max(0, (video.duration || 0) - 0.05));
  });
}

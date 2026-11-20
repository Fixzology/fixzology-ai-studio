import { FixzologyProject, TimelineClip } from '@fixzology/core';

export interface AudioTrackSettings {
  eqLowDb: number;    // -12 to +12 dB (Bass)
  eqMidDb: number;    // -12 to +12 dB (Voice clarity)
  eqHighDb: number;   // -12 to +12 dB (Treble)
  autoDucking: boolean; // Voice-over चलने पर म्यूजिक को -10dB कम करना
}

export class MultiTrackAudioEngine {
  private audioBuffers = new Map<string, AudioBuffer>();
  private decodeCtx = new AudioContext({ sampleRate: 48000 });

  /**
   * प्रोजेक्ट के सभी ऑडियो और वीडियो क्लिप्स से ऑडियो डिकोड करके कैश करता है
   */
  public async loadProjectAudio(project: FixzologyProject): Promise<void> {
    for (const asset of Object.values(project.assets)) {
      if (this.audioBuffers.has(asset.id)) continue;
      if (!asset.mimeType.startsWith('audio/') && !asset.mimeType.startsWith('video/')) continue;

      try {
        const res = await fetch(asset.sourceUri);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await this.decodeCtx.decodeAudioData(arrayBuf);
        this.audioBuffers.set(asset.id, audioBuf);
      } catch {
        // Silent video या unsupported audio track को सुरक्षित रूप से छोड़ें
      }
    }
  }

  /**
   * पूरे प्रोजेक्ट के ऑडियो को OfflineAudioContext में सटीक टाइमिंग के साथ मिक्स करता है
   * (Export के समय MP4 में असली आवाज जोड़ने के लिए)
   */
  public async renderMixedAudioBuffer(
    project: FixzologyProject,
    totalDurationSec: number,
    trackEqMap: Record<string, AudioTrackSettings> = {}
  ): Promise<AudioBuffer> {
    const sampleRate = project.settings.sampleRate || 48000;
    const totalSamples = Math.max(1, Math.ceil(totalDurationSec * sampleRate));
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    const trackMap = new Map(project.tracks.map((t) => [t.id, t]));
    const hasAnySolo = project.tracks.some((t) => t.solo);

    // Voice-over क्लिप्स की टाइमिंग निकालें (Auto-Ducking के लिए)
    const voiceClips = Object.values(project.clips).filter((c) => {
      const tr = trackMap.get(c.trackId);
      return tr && tr.type === 'audio' && tr.name.toLowerCase().includes('voice');
    });

    for (const clip of Object.values(project.clips)) {
      if (!clip.assetId || clip.audioConfig?.muted) continue;

      const track = trackMap.get(clip.trackId);
      if (!track || track.muted) continue;
      if (hasAnySolo && !track.solo) continue;

      const buffer = this.audioBuffers.get(clip.assetId);
      if (!buffer) continue;

      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clip.speed || 1;

      // 1. Gain & Fade-In / Fade-Out Node
      const gainNode = offlineCtx.createGain();
      const baseLinearGain = Math.pow(10, (clip.audioConfig?.gainDb ?? 0) / 20);
      const startSec = clip.startTimeMs / 1000;
      const durationSec = clip.durationMs / 1000;
      const endSec = startSec + durationSec;

      const fadeInSec = Math.min(durationSec / 2, (clip.audioConfig?.fadeInMs ?? 0) / 1000);
      const fadeOutSec = Math.min(durationSec / 2, (clip.audioConfig?.fadeOutMs ?? 0) / 1000);

      if (fadeInSec > 0) {
        gainNode.gain.setValueAtTime(0.0001, startSec);
        gainNode.gain.linearRampToValueAtTime(baseLinearGain, startSec + fadeInSec);
      } else {
        gainNode.gain.setValueAtTime(baseLinearGain, startSec);
      }

      if (fadeOutSec > 0) {
        gainNode.gain.setValueAtTime(baseLinearGain, Math.max(startSec, endSec - fadeOutSec));
        gainNode.gain.linearRampToValueAtTime(0.0001, endSec);
      }

      // 2. Auto-Ducking: अगर यह म्यूजिक ट्रैक है और ऊपर Voice-over चल रहा है, तो आवाज धीमी करें
      const eqSettings = trackEqMap[track.id];
      if (eqSettings?.autoDucking && !track.name.toLowerCase().includes('voice')) {
        for (const vc of voiceClips) {
          const vStart = vc.startTimeMs / 1000;
          const vEnd = (vc.startTimeMs + vc.durationMs) / 1000;
          if (vEnd > startSec && vStart < endSec) {
            gainNode.gain.setValueAtTime(baseLinearGain * 0.25, Math.max(startSec, vStart));
            gainNode.gain.setValueAtTime(baseLinearGain, Math.min(endSec, vEnd));
          }
        }
      }

      // 3. 3-Band Equalizer (Low / Mid / High)
      const lowFilter = offlineCtx.createBiquadFilter();
      lowFilter.type = 'lowshelf';
      lowFilter.frequency.value = 200;
      lowFilter.gain.value = eqSettings?.eqLowDb ?? 0;

      const midFilter = offlineCtx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1500;
      midFilter.gain.value = eqSettings?.eqMidDb ?? 0;

      const highFilter = offlineCtx.createBiquadFilter();
      highFilter.type = 'highshelf';
      highFilter.frequency.value = 6000;
      highFilter.gain.value = eqSettings?.eqHighDb ?? 0;

      source.connect(lowFilter);
      lowFilter.connect(midFilter);
      midFilter.connect(highFilter);
      highFilter.connect(gainNode);
      gainNode.connect(offlineCtx.destination);

      const offsetSec = clip.sourceInMs / 1000;
      source.start(startSec, offsetSec, durationSec * (clip.speed || 1));
    }

    return await offlineCtx.startRendering();
  }
}

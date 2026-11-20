import { FixzologyProject, Keyframe, TimelineClip } from '@fixzology/core';

export interface ActiveClipFrameState {
  clip: TimelineClip;
  localTimeMs: number;
  sourceTimeMs: number;
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
  };
}

/**
 * Keyframes के बीच सटीक वैल्यू (Linear / Ease-in / Ease-out / Ease-in-out) निकालता है
 */
export function evaluateKeyframes(
  keyframes: Keyframe<number>[],
  localTimeMs: number,
  defaultValue: number
): number {
  if (!keyframes || keyframes.length === 0) return defaultValue;

  const sorted = [...keyframes].sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);

  if (localTimeMs <= sorted[0].timeOffsetMs) return sorted[0].value;
  if (localTimeMs >= sorted[sorted.length - 1].timeOffsetMs) {
    return sorted[sorted.length - 1].value;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];

    if (localTimeMs >= k1.timeOffsetMs && localTimeMs <= k2.timeOffsetMs) {
      const span = k2.timeOffsetMs - k1.timeOffsetMs;
      if (span <= 0) return k1.value;

      let t = (localTimeMs - k1.timeOffsetMs) / span;

      // Easing curves
      if (k1.easing === 'ease-in') t = t * t;
      else if (k1.easing === 'ease-out') t = 1 - (1 - t) * (1 - t);
      else if (k1.easing === 'ease-in-out') {
        t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }

      return k1.value + (k2.value - k1.value) * t;
    }
  }

  return defaultValue;
}

/**
 * किसी दिए गए timestamp (playheadMs) पर सभी visible tracks की active clips निकालता है
 */
export function resolveTimelineFrameState(
  project: FixzologyProject,
  playheadMs: number
): ActiveClipFrameState[] {
  const trackOrderMap = new Map<string, number>();
  const visibleTrackIds = new Set<string>();

  for (const track of project.tracks) {
    trackOrderMap.set(track.id, track.order);
    if (track.visible) {
      visibleTrackIds.add(track.id);
    }
  }

  const activeClips = Object.values(project.clips).filter((clip) => {
    if (!visibleTrackIds.has(clip.trackId)) return false;
    const endMs = clip.startTimeMs + clip.durationMs;
    return playheadMs >= clip.startTimeMs && playheadMs < endMs;
  });

  // नीचे वाले ट्रैक से ऊपर वाले ट्रैक (z-index order) में सॉर्ट करें
  activeClips.sort(
    (a, b) => (trackOrderMap.get(a.trackId) ?? 0) - (trackOrderMap.get(b.trackId) ?? 0)
  );

  return activeClips.map((clip) => {
    const localTimeMs = playheadMs - clip.startTimeMs;
    const rawSourceOffset = localTimeMs * clip.speed;
    const sourceTimeMs = clip.reversed
      ? Math.max(clip.sourceInMs, clip.sourceOutMs - rawSourceOffset)
      : Math.min(clip.sourceOutMs, clip.sourceInMs + rawSourceOffset);

    return {
      clip,
      localTimeMs,
      sourceTimeMs,
      transform: {
        x: evaluateKeyframes(clip.transform.x, localTimeMs, 0),
        y: evaluateKeyframes(clip.transform.y, localTimeMs, 0),
        scale: evaluateKeyframes(clip.transform.scale, localTimeMs, 1),
        rotation: evaluateKeyframes(clip.transform.rotation, localTimeMs, 0),
        opacity: evaluateKeyframes(clip.transform.opacity, localTimeMs, 1),
      },
    };
  });
}

/**
 * Master Playback Controller (60fps RequestAnimationFrame + High-Precision Clock)
 */
export class TimelinePlaybackEngine {
  private isPlaying = false;
  private currentTimeMs = 0;
  private lastTickTime = 0;
  private rafId: number | null = null;
  private project: FixzologyProject;
  private onTick: (timeMs: number, frameState: ActiveClipFrameState[]) => void;

  constructor(
    project: FixzologyProject,
    onTick: (timeMs: number, frameState: ActiveClipFrameState[]) => void
  ) {
    this.project = project;
    this.onTick = onTick;
  }

  public updateProject(project: FixzologyProject) {
    this.project = project;
    if (!this.isPlaying) {
      this.seek(this.currentTimeMs);
    }
  }

  public getProjectDurationMs(): number {
    let maxEnd = 0;
    for (const clip of Object.values(this.project.clips)) {
      const end = clip.startTimeMs + clip.durationMs;
      if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastTickTime = performance.now();
    this.loop();
  }

  public pause() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public seek(timeMs: number) {
    this.currentTimeMs = Math.max(0, timeMs);
    const state = resolveTimelineFrameState(this.project, this.currentTimeMs);
    this.onTick(this.currentTimeMs, state);
  }

  private loop = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    this.currentTimeMs += deltaMs;
    const totalDuration = this.getProjectDurationMs();

    if (totalDuration > 0 && this.currentTimeMs >= totalDuration) {
      this.currentTimeMs = totalDuration;
      this.pause();
    }

    const state = resolveTimelineFrameState(this.project, this.currentTimeMs);
    this.onTick(this.currentTimeMs, state);

    if (this.isPlaying) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };
}

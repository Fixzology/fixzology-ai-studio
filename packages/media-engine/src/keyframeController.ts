import { Keyframe, TimelineClip } from './projectSchema';

export type KeyframeProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

/**
 * किसी क्लिप के दिए गए समय (localTimeMs) पर Keyframe जोड़ता या अपडेट करता है
 */
export function upsertClipKeyframe(
  clip: TimelineClip,
  property: KeyframeProperty,
  timeOffsetMs: number,
  value: number,
  easing: Keyframe['easing'] = 'ease-in-out'
): TimelineClip {
  const existing = [...clip.transform[property]];
  // 50ms के भीतर पहले से कीफ्रेम हो तो उसे अपडेट करें
  const idx = existing.findIndex((k) => Math.abs(k.timeOffsetMs - timeOffsetMs) < 50);

  if (idx >= 0) {
    existing[idx] = { ...existing[idx], timeOffsetMs, value, easing };
  } else {
    existing.push({
      id: crypto.randomUUID(),
      timeOffsetMs,
      value,
      easing,
    });
  }

  existing.sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);

  return {
    ...clip,
    transform: {
      ...clip.transform,
      [property]: existing,
    },
  };
}

export function deleteClipKeyframe(
  clip: TimelineClip,
  property: KeyframeProperty,
  keyframeId: string
): TimelineClip {
  return {
    ...clip,
    transform: {
      ...clip.transform,
      [property]: clip.transform[property].filter((k) => k.id !== keyframeId),
    },
  };
}

/**
 * One-Click Motion Presets (Ken Burns Zoom, Slide In, Pop)
 */
export function applyMotionPreset(
  clip: TimelineClip,
  preset: 'KEN_BURNS_ZOOM_IN' | 'KEN_BURNS_ZOOM_OUT' | 'POP_ENTRANCE' | 'SLIDE_FROM_BOTTOM'
): TimelineClip {
  const dur = clip.durationMs;

  if (preset === 'KEN_BURNS_ZOOM_IN') {
    return {
      ...clip,
      transform: {
        ...clip.transform,
        scale: [
          { id: crypto.randomUUID(), timeOffsetMs: 0, value: 1.0, easing: 'linear' },
          { id: crypto.randomUUID(), timeOffsetMs: dur, value: 1.18, easing: 'linear' },
        ],
      },
    };
  }

  if (preset === 'KEN_BURNS_ZOOM_OUT') {
    return {
      ...clip,
      transform: {
        ...clip.transform,
        scale: [
          { id: crypto.randomUUID(), timeOffsetMs: 0, value: 1.2, easing: 'linear' },
          { id: crypto.randomUUID(), timeOffsetMs: dur, value: 1.0, easing: 'linear' },
        ],
      },
    };
  }

  if (preset === 'POP_ENTRANCE') {
    const popTime = Math.min(350, dur);
    return {
      ...clip,
      transform: {
        ...clip.transform,
        scale: [
          { id: crypto.randomUUID(), timeOffsetMs: 0, value: 0.4, easing: 'ease-out' },
          { id: crypto.randomUUID(), timeOffsetMs: popTime, value: 1.0, easing: 'ease-out' },
        ],
        opacity: [
          { id: crypto.randomUUID(), timeOffsetMs: 0, value: 0, easing: 'ease-out' },
          { id: crypto.randomUUID(), timeOffsetMs: popTime, value: 1, easing: 'ease-out' },
        ],
      },
    };
  }

  // SLIDE_FROM_BOTTOM
  const slideTime = Math.min(450, dur);
  return {
    ...clip,
    transform: {
      ...clip.transform,
      y: [
        { id: crypto.randomUUID(), timeOffsetMs: 0, value: 180, easing: 'ease-out' },
        { id: crypto.randomUUID(), timeOffsetMs: slideTime, value: 0, easing: 'ease-out' },
      ],
    },
  };
}

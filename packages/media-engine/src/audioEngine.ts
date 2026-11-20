import { TimelineClip } from '@fixzology/core';

export type TransitionType = 'none' | 'fade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'slide-up' | 'zoom-in';
export type VisualEffectType = 'none' | 'blur' | 'vignette' | 'retro' | 'glitch' | 'cinematic-bars';

export interface ClipTransitionConfig {
  inType: TransitionType;
  inDurationMs: number;
  outType: TransitionType;
  outDurationMs: number;
}

export interface ClipEffectConfig {
  type: VisualEffectType;
  intensity: number; // 0 to 100
}

export const COLOR_GRADING_PRESETS: Record<string, TimelineClip['colorAdjustments']> = {
  NATURAL: {
    exposure: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
  },
  CINEMATIC_TEAL_ORANGE: {
    exposure: 0.05,
    contrast: 18,
    saturation: 12,
    temperature: 14,
    tint: -6,
    highlights: -10,
    shadows: 8,
  },
  WARM_GOLDEN: {
    exposure: 0.1,
    contrast: 10,
    saturation: 20,
    temperature: 28,
    tint: 5,
    highlights: 5,
    shadows: 0,
  },
  MOODY_DARK: {
    exposure: -0.15,
    contrast: 25,
    saturation: -18,
    temperature: -12,
    tint: 0,
    highlights: -20,
    shadows: -15,
  },
  VIBRANT_REELS: {
    exposure: 0.08,
    contrast: 14,
    saturation: 30,
    temperature: 6,
    tint: 2,
    highlights: 10,
    shadows: 10,
  },
};

/**
 * किसी क्लिप के लिए पूर्ण CSS/Canvas Color Grading Filter स्ट्रिंग बनाता है
 */
export function buildColorFilterString(
  adj: TimelineClip['colorAdjustments'],
  effect?: ClipEffectConfig,
  bypassBeforeAfter = false
): string {
  if (bypassBeforeAfter) return 'none';

  const brightness = Math.max(10, 100 + adj.exposure * 50 + (adj.highlights - adj.shadows) * 0.15);
  const contrast = Math.max(10, 100 + adj.contrast);
  const saturate = Math.max(0, 100 + adj.saturation);
  const sepia = adj.temperature > 0 ? Math.min(40, adj.temperature * 0.6) : 0;
  const hueRotate = adj.tint * 0.5 + (adj.temperature < 0 ? adj.temperature * 0.4 : 0);

  let filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) sepia(${sepia}%) hue-rotate(${hueRotate}deg)`;

  if (effect) {
    if (effect.type === 'blur') {
      filter += ` blur(${(effect.intensity / 100) * 16}px)`;
    } else if (effect.type === 'retro') {
      filter += ` sepia(${Math.min(90, effect.intensity)}%) contrast(110%)`;
    }
  }

  return filter;
}

/**
 * क्लिप के शुरू (In) और अंत (Out) में Transition लागू करता है
 */
export function applyClipTransition(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  localTimeMs: number,
  totalDurationMs: number,
  transition?: ClipTransitionConfig
) {
  if (!transition) return;

  // Entrance Transition
  if (transition.inType !== 'none' && transition.inDurationMs > 0 && localTimeMs < transition.inDurationMs) {
    const p = Math.max(0, Math.min(1, localTimeMs / transition.inDurationMs));
    applyTransitionProgress(ctx, width, height, transition.inType, p);
  }

  // Exit Transition
  const timeLeftMs = totalDurationMs - localTimeMs;
  if (transition.outType !== 'none' && transition.outDurationMs > 0 && timeLeftMs < transition.outDurationMs) {
    const p = Math.max(0, Math.min(1, timeLeftMs / transition.outDurationMs));
    applyTransitionProgress(ctx, width, height, transition.outType, p);
  }
}

function applyTransitionProgress(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  type: TransitionType,
  progress: number // 0 = hidden, 1 = fully visible
) {
  if (type === 'fade' || type === 'dissolve') {
    ctx.globalAlpha *= progress;
  } else if (type === 'wipe-left') {
    ctx.beginPath();
    ctx.rect(-width / 2, -height / 2, width * progress, height);
    ctx.clip();
  } else if (type === 'wipe-right') {
    const visibleW = width * progress;
    ctx.beginPath();
    ctx.rect(width / 2 - visibleW, -height / 2, visibleW, height);
    ctx.clip();
  } else if (type === 'slide-up') {
    ctx.translate(0, (1 - progress) * height * 0.4);
    ctx.globalAlpha *= progress;
  } else if (type === 'zoom-in') {
    const s = 0.6 + 0.4 * progress;
    ctx.scale(s, s);
    ctx.globalAlpha *= progress;
  }
}

/**
 * Post-draw Overlays (Vignette, Cinematic Letterbox Bars, Glitch Split)
 */
export function applyPostFrameOverlay(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  effect?: ClipEffectConfig
) {
  if (!effect || effect.type === 'none') return;

  if (effect.type === 'vignette') {
    const radius = Math.max(width, height) * 0.7;
    const grad = ctx.createRadialGradient(width / 2, height / 2, radius * 0.35, width / 2, height / 2, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, effect.intensity / 100)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else if (effect.type === 'cinematic-bars') {
    const barHeight = Math.round(height * 0.12 * (effect.intensity / 100));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, barHeight);
    ctx.fillRect(0, height - barHeight, width, barHeight);
  }
}

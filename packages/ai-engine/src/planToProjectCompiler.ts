import { FixzologyProject, TimelineClip, applyMotionPreset } from '@fixzology/core';
import { COLOR_GRADING_PRESETS } from '@fixzology/media-engine';
import { AiEditingPlan } from './referenceAiOrchestrator';

export function compileAiPlanToProject(
  baseProject: FixzologyProject,
  plan: AiEditingPlan
): FixzologyProject {
  const videoTrack = baseProject.tracks.find((t) => t.type === 'video') || baseProject.tracks[0];
  const overlayTrack =
    baseProject.tracks.find((t) => t.type === 'overlay' || t.type === 'text') || videoTrack;

  const newClips: Record<string, TimelineClip> = {};
  let cursorMs = 0;

  for (const scene of plan.scenes) {
    const asset = baseProject.assets[scene.assetId];
    if (!asset) continue;

    const safeIn = Math.max(0, Math.min(scene.sourceInMs, asset.durationMs - 200));
    const safeOut = Math.max(safeIn + 200, Math.min(scene.sourceOutMs, asset.durationMs));
    const durationMs = safeOut - safeIn;

    // 1. मुख्य Video/Image क्लिप तैयार करें
    let videoClip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      trackId: videoTrack.id,
      startTimeMs: cursorMs,
      durationMs,
      sourceInMs: safeIn,
      sourceOutMs: safeOut,
      speed: 1,
      reversed: false,
      locked: false,
      transform: { x: [], y: [], scale: [], rotation: [], opacity: [] },
      colorAdjustments:
        COLOR_GRADING_PRESETS[scene.colorPreset] || COLOR_GRADING_PRESETS.NATURAL,
    };

    if (scene.motionPreset && scene.motionPreset !== 'NONE') {
      videoClip = applyMotionPreset(videoClip, scene.motionPreset);
    }

    newClips[videoClip.id] = videoClip;

    // 2. अगर AI ने Text/Title दिया है तो Text लेयर जोड़ें
    if (scene.overlayText && scene.overlayText.trim().length > 0) {
      const textClipId = crypto.randomUUID();
      newClips[textClipId] = {
        id: textClipId,
        trackId: overlayTrack.id,
        startTimeMs: cursorMs,
        durationMs,
        sourceInMs: 0,
        sourceOutMs: durationMs,
        speed: 1,
        reversed: false,
        locked: false,
        transform: {
          x: [],
          y: [{ id: crypto.randomUUID(), timeOffsetMs: 0, value: 180, easing: 'linear' }],
          scale: [],
          rotation: [],
          opacity: [],
        },
        colorAdjustments: COLOR_GRADING_PRESETS.NATURAL,
        textConfig: {
          content: scene.overlayText,
          fontFamily: 'Noto Sans Devanagari',
          fontSize: scene.textFontSize || 42,
          color: '#FFFFFF',
          backgroundColor: 'rgba(14, 16, 21, 0.72)',
          alignment: 'center',
          animation: 'fade',
        },
      };
    }

    // 3. अगर कस्टमर ने चैट से कोई Screenshot/Logo इस scene में जुड़वाया है
    if (scene.overlayImageAssetId && baseProject.assets[scene.overlayImageAssetId]) {
      const imgClipId = crypto.randomUUID();
      newClips[imgClipId] = {
        id: imgClipId,
        assetId: scene.overlayImageAssetId,
        trackId: overlayTrack.id,
        startTimeMs: cursorMs,
        durationMs,
        sourceInMs: 0,
        sourceOutMs: durationMs,
        speed: 1,
        reversed: false,
        locked: false,
        transform: {
          x: [],
          y: [],
          scale: [{ id: crypto.randomUUID(), timeOffsetMs: 0, value: 0.55, easing: 'ease-out' }],
          rotation: [],
          opacity: [],
        },
        colorAdjustments: COLOR_GRADING_PRESETS.NATURAL,
      };
    }

    cursorMs += durationMs;
  }

  return {
    ...baseProject,
    revision: baseProject.revision + 1,
    updatedAt: new Date().toISOString(),
    clips: newClips,
  };
}

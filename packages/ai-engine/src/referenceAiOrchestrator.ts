import { SampledVideoContext } from './videoFrameSampler';

export interface AiEditPlanStep {
  sceneNumber: number;
  assetId: string;
  sourceInMs: number;
  sourceOutMs: number;
  transitionIn: 'none' | 'fade' | 'dissolve' | 'wipe-left' | 'slide-up' | 'zoom-in';
  colorPreset: 'NATURAL' | 'CINEMATIC_TEAL_ORANGE' | 'WARM_GOLDEN' | 'MOODY_DARK' | 'VIBRANT_REELS';
  motionPreset: 'NONE' | 'KEN_BURNS_ZOOM_IN' | 'POP_ENTRANCE' | 'SLIDE_FROM_BOTTOM';
  overlayText?: string;
  textFontSize?: number;
  overlayImageAssetId?: string;
  reason: string;
}

export interface AiEditingPlan {
  styleSummary: string;
  detectedPacingSec: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  scenes: AiEditPlanStep[];
  assistantReplyHindi: string;
}

/**
 * Step 1-3: Reference Video और Raw Footage का विश्लेषण करके असली AI Editing Plan बनाता है
 */
export async function generateReferenceEditPlan(params: {
  geminiApiKey: string;
  referenceVideo: SampledVideoContext;
  rawAssets: SampledVideoContext[];
  userGoalPrompt?: string;
}): Promise<AiEditingPlan> {
  const { geminiApiKey, referenceVideo, rawAssets, userGoalPrompt } = params;

  const systemInstruction = `
You are the Fixzology AI Studio Video Editing Engine.
Analyze the uploaded REFERENCE VIDEO frames (pacing, cut rhythm, color mood, text style, aspect ratio) and the customer's RAW FOOTAGE assets.
Create an ORIGINAL editing plan using ONLY the customer's raw asset IDs. Do NOT copy copyrighted content.
Return strictly valid JSON matching this schema:
{
  "styleSummary": "string",
  "detectedPacingSec": number,
  "aspectRatio": "16:9" | "9:16" | "1:1" | "4:5",
  "scenes": [
    {
      "sceneNumber": number,
      "assetId": "exact assetId from rawAssets",
      "sourceInMs": number,
      "sourceOutMs": number,
      "transitionIn": "none" | "fade" | "dissolve" | "wipe-left" | "slide-up" | "zoom-in",
      "colorPreset": "NATURAL" | "CINEMATIC_TEAL_ORANGE" | "WARM_GOLDEN" | "MOODY_DARK" | "VIBRANT_REELS",
      "motionPreset": "NONE" | "KEN_BURNS_ZOOM_IN" | "POP_ENTRANCE" | "SLIDE_FROM_BOTTOM",
      "overlayText": "optional short Hindi/English title",
      "textFontSize": 42,
      "reason": "why this clip & cut fits the reference pacing"
    }
  ],
  "assistantReplyHindi": "Natural, helpful Hindi/Hinglish explanation for the user"
}`;

  const parts: Array<Record<string, unknown>> = [
    {
      text: `REFERENCE VIDEO (${referenceVideo.fileName}, ${referenceVideo.durationMs}ms, ${referenceVideo.width}x${referenceVideo.height}):`,
    },
    ...referenceVideo.sampledFramesBase64.map((f) => ({
      inline_data: { mime_type: 'image/jpeg', data: f.jpegBase64 },
    })),
    {
      text: `RAW FOOTAGE INVENTORY:\n${JSON.stringify(
        rawAssets.map((a) => ({
          assetId: a.assetId,
          fileName: a.fileName,
          durationMs: a.durationMs,
        }))
      )}\nUser Request: ${userGoalPrompt || 'Match the reference video pacing, color mood, and transitions cleanly.'}`,
    },
  ];

  // हर raw clip से 2 sample frames भेजें ताकि AI सही scene चुन सके
  for (const raw of rawAssets) {
    parts.push({ text: `Sample frames for raw assetId="${raw.assetId}" (${raw.fileName}):` });
    for (const f of raw.sampledFramesBase64.slice(0, 2)) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: f.jpegBase64 } });
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      geminiApiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.3,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini AI API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJson) {
    throw new Error('AI ने खाली रिस्पॉन्स दिया। कृपया दोबारा प्रयास करें।');
  }

  return JSON.parse(rawJson) as AiEditingPlan;
}

/**
 * Step 6 & 7: Customer Feedback Chat — केवल मांगे गए बदलाव करता है और बाकी approved scenes सुरक्षित रखता है
 */
export async function applyChatRevisionToPlan(params: {
  geminiApiKey: string;
  currentPlan: AiEditingPlan;
  userFeedbackMessage: string;
  attachedAsset?: { assetId: string; fileName: string; jpegBase64?: string };
}): Promise<AiEditingPlan> {
  const { geminiApiKey, currentPlan, userFeedbackMessage, attachedAsset } = params;

  const instruction = `
You are revising an existing Fixzology AI Studio editing plan based on customer feedback.
STRICT RULE: Modify ONLY the scenes or properties requested by the customer. Preserve all other approved scenes, timings, and settings unchanged.
Return the updated AiEditingPlan JSON with a clear Hindi/Hinglish confirmation in "assistantReplyHindi".`;

  const parts: Array<Record<string, unknown>> = [
    { text: `CURRENT APPROVED PLAN:\n${JSON.stringify(currentPlan)}` },
    {
      text: `CUSTOMER REVISION REQUEST: "${userFeedbackMessage}"${
        attachedAsset
          ? `\nCustomer attached new media: assetId="${attachedAsset.assetId}", fileName="${attachedAsset.fileName}"`
          : ''
      }`,
    },
  ];

  if (attachedAsset?.jpegBase64) {
    parts.push({
      inline_data: { mime_type: 'image/jpeg', data: attachedAsset.jpegBase64 },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      geminiApiKey
    )}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`AI Revision Error: ${response.status}`);
  }

  const data = await response.json();
  const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawJson) as AiEditingPlan;
}

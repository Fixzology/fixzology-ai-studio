import React, { useState } from 'react';
import { FixzologyProject } from '@fixzology/core';
import { importLocalMediaFile } from '@fixzology/media-engine';
import { sampleVideoForAI, SampledVideoContext } from '@fixzology/ai-engine/videoFrameSampler';
import {
  AiEditingPlan,
  generateReferenceEditPlan,
  applyChatRevisionToPlan,
} from '@fixzology/ai-engine/referenceAiOrchestrator';
import { compileAiPlanToProject } from '@fixzology/ai-engine/planToProjectCompiler';

interface ReferenceAiChatPanelProps {
  project: FixzologyProject;
  geminiApiKey: string;
  isOnline: boolean;
  onProjectUpdated: (updatedProject: FixzologyProject) => void;
  onRequestFinalExport: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

export const ReferenceAiChatPanel: React.FC<ReferenceAiChatPanelProps> = ({
  project,
  geminiApiKey,
  isOnline,
  onProjectUpdated,
  onRequestFinalExport,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'ai',
      text: 'Please upload the reference video that shows the editing style you want. Then upload your raw footage, images, audio, or other materials.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [referenceCtx, setReferenceCtx] = useState<SampledVideoContext | null>(null);
  const [rawContexts, setRawContexts] = useState<SampledVideoContext[]>([]);
  const [planHistory, setPlanHistory] = useState<AiEditingPlan[]>([]);
  const [projectHistory, setProjectHistory] = useState<FixzologyProject[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  const currentPlan = planHistory[planHistory.length - 1] || null;

  const pushMessage = (sender: 'ai' | 'user', text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), sender, text, timestamp: new Date().toLocaleTimeString() },
    ]);
  };

  // STEP 1: Reference Video Upload
  const handleReferenceUpload = async (file: File) => {
    setIsProcessing(true);
    try {
      const url = URL.createObjectURL(file);
      const sampled = await sampleVideoForAI('ref-video', file.name, url, 6);
      setReferenceCtx(sampled);
      pushMessage('user', `Reference Video अपलोड किया: ${file.name}`);
      pushMessage(
        'ai',
        `Reference video (${(sampled.durationMs / 1000).toFixed(1)}s) का स्ट्रक्चर और फ्रेम्स स्कैन हो गए हैं। अब अपना Raw Footage अपलोड करें।`
      );
    } catch (err) {
      pushMessage('ai', `Reference video पढ़ने में समस्या आई: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 2: Raw Footage Upload
  const handleRawFootageUpload = async (files: FileList) => {
    setIsProcessing(true);
    try {
      let updatedProject = { ...project };
      const newSamples: SampledVideoContext[] = [];

      for (const file of Array.from(files)) {
        const imported = await importLocalMediaFile(file);
        updatedProject = {
          ...updatedProject,
          assets: { ...updatedProject.assets, [imported.asset.id]: imported.asset },
        };

        if (file.type.startsWith('video/')) {
          const sampled = await sampleVideoForAI(
            imported.asset.id,
            file.name,
            imported.objectUrl,
            4
          );
          newSamples.push(sampled);
        } else if (file.type.startsWith('image/')) {
          newSamples.push({
            assetId: imported.asset.id,
            fileName: file.name,
            durationMs: 4000,
            width: imported.asset.width || 1280,
            height: imported.asset.height || 720,
            sampledFramesBase64: [],
          });
        }
      }

      onProjectUpdated(updatedProject);
      setRawContexts((prev) => [...prev, ...newSamples]);
      pushMessage('user', `${files.length} Raw फाइलें अपलोड की गईं।`);
      pushMessage('ai', 'Raw footage तैयार है। अब "Generate AI Edit" पर क्लिक करें।');
    } catch (err) {
      pushMessage('ai', `फाइल इम्पोर्ट त्रुटि: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 3 & 4: Generate Plan & Auto-Compile Timeline
  const handleGenerateInitialEdit = async () => {
    if (!isOnline) {
      pushMessage('ai', 'इंटरनेट कनेक्शन उपलब्ध नहीं है। आपका लोकल प्रोजेक्ट सुरक्षित है।');
      return;
    }
    if (!referenceCtx || rawContexts.length === 0) {
      pushMessage('ai', 'कृपया पहले Reference Video और कम से कम एक Raw Footage फाइल अपलोड करें।');
      return;
    }

    setIsProcessing(true);
    try {
      const plan = await generateReferenceEditPlan({
        geminiApiKey,
        referenceVideo: referenceCtx,
        rawAssets: rawContexts,
      });

      const compiledProject = compileAiPlanToProject(project, plan);
      setPlanHistory([plan]);
      setProjectHistory([project, compiledProject]);
      onProjectUpdated(compiledProject);

      pushMessage('ai', plan.assistantReplyHindi);
      pushMessage('ai', 'Your preview is ready. What would you like to change?');
    } catch (err) {
      pushMessage('ai', `AI प्लान बनाते समय त्रुटि: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 6 & 7: Customer Feedback Chat Revision
  const handleSendRevision = async () => {
    const text = chatInput.trim();
    if (!text || !currentPlan) return;
    setChatInput('');
    pushMessage('user', text);
    setIsProcessing(true);

    try {
      const revisedPlan = await applyChatRevisionToPlan({
        geminiApiKey,
        currentPlan,
        userFeedbackMessage: text,
      });

      const revisedProject = compileAiPlanToProject(project, revisedPlan);
      setPlanHistory((prev) => [...prev, revisedPlan]);
      setProjectHistory((prev) => [...prev, revisedProject]);
      onProjectUpdated(revisedProject);
      setIsApproved(false);

      pushMessage('ai', revisedPlan.assistantReplyHindi);
      pushMessage('ai', 'Revised preview तैयार है। क्या आप इसे Approve करना चाहते हैं या और बदलाव करने हैं?');
    } catch (err) {
      pushMessage('ai', `बदलाव लागू नहीं हो सका: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Undo to previous AI revision
  const handleUndoRevision = () => {
    if (planHistory.length <= 1 || projectHistory.length <= 2) return;
    const prevProject = projectHistory[projectHistory.length - 2];
    setPlanHistory((prev) => prev.slice(0, -1));
    setProjectHistory((prev) => prev.slice(0, -1));
    onProjectUpdated(prevProject);
    pushMessage('ai', 'पिछले AI Revision पर वापस आ गए हैं।');
  };

  return (
    <div className="flex flex-col h-full bg-[#161922] text-[#F4F6FA] p-3 text-xs">
      {/* Step 1 & 2 Upload Controls */}
      <div className="grid grid-cols-2 gap-2 pb-2 border-b border-[#2B3140]">
        <label className="cursor-pointer p-2 rounded bg-[#1F2430] hover:bg-[#2B3140] border border-[#2B3140] text-center">
          <div className="font-semibold text-[#B7A6FF]">1. Reference Video</div>
          <div className="text-[10px] text-[#9AA3B5] truncate">
            {referenceCtx ? referenceCtx.fileName : 'Select sample style'}
          </div>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleReferenceUpload(e.target.files[0])}
          />
        </label>

        <label className="cursor-pointer p-2 rounded bg-[#1F2430] hover:bg-[#2B3140] border border-[#2B3140] text-center">
          <div className="font-semibold text-[#5EEAD4]">2. Raw Footage ({rawContexts.length})</div>
          <div className="text-[10px] text-[#9AA3B5]">Upload clips / photos</div>
          <input
            type="file"
            multiple
            accept="video/mp4,video/webm,video/quicktime,image/*,audio/*"
            className="hidden"
            onChange={(e) => e.target.files && handleRawFootageUpload(e.target.files)}
          />
        </label>
      </div>

      {/* Generate / Revision Action Bar */}
      <div className="flex items-center gap-1.5 py-2 border-b border-[#2B3140]">
        <button
          onClick={handleGenerateInitialEdit}
          disabled={isProcessing || !referenceCtx || rawContexts.length === 0}
          className="flex-1 py-1.5 px-2 rounded bg-[#7C5CFF] hover:bg-[#6A48F5] disabled:opacity-40 font-semibold text-white"
        >
          {isProcessing ? 'AI Processing...' : 'Generate AI Edit'}
        </button>

        {planHistory.length > 1 && (
          <button
            onClick={handleUndoRevision}
            className="py-1.5 px-2 rounded bg-[#1F2430] border border-[#2B3140]"
          >
            Undo Rev
          </button>
        )}

        {currentPlan && (
          <button
            onClick={() => {
              setIsApproved(true);
              onRequestFinalExport();
            }}
            className="py-1.5 px-2.5 rounded bg-[#22C55E] text-black font-semibold"
          >
            {isApproved ? 'Approved ✓' : 'Approve & Export'}
          </button>
        )}
      </div>

      {/* Editable Scene Plan Summary */}
      {currentPlan && (
        <div className="my-2 p-2 rounded bg-[#0E1015] border border-[#2B3140] max-h-28 overflow-y-auto space-y-1">
          <div className="text-[10px] uppercase text-[#9AA3B5] font-semibold">
            AI Plan ({currentPlan.scenes.length} Scenes • Rev {planHistory.length})
          </div>
          {currentPlan.scenes.map((s) => (
            <div key={s.sceneNumber} className="text-[11px] flex justify-between text-[#F4F6FA]">
              <span>
                Scene {s.sceneNumber}: {s.colorPreset} • {s.transitionIn}
              </span>
              <span className="text-[#14B8A6]">{((s.sourceOutMs - s.sourceInMs) / 1000).toFixed(1)}s</span>
            </div>
          ))}
        </div>
      )}

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto space-y-2 py-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-2 rounded-lg max-w-[90%] ${
              m.sender === 'ai'
                ? 'bg-[#1F2430] text-[#F4F6FA] self-start'
                : 'bg-[#7C5CFF]/30 border border-[#7C5CFF]/50 text-white ml-auto'
            }`}
          >
            <div>{m.text}</div>
            <div className="text-[9px] text-[#9AA3B5] mt-1">{m.timestamp}</div>
          </div>
        ))}
      </div>

      {/* Chat Input */}
      <div className="pt-2 border-t border-[#2B3140] flex gap-1.5">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendRevision()}
          placeholder="जैसे: Text थोड़ा बड़ा करो या Cinematic बनाओ..."
          className="flex-1 bg-[#0E1015] border border-[#2B3140] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-[#7C5CFF]"
        />
        <button
          onClick={handleSendRevision}
          disabled={isProcessing || !currentPlan || !chatInput.trim()}
          className="px-3 py-1.5 rounded bg-[#7C5CFF] disabled:opacity-40 font-semibold text-white"
        >
          Send
        </button>
      </div>
    </div>
  );
};

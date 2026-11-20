import React, { useRef, useState, useEffect } from 'react';

interface DesignLayer {
  id: string;
  type: 'rect' | 'circle' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  text?: string;
  fontSize?: number;
  opacity: number;
}

interface GraphicsDesignStudioProps {
  onSendOverlayToTimeline: (pngBlob: Blob, name: string) => void;
}

const CANVAS_PRESETS = [
  { label: 'YouTube Thumbnail (16:9)', w: 1280, h: 720 },
  { label: 'Shorts / Reels Cover (9:16)', w: 1080, h: 1920 },
  { label: 'Instagram Post (1:1)', w: 1080, h: 1080 },
  { label: 'Video Overlay (Transparent)', w: 1280, h: 720 },
];

export const GraphicsDesignStudio: React.FC<GraphicsDesignStudioProps> = ({
  onSendOverlayToTimeline,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [presetIdx, setPresetIdx] = useState(0);
  const [bgColor, setBgColor] = useState<string>('#131620');
  const [layers, setLayers] = useState<DesignLayer[]>([
    {
      id: 'layer-1',
      type: 'rect',
      x: 80,
      y: 260,
      width: 680,
      height: 110,
      fill: '#7C5CFF',
      opacity: 1,
    },
    {
      id: 'layer-2',
      type: 'text',
      x: 110,
      y: 332,
      width: 620,
      height: 80,
      fill: '#FFFFFF',
      text: 'Fixzology AI Studio • नया वीडियो',
      fontSize: 44,
      opacity: 1,
    },
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('layer-2');

  const currentPreset = CANVAS_PRESETS[presetIdx];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, currentPreset.w, currentPreset.h);

    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, currentPreset.w, currentPreset.h);
    }

    for (const layer of layers) {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.fillStyle = layer.fill;

      if (layer.type === 'rect') {
        ctx.beginPath();
        ctx.roundRect(layer.x, layer.y, layer.width, layer.height, 16);
        ctx.fill();
      } else if (layer.type === 'circle') {
        ctx.beginPath();
        ctx.arc(
          layer.x + layer.width / 2,
          layer.y + layer.height / 2,
          Math.min(layer.width, layer.height) / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      } else if (layer.type === 'text' && layer.text) {
        ctx.font = `700 ${layer.fontSize || 42}px "Inter", "Noto Sans Devanagari", sans-serif`;
        ctx.fillText(layer.text, layer.x, layer.y);
      }

      ctx.restore();
    }
  }, [layers, bgColor, currentPreset]);

  const addLayer = (type: DesignLayer['type']) => {
    const newLayer: DesignLayer = {
      id: crypto.randomUUID(),
      type,
      x: 160,
      y: 180,
      width: type === 'text' ? 500 : 240,
      height: type === 'text' ? 70 : 140,
      fill: type === 'text' ? '#FFFFFF' : '#14B8A6',
      text: type === 'text' ? 'यहाँ हिंदी या English लिखें' : undefined,
      fontSize: 48,
      opacity: 1,
    };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const updateSelected = (patch: Partial<DesignLayer>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === selectedLayerId ? { ...l, ...patch } : l))
    );
  };

  const handleExportPng = (sendToTimeline: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (sendToTimeline) {
        onSendOverlayToTimeline(blob, `Graphic_${Date.now()}.png`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Fixzology_Design_${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    }, 'image/png');
  };

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  return (
    <div className="flex flex-col md:flex-row h-full bg-[#0E1015] text-[#F4F6FA] p-3 gap-3">
      {/* Left Tools */}
      <div className="w-full md:w-64 bg-[#161922] border border-[#2B3140] rounded-lg p-3 space-y-3 text-xs">
        <div className="font-semibold text-[#9AA3B5] uppercase">Canvas Size</div>
        <select
          value={presetIdx}
          onChange={(e) => {
            const idx = Number(e.target.value);
            setPresetIdx(idx);
            if (CANVAS_PRESETS[idx].label.includes('Transparent')) {
              setBgColor('transparent');
            }
          }}
          className="w-full bg-[#1F2430] border border-[#2B3140] rounded p-2 text-white"
        >
          {CANVAS_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>

        <div className="font-semibold text-[#9AA3B5] uppercase pt-2">Add Elements</div>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => addLayer('text')} className="p-2 rounded bg-[#1F2430] hover:bg-[#2B3140]">
            + Text
          </button>
          <button onClick={() => addLayer('rect')} className="p-2 rounded bg-[#1F2430] hover:bg-[#2B3140]">
            + Box
          </button>
          <button onClick={() => addLayer('circle')} className="p-2 rounded bg-[#1F2430] hover:bg-[#2B3140]">
            + Circle
          </button>
        </div>

        <div className="pt-2 space-y-1.5">
          <button
            onClick={() => handleExportPng(false)}
            className="w-full py-2 rounded bg-[#14B8A6] text-black font-semibold"
          >
            Download PNG
          </button>
          <button
            onClick={() => handleExportPng(true)}
            className="w-full py-2 rounded bg-[#7C5CFF] text-white font-semibold"
          >
            Send to Video Timeline
          </button>
        </div>
      </div>

      {/* Center Canvas Preview */}
      <div className="flex-1 bg-[#161922] border border-[#2B3140] rounded-lg flex items-center justify-center p-4 overflow-auto">
        <canvas
          ref={canvasRef}
          width={currentPreset.w}
          height={currentPreset.h}
          className="max-w-full max-h-[65vh] border border-[#2B3140] shadow-lg bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')]"
        />
      </div>

      {/* Right Layer Properties */}
      <div className="w-full md:w-64 bg-[#161922] border border-[#2B3140] rounded-lg p-3 space-y-3 text-xs">
        <div className="font-semibold text-[#9AA3B5] uppercase">Layer Properties</div>
        {selectedLayer ? (
          <div className="space-y-2">
            {selectedLayer.type === 'text' && (
              <>
                <label className="block text-[#9AA3B5]">Text (हिंदी / English)</label>
                <input
                  type="text"
                  value={selectedLayer.text || ''}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  className="w-full bg-[#1F2430] border border-[#2B3140] rounded p-1.5 text-white"
                />
                <label className="block text-[#9AA3B5]">Font Size</label>
                <input
                  type="number"
                  value={selectedLayer.fontSize || 42}
                  onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                  className="w-full bg-[#1F2430] border border-[#2B3140] rounded p-1.5 text-white"
                />
              </>
            )}
            <label className="block text-[#9AA3B5]">Color</label>
            <input
              type="color"
              value={selectedLayer.fill}
              onChange={(e) => updateSelected({ fill: e.target.value })}
              className="w-full h-8 bg-transparent cursor-pointer"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#9AA3B5]">X Pos</label>
                <input
                  type="number"
                  value={selectedLayer.x}
                  onChange={(e) => updateSelected({ x: Number(e.target.value) })}
                  className="w-full bg-[#1F2430] border border-[#2B3140] rounded p-1 text-white"
                />
              </div>
              <div>
                <label className="block text-[#9AA3B5]">Y Pos</label>
                <input
                  type="number"
                  value={selectedLayer.y}
                  onChange={(e) => updateSelected({ y: Number(e.target.value) })}
                  className="w-full bg-[#1F2430] border border-[#2B3140] rounded p-1 text-white"
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[#9AA3B5]">कोई लेयर चुनें।</p>
        )}
      </div>
    </div>
  );
};

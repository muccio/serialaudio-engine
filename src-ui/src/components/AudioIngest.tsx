import React, { useRef, useState } from 'react';
import { FileAudio, Loader2, Music2, Scissors, Sliders, UploadCloud } from 'lucide-react';
import { WebSocketProgressPayload } from '../types';

interface AudioIngestProps {
  onFileUpload: (file: File) => void;
  onLoadDemo: () => void;
  onDetectSlices: (params: {
    method: 'spectral_flux' | 'hfc' | 'energy';
    threshold: number;
    minDurationMs: number;
    maxDurationMs: number;
    crossfadeMs: number;
  }) => void;
  isProcessing: boolean;
  progress: WebSocketProgressPayload | null;
  hasAudio: boolean;
  hasStems: boolean;
  hasSlices: boolean;
  stemCount: number;
}

export function AudioIngest({
  onFileUpload,
  onLoadDemo,
  onDetectSlices,
  isProcessing,
  progress,
  hasAudio,
  hasStems,
  hasSlices,
  stemCount
}: AudioIngestProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<'spectral_flux' | 'hfc' | 'energy'>('spectral_flux');
  const [threshold, setThreshold] = useState<number>(0.2);
  const [minDurationMs, setMinDurationMs] = useState<number>(50);
  const [maxDurationMs, setMaxDurationMs] = useState<number>(1200);
  const [crossfadeMs, setCrossfadeMs] = useState<number>(5);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-surfaceBorder">
        <div className="flex items-center space-x-2">
          <FileAudio className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-200">
            Ingestion & Stem Separation
          </h2>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="text-slate-400">Demucs v4 (htdemucs)</span>
          {hasStems && (
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {stemCount} Stems Active
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload & Demo Loader Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/50 rounded-xl p-5 flex flex-col items-center justify-center space-y-3 bg-slate-900/40 transition group"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".wav,.flac,.mp3"
            className="hidden"
          />

          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:scale-105 transition">
            <UploadCloud className="w-6 h-6" />
          </div>

          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">
              Drag & Drop audio file or <button onClick={() => fileInputRef.current?.click()} className="text-indigo-400 underline hover:text-indigo-300">browse</button>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">WAV, FLAC, MP3 (44.1 / 48 kHz)</p>
          </div>

          <div className="pt-2 flex items-center space-x-2">
            <button
              onClick={onLoadDemo}
              disabled={isProcessing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-medium transition active:scale-95 disabled:opacity-50"
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>Load Menotti "Sebastian's Dance" Demo</span>
            </button>
          </div>
          {hasAudio && (
            <p className="text-[11px] font-mono text-emerald-400">Audio source loaded in session</p>
          )}
        </div>

        {/* MIR Onset Detection Parameters */}
        <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between font-mono text-slate-300">
            <div className="flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>MIR Onset & Pitch Parameters</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1">Algorithm Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="spectral_flux">Spectral Flux</option>
                <option value="hfc">High Frequency Content (HFC)</option>
                <option value="energy">RMS Energy Difference</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Threshold Sensitivity</span>
                <span className="font-mono text-indigo-300">{threshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.8"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Min Event (ms)</span>
                <span className="font-mono text-indigo-300">{minDurationMs} ms</span>
              </div>
              <input
                type="range"
                min="20"
                max="300"
                step="10"
                value={minDurationMs}
                onChange={(e) => setMinDurationMs(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Max Event (ms)</span>
                <span className="font-mono text-indigo-300">{maxDurationMs} ms</span>
              </div>
              <input
                type="range"
                min="400"
                max="3000"
                step="100"
                value={maxDurationMs}
                onChange={(e) => setMaxDurationMs(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-400">
              <span>Crossfade:</span>
              <input
                type="number"
                min="1"
                max="50"
                value={crossfadeMs}
                onChange={(e) => setCrossfadeMs(parseInt(e.target.value) || 5)}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 font-mono text-center"
              />
              <span className="text-[11px]">ms Hann</span>
            </div>

            <button
              onClick={() => onDetectSlices({ method, threshold, minDurationMs, maxDurationMs, crossfadeMs })}
              disabled={isProcessing || !hasStems}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium transition active:scale-95 shadow"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>{hasSlices ? 'Re-Slice Stems' : 'Detect & Slice Events'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Progress Notification Bar */}
      {isProcessing && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2 text-indigo-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{progress?.message || 'Processing audio engine pipeline...'}</span>
            </div>
            <span className="text-slate-400">
              {progress ? Math.round(progress.progress * 100) : 0}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${Math.max(5, (progress?.progress || 0) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

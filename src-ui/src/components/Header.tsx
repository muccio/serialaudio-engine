import { useRef } from 'react';
import { Activity, Download, FolderOpen, Play, Save, Square } from 'lucide-react';

interface HeaderProps {
  isBackendConnected: boolean;
  sampleRate: number;
  setSampleRate: (sr: number) => void;
  isPlayingMaster: boolean;
  hasMaster: boolean;
  hasSession: boolean;
  onToggleMasterPlay: () => void;
  onExportMaster: () => void;
  isRendering: boolean;
  onTriggerRender: () => void;
  onSaveProject: () => void;
  onLoadProjectFile: (file: File) => void;
  isSavingProject?: boolean;
  isLoadingProject?: boolean;
}

export function Header({
  isBackendConnected,
  sampleRate,
  setSampleRate,
  isPlayingMaster,
  hasMaster,
  hasSession,
  onToggleMasterPlay,
  onExportMaster,
  isRendering,
  onTriggerRender,
  onSaveProject,
  onLoadProjectFile,
  isSavingProject = false,
  isLoadingProject = false
}: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <header className="h-16 border-b border-surfaceBorder bg-surface/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-mono font-bold text-lg shadow-inner">
          S
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-100 via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
            SerialAudio Engine
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            MIR Transient Slicing &bull; 12-Tone Serial DSP
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Connection status badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${isBackendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span className={isBackendConnected ? 'text-emerald-400' : 'text-rose-400'}>
            {isBackendConnected ? 'DSP Service 8000' : 'Offline'}
          </span>
        </div>

        {/* Project Save & Load Actions */}
        <div className="flex items-center space-x-1.5 border-r border-slate-800 pr-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onLoadProjectFile(file);
                e.target.value = '';
              }
            }}
            accept=".serialproj,.zip"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isBackendConnected || isLoadingProject}
            title="Carica un progetto completo (.serialproj)"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-mono transition active:scale-95 disabled:opacity-40"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isLoadingProject ? 'Loading...' : 'Load Proj'}</span>
          </button>

          <button
            onClick={onSaveProject}
            disabled={!hasSession || isSavingProject}
            title="Salva l'intero progetto (.serialproj con tutti gli step, stem, slice, matrice e timeline)"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-mono transition active:scale-95 disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isSavingProject ? 'Saving...' : 'Save Proj'}</span>
          </button>
        </div>

        {/* Sample Rate Selector */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
          <button
            onClick={() => setSampleRate(44100)}
            className={`px-2.5 py-1 rounded transition-colors ${sampleRate === 44100 ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            44.1 kHz
          </button>
          <button
            onClick={() => setSampleRate(48000)}
            className={`px-2.5 py-1 rounded transition-colors ${sampleRate === 48000 ? 'bg-indigo-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            48.0 kHz
          </button>
          <span className="px-2 text-slate-500 font-mono text-[10px]">24-bit</span>
        </div>

        {/* Render Mixdown Button */}
        <button
          onClick={onTriggerRender}
          disabled={isRendering || !isBackendConnected}
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium shadow-md shadow-indigo-950/50 transition-all active:scale-95"
        >
          <Activity className={`w-3.5 h-3.5 ${isRendering ? 'animate-spin' : ''}`} />
          <span>{isRendering ? 'Rendering...' : 'Synthesize Mixdown'}</span>
        </button>

        {/* Master Play / Pause */}
        <button
          onClick={onToggleMasterPlay}
          disabled={!hasMaster}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium border border-slate-700 transition"
        >
          {isPlayingMaster ? <Square className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />}
          <span>{isPlayingMaster ? 'Stop' : 'Play Master'}</span>
        </button>

        {/* Export Master */}
        <button
          onClick={onExportMaster}
          disabled={!hasMaster}
          title="Export 24-bit Broadcast WAV Master"
          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium shadow transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export WAV</span>
        </button>
      </div>
    </header>
  );
}

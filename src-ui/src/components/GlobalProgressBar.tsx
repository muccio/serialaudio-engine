import { CheckCircle2, Download, HardDrive, Layers, Loader2, Music, Scissors, Sparkles } from 'lucide-react';

export interface GlobalProgressState {
  isActive: boolean;
  stage: string;
  progress: number; // 0 to 1
  message: string;
  isComplete?: boolean;
}

interface GlobalProgressBarProps {
  state: GlobalProgressState;
  onDismiss?: () => void;
}

export function GlobalProgressBar({ state, onDismiss }: GlobalProgressBarProps) {
  if (!state.isActive && !state.isComplete) return null;

  const pct = Math.min(100, Math.max(0, Math.round(state.progress * 100)));

  const getStageIcon = () => {
    if (state.isComplete) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    switch (state.stage) {
      case 'upload':
        return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
      case 'demo':
      case 'demo_generation':
        return <Music className="w-4 h-4 text-indigo-400 animate-pulse" />;
      case 'separation':
        return <Layers className="w-4 h-4 text-purple-400 animate-pulse" />;
      case 'slicing':
        return <Scissors className="w-4 h-4 text-cyan-400 animate-pulse" />;
      case 'matrix':
        return <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />;
      case 'rendering':
        return <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />;
      case 'save_project':
      case 'load_project':
        return <HardDrive className="w-4 h-4 text-blue-400 animate-pulse" />;
      case 'download':
        return <Download className="w-4 h-4 text-rose-400 animate-bounce" />;
      default:
        return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
    }
  };

  const getStageLabel = () => {
    switch (state.stage) {
      case 'upload':
        return 'Audio Ingestion';
      case 'demo':
      case 'demo_generation':
        return 'Demo Synthesis';
      case 'separation':
        return 'Demucs Neural Stem Separation';
      case 'slicing':
        return 'MIR Transient Slicing';
      case 'matrix':
        return '12-Tone Serial Matrix';
      case 'rendering':
        return 'Timeline Master Synthesis';
      case 'save_project':
        return 'Packaging Project Bundle';
      case 'load_project':
        return 'Restoring Project Bundle';
      case 'download':
        return 'Audio File Download';
      default:
        return state.stage.replace(/_/g, ' ').toUpperCase();
    }
  };

  return (
    <div className={`sticky top-16 z-40 px-6 py-2.5 transition-all duration-300 border-b backdrop-blur-md shadow-md ${
      state.isComplete 
        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
        : 'bg-slate-900/90 border-indigo-500/40 text-slate-200'
    }`}>
      <div className="max-w-7xl mx-auto flex flex-col space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2.5">
            {getStageIcon()}
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
              state.isComplete
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
            }`}>
              {getStageLabel()}
            </span>
            <span className="text-slate-300 truncate max-w-xl font-sans text-xs">
              {state.message || 'Elaborazione in corso...'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <span className="font-bold text-sm text-indigo-300">
              {pct}%
            </span>
            {onDismiss && state.isComplete && (
              <button 
                onClick={onDismiss}
                className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
              >
                Chiudi
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-slate-700/60 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              state.isComplete
                ? 'bg-gradient-to-r from-emerald-500 to-teal-300'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 animate-pulse'
            }`}
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

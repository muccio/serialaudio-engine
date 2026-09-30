import { Fragment } from 'react';
import { Grid, Sparkles } from 'lucide-react';
import { MatrixMetadata, TransformationForm } from '../types';

interface SerialMatrixViewerProps {
  matrixData: MatrixMetadata | null;
  activeForm: TransformationForm;
  onChangeForm: (form: TransformationForm) => void;
  activeRow: number;
  onChangeRow: (row: number) => void;
  reverseBuffers: boolean;
  onToggleReverseBuffers: () => void;
  onPreviewRow: () => void;
  isPlayingPreview: boolean;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function SerialMatrixViewer({
  matrixData,
  activeForm,
  onChangeForm,
  activeRow,
  onChangeRow,
  reverseBuffers,
  onToggleReverseBuffers
}: SerialMatrixViewerProps) {
  if (!matrixData || !matrixData.matrix || matrixData.matrix.length < 12) {
    return (
      <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg">
        <div className="flex items-center space-x-2 pb-3 border-b border-surfaceBorder">
          <Grid className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-200">
            12-Tone Dodecaphonic Serial Matrix
          </h2>
        </div>
        <div className="py-10 text-center text-slate-500 font-mono text-xs">
          Detect transient slices on a stem to compute the 12x12 dodecaphonic permutation matrix.
        </div>
      </div>
    );
  }

  const { matrix, stem } = matrixData;

  return (
    <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-surfaceBorder">
        <div className="flex items-center space-x-2">
          <Grid className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-200">
            12-Tone Serial Matrix & DSP Permutations
          </h2>
          <span className="text-xs font-mono text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30">
            Stem: {stem}
          </span>
        </div>

        {/* Matrix Form Selectors: P, R, I, RI */}
        <div className="flex items-center space-x-1 font-mono text-xs">
          {(['P', 'R', 'I', 'RI'] as TransformationForm[]).map((form) => (
            <button
              key={form}
              onClick={() => onChangeForm(form)}
              className={`px-3 py-1 rounded transition font-semibold ${
                activeForm === form
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {form} ({form === 'P' ? 'Prime' : form === 'R' ? 'Retrograde' : form === 'I' ? 'Inversion' : 'Retro-Inv'})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 12x12 Matrix Visualizer */}
        <div className="lg:col-span-8 overflow-x-auto">
          <div className="inline-block p-2 rounded-xl bg-slate-950/80 border border-slate-800 shadow-inner">
            <div className="grid grid-cols-13 gap-1 text-[11px] font-mono select-none">
              {/* Header row labels (I0..I11) */}
              <div className="w-7 h-7 flex items-center justify-center text-slate-500 text-[10px]">
                I \ P
              </div>
              {Array.from({ length: 12 }).map((_, c) => (
                <div
                  key={`col-head-${c}`}
                  className={`w-7 h-7 flex items-center justify-center font-bold text-[10px] rounded ${
                    activeForm === 'I' || activeForm === 'RI' ? (c === activeRow ? 'bg-indigo-600 text-white' : 'text-indigo-400') : 'text-slate-500'
                  }`}
                >
                  I{c}
                </div>
              ))}

              {/* 12 Matrix Rows */}
              {matrix.map((rowArr, r) => (
                <Fragment key={`row-${r}`}>
                  {/* Row Head (P0..P11) */}
                  <div
                    onClick={() => onChangeRow(r)}
                    className={`w-7 h-7 flex items-center justify-center font-bold text-[10px] rounded cursor-pointer transition ${
                      activeForm === 'P' || activeForm === 'R' ? (r === activeRow ? 'bg-indigo-600 text-white' : 'text-indigo-300 hover:bg-slate-800') : 'text-slate-500 hover:bg-slate-800'
                    }`}
                  >
                    P{r}
                  </div>

                  {/* 12 Matrix Cells */}
                  {rowArr.map((pc, c) => {
                    const isRowActive = (activeForm === 'P' || activeForm === 'R') && r === activeRow;
                    const isColActive = (activeForm === 'I' || activeForm === 'RI') && c === activeRow;
                    const isHighlighted = isRowActive || isColActive;

                    return (
                      <div
                        key={`cell-${r}-${c}`}
                        onClick={() => {
                          if (activeForm === 'P' || activeForm === 'R') onChangeRow(r);
                          else onChangeRow(c);
                        }}
                        className={`w-7 h-7 rounded flex flex-col items-center justify-center text-[10px] font-mono cursor-pointer transition-all ${
                          isHighlighted
                            ? 'bg-indigo-500 text-white font-bold ring-1 ring-indigo-300 scale-105'
                            : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-800/80'
                        }`}
                        title={`Row P${r}, Col I${c}: Pitch Class ${pc} (${PITCH_NAMES[pc]})`}
                      >
                        <span>{pc}</span>
                        <span className="text-[8px] opacity-70 leading-none">{PITCH_NAMES[pc]}</span>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Matrix Transformation Controls & Row Details */}
        <div className="lg:col-span-4 space-y-4 text-xs font-mono">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">Current Form:</span>
              <span className="text-sm font-bold text-indigo-400">
                {activeForm}
                {activeRow}
              </span>
            </div>

            {/* Row Selector Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Row Transposition Index</span>
                <span className="text-indigo-300">{activeRow}</span>
              </div>
              <input
                type="range"
                min="0"
                max="11"
                step="1"
                value={activeRow}
                onChange={(e) => onChangeRow(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Buffer Reversal Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="space-y-0.5">
                <span className="text-slate-300 font-medium">Reverse Audio Buffers</span>
                <p className="text-[10px] text-slate-500">Inverts time envelope x[-t] in Retrograde</p>
              </div>
              <button
                onClick={onToggleReverseBuffers}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  reverseBuffers ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-0.5 left-0.5 ${
                    reverseBuffers ? 'transform translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Inversion Mechanism Note */}
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center space-x-1 text-indigo-400 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>DSP Mapping Engine</span>
              </div>
              <p>
                <strong>Harmonic Slices:</strong> Interval pitch reflection around row centroid: delta_st_inv = -delta_st.
              </p>
              <p>
                <strong>Inharmonic Transients:</strong> FFT spectral band inversion X_inv[k] = X[K - 1 - k] with phase restoration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

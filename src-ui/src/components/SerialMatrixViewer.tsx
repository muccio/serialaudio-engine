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
      <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg space-y-3">
        <div className="flex items-center space-x-2 pb-3 border-b border-surfaceBorder">
          <Grid className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-200">
            Step 3: 12-Tone Dodecaphonic Serial Matrix & DSP
          </h2>
        </div>
        <div className="py-10 text-center text-slate-400 font-mono text-xs space-y-2">
          <p className="text-slate-300 font-medium">No 12-event serial matrix loaded yet.</p>
          <p className="text-slate-500">
            1. Click "Detect & Slice Events" on the stem tracks above.<br />
            2. Click "Select for Matrix" on any stem (Other, Bass, Drums, or Vocals) to generate its Babbitt matrix.
          </p>
        </div>
      </div>
    );
  }

  const { matrix, stem, pitch_classes } = matrixData;

  return (
    <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-surfaceBorder">
        <div className="flex items-center space-x-2">
          <Grid className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-200">
            Step 3: 12-Tone Serial Matrix & DSP Transformations
          </h2>
          <span className="text-xs font-mono text-indigo-300 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30">
            Active Stem: <strong className="uppercase">{stem}</strong>
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
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {form} ({form === 'P' ? 'Prime' : form === 'R' ? 'Retrograde' : form === 'I' ? 'Inversion' : 'Retro-Inv'})
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 13x13 Full Matrix Grid with Guaranteed 13-Column CSS */}
        <div className="lg:col-span-8 overflow-x-auto pb-2">
          <div className="inline-block p-3 rounded-xl bg-slate-950 border border-slate-800 shadow-inner">
            <div
              className="grid gap-1.5 text-[11px] font-mono select-none"
              style={{
                gridTemplateColumns: 'repeat(13, minmax(2rem, 2.5rem))',
                width: 'max-content'
              }}
            >
              {/* Header row corner */}
              <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-slate-500 text-[10px] font-bold border-b border-r border-slate-800">
                P \ I
              </div>

              {/* 12 Column Headers (I0..I11) */}
              {Array.from({ length: 12 }).map((_, c) => {
                const isColSelected = (activeForm === 'I' || activeForm === 'RI') && c === activeRow;
                return (
                  <div
                    key={`col-head-${c}`}
                    onClick={() => {
                      if (activeForm === 'I' || activeForm === 'RI') {
                        onChangeRow(c);
                      }
                    }}
                    className={`w-8 h-8 sm:w-9 sm:h-9 flex flex-col items-center justify-center text-[10px] font-bold rounded cursor-pointer transition ${
                      isColSelected
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-indigo-400 hover:bg-slate-900 border border-transparent'
                    }`}
                    title={`Column I${c} (Inversion transposition ${c})`}
                  >
                    <span>I{c}</span>
                  </div>
                );
              })}

              {/* 12 Matrix Rows */}
              {matrix.map((rowArr, r) => {
                const isRowSelected = (activeForm === 'P' || activeForm === 'R') && r === activeRow;
                return (
                  <Fragment key={`row-${r}`}>
                    {/* Row Header (P0..P11) */}
                    <div
                      onClick={() => {
                        if (activeForm === 'P' || activeForm === 'R') {
                          onChangeRow(r);
                        }
                      }}
                      className={`w-8 h-8 sm:w-9 sm:h-9 flex flex-col items-center justify-center font-bold text-[10px] rounded cursor-pointer transition ${
                        isRowSelected
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-indigo-300 hover:bg-slate-900 border border-transparent'
                      }`}
                      title={`Row P${r} (Prime transposition ${r})`}
                    >
                      <span>P{r}</span>
                    </div>

                    {/* 12 Cells in this row */}
                    {rowArr.map((pc, c) => {
                      const isRowActive = (activeForm === 'P' || activeForm === 'R') && r === activeRow;
                      const isColActive = (activeForm === 'I' || activeForm === 'RI') && c === activeRow;
                      const isHighlighted = isRowActive || isColActive;

                      return (
                        <div
                          key={`cell-${r}-${c}`}
                          onClick={() => {
                            if (activeForm === 'P' || activeForm === 'R') {
                              onChangeRow(r);
                            } else {
                              onChangeRow(c);
                            }
                          }}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-md flex flex-col items-center justify-center text-[10px] font-mono cursor-pointer transition-all ${
                            isHighlighted
                              ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-300 shadow-md scale-105 z-10'
                              : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                          }`}
                          title={`Row P${r}, Col I${c}: Pitch Class ${pc} (${PITCH_NAMES[pc]})`}
                        >
                          <span className="leading-tight font-semibold">{pc}</span>
                          <span className="text-[8px] opacity-75 leading-tight">{PITCH_NAMES[pc]}</span>
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Matrix Controls & Explanatory Inspector */}
        <div className="lg:col-span-4 space-y-4 text-xs font-mono">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-slate-400 block text-[11px]">Selected Serial Form:</span>
                <span className="text-base font-bold text-indigo-400">
                  {activeForm}
                  {activeRow}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded bg-slate-800 text-indigo-300 border border-slate-700 text-[11px]">
                {activeForm === 'P'
                  ? `Prime Row ${activeRow}`
                  : activeForm === 'R'
                  ? `Retrograde Row ${activeRow}`
                  : activeForm === 'I'
                  ? `Inversion Column ${activeRow}`
                  : `Retrograde-Inversion Column ${activeRow}`}
              </span>
            </div>

            {/* Row Selector Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Row Transposition Index:</span>
                <span className="text-indigo-400 font-bold">{activeRow} / 11</span>
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
                <span className="text-slate-200 font-medium">Reverse Audio Buffers</span>
                <p className="text-[10px] text-slate-500">Inverts waveform time envelope x[-t] during Retrograde</p>
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

            {/* Pitch Class Sequence for this form */}
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <span className="text-slate-400 text-[10px] block uppercase tracking-wider">
                12-Event Row Pitch Classes:
              </span>
              <div className="flex flex-wrap gap-1">
                {pitch_classes.map((pc, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 bg-slate-900 border border-slate-700/80 rounded text-[10px] text-indigo-300"
                  >
                    {PITCH_NAMES[pc]} ({pc})
                  </span>
                ))}
              </div>
            </div>

            {/* DSP Transformation Explanation */}
            <div className="bg-slate-950/70 p-3 rounded-lg border border-indigo-900/30 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
              <div className="flex items-center space-x-1.5 text-indigo-400 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>How This Maps to Audio DSP:</span>
              </div>
              <p>
                &bull; <strong>P (Prime):</strong> Plays the 12 transient slices forward in original sequence.
              </p>
              <p>
                &bull; <strong>R (Retrograde):</strong> Slices play in reverse order (12 to 1), with optional reversed buffer x[-t].
              </p>
              <p>
                &bull; <strong>I (Inversion):</strong> Harmonic slices mirror pitch around row centroid (&Delta;st_inv = -&Delta;st). Drums/inharmonic transients invert frequency bands via FFT (X_inv[k] = X[K - 1 - k]).
              </p>
              <p>
                &bull; <strong>RI:</strong> Combines inversion with retrograded slice sequence.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Circle, Lightbulb, Sparkles } from 'lucide-react';

interface WorkflowGuideProps {
  hasStems: boolean;
  hasSlices: boolean;
  hasMatrix: boolean;
  hasMaster: boolean;
  activeStemForMatrix: string;
  totalSlices: number;
}

export function WorkflowGuide({
  hasStems,
  hasSlices,
  hasMatrix,
  hasMaster,
  activeStemForMatrix,
  totalSlices
}: WorkflowGuideProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Determine current active step (1 to 5)
  let currentStep = 1;
  if (hasMaster) currentStep = 5;
  else if (hasMatrix) currentStep = 4;
  else if (hasSlices) currentStep = 3;
  else if (hasStems) currentStep = 2;

  const steps = [
    {
      num: 1,
      title: 'Stem Separation',
      desc: 'Separate mix into 4 stems: Drums, Bass, Other, Vocals.',
      done: hasStems,
      actionHint: hasStems ? 'Stems ready in cache' : 'Upload an audio file or click "Load Menotti Demo"'
    },
    {
      num: 2,
      title: 'MIR Transient Slicing',
      desc: 'Chop stems into acoustic grains & extract pitch/spectral features.',
      done: hasSlices,
      actionHint: hasSlices ? `${totalSlices} total slices extracted` : 'Click "Detect & Slice Events" with chosen threshold'
    },
    {
      num: 3,
      title: '12-Tone Serial Matrix',
      desc: 'Form 12-event rows & compute Babbitt matrix (P, R, I, RI).',
      done: hasMatrix,
      actionHint: hasMatrix ? `Row loaded from stem: ${activeStemForMatrix}` : 'Click "Select for Matrix" on any stem in Waveform Viewer'
    },
    {
      num: 4,
      title: 'Timeline & Density Curve',
      desc: 'Draw event density envelope (events/sec) & set stem weights.',
      done: hasMaster || hasMatrix,
      actionHint: hasMaster ? 'Density automation rendered' : 'Drag handles on the density curve and balance stem weights'
    },
    {
      num: 5,
      title: '24-bit Master Mixdown',
      desc: 'Synthesize master WAV using overlap-add & soft-knee limiter.',
      done: hasMaster,
      actionHint: hasMaster ? 'Playable master ready to audition & export' : 'Click "Synthesize Mixdown" in the top bar'
    }
  ];

  return (
    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-4 shadow-lg space-y-3 font-mono">
      {/* Step Indicator Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Algorithmic Pipeline Guide
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            Step {currentStep} of 5
          </span>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-slate-800 hover:bg-slate-700/80 px-2.5 py-1 rounded transition"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{isOpen ? 'Close Detailed Tutorial' : 'Open How-It-Works Tutorial'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 5-Step Visual Stepper Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 text-[11px]">
        {steps.map((s) => {
          const isCurrent = currentStep === s.num;
          return (
            <div
              key={s.num}
              className={`rounded-lg p-2.5 border transition-all ${
                s.done
                  ? 'bg-slate-950/70 border-emerald-500/40 text-slate-300'
                  : isCurrent
                  ? 'bg-indigo-950/50 border-indigo-500 ring-1 ring-indigo-400/50 text-white shadow-md'
                  : 'bg-slate-950/40 border-slate-800 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[10px] uppercase text-indigo-400">Step {s.num}</span>
                {s.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Circle className={`w-3.5 h-3.5 ${isCurrent ? 'text-indigo-400 animate-pulse' : 'text-slate-600'}`} />
                )}
              </div>
              <div className="font-semibold text-xs text-slate-100">{s.title}</div>
              <p className="text-[10px] mt-1 leading-tight text-slate-400">{s.actionHint}</p>
            </div>
          );
        })}
      </div>

      {/* Collapsible In-Depth Tutorial & Musical Theory Guide */}
      {isOpen && (
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs space-y-4 text-slate-300 mt-2 font-sans leading-relaxed">
          <div className="flex items-center space-x-2 text-indigo-400 font-mono text-sm font-bold border-b border-slate-800 pb-2">
            <Lightbulb className="w-4 h-4" />
            <span>SerialAudio Engine — Complete Operational Tutorial</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <h4 className="font-mono text-xs font-semibold text-indigo-300 uppercase">
                1. What Happens After Stem Separation?
              </h4>
              <p className="text-slate-400 text-xs">
                When audio is separated by Demucs into <strong>Drums, Bass, Other, Vocals</strong>, they are stored in the session cache.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-xs">
                <li>
                  <strong>Click "Detect & Slice Events"</strong>: The MIR engine detects onsets using spectral flux, energy difference, or High Frequency Content (HFC).
                </li>
                <li>
                  Each acoustic slice is isolated with an anti-click Hann crossfade ramp (5 ms) and analyzed for fundamental frequency (f0 in Hz/MIDI) and spectral centroid.
                </li>
                <li>
                  Inspect the slices in the <strong>Multi-Track Waveform Viewer</strong>. Click any slice to hear its isolated sound.
                </li>
              </ul>
            </div>

            <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <h4 className="font-mono text-xs font-semibold text-indigo-300 uppercase">
                2. How the 12-Tone Serial Matrix Operates on Audio
              </h4>
              <p className="text-slate-400 text-xs">
                Click <strong>"Select for Matrix"</strong> on any stem (e.g., <em>Other</em> or <em>Drums</em>) to assemble a 12-slice prime row (P0):
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-xs">
                <li>
                  <strong>Babbitt 12x12 Matrix:</strong> Computes all 48 canonical forms: 12 Prime (P0..P11), 12 Retrograde (R0..R11), 12 Inversion (I0..I11), and 12 Retrograde Inversion (RI0..RI11).
                </li>
                <li>
                  <strong>P (Prime):</strong> Plays the 12 slices forward.
                </li>
                <li>
                  <strong>R (Retrograde):</strong> Reverses slice order, with optional waveform reverse (x[-t]).
                </li>
                <li>
                  <strong>I (Inversion):</strong> For harmonic slices, interval pitch reflection mirrors melodies around the row centroid (&Delta;st_inv = -&Delta;st). For inharmonic percussion, FFT spectral band inversion flips high and low frequencies!
                </li>
                <li>
                  <strong>RI:</strong> Conjugates Inversion and Retrograde.
                </li>
              </ul>
            </div>

            <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <h4 className="font-mono text-xs font-semibold text-indigo-300 uppercase">
                3. Density Automation & Timeline Scheduler
              </h4>
              <p className="text-slate-400 text-xs">
                The timeline density canvas defines the pacing of your serial reconstruction:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-xs">
                <li>
                  <strong>Density Curve (&lambda;(t) events/sec):</strong> Click anywhere on the graph to add control points, or drag existing handles. Try the <em>Golden Arch</em>, <em>Crescendo</em>, or <em>Polyrhythmic</em> presets.
                </li>
                <li>
                  <strong>Stem Weights:</strong> Sliders adjust the probability of triggering drums vs. bass vs. harmonic chords vs. lead melodies at any moment.
                </li>
                <li>
                  <strong>Target Duration:</strong> Choose anywhere from 5 seconds to 60 seconds.
                </li>
              </ul>
            </div>

            <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <h4 className="font-mono text-xs font-semibold text-indigo-300 uppercase">
                4. Mixdown Synthesis & Mastering Export
              </h4>
              <p className="text-slate-400 text-xs">
                Click <strong>"Synthesize Mixdown"</strong> in the top header:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-xs">
                <li>
                  The Python DSP engine schedules transformed serial row events according to the density envelope, applies equal-power stereo panning, and sums them into a master buffer.
                </li>
                <li>
                  A soft-knee limiter normalizes output to prevent digital clipping.
                </li>
                <li>
                  Click <strong>"Play Master"</strong> to audition with real-time playhead tracking, or <strong>"Export WAV"</strong> to save the 24-bit broadcast WAV master!
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

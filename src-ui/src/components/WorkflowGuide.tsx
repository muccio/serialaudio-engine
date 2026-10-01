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
                2. Come Funziona la Matrice Seriale Dodecafonica nell'Audio (DSP & Algoritmi)
              </h4>
              <p className="text-slate-400 text-xs">
                Seleziona qualsiasi stem (es. <em>Other</em> o <em>Drums</em>) o premi <strong>"Genera Matrice 12x12"</strong> nello Step 3. Ecco il meccanismo matematico ed audio che governa la sintesi:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-slate-400 text-xs">
                <li>
                  <strong>Serie Base (Prime Row P0):</strong> Le prime 12 fette temporali dello stem formano la serie fondamentale. Per ogni fetta viene stimato il pitch fondamentale <em>f0</em> (o il baricentro spettrale per i suoni percussivi) e convertito in classe di altezza modulare <em>PC &isin; &#123;0..11&#125;</em>.
                </li>
                <li>
                  <strong>Matrice di Babbitt 12x12:</strong> La riga 0 &egrave; P0; la colonna 0 &egrave; l'inversione I0. Ciascuna cella <em>(r, c) = (P0[c] - P0[0] + I0[r]) mod 12</em>. La matrice genera 48 permutazioni seriali canoniche (12 Prime, 12 Retrograde, 12 Inversioni, 12 Retrograde-Inversioni).
                </li>
                <li>
                  <strong>Forma P (Prime):</strong> Esegue la sequenza in avanti. L'indice di riga seleziona la trasposizione cromatica di partenza.
                </li>
                <li>
                  <strong>Forma R (Retrogrado):</strong> Inverte l'ordine temporale delle fette (da destra a sinistra nella matrice). Se attivi <em>Reverse Buffer (x[-t])</em>, anche i campioni PCM di ciascun buffer vengono suonati al contrario (effetto nastro rovesciato).
                </li>
                <li>
                  <strong>Forma I (Inversione):</strong> Specchia simmetricamente gli intervalli di pitch attorno al baricentro (&Delta;st<sub>inv</sub> = -&Delta;st). Per i suoni inarmonici/percussivi (es. batteria), il motore DSP esegue un'<strong>Inversione Spettrale FFT</strong>: le frequenze acute diventano gravi e viceversa!
                </li>
                <li>
                  <strong>Forma RI (Retrogrado Inverso):</strong> Coniuga l'inversione spettrale/pitch con la lettura temporale retrograda.
                </li>
              </ul>
            </div>

            <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <h4 className="font-mono text-xs font-semibold text-indigo-300 uppercase">
                3. Download di Tutti i Prodotti Intermedi
              </h4>
              <p className="text-slate-400 text-xs">
                Puoi esportare ed utilizzare all'esterno ogni singolo componente generato dalla workstation:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-xs">
                <li>
                  <strong>Input Audio:</strong> Scarica il file audio grezzo caricato o il demo sintetico in formato WAV.
                </li>
                <li>
                  <strong>Stems Separati:</strong> Scarica ciascun file WAV individuale (<em>drums.wav, bass.wav, other.wav, vocals.wav</em>) oppure l'archivio <strong>Stems (ZIP)</strong> completo.
                </li>
                <li>
                  <strong>Fette & Transienti (Slices):</strong> Scarica tutte le fette in archivio <strong>All Slices (ZIP)</strong> con all'interno i file <em>slices_metadata.json</em> e <em>slices_metadata.csv</em>, o scarica singoli slice WAV direttamente dall'ispettore.
                </li>
                <li>
                  <strong>Matrice Seriale (JSON):</strong> Esporta la matrice 12x12 con classi di altezza e metadati per l'integrazione in software MIDI o composizioni esterne.
                </li>
              </ul>
            </div>

            <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <h4 className="font-mono text-xs font-semibold text-indigo-300 uppercase">
                4. Timeline Automation & Scheduler di Densità (Nessun Limite di 60s)
              </h4>
              <p className="text-slate-400 text-xs">
                La timeline imposta il ritmo e la struttura della ricomposizione seriale:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-xs">
                <li>
                  <strong>Durata Libera:</strong> Imposta qualsiasi durata desiderata (es. 15s, 60s, 120s, 300s+) senza alcun limite massimo prefissato, digitando il valore esatto o usando i preset rapidi.
                </li>
                <li>
                  <strong>Curva di Densità (&lambda;(t) eventi/sec):</strong> Fai clic sulla tela per aggiungere punti di automazione o trascina i cerchietti per modellare la densità.
                </li>
                <li>
                  <strong>Pesi degli Stem:</strong> Regola la probabilità relativa con cui batteria, basso, archi o voci vengono innescati.
                </li>
              </ul>
            </div>

            <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <h4 className="font-mono text-xs font-semibold text-indigo-300 uppercase">
                5. Sintesi Mixdown & Master WAV 24-bit
              </h4>
              <p className="text-slate-400 text-xs">
                Clicca su <strong>"Render Timeline Mixdown"</strong>:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-xs">
                <li>
                  Il motore Python DSP pianifica gli eventi delle serie seriali trasformate secondo l'inviluppo di densità, applica il panning equal-power e somma i flussi in un master a 24-bit (44.1 o 48 kHz).
                </li>
                <li>
                  Un limiter soft-knee normalizza l'uscita azzerando i rischi di digital clipping.
                </li>
                <li>
                  Puoi ascoltare il risultato con il player integrato o scaricarlo con <strong>"Export WAV"</strong>.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

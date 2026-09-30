# SerialAudio Engine — Guida Operativa & Tutorial Completo

**Versione:** 0.1.0  
**Architettura:** Tauri v2 + React 18 + Python 3.11 (PyTorch / Demucs / Librosa / FastAPI)

---

## 1. Panoramica del Sistema

**SerialAudio Engine** è una workstation audio ibrida che unisce l'estrazione MIR (Music Information Retrieval) e la separazione delle sorgenti neurali con le tecniche di composizione seriale dodecafonica applicate direttamente al DSP del segnale audio.

---

## 2. Il Flusso Operativo Passo-Passo (Workflow 1 &rarr; 5)

La workstation guida l'utente attraverso **5 fasi sequenziali**:

```
+-------------------------------------------------------------------------------------------------------+
|  [Step 1: Separazione] -> [Step 2: Slicing MIR] -> [Step 3: Matrice 12x12] -> [Step 4: Timeline] -> [Step 5: Mixdown]  |
+-------------------------------------------------------------------------------------------------------+
```

---

### Step 1: Ingestione & Stem Separation (Demucs v4)

1. **Caricamento Audio:**
   - Puoi trascinare un file audio (WAV, FLAC, MP3 a 44.1 o 48 kHz) nell'area di upload.
   - Oppure puoi cliccare su **`Load Menotti "Sebastian's Dance" Demo`**: il sistema genererà automaticamente i 4 stem orchestrali dedicati (archi ritmici, legni solisti, ostinato di violoncelli/bassi e percussioni sincopate).
2. **Separazione:**
   - Demucs v4 esegue il modello neurale `htdemucs` con accelerazione hardware (MPS su Mac Apple Silicon o CUDA su Nvidia).
   - Vengono isolati 4 stem acustici:
     - **Drums** (batteria / percussioni)
     - **Bass** (basso / contrabbasso)
     - **Other** (archi, ottoni, pianoforte, chitarre)
     - **Vocals** (voce o melodia solista dei fiati)
   - Tutti gli stem vengono salvati e memorizzati nella session cache locale (`session_cache/<session_id>/stems/`).

---

### Step 2: Cosa succede dopo la Stem Separation? (MIR Transient Slicing)

Una volta separati gli stem, essi sono tracce audio continue. Il motore ha bisogno di **isolare i grani acustici (slice)** per poterli riordinare serialmente.

1. **Configurazione dei Parametri MIR:**
   - **Metodo di Rilevamento Onset:**
     - `spectral_flux`: Rilevamento basato sul flusso spettrale rettificato a mezza onda (ideale per strumenti polifonici e archi).
     - `hfc` (High Frequency Content): Pondera le alte frequenze dell'STFT (ideale per transienti percussivi secchi come tamburi e legni).
     - `energy`: Derivata prima dell'energia RMS temporale (ideale per suoni percussivi semplici).
   - **Threshold (Sensibilità):** Valore da $0.05$ a $0.80$. Più basso è, più slice verranno rilevati.
   - **Min / Max Event Duration (ms):** Durata minima (default $50\,\text{ms}$) e massima (default $1200\,\text{ms}$) per ogni grano.
   - **Crossfade Envelope (ms):** Rampa Hann a coseno rialzato applicata all'attacco e al rilascio di ogni slice per eliminare qualsiasi click da passaggio per lo zero.
2. **Esecuzione Slicing:**
   - Clicca su **`Detect & Slice Events`**.
   - Il motore analizza ogni stem ed estrae i metadati acustici:
     - $f_0$ (Frequenza fondamentale stimata in Hz e semitono MIDI via algoritmo `librosa.pyin`).
     - Centroide spettrale (luminosità timbrica in Hz).
   - Nel **Multi-Track Waveform Viewer** compariranno i marker verticali e le etichette con il semitono o i Hz di ogni slice.
   - **Audizione:** Puoi cliccare su qualsiasi slice nella forma d'onda per ascoltarlo singolarmente!

---

### Step 3: La Matrice Dodecafonica & Le Trasformazioni Seriali

Una volta estratti i slice, il motore li raggruppa in **righe di 12 eventi** ($S = \{s_0, s_1, \dots, s_{11}\}$).

1. **Selezionare lo Stem per la Matrice:**
   - Nel Waveform Viewer, clicca sul pulsante **`Select for Matrix`** accanto a una delle tracce (es. *Other*, *Bass*, o *Drums*).
   - Il motore calcola istantaneamente la classica matrice di Babbitt $12 \times 12$ basata sulle classi di altezza (Pitch Classes da $0$ a $11$) dei primi 12 slice.
2. **Lettura della Matrice:**
   - La matrice contiene **144 celle** ($12 \times 12$), disposte con le righe Prime a sinistra ($P_0 \dots P_{11}$) e le colonne Inversion in alto ($I_0 \dots I_{11}$).
   - Ogni cella mostra il Pitch Class ($0 = \text{C}, 1 = \text{C}\sharp, \dots, 11 = \text{B}$).
3. **Le 4 Forme Seriali Dodecafoniche & Il Mappaggio DSP:**
   - **P (Prime / Forma Base):** Riproduce la sequenza dei 12 slice in ordine originale ($s_0 \to s_{11}$).
   - **R (Retrogrado):** Inverte l'ordine temporale della sequenza ($s_{11} \to s_0$).
     - Se il toggle **`Reverse Audio Buffers`** è attivo, inverte anche la forma d'onda interna di ogni singolo slice nel tempo ($x[-t]$).
   - **I (Inversione):**
     - *Per i slice armonici/melodici:* Riflessione speculare degli intervalli rispetto al baricentro di intonazione della serie ($C = \frac{1}{12}\sum semitoni$):
       $$\Delta st = semitone - C \implies \text{Pitch Shift di } -2 \cdot \Delta st \text{ semitoni}$$
       La trasposizione viene calcolata ed applicata via phase vocoder di alta qualità.
     - *Per i slice inarmonici/percussivi (es. Drums):* Viene eseguita un'**inversione spettrale FFT**:
       $$X_{inv}[k] = X[K - 1 - k]$$
       le frequenze gravi diventano acute e le acute diventano gravi, ricostruendo la fase con istft.
   - **RI (Retrogrado Inverso):** Applica contemporaneamente l'inversione degli intervalli e l'inversione dell'ordine temporale dei grani.
4. **Selezione Trasposizione (Indice 0–11):**
   - Spostando lo slider dell'indice di riga da $0$ a $11$, puoi selezionare qualsiasi trasposizione della serie.

---

### Step 4: Timeline & Generatore di Densità ($\lambda(t)$ Events/Sec)

La timeline non è una semplice sequenza rigida, ma un **generatore continuo di densità stocastico-seriale**:

1. **Curva di Automazione della Densità:**
   - Il canvas visualizza il tasso di densità $\lambda(t)$ (da $0.5$ a $16$ eventi al secondo) in funzione del tempo.
   - Puoi **cliccare ovunque sul grafico** per aggiungere nuovi punti di controllo, oppure **trascinare i nodi esistenti**.
   - Sono disponibili preset musicali:
     - *Golden Arch:* Attacco rarefatto, picco di densità al centro, chiusura rarefatta.
     - *Crescendo:* Crescita continua di densità fino al climax finale.
     - *Polyrhythmic:* Onde ritmiche alternate.
2. **Durata Target:**
   - Regolabile liberamente tramite slider da $5$ a $60$ secondi.
3. **Stem Balance Weights:**
   - Sliders per bilanciare la probabilità di estrazione fra i 4 stem:
     - Drums %
     - Bass %
     - Other %
     - Vocals %

---

### Step 5: Sintesi del Mixdown Master & Esportazione WAV

1. **Rendering:**
   - Clicca su **`Synthesize Mixdown`** nella barra superiore.
   - Il motore Python:
     - Integra la densità $\lambda(t)$ nel tempo per calcolare i trigger temporali esatti.
     - Estrae i grani seguendo ciclicamente la serie seriale trasformata ($P_n, R_n, I_n, \text{o } RI_n$).
     - Applica il panning stereo a potenza costante.
     - Somma le tracce in overlap-add.
     - Applica un limiter soft-knee normalizzatore per prevenire il clipping digitale.
2. **Audizione:**
   - Clicca **`Play Master`** per ascoltare la composizione completata. La linea verde della playhead scorrerà lungo il canvas in tempo reale.
3. **Esportazione:**
   - Clicca **`Export WAV`** per scaricare direttamente il master WAV a 24-bit (44.1 o 48.0 kHz).

---

## 3. Bug Risolti in questo Aggiornamento

1. **Visualizzazione Matrice a 1 Colonna:**
   - *Causa:* La classe `grid-cols-13` non faceva parte dei default di Tailwind CSS, provocando il fallback del browser a 1 sola colonna a blocchi.
   - *Risoluzione:* Configurato esplicitamente `gridTemplateColumns: repeat(13, minmax(2rem, 2.5rem))` con styling uniforme e `gridTemplateColumns: { '13': 'repeat(13, minmax(0, 1fr))' }` in `tailwind.config.js`.
2. **Errore 404 e Syntax Error su `manifest.webmanifest`:**
   - *Causa:* Il browser richiedeva automaticamente `/manifest.webmanifest`, `/vite.svg` e `/favicon.ico`. Mancando la cartella `public`, il server rispondeva con HTML che generava un `SyntaxError` quando interpretato come JSON.
   - *Risoluzione:* Creati `manifest.webmanifest`, `manifest.json`, `vite.svg` e `favicon.ico` in `src-ui/public/` e aggiunti endpoint di fallback in `engine-py/main.py`.
3. **Guida e Tutorial Integrati nella UI:**
   - Aggiunto il componente interattivo **`WorkflowGuide`** con indicatore visivo a 5 step e tutorial a scomparsa direttamente dentro la workstation.

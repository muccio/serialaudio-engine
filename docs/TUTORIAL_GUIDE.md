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

### Step 3: La Matrice Dodecafonica & Le Trasformazioni Seriali sull'Audio

Una volta estratti i slice, il motore li organizza matematicamente in una **serie dodecafonica di 12 eventi** ($S = \{s_0, s_1, \dots, s_{11}\}$).

#### 1. Come nasce la Serie Fondamentale ($P_0$):
- Quando selezioni uno stem (es. *Other*, *Bass*, *Drums* o *Vocals*) o premi **"Genera Matrice 12x12"**, il sistema prende i primi 12 slice temporali estratti dall'algoritmo MIR.
- Per ogni slice viene calcolata l'intonazione stimata $f_0$ in semitoni MIDI (per elementi armonici) o il centroide spettrale (per elementi percussivi).
- Il pitch viene proiettato nella classe di altezza modulare dodecafonica ($PC \in \{0, 1, \dots, 11\}$ dove $0=\text{C}, 1=\text{C}\sharp, \dots, 11=\text{B}$).

#### 2. Costruzione della Matrice di Babbitt $12 \times 12$:
- La riga superiore è la serie originale $P_0$.
- La colonna sinistra è l'inversione $I_0$, ottenuta calcolando:
  $$I_0[i] = (P_0[0] - (P_0[i] - P_0[0])) \pmod{12}$$
- Ciascuna cella della matrice $(r, c)$ viene calcolata come:
  $$\text{Cell}[r, c] = (P_0[c] - P_0[0] + I_0[r]) \pmod{12}$$
- La matrice genera **48 permutazioni seriali canoniche** della composizione:
  - 12 forme **Prime** ($P_0 \dots P_{11}$)
  - 12 forme **Retrograde** ($R_0 \dots R_{11}$)
  - 12 forme **Inversion** ($I_0 \dots I_{11}$)
  - 12 forme **Retrograde-Inversion** ($RI_0 \dots RI_{11}$)

#### 3. Come la Matrice si traduce in Suono (DSP Engine):
Quando la timeline riproduce o sintetizza gli eventi, non usa pitch sintetici astratti: **applica le permutazioni matematiche ai buffer audio dei singoli slice**:

- **P (Prime):**
  - Legge la sequenza dei 12 slice da sinistra a destra nella matrice.
  - La riga selezionata (da $0$ a $11$) determina la trasposizione cromatica di partenza.
- **R (Retrogrado):**
  - Legge la sequenza delle fette da destra a sinistra (inversione dell'ordine temporale degli eventi).
  - Se attivi il comando **`Reverse Audio Buffers (x[-t])`**, ciascun campione PCM all'interno del grano audio viene rovesciato nel tempo (effetto tape reverse psichedelico/concreto).
- **I (Inversione):**
  - Legge la colonna della matrice dall'alto in basso.
  - **Per fette armoniche (melodiche):** Calcola il baricentro di pitch della serie $C = \frac{1}{12}\sum semitoni$. Per ogni slice calcola la distanza $\Delta st = semitone - C$ e applica un pitch shifting con phase vocoder pari a $-2 \cdot \Delta st$. Una melodia ascendente diventa discendente con intervalli speculari identici!
  - **Per fette inarmoniche (percussioni/batteria):** Esegue un'**Inversione Spettrale FFT**:
    $$X_{inv}[k] = X[K - 1 - k]$$
    invertendo l'asse delle frequenze dell'STFT: le frequenze gravi (cassa/sub) salgono ad acuti brillanti e le frequenze acute (piatti/charleston) scendono a toni cupi e scuri!
- **RI (Retrogrado Inverso):**
  - Coniuga la lettura temporale inversa e l'inversione spettrale o di intonazione.

---

### Step 4: Timeline & Generatore di Densità (Nessun Limite di 60 Secondi)

La timeline non è legata a vincoli prefissati: puoi impostare **qualsiasi durata target** (da 5 secondi a 120s, 300s, 600s o più):

1. **Durata Libera & Senza Limiti:**
   - Tramite la casella numerica puoi inserire liberamente qualsiasi numero di secondi (es. `15`, `60`, `180`, `300`).
   - Sono disponibili pulsanti di preset immediati: **`15s`**, **`30s`**, **`60s`**, **`120s`**, **`300s`**.
   - Lo slider orizzontale si adatta dinamicamente alla durata impostata.
2. **Curva di Densità $\lambda(t)$ (Eventi/Secondo):**
   - Disegna sulla tela interattiva il flusso di densità stocastica nel tempo.
   - Punti di controllo manipolabili con il mouse o con preset grafici (*Golden Arch*, *Crescendo*, *Polyrhythmic*).
3. **Pesi di Bilanciamento degli Stem:**
   - Sliders individuali per stabilire la probabilità che a ogni istante venga suonata una fetta di batteria, basso, archi o voce.

---

### Step 5: Sintesi del Mixdown Master & Esportazione

1. Clicca su **`Synthesize Mixdown`** o **`Render Timeline Mixdown`**.
2. Il motore Python esegue lo scheduling stocastico non omogeneo secondo $\lambda(t)$, assembla le fette trasformate della matrice dodecafonica, applica il panning equal-power e produce un master WAV a **24-bit PCM** (a 44.1 o 48.0 kHz).
3. Il limiter soft-knee integrato previene qualsiasi saturazione digitale.

---

## 3. Download di Tutti i Prodotti Intermedi

La workstation permette ora di esportare e scaricare ogni singolo elemento intermedio prodotto dal pipeline:

| Prodotto Intermedio | Formato | Posizione / Come Scaricarlo |
| --- | --- | --- |
| **Audio Input Originale / Demo** | `.wav` | Pulsante **`Download Input WAV`** nel Modulo 1 |
| **Singoli Stems Separati** | `.wav` | Pulsante **`WAV`** accanto a ciascun canale nel Modulo 2 |
| **Tutti i 4 Stems Insieme** | `.zip` | Pulsante **`Stems (ZIP)`** nella testata del Modulo 2 |
| **Tutte le Fette Audio Rilevate** | `.zip` | Pulsante **`All Slices (ZIP)`** nella testata del Modulo 2 (include WAVs, `slices_metadata.json` e `slices_metadata.csv`) |
| **Metadati delle Fette** | `.json` | Pulsante **`Metadata (JSON)`** nella testata del Modulo 2 |
| **Singolo Slice WAV** | `.wav` | Icona download nel badge di anteprima dello slice quando ci si passa sopra con il mouse |
| **Fette di uno Specifico Stem** | `.zip` | Pulsante **`ZIP`** accanto alla traccia dello stem nel Modulo 2 o Modulo 3 |
| **Matrice Seriale 12x12** | `.json` | Pulsante **`Export Matrix (JSON)`** nella barra delle forme del Modulo 3 |
| **Master Renderizzato Finale** | `.wav` (24-bit) | Pulsante **`Export WAV`** nella testata principale della DAW |

Tutti i download sono disponibili anche via API REST:
- `/api/download/stem/{session_id}/{stem}`
- `/api/download/stems-zip/{session_id}`
- `/api/download/slices-zip/{session_id}`
- `/api/download/slices-meta/{session_id}`
- `/api/download/matrix-json/{session_id}/{stem}`
- `/api/download/raw-mix/{session_id}`
- `/api/download/slice/{session_id}/{stem}/{slice_id}`
- `/api/export/{session_id}`

---

## 4. Salvataggio & Caricamento del Progetto (`.serialproj`)

La workstation include un sistema completo di persistenza del progetto in un unico archivio compatto con estensione **`.serialproj`** (formato standard ZIP decompattabile).

### Cosa include il salvataggio:
1. **`project.json` (Stato e Cronologia Completa):**
   - Nome del progetto, data/ora UTC di creazione e formato.
   - Tutti i passaggi completati fino a quel momento.
   - Impostazioni di slicing MIR (metodo, threshold, min/max ms, crossfade).
   - Metadati acustici di ciascuna fetta ($f_0$ stimato in Hz e semitono, durata, timestamp, centroide spettrale).
   - Matrice seriale di Babbitt $12 \times 12$ pre-calcolata.
   - Stato esatto dell'interfaccia utente:
     - Stem attivo per la matrice (`other`, `drums`, etc.).
     - Forma seriale attiva ($P, R, I, RI$).
     - Indice di riga/trasposizione attiva ($0 \dots 11$).
     - Stato del flag di inversione buffer ($x[-t]$).
     - Durata target della timeline (es. 15s, 60s, 300s).
     - Punti esatti della curva di automazione di densità $\lambda(t)$.
     - Pesi di bilanciamento dei 4 stem.
     - Sample rate selezionato (44.1 o 48.0 kHz).
     - Statistiche dell'ultimo master mixdown (se renderizzato).
2. **Tutti i Dati Audio Generati (File WAV Reali):**
   - `raw/`: Mix audio originale caricato o demo sintetico.
   - `stems/`: Tutti i 4 stem Demucs separati (`drums.wav`, `bass.wav`, `other.wav`, `vocals.wav`).
   - `slices/`: Tutte le singole fette audio WAV segmentate e organizzate per traccia.
   - `master/`: Il master mixdown a 24-bit renderizzato (se generato prima del salvataggio).

### Come salvare:
- Clicca sul pulsante **`Save Proj`** nella barra superiore in alto.
- Inserisci il nome desiderato (default: `SerialAudio_Project`).
- Il browser scaricherà il file `NomeProgetto.serialproj`.

### Come caricare:
- Clicca sul pulsante **`Load Proj`** nella barra superiore in alto.
- Seleziona un file `.serialproj` precedentemente salvato.
- Il motore decomprime e reidrata l'intera sessione sul server:
  - Tutte le forme d'onda, i marcatori di transienti, la matrice dodecafonica, la curva di densità e il lettore audio del master tornano esattamente nello stato in cui erano stati salvati!

---

## 5. Test e Verifica

Per verificare il funzionamento del sistema e dei nuovi endpoint:

```bash
# Esecuzione test suite completa (15 test unitari DSP/API + test di build Vite)
./run.sh test

# Avvio dei server di sviluppo
./run.sh dev
```

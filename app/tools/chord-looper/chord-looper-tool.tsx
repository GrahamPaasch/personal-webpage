'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { NOTE_OPTIONS, clamp, frequencyFromMidi } from '@/lib/music/notes';
import { chordForKey, PROGRESSION_PRESETS, type ProgressionPreset, type ScaleType } from '@/lib/music/harmony';

type Waveform = OscillatorType;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AnyWindow = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = AnyWindow.AudioContext || AnyWindow.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

async function safeResume(ctx: AudioContext) {
  try {
    if (ctx.state !== 'running') await ctx.resume();
  } catch {
    // ignore
  }
}

function scheduleChord(
  ctx: AudioContext,
  time: number,
  freqs: number[],
  opts: { waveform: Waveform; gain: number; durationSec: number },
) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.05, opts.durationSec - 0.05));
  g.connect(ctx.destination);

  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = opts.waveform;
    osc.frequency.setValueAtTime(freq, time);
    osc.connect(g);
    osc.start(time);
    osc.stop(time + opts.durationSec + 0.05);
  }
}

function scheduleClick(ctx: AudioContext, time: number, opts: { frequency: number; gain: number }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(opts.frequency, time);

  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.05);
}

type Settings = {
  keyIndex: number;
  spelling: 'sharp' | 'flat';
  scale: ScaleType;
  presetId: string;
  bpm: number;
  beatsPerBar: number;
  barsPerChord: number;
  waveform: Waveform;
  volume: number;
  click: boolean;
  bass: boolean;
  a4: number;
};

export default function ChordLooperTool(props: { initial?: Partial<Settings> }) {
  const init = props.initial;

  const [keyIndex, setKeyIndex] = useState(clamp(init?.keyIndex ?? 0, 0, 11)); // C
  const [spelling, setSpelling] = useState<'sharp' | 'flat'>(init?.spelling === 'sharp' ? 'sharp' : 'flat');
  const [scale, setScale] = useState<ScaleType>(init?.scale === 'minor' ? 'minor' : 'major');
  const [presetId, setPresetId] = useState<string>(typeof init?.presetId === 'string' ? init.presetId : 'i-v-vi-iv');
  const [bpm, setBpm] = useState(clamp(init?.bpm ?? 92, 30, 240));
  const [beatsPerBar, setBeatsPerBar] = useState(clamp(init?.beatsPerBar ?? 4, 1, 12));
  const [barsPerChord, setBarsPerChord] = useState(clamp(init?.barsPerChord ?? 1, 1, 16));
  const [waveform, setWaveform] = useState<Waveform>(() => {
    const wf = init?.waveform;
    if (wf && ['sine', 'triangle', 'sawtooth', 'square'].includes(wf)) return wf;
    return 'triangle';
  });
  const [volume, setVolume] = useState(clamp(init?.volume ?? 0.18, 0, 1));
  const [click, setClick] = useState(init?.click ?? true);
  const [bass, setBass] = useState(init?.bass ?? false);
  const [a4, setA4] = useState(clamp(init?.a4 ?? 440, 415, 466));

  const [isRunning, setIsRunning] = useState(false);
  const [activeChord, setActiveChord] = useState<number>(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextChordTimeRef = useRef<number>(0);
  const chordIndexRef = useRef<number>(0);
  const uiTimeoutsRef = useRef<number[]>([]);
  const bassOscRef = useRef<OscillatorNode | null>(null);
  const bassGainRef = useRef<GainNode | null>(null);

  const settingsRef = useRef<Settings>({
    keyIndex,
    spelling,
    scale,
    presetId,
    bpm,
    beatsPerBar,
    barsPerChord,
    waveform,
    volume,
    click,
    bass,
    a4,
  });

  useEffect(() => {
    settingsRef.current = {
      keyIndex,
      spelling,
      scale,
      presetId,
      bpm,
      beatsPerBar,
      barsPerChord,
      waveform,
      volume,
      click,
      bass,
      a4,
    };
  }, [a4, barsPerChord, bass, beatsPerBar, bpm, click, keyIndex, presetId, scale, spelling, volume, waveform]);

  const presetOptions = useMemo(() => {
    return PROGRESSION_PRESETS.filter((p) => p.scale === 'any' || p.scale === scale);
  }, [scale]);

  const preset: ProgressionPreset = useMemo(() => {
    const found = presetOptions.find((p) => p.id === presetId);
    return found || presetOptions[0] || PROGRESSION_PRESETS[0];
  }, [presetId, presetOptions]);

  const chords = useMemo(() => {
    return preset.roman
      .map((tok) => chordForKey(keyIndex, scale, tok, { spelling, rootMidi: 48 }))
      .filter(Boolean)
      .map((c) => ({
        name: c!.name,
        midi: c!.midi,
      }));
  }, [keyIndex, preset.roman, scale, spelling]);

  const chordNames = useMemo(() => chords.map((c) => c.name), [chords]);

  const clearUiTimeouts = () => {
    for (const id of uiTimeoutsRef.current) window.clearTimeout(id);
    uiTimeoutsRef.current = [];
  };

  const stopSchedulingNoState = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearUiTimeouts();
  };

  const stopBassNoState = () => {
    const ctx = ctxRef.current;
    const osc = bassOscRef.current;
    const g = bassGainRef.current;
    if (ctx && osc && g) {
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(0.0001, t, 0.03);
      try {
        osc.stop(t + 0.15);
      } catch {
        // ignore
      }
    }
    bassOscRef.current = null;
    bassGainRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      for (const id of uiTimeoutsRef.current) window.clearTimeout(id);
      uiTimeoutsRef.current = [];

      const ctx = ctxRef.current;
      const osc = bassOscRef.current;
      const g = bassGainRef.current;
      if (ctx && osc && g) {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0.0001, t, 0.03);
        try {
          osc.stop(t + 0.15);
        } catch {
          // ignore
        }
      }
      bassOscRef.current = null;
      bassGainRef.current = null;
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  const startBass = (ctx: AudioContext, freq: number, gain: number) => {
    stopBassNoState();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.setTargetAtTime(clamp(gain, 0, 1), ctx.currentTime + 0.01, 0.05);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();

    bassOscRef.current = osc;
    bassGainRef.current = g;
  };

  const start = async () => {
    if (isRunning) return;
    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (!ctx) return;
    await safeResume(ctx);

    stopSchedulingNoState();
    chordIndexRef.current = 0;
    nextChordTimeRef.current = ctx.currentTime + 0.08;
    setActiveChord(0);

    const s = settingsRef.current;
    if (s.bass) {
      const rootMidi = 36 + ((s.keyIndex % 12) + 12) % 12; // around C2
      const freq = frequencyFromMidi(rootMidi, s.a4);
      startBass(ctx, freq, 0.08);
    }

    const lookaheadMs = 25;
    const scheduleAheadSec = 0.2;

    const scheduler = () => {
      const st = settingsRef.current;
      const beats = clamp(st.beatsPerBar, 1, 12);
      const bars = clamp(st.barsPerChord, 1, 16);
      const secondsPerBeat = 60 / clamp(st.bpm, 30, 240);
      const chordLen = secondsPerBeat * beats * bars;

      while (nextChordTimeRef.current < ctx.currentTime + scheduleAheadSec) {
        const idx = chordIndexRef.current % Math.max(1, chords.length);
        const chord = chords[idx];
        if (!chord) {
          nextChordTimeRef.current += chordLen;
          chordIndexRef.current += 1;
          continue;
        }

        const freqs = chord.midi.map((m) => frequencyFromMidi(m, st.a4));
        // Add an octave on the root for a fuller sound.
        freqs.push(frequencyFromMidi(chord.midi[0] + 12, st.a4));

        scheduleChord(ctx, nextChordTimeRef.current, freqs, {
          waveform: st.waveform,
          gain: clamp(st.volume, 0, 0.6),
          durationSec: chordLen,
        });

        if (st.click) {
          for (let b = 0; b < beats * bars; b += 1) {
            const t = nextChordTimeRef.current + b * secondsPerBeat;
            const isDownbeat = b % beats === 0;
            scheduleClick(ctx, t, { frequency: isDownbeat ? 1400 : 980, gain: isDownbeat ? 0.35 : 0.22 });
          }
        }

        const delayMs = Math.max(0, Math.round((nextChordTimeRef.current - ctx.currentTime) * 1000));
        const timeoutId = window.setTimeout(() => setActiveChord(idx), delayMs);
        uiTimeoutsRef.current.push(timeoutId);

        nextChordTimeRef.current += chordLen;
        chordIndexRef.current += 1;
      }
    };

    timerRef.current = window.setInterval(scheduler, lookaheadMs);
    setIsRunning(true);
  };

  const stop = () => {
    if (!isRunning) return;
    stopSchedulingNoState();
    stopBassNoState();
    setIsRunning(false);
  };

  const keyLabel = useMemo(() => {
    const opt = NOTE_OPTIONS[((keyIndex % 12) + 12) % 12];
    return spelling === 'flat' ? opt.flat : opt.sharp;
  }, [keyIndex, spelling]);

  const copySheet = async () => {
    const lines = [
      `${keyLabel} ${scale} · ${preset.name}`,
      chordNames.join('  |  '),
      '',
      `bpm=${bpm} beatsPerBar=${beatsPerBar} barsPerChord=${barsPerChord}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Chord Looper</h1>
          <span className="prompt-header-badge">HARMONY</span>
        </div>
        <p className="muted">
          Loop common progressions in any key. This is intentionally lightweight: a simple synth, optional click, and a bass drone.
          Use it for ear training, groove, and improvisation practice.
        </p>

        <div className="toolbox-row">
          <div className="music-quiz-display" aria-live="polite">
            <div className="music-quiz-label">Now playing</div>
            <div className="music-quiz-value">{chordNames[activeChord] || '—'}</div>
            <div className="muted small">
              {keyLabel} {scale} · {preset.name} · {bpm} BPM
            </div>
          </div>
          <div className="toolbox-actions">
            <button className={`button primary ${isRunning ? 'music-stop' : ''}`} type="button" onClick={isRunning ? stop : start} disabled={!chords.length}>
              {isRunning ? 'Stop' : 'Start'}
            </button>
            <button className="button" type="button" onClick={copySheet} disabled={!chords.length}>
              Copy
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        <div className="music-prog" aria-label="Chord progression" style={{ marginTop: 12 }}>
          {chords.length ? (
            chords.map((c, i) => (
              <span key={`${c.name}-${i}`} className={`music-prog-chord ${i === activeChord ? 'music-prog-active' : ''}`}>
                {c.name}
              </span>
            ))
          ) : (
            <p className="muted">No chords (check settings).</p>
          )}
        </div>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Progression</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            Key
            <select value={keyIndex} onChange={(e) => setKeyIndex(Number.parseInt(e.target.value, 10))} disabled={isRunning}>
              {NOTE_OPTIONS.map((opt) => (
                <option key={opt.index} value={opt.index}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbox-field">
            Scale
            <select value={scale} onChange={(e) => setScale(e.target.value as ScaleType)} disabled={isRunning}>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </label>
          <label className="toolbox-field">
            Spelling
            <select value={spelling} onChange={(e) => setSpelling(e.target.value as 'sharp' | 'flat')} disabled={isRunning}>
              <option value="flat">Flats</option>
              <option value="sharp">Sharps</option>
            </select>
          </label>
        </div>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Preset
          <select value={preset.id} onChange={(e) => setPresetId(e.target.value)} disabled={isRunning}>
            {presetOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Playback</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            BPM
            <input
              value={String(bpm)}
              onChange={(e) => setBpm(clamp(Number.parseInt(e.target.value || '0', 10), 30, 240))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
          <label className="toolbox-field">
            Beats per bar
            <input
              value={String(beatsPerBar)}
              onChange={(e) => setBeatsPerBar(clamp(Number.parseInt(e.target.value || '0', 10), 1, 12))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
          <label className="toolbox-field">
            Bars per chord
            <input
              value={String(barsPerChord)}
              onChange={(e) => setBarsPerChord(clamp(Number.parseInt(e.target.value || '0', 10), 1, 16))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
        </div>

        <div className="toolbox-row" style={{ marginTop: 12 }}>
          <label className="toolbox-field">
            Waveform
            <select value={waveform} onChange={(e) => setWaveform(e.target.value as Waveform)} disabled={isRunning}>
              <option value="sine">Sine</option>
              <option value="triangle">Triangle</option>
              <option value="sawtooth">Saw</option>
              <option value="square">Square</option>
            </select>
          </label>
          <label className="toolbox-field">
            Volume
            <input
              value={String(Math.round(volume * 100))}
              onChange={(e) => setVolume(clamp(Number.parseInt(e.target.value || '0', 10) / 100, 0, 1))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number.parseInt(e.target.value, 10) / 100)}
          aria-label="Chord volume slider"
          disabled={isRunning}
        />

        <div className="toolbox-row" style={{ marginTop: 12 }}>
          <label className="toolbox-check">
            <input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} disabled={isRunning} />
            <span>Click</span>
          </label>
          <label className="toolbox-check">
            <input type="checkbox" checked={bass} onChange={(e) => setBass(e.target.checked)} disabled={isRunning} />
            <span>Bass drone on tonic</span>
          </label>
        </div>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          A4 tuning (Hz)
          <input
            value={String(a4)}
            onChange={(e) => setA4(clamp(Number.parseInt(e.target.value || '0', 10), 415, 466))}
            inputMode="numeric"
            disabled={isRunning}
          />
        </label>
      </div>
    </>
  );
}

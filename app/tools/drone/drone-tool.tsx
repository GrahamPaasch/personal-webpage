'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { NOTE_OPTIONS, clamp, frequencyFromMidi, midiFromNoteIndex, midiToNoteName, pitchToNote } from '@/lib/music/notes';

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

export default function DroneTool(props: {
  initial?: Partial<{
    noteIndex: number;
    octave: number;
    a4: number;
    volume: number;
    waveform: Waveform;
    spelling: 'sharp' | 'flat';
  }>;
}) {
  const init = props.initial;

  const [isOn, setIsOn] = useState(false);
  const [noteIndex, setNoteIndex] = useState(clamp(init?.noteIndex ?? 9, 0, 11)); // A
  const [octave, setOctave] = useState(clamp(init?.octave ?? 4, 0, 8));
  const [a4, setA4] = useState(clamp(init?.a4 ?? 440, 415, 466));
  const [volume, setVolume] = useState(clamp(init?.volume ?? 0.25, 0, 1));
  const [waveform, setWaveform] = useState<Waveform>(() => {
    const wf = init?.waveform;
    if (wf && ['sine', 'triangle', 'sawtooth', 'square'].includes(wf)) return wf;
    return 'sine';
  });
  const [spelling, setSpelling] = useState<'sharp' | 'flat'>(init?.spelling === 'sharp' ? 'sharp' : 'flat');

  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const midi = useMemo(() => midiFromNoteIndex(noteIndex, octave), [noteIndex, octave]);
  const freq = useMemo(() => frequencyFromMidi(midi, a4), [a4, midi]);
  const noteLabel = useMemo(() => midiToNoteName(midi, spelling), [midi, spelling]);

  const start = async () => {
    if (isOn) return;
    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (!ctx) return;

    await safeResume(ctx);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);

    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    // Gentle fade-in.
    gain.gain.setTargetAtTime(clamp(volume, 0, 1), ctx.currentTime + 0.01, 0.04);

    oscRef.current = osc;
    gainRef.current = gain;
    setIsOn(true);
  };

  const stop = () => {
    if (!isOn) return;
    const ctx = ctxRef.current;
    const osc = oscRef.current;
    const gain = gainRef.current;
    if (ctx && osc && gain) {
      const t = ctx.currentTime;
      gain.gain.setTargetAtTime(0.0001, t, 0.03);
      try {
        osc.stop(t + 0.15);
      } catch {
        // ignore
      }
    }
    oscRef.current = null;
    gainRef.current = null;
    setIsOn(false);
  };

  useEffect(() => {
    // Clean up audio nodes on unmount.
    return () => {
      try {
        oscRef.current?.stop();
      } catch {
        // ignore
      }
      oscRef.current = null;
      gainRef.current = null;
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    const osc = oscRef.current;
    if (!ctx || !osc) return;
    osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
  }, [freq]);

  useEffect(() => {
    const osc = oscRef.current;
    if (!osc) return;
    osc.type = waveform;
  }, [waveform]);

  useEffect(() => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    gain.gain.setTargetAtTime(clamp(volume, 0, 1), ctx.currentTime, 0.03);
  }, [volume]);

  const niceFreq = useMemo(() => {
    const p = pitchToNote(freq, { a4, spelling });
    return { hz: freq, cents: p.cents };
  }, [a4, freq, spelling]);

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Drone</h1>
          <span className="prompt-header-badge">INTONATION</span>
        </div>
        <p className="muted">
          A sustained pitch for intonation work. Keep the volume low. On speakers, drones can get fatiguing fast.
        </p>

        <div className="toolbox-row">
          <div className="music-bpm-display">
            <div className="music-bpm-number" style={{ fontSize: '2.2rem' }}>
              {noteLabel}
            </div>
            <div className="muted small">{freq.toFixed(2)} Hz</div>
          </div>

          <div className="toolbox-actions">
            <button className={`button primary ${isOn ? 'music-stop' : ''}`} type="button" onClick={isOn ? stop : start}>
              {isOn ? 'Stop' : 'Start'}
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        <p className="muted small">
          Equal temperament target: {niceFreq.hz.toFixed(2)} Hz ({niceFreq.cents >= 0 ? '+' : ''}
          {niceFreq.cents.toFixed(1)} cents vs nearest semitone).
        </p>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Pitch</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            Note
            <select value={noteIndex} onChange={(e) => setNoteIndex(Number.parseInt(e.target.value, 10))}>
              {NOTE_OPTIONS.map((opt) => (
                <option key={opt.index} value={opt.index}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbox-field">
            Octave
            <input
              value={String(octave)}
              onChange={(e) => setOctave(clamp(Number.parseInt(e.target.value || '0', 10), 0, 8))}
              inputMode="numeric"
            />
          </label>
          <label className="toolbox-field">
            Spelling
            <select value={spelling} onChange={(e) => setSpelling(e.target.value as 'sharp' | 'flat')}>
              <option value="flat">Flats</option>
              <option value="sharp">Sharps</option>
            </select>
          </label>
        </div>

        <p className="muted small" style={{ marginTop: 12 }}>
          Tip for viola: try A4 (open A), D4 (open D), or the tonic of the key you are practicing.
        </p>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Tone</h2>
        <label className="toolbox-field">
          Waveform
          <select value={waveform} onChange={(e) => setWaveform(e.target.value as Waveform)}>
            <option value="sine">Sine (clean)</option>
            <option value="triangle">Triangle (soft)</option>
            <option value="sawtooth">Saw (bright)</option>
            <option value="square">Square (buzzy)</option>
          </select>
        </label>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Volume
          <input
            value={String(Math.round(volume * 100))}
            onChange={(e) => setVolume(clamp(Number.parseInt(e.target.value || '0', 10) / 100, 0, 1))}
            inputMode="numeric"
          />
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number.parseInt(e.target.value, 10) / 100)}
          aria-label="Drone volume slider"
        />

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          A4 tuning (Hz)
          <input
            value={String(a4)}
            onChange={(e) => setA4(clamp(Number.parseInt(e.target.value || '0', 10), 415, 466))}
            inputMode="numeric"
          />
        </label>
        <p className="muted small">Most orchestras: 440–442. Baroque ensembles: often 415.</p>
      </div>
    </>
  );
}

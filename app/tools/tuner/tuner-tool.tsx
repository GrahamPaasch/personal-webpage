'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { clamp, pitchToNote } from '@/lib/music/notes';
import { detectPitchAutocorrelation } from '@/lib/music/pitchDetect';

type Status = 'idle' | 'requesting' | 'listening' | 'error';

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

export default function TunerTool() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [a4, setA4] = useState(440);
  const [spelling, setSpelling] = useState<'sharp' | 'flat'>('flat');
  const [pitchHz, setPitchHz] = useState<number | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    return () => {
      // Unmount cleanup: stop the audio graph without setState.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      try {
        sourceRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        analyserRef.current?.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
      analyserRef.current = null;

      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
      }
      streamRef.current = null;
      bufRef.current = null;

      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  const note = useMemo(() => {
    if (!pitchHz) return null;
    if (!Number.isFinite(pitchHz) || pitchHz <= 0) return null;
    return pitchToNote(pitchHz, { a4, spelling });
  }, [a4, pitchHz, spelling]);

  const cents = note ? clamp(note.cents, -100, 100) : 0;
  const centsClamped = clamp(cents, -50, 50);
  const pointerPct = ((centsClamped + 50) / 100) * 100;

  const start = async () => {
    if (status === 'listening' || status === 'requesting') return;
    setStatus('requesting');
    setErrorText(null);

    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (!ctx) {
      setStatus('error');
      setErrorText('Web Audio is not supported in this browser.');
      return;
    }

    await safeResume(ctx);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);

      sourceRef.current = source;
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;

      setStatus('listening');
      lastUpdateRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error('tuner getUserMedia failed', err);
      setStatus('error');
      setErrorText('Microphone permission denied or unavailable.');
      setPitchHz(null);
    }
  };

  const stop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      // ignore
    }
    sourceRef.current = null;
    analyserRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    streamRef.current = null;
    bufRef.current = null;

    setStatus('idle');
    setPitchHz(null);
    setErrorText(null);
  };

  function loop(ts: number) {
    rafRef.current = requestAnimationFrame(loop);
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    if (!analyser || !ctx || !buf) return;

    if (ts - lastUpdateRef.current < 90) return;
    lastUpdateRef.current = ts;

    analyser.getFloatTimeDomainData(buf);
    const freq = detectPitchAutocorrelation(buf, ctx.sampleRate, {
      minFreq: 55,
      maxFreq: 1200,
      minRms: 0.01,
      correlationThreshold: 0.25,
    });

    setPitchHz((prev) => {
      if (freq === null) return null;
      // Avoid noisy UI updates for tiny differences.
      if (prev && Math.abs(prev - freq) < 0.05) return prev;
      return freq;
    });
  }

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Tuner</h1>
          <span className="prompt-header-badge">MIC</span>
        </div>
        <p className="muted">
          Microphone-based pitch detection. Use headphones to avoid feedback. This is a practice helper, not a lab instrument.
        </p>

        <div className="toolbox-row">
          <div className="music-tuner-display" aria-live="polite">
            <div className="music-tuner-note">{note?.note || (status === 'listening' ? '…' : '—')}</div>
            <div className="muted small">
              {pitchHz ? `${pitchHz.toFixed(2)} Hz` : status === 'listening' ? 'Listening…' : 'Press Start'}
              {note ? ` · ${note.cents >= 0 ? '+' : ''}${note.cents.toFixed(1)} cents` : ''}
            </div>
            <div className="music-cents-gauge" aria-label="Cents deviation gauge">
              <div className="music-cents-ticks" aria-hidden="true">
                <span>-50</span>
                <span>0</span>
                <span>+50</span>
              </div>
              <div className="music-cents-track" aria-hidden="true">
                <div className="music-cents-center" />
                <div className="music-cents-pointer" style={{ left: `${pointerPct}%` }} />
              </div>
            </div>
          </div>

          <div className="toolbox-actions">
            <button className={`button primary ${status === 'listening' ? 'music-stop' : ''}`} type="button" onClick={status === 'listening' ? stop : start}>
              {status === 'listening' ? 'Stop' : 'Start'}
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        {status === 'error' && errorText ? (
          <p className="toolbox-error" role="alert">
            {errorText}
          </p>
        ) : null}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <label className="toolbox-field">
          A4 tuning (Hz)
          <input
            value={String(a4)}
            onChange={(e) => setA4(clamp(Number.parseInt(e.target.value || '0', 10), 415, 466))}
            inputMode="numeric"
          />
        </label>
        <p className="muted small">Most orchestras: 440–442.</p>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Note spelling
          <select value={spelling} onChange={(e) => setSpelling(e.target.value as 'sharp' | 'flat')}>
            <option value="flat">Flats</option>
            <option value="sharp">Sharps</option>
          </select>
        </label>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Troubleshooting</h2>
        <ul>
          <li>If it flickers between two notes, play a steady tone and reduce room noise.</li>
          <li>If it reads an octave off, move slightly closer to the microphone.</li>
          <li>On phones, disable “voice isolation” modes if available.</li>
        </ul>
        <p className="muted small">
          This uses autocorrelation on the time-domain waveform. It works well for single notes; chords are much harder.
        </p>
      </div>
    </>
  );
}

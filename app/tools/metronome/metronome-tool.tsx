'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getAudioContext, safeResume } from '@/lib/music/audioContext';
import { ClickEngine, type EngineEvent } from '@/lib/music/clickEngine';
import { clamp, midiToNoteName, parseNoteName } from '@/lib/music/notes';
import {
  DEFAULT_SETTINGS,
  LIMITS,
  beatsPerBar,
  normalizeSettings,
  settingsToParams,
  type PracticeSettings,
} from '@/lib/music/practiceParams';
import { findPattern, patternGrid } from '@/lib/music/rhythmPatterns';
import {
  DrillsSection,
  DroneSection,
  KeysSection,
  LadderSection,
  LogSection,
  PatternSection,
  PlanSection,
  PresetSection,
  SoundSection,
  TempoSection,
  type PlanBlock,
  type Preset,
  type LogEntry,
} from './sections';

const STORAGE_KEY = 'gp_practice_tool_v1';
const PRESETS_KEY = 'gp_practice_tool_presets_v1';
/** Shared with /tools/practice-log so sessions show up there. */
const LOG_KEY = 'gp_music_practice_log_v1';

type Display = {
  running: boolean;
  bar: number;
  beat: number;
  sub: number;
  beats: number;
  subdivision: number;
  silent: boolean;
};

type LadderState = {
  awaiting: boolean;
  pendingBpm: number | null;
  blockStart: number;
  bestClean: number | null;
  reached: boolean;
  clean: number;
  missed: number;
  shuffleQueue: number[];
};

type PlanState = {
  blocks: PlanBlock[];
  activeIndex: number | null;
  endsAt: number | null;
  blockStartBar: number;
  remainingMs: number;
};

/** baseMs = time from earlier runs since the last Start; elapsedMs = baseMs plus the current run. */
type Session = { startedAt: number | null; baseMs: number; elapsedMs: number; bars: number };
const IDLE_SESSION: Session = { startedAt: null, baseMs: 0, elapsedMs: 0, bars: 0 };

const IDLE_DISPLAY: Display = { running: false, bar: 0, beat: 0, sub: 0, beats: 4, subdivision: 1, silent: false };
const IDLE_LADDER: LadderState = {
  awaiting: false,
  pendingBpm: null,
  blockStart: 0,
  bestClean: null,
  reached: false,
  clean: 0,
  missed: 0,
  shuffleQueue: [],
};

const DEFAULT_PLAN: PlanBlock[] = [
  { id: 'warm', label: 'Warm-up: scales with drone', minutes: 5, bpm: 60, drone: 'D3' },
  { id: 'p1', label: 'Passage A (ladder)', minutes: 9, bpm: null, drone: null },
  { id: 'p2', label: 'Passage B', minutes: 9, bpm: null, drone: null },
  { id: 'run', label: 'Run-through at tempo', minutes: 5, bpm: null, drone: null },
];

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the tool still works for this session.
  }
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function stepToward(current: number, target: number, step: number): number {
  if (current === target) return target;
  const next = current < target ? current + step : current - step;
  return current < target ? Math.min(next, target) : Math.max(next, target);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable;
}

export default function MetronomeTool(props: { initial: Partial<PracticeSettings>; autostart?: boolean }) {
  const urlKeys = useMemo(() => Object.keys(props.initial) as (keyof PracticeSettings)[], [props.initial]);

  const [settings, setSettings] = useState<PracticeSettings>(() => normalizeSettings(props.initial));
  const settingsRef = useRef(settings);
  const [display, setDisplay] = useState<Display>(IDLE_DISPLAY);
  const [ladder, setLadder] = useState<LadderState>(IDLE_LADDER);
  const ladderRef = useRef<LadderState>(IDLE_LADDER);
  const [plan, setPlan] = useState<PlanState>({ blocks: DEFAULT_PLAN, activeIndex: null, endsAt: null, blockStartBar: 0, remainingMs: 0 });
  const planRef = useRef(plan);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [session, setSession] = useState<Session>(IDLE_SESSION);
  const sessionRef = useRef(session);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [standMode, setStandMode] = useState(false);
  const [note, setNote] = useState<string>(
    props.autostart ? 'Tap anywhere to start (browsers need a touch before audio).' : 'Press Start, or Space. Arrow keys change tempo.',
  );
  const [storageLoaded, setStorageLoaded] = useState(false);

  const engineRef = useRef<ClickEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastBeatRef = useRef<EngineEvent | null>(null);
  const sweepRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const tapsRef = useRef<number[]>([]);
  const noteTimerRef = useRef<number | null>(null);

  const flash = useCallback((text: string) => {
    setNote(text);
    if (noteTimerRef.current !== null) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => setNote(''), 4000);
  }, []);

  /** Single entry point for settings changes; keeps the ref the engine reads in sync. */
  const patch = useCallback((partial: Partial<PracticeSettings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...partial });
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const updateLadder = useCallback((partial: Partial<LadderState>) => {
    ladderRef.current = { ...ladderRef.current, ...partial };
    setLadder(ladderRef.current);
  }, []);

  const updatePlan = useCallback((partial: Partial<PlanState>) => {
    planRef.current = { ...planRef.current, ...partial };
    setPlan(planRef.current);
  }, []);

  // ---- Persistence -------------------------------------------------------

  useEffect(() => {
    // Load on a tick after mount so the server-rendered markup stays stable
    // (URL parameters win over whatever was stored last time).
    const id = window.setTimeout(() => {
      const stored = readJson<{ settings?: Partial<PracticeSettings>; plan?: PlanBlock[] }>(STORAGE_KEY);
      if (stored?.settings) {
        const merged: Partial<PracticeSettings> = { ...stored.settings };
        for (const key of urlKeys) delete merged[key];
        patch(merged);
      }
      if (stored?.plan && Array.isArray(stored.plan) && stored.plan.length) updatePlan({ blocks: stored.plan });
      const storedPresets = readJson<Preset[]>(PRESETS_KEY);
      if (Array.isArray(storedPresets)) setPresets(storedPresets.filter((p) => p && typeof p.name === 'string'));
      const log = readJson<LogEntry[]>(LOG_KEY);
      if (Array.isArray(log)) setLogEntries(log);
      setStorageLoaded(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [patch, updatePlan, urlKeys]);

  useEffect(() => {
    if (!storageLoaded) return;
    writeJson(STORAGE_KEY, { settings, plan: plan.blocks });
  }, [plan.blocks, settings, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    writeJson(PRESETS_KEY, presets);
  }, [presets, storageLoaded]);

  // ---- Engine --------------------------------------------------------------

  const applyBpmNow = useCallback(
    (bpm: number) => {
      patch({ bpm: clamp(Math.round(bpm), LIMITS.bpm[0], LIMITS.bpm[1]) });
    },
    [patch],
  );

  /** Plan blocks may name a drone note ("D3"); "off" or blank leaves the drone alone. */
  const applyBlockDrone = useCallback(
    (drone: string | null) => {
      if (!drone) return;
      if (drone.toLowerCase() === 'off') {
        patch({ droneOn: false });
        return;
      }
      const midi = parseNoteName(drone);
      if (midi !== null) patch({ droneOn: true, droneSequence: '', droneMidi: clamp(midi, LIMITS.droneMidi[0], LIMITS.droneMidi[1]) });
    },
    [patch],
  );

  const advancePlan = useCallback(() => {
    const p = planRef.current;
    if (p.activeIndex === null) return;
    const nextIndex = p.activeIndex + 1;
    const engine = engineRef.current;
    if (nextIndex >= p.blocks.length) {
      updatePlan({ activeIndex: null, endsAt: null, remainingMs: 0 });
      engine?.fanfare();
      engine?.stop();
      flash('Session plan complete.');
      return;
    }
    const block = p.blocks[nextIndex];
    engine?.chime();
    if (block.bpm) applyBpmNow(block.bpm);
    applyBlockDrone(block.drone);
    updatePlan({
      activeIndex: nextIndex,
      endsAt: Date.now() + block.minutes * 60_000,
      remainingMs: block.minutes * 60_000,
      blockStartBar: engine?.position.bar ?? 0,
    });
    flash(`Now: ${block.label}`);
  }, [applyBlockDrone, applyBpmNow, flash, updatePlan]);

  const handleBar = useCallback(
    (bar: number) => {
      const s = settingsRef.current;
      const L = ladderRef.current;
      sessionRef.current = { ...sessionRef.current, bars: bar + 1 };

      if (s.ladderMode === 'rate') {
        if (L.pendingBpm !== null) {
          applyBpmNow(L.pendingBpm);
          updateLadder({ pendingBpm: null, blockStart: bar });
        } else if (!L.awaiting && bar - L.blockStart >= s.ladderBars) {
          updateLadder({ awaiting: true });
        }
      } else if (s.ladderMode === 'auto') {
        if (bar > 0 && bar % s.ladderBars === 0 && !L.reached) {
          const next = stepToward(s.bpm, s.ladderTarget, s.ladderStep);
          applyBpmNow(next);
          if (next === s.ladderTarget) {
            updateLadder({ reached: true, bestClean: next });
            engineRef.current?.fanfare();
            if (!s.ladderHoldAtTarget && engineRef.current) engineRef.current.stopAtBar = bar + s.ladderBars;
          }
        }
      } else if (s.ladderMode === 'shuffle') {
        if (bar > 0 && bar % s.ladderBars === 0) {
          let queue = L.shuffleQueue;
          if (!queue.length) {
            const lo = Math.min(s.ladderStart, s.ladderTarget);
            const hi = Math.max(s.ladderStart, s.ladderTarget);
            const tempos: number[] = [];
            for (let t = lo; t <= hi; t += s.ladderStep) tempos.push(t);
            queue = shuffled(tempos);
          }
          const [next, ...rest] = queue;
          applyBpmNow(next);
          updateLadder({ shuffleQueue: rest });
        }
      }
    },
    [applyBpmNow, updateLadder],
  );

  const ensureEngine = useCallback(async (): Promise<ClickEngine | null> => {
    if (engineRef.current) {
      await safeResume(engineRef.current.ctx);
      return engineRef.current;
    }
    const ctx = getAudioContext();
    if (!ctx) {
      flash('This browser has no Web Audio support.');
      return null;
    }
    await safeResume(ctx);
    const engine = new ClickEngine(ctx, {
      getSettings: () => settingsRef.current,
      isMuted: () => mutedRef.current,
      onBar: handleBar,
      onStop: () => {
        setDisplay((d) => ({ ...d, running: false }));
      },
    });
    engineRef.current = engine;
    // Test hook: lets Playwright read the scheduled click times (see tests/metronome.spec.ts).
    (window as Window & { __practiceToolEvents?: () => EngineEvent[] }).__practiceToolEvents = () => engine.recent.slice();
    return engine;
  }, [flash, handleBar]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setMasterVolume(settings.volume);
    engine.syncDrone();
  }, [settings]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
      wakeLockRef.current?.release().catch(() => undefined);
    };
  }, []);

  // ---- Wake lock -----------------------------------------------------------

  const requestWakeLock = useCallback(async () => {
    try {
      if (!('wakeLock' in navigator)) return;
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // Not allowed (battery saver, hidden tab); the screen may sleep.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && engineRef.current?.running) void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [requestWakeLock]);

  // ---- Visual loop ---------------------------------------------------------

  const stopVisualLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (sweepRef.current) sweepRef.current.style.transform = 'translateX(0)';
  }, []);

  const startVisualLoop = useCallback(() => {
    stopVisualLoop();
    const loop = () => {
      const engine = engineRef.current;
      if (!engine || !engine.running) {
        rafRef.current = null;
        return;
      }
      const now = engine.ctx.currentTime;
      const due = engine.drainDue(now + 0.004);
      if (due.length) {
        const last = due[due.length - 1];
        const beatEvent = [...due].reverse().find((e) => e.sub === 0) ?? null;
        if (beatEvent) lastBeatRef.current = beatEvent;
        setDisplay({
          running: true,
          bar: last.bar,
          beat: last.beat,
          sub: last.sub,
          beats: last.beats,
          subdivision: last.subdivision,
          silent: last.silent,
        });
        const downbeat = due.find((e) => e.beat === 0 && e.sub === 0 && e.bar >= 0);
        if (downbeat && settingsRef.current.flashDownbeat && flashRef.current) {
          const el = flashRef.current;
          el.classList.remove('pt-flash-on');
          void el.offsetWidth;
          el.classList.add('pt-flash-on');
        }
      }
      const lb = lastBeatRef.current;
      if (lb && sweepRef.current && settingsRef.current.sweep) {
        const phase = clamp((now - lb.time) / lb.secondsPerBeat, 0, 1);
        const beats = Math.max(1, lb.beats);
        const x = lb.bar < 0 ? phase : (lb.beat + phase) / beats;
        sweepRef.current.style.transform = `translateX(${(x * 96).toFixed(2)}%)`;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [stopVisualLoop]);

  // ---- Transport -----------------------------------------------------------

  const start = useCallback(async () => {
    const engine = await ensureEngine();
    if (!engine || engine.running) return;
    const s = settingsRef.current;
    if (s.ladderMode !== 'off') {
      applyBpmNow(s.ladderStart);
      ladderRef.current = { ...IDLE_LADDER };
      setLadder(ladderRef.current);
    }
    lastBeatRef.current = null;
    sessionRef.current = { ...IDLE_SESSION, startedAt: Date.now() };
    setSession(sessionRef.current);
    engine.start();
    engine.syncDrone();
    setDisplay({ ...IDLE_DISPLAY, running: true, beats: beatsPerBar(s.grouping), subdivision: s.subdivision });
    startVisualLoop();
    void requestWakeLock();
    flash(s.countInBars ? `Count-in: ${s.countInBars} bar${s.countInBars > 1 ? 's' : ''}.` : 'Running.');
  }, [applyBpmNow, ensureEngine, flash, requestWakeLock, startVisualLoop]);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.running) engine.stop();
    stopVisualLoop();
    releaseWakeLock();
    const sess = sessionRef.current;
    if (sess.startedAt) {
      const total = sess.baseMs + (Date.now() - sess.startedAt);
      sessionRef.current = { ...sess, startedAt: null, baseMs: total, elapsedMs: total };
      setSession(sessionRef.current);
    }
    updateLadder({ awaiting: false, pendingBpm: null });
    if (planRef.current.activeIndex !== null) updatePlan({ activeIndex: null, endsAt: null, remainingMs: 0 });
    setDisplay((d) => ({ ...IDLE_DISPLAY, beats: d.beats, subdivision: d.subdivision }));
    flash('Stopped.');
  }, [flash, releaseWakeLock, stopVisualLoop, updateLadder, updatePlan]);

  const toggle = useCallback(() => {
    if (engineRef.current?.running) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => {
    if (!session.startedAt) return;
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      if (!s.startedAt) return;
      sessionRef.current = { ...s, elapsedMs: s.baseMs + (Date.now() - s.startedAt) };
      setSession(sessionRef.current);
      const p = planRef.current;
      if (p.activeIndex !== null && p.endsAt !== null) {
        const remaining = p.endsAt - Date.now();
        if (remaining <= 0) advancePlan();
        else updatePlan({ remainingMs: remaining });
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [advancePlan, session.startedAt, updatePlan]);

  const nudgeBpm = useCallback(
    (delta: number) => {
      const s = settingsRef.current;
      applyBpmNow(s.bpm + delta);
      if (s.ladderMode !== 'off' && !engineRef.current?.running) patch({ ladderStart: clamp(s.bpm + delta, LIMITS.bpm[0], LIMITS.bpm[1]) });
    },
    [applyBpmNow, patch],
  );

  const rateBlock = useCallback(
    (clean: boolean) => {
      const s = settingsRef.current;
      const engine = engineRef.current;
      if (s.ladderMode !== 'rate' || !engine?.running) {
        nudgeBpm(clean ? s.ladderStep : -s.ladderStep);
        return;
      }
      const L = ladderRef.current;
      let next = s.bpm;
      if (clean) {
        next = stepToward(s.bpm, s.ladderTarget, s.ladderStep);
        const best = L.bestClean === null ? s.bpm : Math.max(L.bestClean, s.bpm);
        const reached = s.bpm === s.ladderTarget;
        updateLadder({ awaiting: false, pendingBpm: next === s.bpm ? null : next, bestClean: best, clean: L.clean + 1, reached: L.reached || reached });
        if (reached && !L.reached) {
          engine.fanfare();
          flash(`Target ${s.ladderTarget} BPM played clean.`);
          if (!s.ladderHoldAtTarget) engine.stopAtBar = engine.position.bar + 1;
        } else {
          flash(next === s.bpm ? 'Clean. Holding tempo.' : `Clean. Next block at ${next} BPM.`);
        }
      } else {
        const floor = Math.min(s.ladderStart, s.ladderTarget);
        next = Math.max(floor, s.bpm - s.ladderDrop);
        updateLadder({ awaiting: false, pendingBpm: next === s.bpm ? null : next, missed: L.missed + 1 });
        flash(next === s.bpm ? 'Missed. Same tempo again.' : `Missed. Next block at ${next} BPM.`);
      }
      updateLadder({ blockStart: engine.position.bar });
    },
    [flash, nudgeBpm, updateLadder],
  );

  const tapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapsRef.current;
    if (taps.length && now - taps[taps.length - 1] > 2500) taps.length = 0;
    taps.push(now);
    while (taps.length > 8) taps.shift();
    if (taps.length < 3) {
      flash(taps.length === 1 ? 'Keep tapping…' : 'One more…');
      return;
    }
    const deltas: number[] = [];
    for (let i = 1; i < taps.length; i += 1) deltas.push(taps[i] - taps[i - 1]);
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const bpm = clamp(Math.round(60000 / avg), LIMITS.bpm[0], LIMITS.bpm[1]);
    applyBpmNow(bpm);
    if (settingsRef.current.ladderMode !== 'off' && !engineRef.current?.running) patch({ ladderStart: bpm });
    flash(`Tapped ${bpm} BPM.`);
  }, [applyBpmNow, flash, patch]);

  const toggleDrone = useCallback(async () => {
    const engine = await ensureEngine();
    if (!engine) return;
    patch({ droneOn: !settingsRef.current.droneOn });
    engine.syncDrone();
  }, [ensureEngine, patch]);

  // ---- Session plan ----------------------------------------------------------

  const startPlan = useCallback(async () => {
    const p = planRef.current;
    if (!p.blocks.length) return;
    const engine = await ensureEngine();
    if (!engine) return;
    const block = p.blocks[0];
    if (block.bpm) {
      applyBpmNow(block.bpm);
      if (settingsRef.current.ladderMode !== 'off') patch({ ladderStart: block.bpm });
    }
    applyBlockDrone(block.drone);
    if (!engine.running) await start();
    updatePlan({ activeIndex: 0, endsAt: Date.now() + block.minutes * 60_000, remainingMs: block.minutes * 60_000, blockStartBar: 0 });
    flash(`Now: ${block.label}`);
  }, [applyBlockDrone, applyBpmNow, ensureEngine, flash, patch, start, updatePlan]);

  const skipBlock = useCallback(() => {
    if (planRef.current.activeIndex !== null) advancePlan();
  }, [advancePlan]);

  // ---- Log -------------------------------------------------------------------

  const saveToLog = useCallback(() => {
    const s = settingsRef.current;
    const sess = sessionRef.current;
    const elapsed = sess.baseMs + (sess.startedAt ? Date.now() - sess.startedAt : 0);
    const minutes = clamp(Math.round(elapsed / 60000), 1, 24 * 60);
    const L = ladderRef.current;
    const parts = [`${sess.bars} bars`];
    if (s.ladderMode !== 'off') {
      parts.push(`ladder ${s.ladderStart}→${s.ladderTarget} BPM, best clean ${L.bestClean ?? '—'}`);
      if (L.clean || L.missed) parts.push(`${L.clean} clean / ${L.missed} missed blocks`);
    } else {
      parts.push(`${s.bpm} BPM`);
    }
    if (s.droneOn) parts.push(`drone ${midiToNoteName(s.droneMidi, 'flat')}`);
    if (s.gapEnabled) parts.push(`gap ${s.gapPlayBars}/${s.gapMuteBars}`);
    const entry: LogEntry = {
      id: createId(),
      date: todayLocal(),
      minutes,
      activity: s.goal.trim() || 'Metronome practice',
      tags: ['viola', 'metronome'],
      notes: parts.join('; '),
    };
    const existing = readJson<LogEntry[]>(LOG_KEY) ?? [];
    const next = [entry, ...existing];
    writeJson(LOG_KEY, next);
    setLogEntries(next);
    flash(`Logged ${minutes} min to the practice log.`);
  }, [flash]);

  // ---- Presets and links ------------------------------------------------------

  const savePreset = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    setPresets((prev) => [{ name: trimmed, settings: settingsRef.current }, ...prev.filter((p) => p.name !== trimmed)].slice(0, 30));
    flash(`Saved preset “${trimmed}”.`);
  }, [flash]);

  const loadPreset = useCallback(
    (preset: Preset) => {
      patch(preset.settings);
      flash(`Loaded “${preset.name}”.`);
    },
    [flash, patch],
  );

  const deletePreset = useCallback((name: string) => {
    setPresets((prev) => prev.filter((p) => p.name !== name));
  }, []);

  const shareUrl = useMemo(() => {
    const q = settingsToParams(settings).toString();
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.grahampaasch.com';
    return `${origin}/tools/metronome${q ? `?${q}` : ''}`;
  }, [settings]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash('Link copied.');
    } catch {
      flash('Could not copy; the link is shown below.');
    }
  }, [flash, shareUrl]);

  // ---- Keyboard and pedal -----------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (standMode) setStandMode(false);
        else if (engineRef.current?.running) stop();
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = settingsRef.current;
      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          toggle();
          return;
        case 'ArrowUp':
          e.preventDefault();
          nudgeBpm(e.shiftKey ? 5 : 1);
          return;
        case 'ArrowDown':
          e.preventDefault();
          nudgeBpm(e.shiftKey ? -5 : -1);
          return;
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          rateBlock(true);
          return;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          rateBlock(false);
          return;
        default:
          break;
      }
      switch (e.key.toLowerCase()) {
        case 't':
          tapTempo();
          return;
        case 'm':
          setMuted((m) => {
            mutedRef.current = !m;
            return !m;
          });
          return;
        case 'd':
          void toggleDrone();
          return;
        case 'g':
          patch({ gapEnabled: !s.gapEnabled });
          flash(s.gapEnabled ? 'Gap click off.' : `Gap click on: ${s.gapPlayBars} bars on, ${s.gapMuteBars} silent.`);
          return;
        case 'f':
          setStandMode((v) => !v);
          return;
        case '?':
          document.getElementById('pt-keys')?.setAttribute('open', '');
          document.getElementById('pt-keys')?.scrollIntoView({ block: 'start' });
          return;
        default:
          break;
      }
      if (/^[1-6]$/.test(e.key)) {
        patch({ subdivision: Number.parseInt(e.key, 10) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flash, nudgeBpm, patch, rateBlock, standMode, stop, tapTempo, toggle, toggleDrone]);

  useEffect(() => {
    if (!props.autostart) return;
    const once = () => {
      void start();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
    return () => {
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
  }, [props.autostart, start]);

  // ---- Render -------------------------------------------------------------------

  const s = settings;
  const beats = beatsPerBar(s.grouping);
  const pattern = findPattern(s.patternId);
  const grid = pattern ? patternGrid(pattern) : null;
  const gridNow = pattern && display.running ? (((display.bar * display.beats + display.beat) % pattern.beats) + pattern.beats) % pattern.beats : -1;
  const droneLabel = midiToNoteName(s.droneMidi, 'flat');
  const activeBlock = plan.activeIndex !== null ? plan.blocks[plan.activeIndex] : null;
  const ladderOn = s.ladderMode !== 'off';

  const displayBlock = (
    <div ref={flashRef} className={`pt-display ${display.running && display.silent ? 'pt-display-silent' : ''}`}>
      {s.goal.trim() ? <div className="pt-goal">{s.goal}</div> : null}
      <div className="pt-bpm-row">
        <div className="pt-bpm" aria-live="off">
          {s.bpm}
        </div>
        <div className="pt-bpm-side">
          <div className="pt-bpm-unit">BPM</div>
          {ladderOn ? (
            <div className="pt-ladder-mini">
              {s.ladderStart} → <strong>{s.ladderTarget}</strong>
              {ladder.bestClean !== null ? <span> · best clean {ladder.bestClean}</span> : null}
            </div>
          ) : null}
          <div className="pt-counter">
            {display.running
              ? display.bar < 0
                ? `count-in ${display.beat + 1}`
                : `bar ${display.bar + 1} · beat ${display.beat + 1}${display.subdivision > 1 ? `.${display.sub + 1}` : ''}`
              : `${beats} beats${s.subdivision > 1 ? ` · ${s.subdivision} per beat` : ''}`}
            {display.running && display.silent ? ' · silent' : ''}
            {muted ? ' · click muted' : ''}
          </div>
        </div>
      </div>

      <div className="pt-dots" role="img" aria-label={`Beat ${display.running ? display.beat + 1 : 0} of ${beats}`}>
        {Array.from({ length: beats }, (_, i) => {
          const accent = s.accentDownbeat && accentIndex(s.grouping, i);
          const on = display.running && display.bar >= 0 && display.beat === i;
          return (
            <span
              key={i}
              className={['pt-dot', accent ? 'pt-dot-accent' : '', on ? 'pt-dot-on' : '', on && display.silent ? 'pt-dot-silent' : ''].filter(Boolean).join(' ')}
            />
          );
        })}
      </div>

      {s.sweep ? (
        <div className="pt-sweep" aria-hidden="true">
          <div ref={sweepRef} className="pt-sweep-bar" />
        </div>
      ) : null}

      {ladder.awaiting ? (
        <div className="pt-prompt" role="status">
          <span>Was that block clean?</span>
          <div className="pt-big-row">
            <button className="button pt-bigbtn pt-bigbtn-bad" type="button" onClick={() => rateBlock(false)}>
              ✗ Missed
            </button>
            <button className="button primary pt-bigbtn" type="button" onClick={() => rateBlock(true)}>
              ✓ Clean
            </button>
          </div>
        </div>
      ) : ladder.pendingBpm !== null ? (
        <div className="pt-prompt pt-prompt-quiet" role="status">
          Next bar: {ladder.pendingBpm} BPM
        </div>
      ) : null}

      {activeBlock ? (
        <div className="pt-plan-now">
          <span className="pt-plan-label">{activeBlock.label}</span>
          <span className="pt-plan-clock">{formatClock(plan.remainingMs)}</span>
          <button className="button" type="button" onClick={skipBlock}>
            Skip
          </button>
        </div>
      ) : null}

      {grid && pattern ? (
        <div className="pt-grid" role="img" aria-label={`Pattern ${pattern.name}: ${pattern.description}`}>
          {grid.map((onCell, i) => {
            const beatIdx = Math.floor(i / pattern.grid);
            const now = beatIdx === gridNow;
            return <span key={i} className={['pt-cell', onCell ? 'pt-cell-on' : '', now ? 'pt-cell-now' : '', i % pattern.grid === 0 ? 'pt-cell-beat' : ''].filter(Boolean).join(' ')} />;
          })}
        </div>
      ) : null}
    </div>
  );

  const transportButtons = (big: boolean) => (
    <div className={big ? 'pt-big-row' : 'pt-transport'}>
      <button className={`button primary pt-transport-main ${big ? 'pt-bigbtn' : ''} ${display.running ? 'music-stop' : ''}`} type="button" onClick={toggle}>
        {display.running ? 'Stop' : ladderOn ? `Start at ${s.ladderStart}` : 'Start'}
      </button>
      <button className={`button ${big ? 'pt-bigbtn' : ''}`} type="button" onClick={() => nudgeBpm(-1)} aria-label="Slower by one">
        −1
      </button>
      <button className={`button ${big ? 'pt-bigbtn' : ''}`} type="button" onClick={() => nudgeBpm(1)} aria-label="Faster by one">
        +1
      </button>
      <button className={`button ${big ? 'pt-bigbtn' : ''}`} type="button" onClick={tapTempo}>
        Tap
      </button>
      <button className={`button ${big ? 'pt-bigbtn' : ''} ${s.droneOn ? 'pt-on' : ''}`} type="button" onClick={() => void toggleDrone()}>
        Drone {s.droneOn ? `${droneLabel} on` : 'off'}
      </button>
      {!big ? (
        <button className="button" type="button" onClick={() => setStandMode(true)}>
          Stand mode
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      {standMode ? (
        <div className="pt-stand" role="dialog" aria-label="Stand mode">
          <div className="pt-stand-inner">
            {displayBlock}
            {transportButtons(true)}
            {ladderOn && !ladder.awaiting ? (
              <div className="pt-big-row">
                <button className="button pt-bigbtn pt-bigbtn-bad" type="button" onClick={() => rateBlock(false)}>
                  ✗ Missed
                </button>
                <button className="button pt-bigbtn" type="button" onClick={() => rateBlock(true)}>
                  ✓ Clean
                </button>
              </div>
            ) : null}
            <div className="pt-stand-foot">
              <span className="muted small">{note}</span>
              <button className="button" type="button" onClick={() => setStandMode(false)}>
                Exit (Esc)
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Practice Tool</h1>
          <span className="prompt-header-badge">METRONOME +</span>
        </div>
        {displayBlock}
        <div style={{ marginTop: 12 }}>{transportButtons(false)}</div>
        <p className="muted small" style={{ marginTop: 8, minHeight: '1.2em' }} aria-live="polite">
          {note}
        </p>
        <div className="pt-session">
          <span>Session {formatClock(session.elapsedMs)}</span>
          <span>{session.bars} bars</span>
          {ladderOn ? <span>{ladder.clean} clean · {ladder.missed} missed</span> : null}
          <button className="button" type="button" onClick={saveToLog} disabled={!session.bars && !session.elapsedMs}>
            Save to practice log
          </button>
          <Link className="button" href="/tools#music">
            All music tools
          </Link>
        </div>
      </div>

      <TempoSection s={s} patch={patch} running={display.running} />
      <LadderSection s={s} patch={patch} ladder={ladder} />
      <DrillsSection s={s} patch={patch} />
      <DroneSection s={s} patch={patch} onToggle={() => void toggleDrone()} />
      <SoundSection s={s} patch={patch} muted={muted} setMuted={(m) => { mutedRef.current = m; setMuted(m); }} />
      <PatternSection s={s} patch={patch} />
      <PlanSection
        blocks={plan.blocks}
        activeIndex={plan.activeIndex}
        setBlocks={(blocks) => updatePlan({ blocks })}
        onStart={() => void startPlan()}
        onStop={stop}
        onSkip={skipBlock}
      />
      <LogSection entries={logEntries} goal={s.goal} onSave={saveToLog} />
      <PresetSection
        presets={presets}
        onSave={savePreset}
        onLoad={loadPreset}
        onDelete={deletePreset}
        shareUrl={shareUrl}
        onCopy={() => void copyLink()}
        onReset={() => patch({ ...DEFAULT_SETTINGS, goal: s.goal })}
      />
      <KeysSection />
    </>
  );
}

function accentIndex(grouping: number[], beat: number): boolean {
  let pos = 0;
  for (const g of grouping) {
    if (pos === beat) return true;
    pos += g;
  }
  return false;
}

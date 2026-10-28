'use client';

import { useState, type ReactNode } from 'react';
import { NOTE_OPTIONS, clamp, frequencyFromMidi, midiFromNoteIndex, midiToNoteName } from '@/lib/music/notes';
import {
  CLICK_VOICES,
  LIMITS,
  groupingLabel,
  parseDroneSequence,
  parseGrouping,
  type ClickVoice,
  type DroneWave,
  type LadderMode,
  type PracticeSettings,
} from '@/lib/music/practiceParams';
import { RHYTHM_PATTERNS } from '@/lib/music/rhythmPatterns';

export type PlanBlock = { id: string; label: string; minutes: number; bpm: number | null; drone: string | null };
export type Preset = { name: string; settings: Partial<PracticeSettings> };
export type LogEntry = { id: string; date: string; minutes: number; activity: string; tags: string[]; notes: string };

type SectionProps = { s: PracticeSettings; patch: (p: Partial<PracticeSettings>) => void };

const METERS = ['2', '3', '4', '5', '3+2', '2+3', '6', '3+3', '2+2+3', '3+2+2', '3+3+3', '3+3+3+3'];
const SUBDIVISIONS = [
  { id: 1, label: 'Beats only' },
  { id: 2, label: 'Eighths (2)' },
  { id: 3, label: 'Triplets (3)' },
  { id: 4, label: 'Sixteenths (4)' },
  { id: 5, label: 'Quintuplets (5)' },
  { id: 6, label: 'Sextuplets (6)' },
];

function Section(props: { id?: string; title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details id={props.id} className="card pt-section" open={props.open}>
      <summary>
        <span>{props.title}</span>
        {props.hint ? <span className="muted small">{props.hint}</span> : null}
      </summary>
      <div className="pt-section-body">{props.children}</div>
    </details>
  );
}

function NumField(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean; step?: number }) {
  return (
    <label className="toolbox-field">
      {props.label}
      <input
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={String(props.value)}
        disabled={props.disabled}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) props.onChange(clamp(n, props.min, props.max));
        }}
      />
    </label>
  );
}

function PctSlider(props: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  const max = props.max ?? 100;
  return (
    <label className="pt-slider">
      <span>
        {props.label} <span className="muted small">{Math.round(props.value * 100)}%</span>
      </span>
      <input type="range" min={0} max={max} value={Math.round(props.value * 100)} onChange={(e) => props.onChange(Number.parseInt(e.target.value, 10) / 100)} />
    </label>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toolbox-check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

export function TempoSection({ s, patch, running }: SectionProps & { running: boolean }) {
  const [meterText, setMeterText] = useState(groupingLabel(s.grouping));
  const meterShown = parseGrouping(meterText)?.join('+') === s.grouping.join('+') ? meterText : groupingLabel(s.grouping);
  return (
    <Section title="Tempo and meter" open>
      <label className="toolbox-field">
        What are you working on?
        <input value={s.goal} placeholder="e.g. Dukas, fig. 17 to 19" maxLength={120} onChange={(e) => patch({ goal: e.target.value })} />
      </label>
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <NumField label="BPM" value={s.bpm} min={LIMITS.bpm[0]} max={LIMITS.bpm[1]} onChange={(bpm) => patch({ bpm })} />
        <label className="toolbox-field">
          Beats per bar (grouping)
          <input
            value={meterShown}
            inputMode="numeric"
            list="pt-meters"
            onChange={(e) => {
              setMeterText(e.target.value);
              const g = parseGrouping(e.target.value);
              if (g) patch({ grouping: g });
            }}
          />
          <datalist id="pt-meters">
            {METERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="toolbox-field">
          Subdivision
          <select value={s.subdivision} onChange={(e) => patch({ subdivision: Number.parseInt(e.target.value, 10) })}>
            {SUBDIVISIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        type="range"
        min={LIMITS.bpm[0]}
        max={LIMITS.bpm[1]}
        value={s.bpm}
        onChange={(e) => patch({ bpm: Number.parseInt(e.target.value, 10) })}
        aria-label="BPM slider"
        style={{ marginTop: 10 }}
      />
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        {s.subdivision === 2 ? (
          <PctSlider label="Swing" value={s.swing} max={45} onChange={(swing) => patch({ swing })} />
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Swing appears with the eighth-note subdivision. Write 3+2+2 for a 7/8 bar, 3+3 for 6/8 in eighths.
          </p>
        )}
        <label className="toolbox-field" style={{ maxWidth: 180 }}>
          Count-in
          <select value={s.countInBars} onChange={(e) => patch({ countInBars: Number.parseInt(e.target.value, 10) })} disabled={running}>
            <option value={0}>None</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
          </select>
        </label>
      </div>
    </Section>
  );
}

export function LadderSection({ s, patch, ladder }: SectionProps & { ladder: { bestClean: number | null; clean: number; missed: number; reached: boolean } }) {
  const modes: { id: LadderMode; label: string; hint: string }[] = [
    { id: 'off', label: 'Off', hint: 'Plain click at one tempo.' },
    { id: 'rate', label: 'Rate it', hint: 'After each block, mark it clean (→ / PageDown / ✓) or missed (← / PageUp / ✗). Clean raises the tempo by the step; missed drops it. This is how expert practisers actually move tempo: up after success, back after a miss.' },
    { id: 'auto', label: 'Auto', hint: 'Classic ramp: the step is added every N bars until the target.' },
    { id: 'shuffle', label: 'Shuffle', hint: 'Random order through every tempo between start and target, one block each. Experimental: the evidence for variable-tempo practice is mixed.' },
  ];
  const current = modes.find((m) => m.id === s.ladderMode) ?? modes[0];
  return (
    <Section title="Tempo ladder" hint={s.ladderMode === 'off' ? 'off' : `${s.ladderStart} → ${s.ladderTarget}, ${current.label}`}>
      <div className="pt-choice-row" role="radiogroup" aria-label="Ladder mode">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={s.ladderMode === m.id}
            className={`button ${s.ladderMode === m.id ? 'primary' : ''}`}
            onClick={() => patch({ ladderMode: m.id, ...(m.id !== 'off' && s.ladderMode === 'off' ? { ladderStart: s.bpm } : null) })}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted small">{current.hint}</p>
      <div className="toolbox-row">
        <NumField label="Start BPM" value={s.ladderStart} min={LIMITS.bpm[0]} max={LIMITS.bpm[1]} onChange={(ladderStart) => patch({ ladderStart, bpm: ladderStart })} />
        <NumField label="Target BPM" value={s.ladderTarget} min={LIMITS.bpm[0]} max={LIMITS.bpm[1]} onChange={(ladderTarget) => patch({ ladderTarget })} />
        <NumField label="Step (BPM)" value={s.ladderStep} min={LIMITS.ladderStep[0]} max={LIMITS.ladderStep[1]} onChange={(ladderStep) => patch({ ladderStep })} />
        <NumField label="Block (bars)" value={s.ladderBars} min={LIMITS.ladderBars[0]} max={LIMITS.ladderBars[1]} onChange={(ladderBars) => patch({ ladderBars })} />
        {s.ladderMode === 'rate' ? (
          <NumField label="Drop after a miss (BPM)" value={s.ladderDrop} min={0} max={LIMITS.ladderStep[1]} onChange={(ladderDrop) => patch({ ladderDrop })} />
        ) : null}
      </div>
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <Check label="Keep clicking at the target (otherwise stop after one block there)" checked={s.ladderHoldAtTarget} onChange={(ladderHoldAtTarget) => patch({ ladderHoldAtTarget })} />
      </div>
      {s.ladderMode !== 'off' ? (
        <p className="muted small" style={{ marginTop: 10 }}>
          This session: {ladder.clean} clean, {ladder.missed} missed{ladder.bestClean !== null ? `, best clean tempo ${ladder.bestClean}` : ''}
          {ladder.reached ? ' · target reached' : ''}. Tip: pick a target 5–10% above the performance tempo so the real thing feels easy.
        </p>
      ) : null}
    </Section>
  );
}

export function DrillsSection({ s, patch }: SectionProps) {
  const hint = [s.gapEnabled ? `gap ${s.gapPlayBars}/${s.gapMuteBars}` : null, s.dropout > 0 ? `dropout ${Math.round(s.dropout * 100)}%` : null, s.drillEnabled ? 'subdivision drill' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Section title="Internal pulse drills" hint={hint || 'off'}>
      <p className="muted small">
        The click drops out, you keep the tempo, the dots keep moving so you can check yourself. Musicians hold tempo better than non-musicians once a
        click stops; these drills practise exactly that moment.
      </p>
      <div className="toolbox-row">
        <Check label="Gap click (G)" checked={s.gapEnabled} onChange={(gapEnabled) => patch({ gapEnabled })} />
        <NumField label="Bars with click" value={s.gapPlayBars} min={LIMITS.gapBars[0]} max={LIMITS.gapBars[1]} onChange={(gapPlayBars) => patch({ gapPlayBars })} />
        <NumField label="Silent bars" value={s.gapMuteBars} min={LIMITS.gapBars[0]} max={LIMITS.gapBars[1]} onChange={(gapMuteBars) => patch({ gapMuteBars })} />
        <Check label="Checkpoint bell when the click returns" checked={s.gapCheckpoint} onChange={(gapCheckpoint) => patch({ gapCheckpoint })} />
      </div>
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <PctSlider label="Random dropout (downbeats always sound)" value={s.dropout} max={80} onChange={(dropout) => patch({ dropout })} />
      </div>
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <Check label="Subdivision drill: cycle 1 → 2 → 3 → 4 per beat" checked={s.drillEnabled} onChange={(drillEnabled) => patch({ drillEnabled })} />
        <NumField label="Bars per step" value={s.drillBars} min={LIMITS.drillBars[0]} max={LIMITS.drillBars[1]} onChange={(drillBars) => patch({ drillBars })} />
      </div>
    </Section>
  );
}

const JUST_INTERVALS: { name: string; cents: number }[] = [
  { name: 'Perfect fifth', cents: 2 },
  { name: 'Perfect fourth', cents: -2 },
  { name: 'Major third', cents: -14 },
  { name: 'Minor third', cents: 16 },
  { name: 'Major sixth', cents: -16 },
  { name: 'Minor seventh (7th harmonic)', cents: -31 },
];

export function DroneSection({ s, patch, onToggle }: SectionProps & { onToggle: () => void }) {
  const noteIndex = ((s.droneMidi % 12) + 12) % 12;
  const octave = Math.floor(s.droneMidi / 12) - 1;
  const freq = frequencyFromMidi(s.droneMidi, s.a4);
  const seq = parseDroneSequence(s.droneSequence);
  return (
    <Section title="Drone" hint={s.droneOn ? `${midiToNoteName(s.droneMidi, 'flat')} on` : 'off'}>
      <div className="toolbox-row">
        <button className={`button ${s.droneOn ? 'primary' : ''}`} type="button" onClick={onToggle}>
          {s.droneOn ? 'Drone on (D)' : 'Drone off (D)'}
        </button>
        <label className="toolbox-field">
          Note
          <select value={noteIndex} onChange={(e) => patch({ droneMidi: midiFromNoteIndex(Number.parseInt(e.target.value, 10), octave) })}>
            {NOTE_OPTIONS.map((o) => (
              <option key={o.index} value={o.index}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <NumField label="Octave" value={octave} min={1} max={6} onChange={(o) => patch({ droneMidi: midiFromNoteIndex(noteIndex, o) })} />
        <label className="toolbox-field">
          Wave
          <select value={s.droneWave} onChange={(e) => patch({ droneWave: e.target.value as DroneWave })}>
            <option value="sine">Sine (clean)</option>
            <option value="triangle">Triangle (soft)</option>
            <option value="sawtooth">Saw (bright)</option>
            <option value="square">Square (buzzy)</option>
          </select>
        </label>
      </div>
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <PctSlider label="Drone volume" value={s.droneVolume} onChange={(droneVolume) => patch({ droneVolume })} />
        <NumField label="A4 (Hz)" value={s.a4} min={LIMITS.a4[0]} max={LIMITS.a4[1]} onChange={(a4) => patch({ a4 })} />
      </div>
      <label className="toolbox-field" style={{ marginTop: 12 }}>
        Per-bar sequence (optional, e.g. D3, A3, D3, G3)
        <input value={s.droneSequence} placeholder="leave empty for one note" onChange={(e) => patch({ droneSequence: e.target.value })} />
      </label>
      <p className="muted small">
        {seq.length ? `Cycles ${seq.map((m) => midiToNoteName(m, 'flat')).join(' → ')} one note per bar.` : `${midiToNoteName(s.droneMidi, 'flat')} = ${freq.toFixed(2)} Hz at A4 = ${s.a4}.`}{' '}
        Viola open strings: C3, G3, D4, A4. Against a sustained tonic, tune intervals by ear; pure intervals sit off equal temperament by:
      </p>
      <ul className="pt-intervals">
        {JUST_INTERVALS.map((i) => (
          <li key={i.name}>
            {i.name} {i.cents > 0 ? '+' : ''}
            {i.cents} ¢
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function SoundSection({ s, patch, muted, setMuted }: SectionProps & { muted: boolean; setMuted: (m: boolean) => void }) {
  return (
    <Section title="Sound and display" hint={`${CLICK_VOICES.find((v) => v.id === s.voice)?.label ?? ''}${muted ? ' · muted' : ''}`}>
      <div className="toolbox-row">
        <label className="toolbox-field">
          Click voice
          <select value={s.voice} onChange={(e) => patch({ voice: e.target.value as ClickVoice })}>
            {CLICK_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <Check label="Mute click (M) — drone and dots keep going" checked={muted} onChange={setMuted} />
        <Check label="Accent the first beat of each group" checked={s.accentDownbeat} onChange={(accentDownbeat) => patch({ accentDownbeat })} />
      </div>
      <div className="pt-sliders">
        <PctSlider label="Master volume" value={s.volume} onChange={(volume) => patch({ volume })} />
        <PctSlider label="Accent" value={s.accentVolume} onChange={(accentVolume) => patch({ accentVolume })} />
        <PctSlider label="Beat" value={s.beatVolume} onChange={(beatVolume) => patch({ beatVolume })} />
        <PctSlider label="Subdivision" value={s.subVolume} onChange={(subVolume) => patch({ subVolume })} />
      </div>
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <Check label="Flash the display on the downbeat" checked={s.flashDownbeat} onChange={(flashDownbeat) => patch({ flashDownbeat })} />
        <Check label="Sweep bar" checked={s.sweep} onChange={(sweep) => patch({ sweep })} />
      </div>
    </Section>
  );
}

export function PatternSection({ s, patch }: SectionProps) {
  const categories = Array.from(new Set(RHYTHM_PATTERNS.map((p) => p.category)));
  return (
    <Section title="Rhythm pattern and polyrhythm" hint={[s.patternId ?? null, s.poly >= 2 ? `${s.poly} cross-beats` : null].filter(Boolean).join(' · ') || 'off'}>
      <div className="toolbox-row">
        <label className="toolbox-field">
          Pattern on top of the click
          <select
            value={s.patternId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              const p = RHYTHM_PATTERNS.find((x) => x.id === id);
              patch({ patternId: id, ...(p ? { grouping: parseGrouping(p.meter) ?? s.grouping } : null) });
            }}
          >
            <option value="">None</option>
            {categories.map((c) => (
              <optgroup key={c} label={c}>
                {RHYTHM_PATTERNS.filter((p) => p.category === c).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <PctSlider label="Pattern volume" value={s.patternVolume} onChange={(patternVolume) => patch({ patternVolume })} />
      </div>
      {s.patternId ? <p className="muted small">{RHYTHM_PATTERNS.find((p) => p.id === s.patternId)?.description}</p> : null}
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <NumField label="Polyrhythm: cross-beats per bar (0 = off)" value={s.poly} min={0} max={LIMITS.poly[1]} onChange={(poly) => patch({ poly })} />
        <PctSlider label="Cross-beat volume" value={s.polyVolume} onChange={(polyVolume) => patch({ polyVolume })} />
      </div>
    </Section>
  );
}

export function PlanSection(props: {
  blocks: PlanBlock[];
  activeIndex: number | null;
  setBlocks: (b: PlanBlock[]) => void;
  onStart: () => void;
  onStop: () => void;
  onSkip: () => void;
}) {
  const [slice, setSlice] = useState(3);
  const { blocks, setBlocks } = props;
  const total = blocks.reduce((a, b) => a + b.minutes, 0);

  const update = (id: string, partial: Partial<PlanBlock>) => setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...partial } : b)));
  const remove = (id: string) => setBlocks(blocks.filter((b) => b.id !== id));
  const add = () => setBlocks([...blocks, { id: Math.random().toString(36).slice(2), label: 'New block', minutes: 5, bpm: null, drone: null }]);
  const move = (index: number, dir: -1 | 1) => {
    const next = [...blocks];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setBlocks(next);
  };
  const interleave = () => {
    const queues = blocks.map((b) => {
      const n = Math.max(1, Math.ceil(b.minutes / slice));
      return Array.from({ length: n }, (_, i) => ({
        ...b,
        id: `${b.id}-${i}`,
        label: n > 1 ? `${b.label.replace(/ \(\d+\/\d+\)$/, '')} (${i + 1}/${n})` : b.label,
        minutes: i === n - 1 ? b.minutes - slice * (n - 1) || slice : slice,
      }));
    });
    const out: PlanBlock[] = [];
    let remaining = true;
    while (remaining) {
      remaining = false;
      for (const q of queues) {
        const item = q.shift();
        if (item) {
          out.push(item);
          remaining = remaining || q.length > 0;
        }
      }
    }
    setBlocks(out);
  };

  return (
    <Section title="Session plan" hint={`${blocks.length} blocks · ${total} min`}>
      <p className="muted small">
        Short blocks that alternate between passages beat one long block on each: clarinetists who switched pieces every 3 minutes kept more the
        next day than those who practised each piece for 12 straight minutes (Carter &amp; Grahn 2016). Build the plan, press Interleave, then Run.
      </p>
      <div className="pt-plan-list">
        {blocks.map((b, i) => (
          <div key={b.id} className={`pt-plan-row ${props.activeIndex === i ? 'pt-plan-row-active' : ''}`}>
            <span className="pt-plan-index">{i + 1}</span>
            <input value={b.label} aria-label="Block label" onChange={(e) => update(b.id, { label: e.target.value.slice(0, 60) })} />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={String(b.minutes)}
              aria-label="Minutes"
              onChange={(e) => update(b.id, { minutes: clamp(Number.parseInt(e.target.value || '1', 10) || 1, 1, 120) })}
            />
            <input
              type="number"
              inputMode="numeric"
              placeholder="BPM"
              aria-label="BPM for this block"
              value={b.bpm ?? ''}
              onChange={(e) => update(b.id, { bpm: e.target.value ? clamp(Number.parseInt(e.target.value, 10) || 60, LIMITS.bpm[0], LIMITS.bpm[1]) : null })}
            />
            <input value={b.drone ?? ''} placeholder="drone" aria-label="Drone note for this block" onChange={(e) => update(b.id, { drone: e.target.value.trim() || null })} />
            <div className="pt-plan-actions">
              <button className="button" type="button" onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button className="button" type="button" onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button className="button" type="button" onClick={() => remove(b.id)} aria-label="Remove block">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="toolbox-actions" style={{ marginTop: 12 }}>
        <button className="button" type="button" onClick={add}>
          Add block
        </button>
        <label className="toolbox-field" style={{ maxWidth: 160, flex: '0 1 auto' }}>
          Slice (min)
          <input type="number" inputMode="numeric" min={1} max={30} value={String(slice)} onChange={(e) => setSlice(clamp(Number.parseInt(e.target.value || '3', 10) || 3, 1, 30))} />
        </label>
        <button className="button" type="button" onClick={interleave}>
          Interleave
        </button>
        {props.activeIndex === null ? (
          <button className="button primary" type="button" onClick={props.onStart} disabled={!blocks.length}>
            Run plan
          </button>
        ) : (
          <>
            <button className="button" type="button" onClick={props.onSkip}>
              Skip block
            </button>
            <button className="button primary music-stop" type="button" onClick={props.onStop}>
              Stop plan
            </button>
          </>
        )}
      </div>
    </Section>
  );
}

export function LogSection(props: { entries: LogEntry[]; goal: string; onSave: () => void }) {
  const mine = props.entries.filter((e) => Array.isArray(e.tags) && e.tags.includes('metronome')).slice(0, 6);
  const sameGoal = props.goal.trim() ? mine.find((e) => e.activity === props.goal.trim()) : null;
  const days = new Set(mine.map((e) => e.date)).size;
  return (
    <Section title="Practice log" hint={mine.length ? `${mine.length} recent · ${days} day${days === 1 ? '' : 's'}` : 'empty'}>
      <p className="muted small">
        What you did, not how long, predicts what you keep (Duke, Simmons &amp; Cash 2009). Save a session and tomorrow starts from today's best clean
        tempo. Entries go to the shared <a href="/tools/practice-log">practice log</a> on this device.
      </p>
      {sameGoal ? (
        <p className="pt-log-last">
          Last time on “{sameGoal.activity}” ({sameGoal.date}): {sameGoal.notes}
        </p>
      ) : null}
      {mine.length ? (
        <ul className="pt-log-list">
          {mine.map((e) => (
            <li key={e.id}>
              <span className="pt-log-date">{e.date}</span> {e.minutes} min · {e.activity}
              {e.notes ? <span className="muted"> · {e.notes}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button className="button" type="button" onClick={props.onSave}>
        Save this session
      </button>
    </Section>
  );
}

export function PresetSection(props: {
  presets: Preset[];
  onSave: (name: string) => void;
  onLoad: (p: Preset) => void;
  onDelete: (name: string) => void;
  shareUrl: string;
  onCopy: () => void;
  onReset: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <Section title="Presets and link" hint={`${props.presets.length} saved`}>
      <div className="toolbox-row">
        <label className="toolbox-field">
          Preset name
          <input value={name} placeholder="e.g. Dukas 3/8 ladder" maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          className="button primary"
          type="button"
          onClick={() => {
            props.onSave(name);
            setName('');
          }}
          disabled={!name.trim()}
        >
          Save preset
        </button>
        <button className="button" type="button" onClick={props.onReset}>
          Reset to defaults
        </button>
      </div>
      {props.presets.length ? (
        <ul className="pt-preset-list">
          {props.presets.map((p) => (
            <li key={p.name}>
              <button className="button" type="button" onClick={() => props.onLoad(p)}>
                {p.name}
              </button>
              <button className="button" type="button" onClick={() => props.onDelete(p.name)} aria-label={`Delete preset ${p.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="toolbox-row" style={{ marginTop: 12 }}>
        <label className="toolbox-field">
          Link to this setup (voice assistants can open it)
          <input value={props.shareUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
        </label>
        <button className="button" type="button" onClick={props.onCopy}>
          Copy link
        </button>
      </div>
      <p className="muted small">
        Parameters: bpm, beats (4 or 3+2+2), sub, swing, volume, accent, voice, countin, ramp (60-120x4@4), mode (rate/auto/shuffle), gap (4/2),
        dropout, drill, drone (A3 / off), droneSeq, a4, pattern, poly, goal, flash, autostart.
      </p>
    </Section>
  );
}

const KEYS: [string, string][] = [
  ['Space / Enter', 'start or stop'],
  ['↑ / ↓', 'tempo ±1 (Shift: ±5)'],
  ['→ / PageDown', 'block was clean (ladder off: +step)'],
  ['← / PageUp', 'block was missed (ladder off: −step)'],
  ['T', 'tap tempo'],
  ['1–6', 'subdivision'],
  ['M', 'mute click'],
  ['D', 'drone on/off'],
  ['G', 'gap click on/off'],
  ['F', 'stand mode'],
  ['Esc', 'stop, or leave stand mode'],
];

export function KeysSection() {
  return (
    <Section id="pt-keys" title="Keys and pedals" hint="? for help">
      <p className="muted small">
        Bluetooth page-turner pedals (PageFlip, AirTurn, Cicada) send PageUp/PageDown, arrows, or Space/Enter. Any of those modes works: one pedal
        for “clean”, one for “missed”, or just start/stop.
      </p>
      <dl className="pt-keys">
        {KEYS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

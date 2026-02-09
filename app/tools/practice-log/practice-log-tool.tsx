'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { clamp } from '@/lib/music/notes';

type PracticeEntry = {
  id: string;
  date: string; // YYYY-MM-DD (local)
  minutes: number;
  activity: string;
  tags: string[];
  notes: string;
};

const STORAGE_KEY = 'gp_music_practice_log_v1';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseEntry(raw: any): PracticeEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : createId();
  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : todayLocal();
  const minutes = typeof raw.minutes === 'number' && Number.isFinite(raw.minutes) ? raw.minutes : Number.parseInt(String(raw.minutes || '0'), 10);
  const activity = typeof raw.activity === 'string' ? raw.activity : '';
  const notes = typeof raw.notes === 'string' ? raw.notes : '';
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()) : [];

  const safeMinutes = clamp(Math.round(minutes || 0), 1, 24 * 60);
  return { id, date, minutes: safeMinutes, activity, tags, notes };
}

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function PracticeLogTool() {
  const [entries, setEntries] = useState<PracticeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [date, setDate] = useState<string>(todayLocal());
  const [minutes, setMinutes] = useState<string>('25');
  const [activity, setActivity] = useState<string>('Repertoire');
  const [tags, setTags] = useState<string>('viola');
  const [notes, setNotes] = useState<string>('');

  const [importText, setImportText] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const loadedRef = useRef(false);

  useEffect(() => {
    // Load asynchronously so SSR output stays stable.
    const id = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          loadedRef.current = true;
          setLoaded(true);
          return;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          loadedRef.current = true;
          setLoaded(true);
          return;
        }
        const next = parsed.map(parseEntry).filter(Boolean) as PracticeEntry[];
        setEntries(next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
      } catch {
        // ignore
      } finally {
        loadedRef.current = true;
        setLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // ignore
    }
  }, [entries]);

  const totals = useMemo(() => {
    const byDate = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const now = new Date();
    const daysAgo = (d: string): number => {
      const [y, m, dd] = d.split('-').map((x) => Number.parseInt(x, 10));
      const dt = new Date(y, (m || 1) - 1, dd || 1);
      const diffMs = now.getTime() - dt.getTime();
      return Math.floor(diffMs / (24 * 60 * 60 * 1000));
    };

    let last7 = 0;
    let last30 = 0;
    let all = 0;
    for (const e of byDate) {
      all += e.minutes;
      const ago = daysAgo(e.date);
      if (ago >= 0 && ago < 7) last7 += e.minutes;
      if (ago >= 0 && ago < 30) last30 += e.minutes;
    }
    return { last7, last30, all };
  }, [entries]);

  const setNote = (msg: string) => {
    setStatusNote(msg);
    window.setTimeout(() => setStatusNote(null), 2200);
  };

  const addEntry = () => {
    const min = clamp(Number.parseInt(minutes || '0', 10), 1, 24 * 60);
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);

    const entry: PracticeEntry = {
      id: createId(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayLocal(),
      minutes: min,
      activity: activity.trim() || 'Practice',
      tags: tagList,
      notes: notes.trim(),
    };

    setEntries((prev) => [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
    setNotes('');
    setNote('Added entry.');
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const exportJson = async () => {
    const json = JSON.stringify(entries, null, 2);
    const ok = await tryCopy(json);
    setNote(ok ? 'Copied JSON.' : 'Copy failed.');
  };

  const exportCsv = async () => {
    const header = 'date,minutes,activity,tags,notes';
    const rows = entries.map((e) => {
      const esc = (s: string) => `"${String(s).replaceAll('"', '""')}"`;
      return [e.date, String(e.minutes), esc(e.activity), esc(e.tags.join(' ')), esc(e.notes)].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const ok = await tryCopy(csv);
    setNote(ok ? 'Copied CSV.' : 'Copy failed.');
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed)) {
        setNote('Import failed: expected a JSON array.');
        return;
      }
      const next = parsed.map(parseEntry).filter(Boolean) as PracticeEntry[];
      setEntries(next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
      setImportText('');
      setNote(`Imported ${next.length} entries.`);
    } catch {
      setNote('Import failed: invalid JSON.');
    }
  };

  const clearAll = () => {
    const ok = window.confirm('Clear the entire practice log? This cannot be undone.');
    if (!ok) return;
    setEntries([]);
    setNote('Cleared log.');
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Practice Log</h1>
          <span className="prompt-header-badge">LOCAL</span>
        </div>
        <p className="muted">
          A local-only practice log. No accounts, no cloud, no analytics beyond what your browser already does.
          Export/import JSON so you can back it up or move machines.
        </p>

        <div className="toolbox-row">
          <div className="music-timer-display" aria-live="polite">
            <div className="music-timer-label">Totals</div>
            <div className="music-timer-clock" style={{ fontSize: '1.7rem' }}>
              {totals.last7} min (7d)
            </div>
            <div className="muted small">
              {totals.last30} min (30d) · {totals.all} min (all time) · {entries.length} entries
            </div>
          </div>

          <div className="toolbox-actions">
            <button className="button" type="button" onClick={exportJson} disabled={!entries.length}>
              Copy JSON
            </button>
            <button className="button" type="button" onClick={exportCsv} disabled={!entries.length}>
              Copy CSV
            </button>
            <button className="button" type="button" onClick={clearAll} disabled={!entries.length}>
              Clear
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        {statusNote ? <p className="muted small">{statusNote}</p> : null}
        {!loaded ? <p className="muted small">Loading…</p> : null}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Add Entry</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            Date
            <input value={date} onChange={(e) => setDate(e.target.value)} inputMode="text" />
          </label>
          <label className="toolbox-field">
            Minutes
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
          </label>
        </div>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Activity
          <input value={activity} onChange={(e) => setActivity(e.target.value)} />
        </label>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="viola, scales, rep" />
        </label>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
        </label>

        <div className="toolbox-actions" style={{ marginTop: 12 }}>
          <button className="button primary" type="button" onClick={addEntry}>
            Add
          </button>
          <button className="button" type="button" onClick={() => setNotes('')}>
            Clear notes
          </button>
        </div>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Entries</h2>
        {entries.length === 0 ? (
          <p className="muted">No entries yet.</p>
        ) : (
          <div className="music-log-list">
            {entries.slice(0, 60).map((e) => (
              <div key={e.id} className="music-log-item">
                <div className="music-log-head">
                  <span className="music-log-date">{e.date}</span>
                  <span className="music-log-min">{e.minutes} min</span>
                  <button className="button" type="button" onClick={() => removeEntry(e.id)} aria-label={`Delete entry ${e.date}`}>
                    Delete
                  </button>
                </div>
                <div className="music-log-activity">{e.activity}</div>
                {e.tags.length ? <div className="muted small">tags: {e.tags.join(', ')}</div> : null}
                {e.notes ? <div className="muted small">{e.notes}</div> : null}
              </div>
            ))}
            {entries.length > 60 ? <p className="muted small">Showing the 60 most recent entries.</p> : null}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Import</h2>
        <p className="muted small">
          Paste a JSON array exported from this page, then import. This will replace the current log.
        </p>
        <label className="toolbox-field">
          JSON
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} spellCheck={false} />
        </label>
        <div className="toolbox-actions" style={{ marginTop: 12 }}>
          <button className="button" type="button" onClick={importJson} disabled={!importText.trim()}>
            Import JSON
          </button>
        </div>
      </div>
    </>
  );
}


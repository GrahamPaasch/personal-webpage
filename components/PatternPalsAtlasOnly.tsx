'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';
import { getPatternExcerpt } from '@/lib/patternpals/excerpts';
import { buildEligiblePatternPool, drawRandomPattern, effectiveDifficultyBand } from '@/lib/patternpals/eligibility';
import type { DrawHistoryEntry } from '@/lib/patternpals/eligibility';
import {
  getCatalogJugglerCounts,
  getPatternJugglerBounds,
  getPatternObjectCount,
  getPatternRhythm,
  getPatternSources,
  getPatternTiming,
  getPatternTypeClassification,
} from '@/lib/patternpals/atlas';
import type { PatternTiming } from '@/lib/patternpals/atlas';
import { DIFFICULTY_BANDS, estimateDifficulty } from '@/lib/patternpals/difficulty';
import { getPatternRelatives } from '@/lib/patternpals/relatives';
import { analyzeSiteswap, validateSyncPair } from '@/lib/patternpals/siteswap';
import type { DifficultyBand } from '@/lib/patternpals/difficulty';
import type { Pattern } from '@/lib/patternpals/types';

type PatternPalsAtlasOnlyProps = {
  initialPatternId?: string;
};
const CATALOG_JUGGLER_COUNTS = getCatalogJugglerCounts(PATTERN_LIBRARY).filter((count) => count >= 2);
const MAX_GROUP_SIZE = Math.max(10, ...CATALOG_JUGGLER_COUNTS.filter((count) => count <= 16));
const RANDOMIZER_AVOID_RECENT = 5;
const SPIN_DURATION_MS = 1900;
const REDUCED_MOTION_DELAY_MS = 1200;
const BAND_KEYS: DifficultyBand[] = [1, 2, 3, 4];

/** "2", "4+" or "5–7": how many jugglers a pattern itself calls for. */
export const formatJugglerBounds = (pattern: Pattern) => {
  const bounds = getPatternJugglerBounds(pattern);
  if (bounds.max === null) return `${bounds.min}+`;
  if (bounds.max !== bounds.min) return `${bounds.min}–${bounds.max}`;
  return `${bounds.min}`;
};

const timingLabel = (timing: PatternTiming | null) => (timing === 'sync' ? 'sync' : timing === 'async' ? 'async' : null);

export default function PatternPalsAtlasOnly({ initialPatternId }: PatternPalsAtlasOnlyProps = {}) {
  const initialPattern = initialPatternId ? getPatternById(initialPatternId) ?? null : null;
  // Randomizer state
  const [randJugglers, setRandJugglers] = useState<number>(() =>
    initialPattern ? Math.min(MAX_GROUP_SIZE, Math.max(2, getPatternJugglerBounds(initialPattern).min)) : 3,
  );
  const [randResult, setRandResult] = useState<Pattern | null>(initialPattern);
  const [randHistory, setRandHistory] = useState<DrawHistoryEntry[]>([]);
  const [randSpinning, setRandSpinning] = useState(false);
  const [reelName, setReelName] = useState<string>('');
  // Filters (all optional; they narrow what the wheel can land on)
  const [clubsMin, setClubsMin] = useState<number | null>(null);
  const [clubsMax, setClubsMax] = useState<number | null>(null);
  const [timing, setTiming] = useState<PatternTiming | 'all'>('all');
  const [band, setBand] = useState<DifficultyBand | null>(null);
  const [stretch, setStretch] = useState(false);
  const [query, setQuery] = useState('');
  const timers = useRef<number[]>([]);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const jugglerPool = useMemo(
    () => buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: randJugglers }).eligible,
    [randJugglers],
  );

  const clubOptions = useMemo(() => {
    const counts = new Set<number>();
    jugglerPool.forEach((pattern) => {
      const clubs = getPatternObjectCount(pattern);
      if (typeof clubs === 'number') counts.add(clubs);
    });
    return Array.from(counts).sort((a, b) => a - b);
  }, [jugglerPool]);

  const eligiblePool = useMemo(
    () =>
      buildEligiblePatternPool(PATTERN_LIBRARY, {
        jugglerCount: randJugglers,
        clubsMin,
        clubsMax,
        timing,
        difficultyBand: band,
        stretch,
        query,
      }),
    [randJugglers, clubsMin, clubsMax, timing, band, stretch, query],
  );

  const activeBand = effectiveDifficultyBand(band, stretch);
  const filtersActive = clubsMin !== null || clubsMax !== null || timing !== 'all' || band !== null || stretch || query.trim() !== '';

  const randSources = useMemo(() => {
    if (!randResult) return { sources: [], missing: [] as string[] };
    return getPatternSources(randResult);
  }, [randResult]);

  const randExcerpt = useMemo(() => {
    if (!randResult) return undefined;
    return getPatternExcerpt(randResult.id);
  }, [randResult]);

  const randDifficulty = useMemo(() => (randResult ? estimateDifficulty(randResult) : null), [randResult]);
  const randRelatives = useMemo(() => (randResult ? getPatternRelatives(randResult, PATTERN_LIBRARY) : []), [randResult]);
  const randNotation = useMemo(() => {
    const derived = randResult?.derived;
    if (!derived) return null;
    const siteswap = derived.siteswap ? analyzeSiteswap(derived.siteswap) : null;
    const pair = derived.syncPair ? validateSyncPair(derived.syncPair[0], derived.syncPair[1]) : null;
    if (!siteswap && !derived.syncPair && !derived.anthology?.sequence && !derived.prechac) return null;
    return { siteswap, pair, derived };
  }, [randResult]);

  const browseList = useMemo(
    () => eligiblePool.eligible.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [eligiblePool.eligible],
  );

  const clearFilters = useCallback(() => {
    setClubsMin(null);
    setClubsMax(null);
    setTiming('all');
    setBand(null);
    setStretch(false);
    setQuery('');
  }, []);

  const handleSpin = useCallback(() => {
    const pool = eligiblePool.eligible;
    if (pool.length === 0 || randSpinning) return;
    const drawn = drawRandomPattern(pool, randHistory, RANDOMIZER_AVOID_RECENT);
    if (!drawn) {
      setRandResult(null);
      return;
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Randomizer] Drew "${drawn.name}" from ${pool.length} patterns for ${randJugglers} jugglers`);
    }
    setRandSpinning(true);
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    const land = () => {
      setReelName(drawn.name);
      setRandResult(drawn);
      setRandHistory((prev) => [...prev, { pattern: drawn, drawnAt: Date.now() }]);
      setRandSpinning(false);
    };
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || pool.length < 2) {
      setReelName(pool.length < 2 ? drawn.name : '…');
      timers.current.push(window.setTimeout(land, REDUCED_MOTION_DELAY_MS));
      return;
    }
    // Reel: names tick past quickly, then decelerate and settle on the draw.
    let elapsed = 0;
    let delay = 55;
    let last = -1;
    while (elapsed + delay < SPIN_DURATION_MS) {
      elapsed += delay;
      delay = Math.min(260, delay * 1.11);
      timers.current.push(
        window.setTimeout(() => {
          let index = Math.floor(Math.random() * pool.length);
          if (index === last) index = (index + 1) % pool.length;
          last = index;
          setReelName(pool[index].name);
        }, elapsed),
      );
    }
    timers.current.push(window.setTimeout(land, SPIN_DURATION_MS));
  }, [eligiblePool.eligible, randHistory, randJugglers, randSpinning]);

  const showPattern = useCallback((pattern: Pattern) => {
    setRandResult(pattern);
    setReelName(pattern.name);
    window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  return (
    <section className="grid patternpals-grid">
      <article className="card patternpals-randomizer" id="patternpals-randomizer">
        <div className="patternpals-randomizer-header">
          <div className="patternpals-randomizer-title">
            <p className="patternpals-detail-label">🎰 Pattern Randomizer 🎰</p>
            <h2>Spin the Wheel!</h2>
          </div>
        </div>
        <p className="muted patternpals-randomizer-intro">Set your group size, narrow the wheel if you like, then spin — may the odds be in your favor!</p>

        <div className="patternpals-token-setup">
          <div className="patternpals-tokens-section">
            <div className="patternpals-tokens-header">
              <h3>Jugglers in your group</h3>
            </div>
            <div className="patternpals-tokens-display">
              {Array.from({ length: randJugglers }).map((_, i) => (
                <div key={i} className="patternpals-token">🤹</div>
              ))}
            </div>
            <div className="patternpals-tokens-controls">
              <button
                type="button"
                className="patternpals-token-button"
                onClick={() => setRandJugglers(Math.max(2, randJugglers - 1))}
                aria-label="Remove one juggler"
              >
                ➖
              </button>
              <span className="patternpals-token-count">{randJugglers}</span>
              <button
                type="button"
                className="patternpals-token-button"
                onClick={() => setRandJugglers(Math.min(MAX_GROUP_SIZE, randJugglers + 1))}
                aria-label="Add one juggler"
              >
                ➕
              </button>
            </div>
          </div>
        </div>

        <div className="patternpals-filters" aria-label="Narrow the wheel">
          <div className="patternpals-filter-row">
            <label className="patternpals-filter-label" htmlFor="patternpals-search">🔍 Search</label>
            <div className="patternpals-search-wrap">
              <input
                id="patternpals-search"
                type="search"
                className="patternpals-search"
                placeholder="name, alias or siteswap — e.g. why not, popcorn, 77722"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="patternpals-filter-row">
            <span className="patternpals-filter-label">🎪 Clubs</span>
            <div className="patternpals-chip-group">
              <select
                className="patternpals-select"
                aria-label="Minimum clubs"
                value={clubsMin ?? ''}
                onChange={(event) => {
                  const value = event.target.value === '' ? null : Number(event.target.value);
                  setClubsMin(value);
                  if (value !== null && clubsMax !== null && clubsMax < value) setClubsMax(value);
                }}
              >
                <option value="">any</option>
                {clubOptions.map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
              <span className="patternpals-filter-sep">to</span>
              <select
                className="patternpals-select"
                aria-label="Maximum clubs"
                value={clubsMax ?? ''}
                onChange={(event) => {
                  const value = event.target.value === '' ? null : Number(event.target.value);
                  setClubsMax(value);
                  if (value !== null && clubsMin !== null && clubsMin > value) setClubsMin(value);
                }}
              >
                <option value="">any</option>
                {clubOptions.map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="patternpals-filter-row">
            <span className="patternpals-filter-label">♪ Timing</span>
            <div className="patternpals-chip-group" role="group" aria-label="Timing">
              {(['all', 'async', 'sync'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`patternpals-chip ${timing === value ? 'active' : ''}`}
                  aria-pressed={timing === value}
                  onClick={() => setTiming(value)}
                >
                  {value === 'all' ? 'any' : value}
                </button>
              ))}
            </div>
          </div>

          <div className="patternpals-filter-row">
            <span className="patternpals-filter-label">💪 Difficulty</span>
            <div className="patternpals-chip-group" role="group" aria-label="Difficulty band">
              <button
                type="button"
                className={`patternpals-chip ${band === null ? 'active' : ''}`}
                aria-pressed={band === null}
                onClick={() => setBand(null)}
              >
                any
              </button>
              {BAND_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`patternpals-chip ${band === key ? 'active' : ''} ${stretch && activeBand === key ? 'stretch-target' : ''}`}
                  aria-pressed={band === key}
                  title={DIFFICULTY_BANDS[key].blurb}
                  onClick={() => setBand(band === key ? null : key)}
                >
                  {DIFFICULTY_BANDS[key].label}
                </button>
              ))}
              <button
                type="button"
                className={`patternpals-chip patternpals-chip-stretch ${stretch ? 'active' : ''}`}
                aria-pressed={stretch}
                title="Spin one notch above the band you picked (or Advanced when no band is picked)"
                onClick={() => setStretch(!stretch)}
              >
                🔥 Stretch me
              </button>
            </div>
          </div>

          {filtersActive ? (
            <div className="patternpals-filter-row patternpals-filter-summary">
              <span className="muted">
                Wheel narrowed to {eligiblePool.eligible.length} of {jugglerPool.length} patterns for {randJugglers}
                {activeBand ? ` · ${DIFFICULTY_BANDS[activeBand].label}${stretch ? ' (stretch)' : ''}` : ''}
              </span>
              <button type="button" className="patternpals-link-button" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        <div className="patternpals-spin-zone">
          <button
            type="button"
            className={`patternpals-big-spin-button ${randSpinning ? 'spinning' : ''}`}
            onClick={handleSpin}
            disabled={randSpinning || eligiblePool.eligible.length === 0}
            aria-label="Spin the randomizer"
          >
            <span className="patternpals-spin-text">
              {randSpinning ? '🎪 SPINNING... 🎪' : eligiblePool.eligible.length === 0 ? '⚠️ No patterns' : stretch ? '🔥 SPIN 🔥' : '🎪 SPIN 🎪'}
            </span>
            <span className="patternpals-spin-count">({eligiblePool.eligible.length} eligible)</span>
          </button>
        </div>
        {eligiblePool.eligible.length === 0 ? (
          <p className="muted patternpals-empty-hint">Nothing matches those filters for {randJugglers} jugglers — loosen one and spin again.</p>
        ) : null}

        {randSpinning ? (
          <div className="patternpals-reel" aria-live="polite" aria-label="Spinning">
            <div className="patternpals-reel-window">
              <span key={reelName} className="patternpals-reel-name">{reelName || '…'}</span>
            </div>
          </div>
        ) : null}

        {randResult && !randSpinning ? (
          <div ref={resultRef} className="patternpals-result-wheel revealed">
            <div className="patternpals-wheel-backdrop">🎊 ✨ 🎊</div>
            <div className="patternpals-result-card">
              <div className="patternpals-result-header">
                <h3 className="patternpals-result-name">{randResult.name}</h3>
              </div>
              {randResult.description && !/^Extracted from .* pattern book\.$/.test(randResult.description) ? (
                <p className="patternpals-result-description">{randResult.description}</p>
              ) : null}
              <div className="patternpals-result-metadata">
                <span className="patternpals-metadata-badge">{getPatternTypeClassification(randResult).displayName}</span>
                <span className="patternpals-metadata-badge">👥 {formatJugglerBounds(randResult)} jugglers</span>
                {getPatternObjectCount(randResult) ? (
                  <span className="patternpals-metadata-badge">🎪 {getPatternObjectCount(randResult)} clubs</span>
                ) : null}
                {getPatternRhythm(randResult) ? <span className="patternpals-metadata-badge">♪ {getPatternRhythm(randResult)}</span> : null}
                {timingLabel(getPatternTiming(randResult)) ? (
                  <span className="patternpals-metadata-badge">{timingLabel(getPatternTiming(randResult))}</span>
                ) : null}
                {randDifficulty ? (
                  <span
                    className={`patternpals-metadata-badge patternpals-band-${randDifficulty.band}`}
                    title={`Heuristic: ${randDifficulty.reasons.length ? randDifficulty.reasons.join(', ') : 'nothing adds difficulty'} (score ${randDifficulty.score})`}
                  >
                    💪 {randDifficulty.label}
                  </span>
                ) : null}
              </div>
              <div className="patternpals-result-actions">
                <button
                  type="button"
                  className="patternpals-result-button secondary"
                  onClick={handleSpin}
                  disabled={randSpinning || eligiblePool.eligible.length === 0}
                >
                  🎲 Reroll
                </button>
                <a className="patternpals-result-button tertiary" href={`/patternpals/patterns/${randResult.id}`}>
                  🔗 Link
                </a>
                <button
                  type="button"
                  className="patternpals-result-button tertiary"
                  onClick={() => { setRandResult(null); setRandHistory([]); }}
                >
                  Reset
                </button>
              </div>

              {randNotation ? (
                <div className="patternpals-notation">
                  {randNotation.siteswap ? (
                    <div className="patternpals-notation-row">
                      <span className="patternpals-notation-label">Siteswap</span>
                      <code className="patternpals-notation-code">{randNotation.siteswap.input}</code>
                      <span className="muted">
                        {randNotation.siteswap.clubs} clubs · period {randNotation.siteswap.period} · {randNotation.siteswap.throwKinds.split('').filter((k) => k === 'p').length} pass{randNotation.siteswap.throwKinds.split('').filter((k) => k === 'p').length === 1 ? '' : 'es'} per period
                      </span>
                    </div>
                  ) : null}
                  {randNotation.siteswap ? (
                    <div className="patternpals-notation-row">
                      <span className="patternpals-notation-label">Prechac</span>
                      <code className="patternpals-notation-code">A: {randNotation.siteswap.local.A.join(' ')}</code>
                      <code className="patternpals-notation-code">B: {randNotation.siteswap.local.B.join(' ')}</code>
                    </div>
                  ) : randNotation.derived.prechac ? (
                    <div className="patternpals-notation-row">
                      <span className="patternpals-notation-label">Prechac</span>
                      <code className="patternpals-notation-code">{randNotation.derived.prechac}</code>
                    </div>
                  ) : null}
                  {randNotation.derived.syncPair ? (
                    <div className="patternpals-notation-row">
                      <span className="patternpals-notation-label">Local</span>
                      <code className="patternpals-notation-code">J1: {randNotation.derived.syncPair[0]}</code>
                      <code className="patternpals-notation-code">J2: {randNotation.derived.syncPair[1]}</code>
                      {randNotation.pair ? <span className="muted">{randNotation.pair.clubs} clubs · validated</span> : null}
                    </div>
                  ) : null}
                  {randNotation.derived.anthology?.sequence ? (
                    <div className="patternpals-notation-row">
                      <span className="patternpals-notation-label">Sequence</span>
                      <code className="patternpals-notation-code">{randNotation.derived.anthology.sequence}</code>
                      {randNotation.derived.anthology.throws ? <span className="muted">{randNotation.derived.anthology.throws}</span> : null}
                    </div>
                  ) : null}
                  {randNotation.derived.notationSource || randNotation.derived.anthology ? (
                    <p className="patternpals-notation-source muted">
                      {[
                        randNotation.derived.notationSource ? `Notation from ${randNotation.derived.notationSource}` : null,
                        randNotation.derived.anthology?.sequence
                          ? `sequence from the Passing Pattern Anthology p.${randNotation.derived.anthology.page} (Markus Walter, CC BY-SA 4.0)`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('; ')}
                      {randNotation.siteswap || randNotation.pair ? '; validated locally.' : '.'}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {randRelatives.length > 0 ? (
                <div className="patternpals-relatives">
                  <span className="patternpals-relatives-label">🧬 Relatives</span>
                  <div className="patternpals-relatives-list">
                    {randRelatives.slice(0, 12).map((relative) => (
                      <button
                        key={relative.pattern.id}
                        type="button"
                        className={`patternpals-relative patternpals-relative-${relative.kind}`}
                        onClick={() => showPattern(relative.pattern)}
                        title={relative.label}
                      >
                        <span className="patternpals-relative-name">{relative.pattern.name}</span>
                        <span className="patternpals-relative-kind">{relative.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {randExcerpt ? (
                <div className="patternpals-inline-excerpt">
                  <div className="patternpals-excerpt-header">
                    <div>
                      <strong>{randExcerpt.sourceTitle}</strong>
                      <span>Page {randExcerpt.page}</span>
                    </div>
                    <a href={`${randExcerpt.bookFile}#page=${randExcerpt.page}`} target="_blank" rel="noreferrer">Open PDF</a>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={randExcerpt.image} alt={randExcerpt.alt} loading="lazy" />
                </div>
              ) : randSources.sources.length > 0 ? (
                <div className="patternpals-inline-sources">
                  <p className="patternpals-sources-label">📚 Source books</p>
                  <div className="patternpals-book-list">
                    {randSources.sources.map((book) => (
                      <a key={book.tag} className="patternpals-book-link" href={book.file} target="_blank" rel="noreferrer" download>
                        <span>{book.title}</span>
                        <span className="patternpals-book-action">Download PDF</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {randHistory.length > 1 ? (
                <div className="patternpals-history">
                  <span className="patternpals-history-label">🎰 Draw history:</span>
                  <div className="patternpals-history-trail">
                    {randHistory.map((e, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="patternpals-history-item"
                        title={e.pattern.name}
                        onClick={() => showPattern(e.pattern)}
                      >
                        {e.pattern.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <details className="patternpals-browse">
          <summary>
            📖 Browse the {eligiblePool.eligible.length} pattern{eligiblePool.eligible.length === 1 ? '' : 's'} the wheel can land on
          </summary>
          <ul className="patternpals-browse-list">
            {browseList.map((pattern) => {
              const difficulty = estimateDifficulty(pattern);
              const clubs = getPatternObjectCount(pattern);
              return (
                <li key={pattern.id}>
                  <button type="button" className="patternpals-browse-item" onClick={() => showPattern(pattern)}>
                    <span className="patternpals-browse-name">{pattern.name}</span>
                    <span className="patternpals-browse-meta">
                      <span>👥 {formatJugglerBounds(pattern)}</span>
                      {clubs ? <span>🎪 {clubs}</span> : null}
                      <span className={`patternpals-band-dot patternpals-band-${difficulty.band}`} title={difficulty.label}>{difficulty.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      </article>
    </section>
  );
}

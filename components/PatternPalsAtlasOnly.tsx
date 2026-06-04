'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';
import { getPatternExcerpt } from '@/lib/patternpals/excerpts';
import { buildEligiblePatternPool, drawRandomPattern } from '@/lib/patternpals/eligibility';
import type { DrawHistoryEntry } from '@/lib/patternpals/eligibility';
import {
  PATTERN_TYPE_LABELS,
  buildAtlasHealth,
  getCatalogJugglerCounts,
  getPatternAliases,
  getPatternJugglerCount,
  getPatternObjectCount,
  getPatternRhythm,
  getPatternSources,
  getPatternTypeClassification,
  patternSupportsJugglers,
} from '@/lib/patternpals/atlas';
import type { Pattern, PatternType } from '@/lib/patternpals/types';

type PatternPalsAtlasOnlyProps = {
  initialPatternId?: string;
};

type PatternFilterState = {
  patternType: 'all' | PatternType;
  jugglers: 'all' | string;
  objects: 'all' | string;
};

const PATTERN_TYPE_OPTIONS: PatternType[] = [
  'passing',
  'feed',
  'line',
  'takeout',
  'triangle',
  'moving',
  'solo',
  'warmup',
  'other',
];
const DEFAULT_PATTERN_FILTERS: PatternFilterState = {
  patternType: 'all',
  jugglers: 'all',
  objects: 'all',
};
const DEFAULT_PATTERN_LIMIT = 80;
const PATTERN_PAGE_SIZE = 80;
const SEARCH_PATTERN_LIMIT = 250;
const CATALOG_JUGGLER_COUNTS = getCatalogJugglerCounts(PATTERN_LIBRARY).filter((count) => count >= 2);
const RANDOMIZER_AVOID_RECENT = 5;

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compactSearchText = (value: string) => normalizeSearchText(value).replace(/\s+/g, '');

const isSubsequence = (needle: string, haystack: string) => {
  if (!needle) return true;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
};

const buildPatternSearchFields = (pattern: Pattern) => {
  const sources = getPatternSources(pattern).sources.map((source) => source.title);
  const patternTypeClassification = getPatternTypeClassification(pattern);
  return [
    pattern.id,
    pattern.name,
    pattern.description,
    patternTypeClassification.displayName,
    getPatternRhythm(pattern) ?? '',
    String(getPatternJugglerCount(pattern)),
    String(getPatternObjectCount(pattern) ?? ''),
    ...pattern.tags,
    ...getPatternAliases(pattern),
    ...(pattern.roles ?? []),
    ...(pattern.commonMistakes ?? []),
    ...sources,
  ].filter(Boolean);
};

const scorePatternSearch = (pattern: Pattern, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const fields = buildPatternSearchFields(pattern).map((field) => ({
    normalized: normalizeSearchText(field),
    compact: compactSearchText(field),
  }));
  const compactName = compactSearchText(pattern.name);

  let totalScore = 0;
  for (const term of terms) {
    const compactTerm = compactSearchText(term);
    let termScore = 0;
    for (const field of fields) {
      if (!field.normalized) continue;
      if (field.normalized === term || field.compact === compactTerm) termScore = Math.max(termScore, 120);
      else if (field.normalized.includes(term) || field.compact.includes(compactTerm)) termScore = Math.max(termScore, 90);
      else if (field.normalized.split(' ').some((word) => word.startsWith(term))) termScore = Math.max(termScore, 70);
      else if (isSubsequence(compactTerm, field.compact)) termScore = Math.max(termScore, 35);
    }

    if (compactName.includes(compactTerm)) termScore += 20;
    if (termScore === 0) return 0;
    totalScore += termScore;
  }

  return totalScore;
};

const matchesPatternFilters = (pattern: Pattern, filters: PatternFilterState) => {
  const patternTypeClassification = getPatternTypeClassification(pattern);
  if (filters.patternType !== 'all' && patternTypeClassification.value !== filters.patternType) return false;
  if (filters.jugglers !== 'all' && !patternSupportsJugglers(pattern, Number(filters.jugglers))) return false;
  if (filters.objects !== 'all' && getPatternObjectCount(pattern) !== Number(filters.objects)) return false;
  return true;
};

type PatternListProps = {
  patterns: Pattern[];
  total: number;
  searchActive: boolean;
  hasMore: boolean;
  onSelect: (pattern: Pattern) => void;
  onLoadMore: () => void;
};

const PatternList = memo(({ patterns, total, searchActive, hasMore, onSelect, onLoadMore }: PatternListProps) => {
  return (
    <>
      <div className="patternpals-pattern-summary muted small">
        Showing {patterns.length} of {total} patterns.
        {searchActive ? ' Refine your search to see more results.' : ' Use search to jump to a pattern quickly.'}
      </div>
      <div className="patternpals-pattern-list">
        {patterns.map((pattern) => {
          const patternTypeClassification = getPatternTypeClassification(pattern);
          const objectCount = getPatternObjectCount(pattern);
          return (
            <div key={pattern.id} className="patternpals-pattern-row">
              <div className="patternpals-pattern-main">
                <button type="button" className="patternpals-pattern-trigger" onClick={() => onSelect(pattern)}>
                  <h3>{pattern.name}</h3>
                  <p className="muted">{pattern.description}</p>
                  <div className="patternpals-chip-row">
                    <span className={`patternpals-metadata-pill ${patternTypeClassification.provenance.confidence}`}>
                      {patternTypeClassification.displayName}
                    </span>
                    <span>{getPatternJugglerCount(pattern)} jugglers</span>
                    {objectCount ? <span>{objectCount} objects</span> : null}
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore ? (
        <div className="patternpals-pattern-actions">
          <button type="button" className="patternpals-mini-button" onClick={onLoadMore}>
            Load more patterns
          </button>
        </div>
      ) : null}
    </>
  );
});

PatternList.displayName = 'PatternList';

export default function PatternPalsAtlasOnly({ initialPatternId }: PatternPalsAtlasOnlyProps = {}) {
  const [patternSearch, setPatternSearch] = useState('');
  const [patternLimit, setPatternLimit] = useState(DEFAULT_PATTERN_LIMIT);
  const [patternFilters, setPatternFilters] = useState<PatternFilterState>(DEFAULT_PATTERN_FILTERS);

  // Randomizer state
  const [randJugglers, setRandJugglers] = useState<number>(3);
  const [randPatternType, setRandPatternType] = useState<'all' | PatternType>('all');
  const [randObjectCount, setRandObjectCount] = useState<'all' | string>('all');
  const [randSourceBacked, setRandSourceBacked] = useState(false);
  const [randResult, setRandResult] = useState<import('@/lib/patternpals/types').Pattern | null>(null);
  const [randHistory, setRandHistory] = useState<DrawHistoryEntry[]>([]);
  const [randSpinning, setRandSpinning] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(() =>
    initialPatternId ? getPatternById(initialPatternId) ?? null : null,
  );

  const atlasHealth = useMemo(() => buildAtlasHealth(PATTERN_LIBRARY), []);

  const eligiblePool = useMemo(
    () =>
      buildEligiblePatternPool(PATTERN_LIBRARY, {
        jugglerCount: randJugglers,
        patternType: randPatternType,
        objectCount: randObjectCount === 'all' ? null : Number(randObjectCount),
        sourceBacked: randSourceBacked,
      }),
    [randJugglers, randPatternType, randObjectCount, randSourceBacked],
  );

  const handleSpin = useCallback(() => {
    setRandSpinning(true);
    // Brief visual delay for effect
    setTimeout(() => {
      const drawn = drawRandomPattern(eligiblePool.eligible, randHistory, RANDOMIZER_AVOID_RECENT);
      if (drawn) {
        setRandResult(drawn);
        setRandHistory((prev) => [...prev, { pattern: drawn, drawnAt: Date.now() }]);
      } else {
        setRandResult(null);
      }
      setRandSpinning(false);
    }, 300);
  }, [eligiblePool.eligible, randHistory]);

  const filteredPatterns = useMemo(() => {
    const query = patternSearch.trim();
    const scored = PATTERN_LIBRARY.map((pattern, index) => ({
      pattern,
      index,
      score: scorePatternSearch(pattern, query),
    })).filter(({ pattern, score }) => score > 0 && matchesPatternFilters(pattern, patternFilters));

    if (query) scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.map(({ pattern }) => pattern);
  }, [patternFilters, patternSearch]);

  const visiblePatterns = useMemo(() => {
    if (patternSearch.trim()) return filteredPatterns.slice(0, SEARCH_PATTERN_LIMIT);
    return filteredPatterns.slice(0, patternLimit);
  }, [filteredPatterns, patternLimit, patternSearch]);

  const hasMorePatterns = useMemo(() => {
    if (patternSearch.trim()) return filteredPatterns.length > SEARCH_PATTERN_LIMIT;
    return filteredPatterns.length > patternLimit;
  }, [filteredPatterns.length, patternLimit, patternSearch]);

  const patternFiltersActive = useMemo(
    () =>
      Boolean(patternSearch.trim())
      || patternFilters.patternType !== 'all'
      || patternFilters.jugglers !== 'all'
      || patternFilters.objects !== 'all',
    [patternFilters, patternSearch],
  );

  const selectedSources = useMemo(() => {
    if (!selectedPattern) return { sources: [], missing: [] as string[] };
    return getPatternSources(selectedPattern);
  }, [selectedPattern]);

  const selectedExcerpt = useMemo(() => {
    if (!selectedPattern) return undefined;
    return getPatternExcerpt(selectedPattern.id);
  }, [selectedPattern]);

  const selectedPatternPath = selectedPattern ? `/patternpals/patterns/${selectedPattern.id}` : '/patternpals';

  useEffect(() => {
    setPatternLimit(DEFAULT_PATTERN_LIMIT);
  }, [patternSearch, patternFilters]);

  const closePatternDetail = useCallback(() => {
    setSelectedPattern(null);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/patternpals/patterns/')) {
      window.history.pushState({}, '', '/patternpals');
    }
  }, []);

  const handleSelectPattern = useCallback((pattern: Pattern) => {
    setSelectedPattern(pattern);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/patternpals/patterns/${pattern.id}`);
    }
  }, []);

  const handleLoadMorePatterns = useCallback(() => {
    setPatternLimit((prev) => prev + PATTERN_PAGE_SIZE);
  }, []);

  const resetPatternBrowser = useCallback(() => {
    setPatternSearch('');
    setPatternFilters(DEFAULT_PATTERN_FILTERS);
  }, []);

  return (
    <section className="grid patternpals-grid">
      <article className="card patternpals-hero">
        <div className="patternpals-hero-content">
          <div>
            <h1>PatternPals Atlas</h1>
            <p className="muted">A focused atlas experience: find patterns fast, inspect sources, and preserve clear pattern documentation.</p>
          </div>
          <div className="patternpals-stat-grid">
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Atlas entries</span>
              <strong>{atlasHealth.totalPatterns}</strong>
            </div>
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Source-backed</span>
              <strong>{atlasHealth.sourceBackedPatterns}</strong>
            </div>
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Visual excerpts</span>
              <strong>{atlasHealth.excerptBackedPatterns}</strong>
            </div>
          </div>
        </div>
      </article>

      <article className="card patternpals-randomizer" id="patternpals-randomizer">
        <div className="patternpals-section-header">
          <div>
            <p className="patternpals-detail-label">Pattern randomizer</p>
            <h2>Spin a random pattern</h2>
          </div>
        </div>
        <p className="muted">Configure your group and hit Spin — the randomizer draws an eligible pattern from the atlas.</p>

        <div className="patternpals-filter-grid" aria-label="Randomizer filters">
          <label>
            Jugglers
            <select
              value={String(randJugglers)}
              onChange={(event) => setRandJugglers(Number(event.target.value))}
            >
              {CATALOG_JUGGLER_COUNTS.map((count) => (
                <option key={count} value={String(count)}>{count}</option>
              ))}
            </select>
          </label>
          <label>
            Pattern type
            <select
              value={randPatternType}
              onChange={(event) => setRandPatternType(event.target.value as 'all' | PatternType)}
            >
              <option value="all">Any</option>
              {PATTERN_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>{PATTERN_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </label>
          <label>
            Objects
            <select
              value={randObjectCount}
              onChange={(event) => setRandObjectCount(event.target.value)}
            >
              <option value="all">Any</option>
              {[5, 6, 7, 8, 9, 10, 11].map((count) => (
                <option key={count} value={String(count)}>{count}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="patternpals-checkbox-label">
          <input
            type="checkbox"
            checked={randSourceBacked}
            onChange={(event) => setRandSourceBacked(event.target.checked)}
          />
          Source-backed patterns only
        </label>

        <div className="patternpals-randomizer-actions">
          <button
            type="button"
            className="patternpals-spin-button"
            onClick={handleSpin}
            disabled={randSpinning || eligiblePool.eligible.length === 0}
          >
            {randSpinning ? 'Spinning…' : eligiblePool.eligible.length === 0 ? 'No eligible patterns' : `Spin (${eligiblePool.eligible.length} eligible)`}
          </button>
          {randResult ? (
            <button
              type="button"
              className="patternpals-mini-button ghost"
              onClick={() => { setRandResult(null); setRandHistory([]); }}
            >
              Reset
            </button>
          ) : null}
        </div>

        {randResult ? (
          <div className="patternpals-rand-result">
            <div className="patternpals-rand-result-header">
              <div>
                <p className="patternpals-detail-label">Drawn pattern</p>
                <h3>{randResult.name}</h3>
              </div>
              <div className="patternpals-detail-actions">
                <button
                  type="button"
                  className="patternpals-mini-button"
                  onClick={() => handleSelectPattern(randResult)}
                >
                  View in atlas
                </button>
                <button
                  type="button"
                  className="patternpals-mini-button ghost"
                  onClick={handleSpin}
                  disabled={randSpinning}
                >
                  Reroll
                </button>
              </div>
            </div>
            <p className="muted">{randResult.description}</p>
            <div className="patternpals-chip-row">
              <span className="patternpals-metadata-pill curated">{getPatternTypeClassification(randResult).displayName}</span>
              <span>{getPatternJugglerCount(randResult)} jugglers</span>
              {getPatternObjectCount(randResult) ? <span>{getPatternObjectCount(randResult)} objects</span> : null}
              {getPatternRhythm(randResult) ? <span>{getPatternRhythm(randResult)}</span> : null}
            </div>
            {randHistory.length > 1 ? (
              <p className="muted small">Draw history ({randHistory.length} spins): {randHistory.map((e) => e.pattern.name).join(' → ')}</p>
            ) : null}
          </div>
        ) : null}
      </article>

      <article className="card patternpals-progress" id="patternpals-library">
        <div className="patternpals-section-header">
          <div>
            <p className="patternpals-detail-label">Living knowledge base</p>
            <h2>Pattern atlas browser</h2>
          </div>
          <div className="patternpals-search-panel">
            <div className="patternpals-search">
              <input
                value={patternSearch}
                onChange={(event) => setPatternSearch(event.target.value)}
                placeholder="Search names, aliases, roles, rhythms, or source books"
              />
            </div>
            <div className="patternpals-filter-grid" aria-label="Pattern filters">
              <label>
                Pattern type
                <select
                  value={patternFilters.patternType}
                  onChange={(event) => setPatternFilters((prev) => ({ ...prev, patternType: event.target.value as PatternFilterState['patternType'] }))}
                >
                  <option value="all">Any</option>
                  {PATTERN_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>{PATTERN_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </label>
              <label>
                Jugglers
                <select
                  value={patternFilters.jugglers}
                  onChange={(event) => setPatternFilters((prev) => ({ ...prev, jugglers: event.target.value }))}
                >
                  <option value="all">Any</option>
                  {CATALOG_JUGGLER_COUNTS.map((count) => (
                    <option key={count} value={String(count)}>{count}</option>
                  ))}
                </select>
              </label>
              <label>
                Objects
                <select
                  value={patternFilters.objects}
                  onChange={(event) => setPatternFilters((prev) => ({ ...prev, objects: event.target.value }))}
                >
                  <option value="all">Any</option>
                  {[5, 6, 7, 8, 9, 10, 11].map((count) => (
                    <option key={count} value={String(count)}>{count}</option>
                  ))}
                </select>
              </label>
            </div>
            {patternFiltersActive ? (
              <button type="button" className="patternpals-mini-button ghost" onClick={resetPatternBrowser}>
                Reset search and filters
              </button>
            ) : null}
          </div>
        </div>

        <PatternList
          patterns={visiblePatterns}
          total={filteredPatterns.length}
          searchActive={Boolean(patternSearch.trim())}
          hasMore={hasMorePatterns}
          onSelect={handleSelectPattern}
          onLoadMore={handleLoadMorePatterns}
        />
      </article>

      {selectedPattern ? (
        <div
          className="patternpals-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="patternpals-detail-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePatternDetail();
          }}
        >
          <div className="patternpals-detail-card">
            <div className="patternpals-detail-header">
              <div>
                <p className="patternpals-detail-label">Canonical atlas entry</p>
                <h3 id="patternpals-detail-title">{selectedPattern.name}</h3>
              </div>
              <div className="patternpals-detail-actions">
                <a className="patternpals-mini-button" href={selectedPatternPath}>Share link</a>
                <button type="button" className="patternpals-mini-button ghost" onClick={closePatternDetail}>Close</button>
              </div>
            </div>

            <p className="muted">{selectedPattern.description}</p>

            <div className="patternpals-detail-meta">
              <span>{getPatternJugglerCount(selectedPattern)} jugglers</span>
              <span>{selectedPattern.props.join(', ')}</span>
              {getPatternObjectCount(selectedPattern) ? <span>{getPatternObjectCount(selectedPattern)} objects</span> : null}
              {getPatternRhythm(selectedPattern) ? <span>{getPatternRhythm(selectedPattern)}</span> : null}
            </div>

            <div className="patternpals-detail-section">
              <h4>Source excerpt</h4>
              {selectedExcerpt ? (
                <div className="patternpals-excerpt-card">
                  <div className="patternpals-excerpt-header">
                    <div>
                      <strong>{selectedExcerpt.sourceTitle}</strong>
                      <span>Page {selectedExcerpt.page}</span>
                    </div>
                    <a href={`${selectedExcerpt.bookFile}#page=${selectedExcerpt.page}`} target="_blank" rel="noreferrer">Open PDF page</a>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedExcerpt.image} alt={selectedExcerpt.alt} loading="lazy" />
                </div>
              ) : (
                <p className="muted small">No automatic source snapshot is available for this pattern yet.</p>
              )}
            </div>

            <div className="patternpals-detail-section">
              <h4>Source citations</h4>
              {selectedSources.sources.length > 0 ? (
                <div className="patternpals-book-list">
                  {selectedSources.sources.map((book) => (
                    <a key={book.tag} className="patternpals-book-link" href={book.file} target="_blank" rel="noreferrer" download>
                      <span>{book.title}</span>
                      <span className="patternpals-book-action">Download PDF</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted small">No mapped source books for this pattern yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

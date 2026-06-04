'use client';

import { useCallback, useMemo, useState } from 'react';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';
import { getPatternExcerpt } from '@/lib/patternpals/excerpts';
import { buildEligiblePatternPool, drawRandomPattern } from '@/lib/patternpals/eligibility';
import type { DrawHistoryEntry } from '@/lib/patternpals/eligibility';
import {
  getCatalogJugglerCounts,
  getPatternObjectCount,
  getPatternRhythm,
  getPatternSources,
  getPatternTypeClassification,
} from '@/lib/patternpals/atlas';
import type { Pattern } from '@/lib/patternpals/types';

type PatternPalsAtlasOnlyProps = {
  initialPatternId?: string;
};
const CATALOG_JUGGLER_COUNTS = getCatalogJugglerCounts(PATTERN_LIBRARY).filter((count) => count >= 2);
const RANDOMIZER_AVOID_RECENT = 5;

export default function PatternPalsAtlasOnly({ initialPatternId }: PatternPalsAtlasOnlyProps = {}) {
  // Randomizer state
  const [randJugglers, setRandJugglers] = useState<number>(3);
  const [randResult, setRandResult] = useState<Pattern | null>(() =>
    initialPatternId ? getPatternById(initialPatternId) ?? null : null,
  );
  const [randHistory, setRandHistory] = useState<DrawHistoryEntry[]>([]);
  const [randSpinning, setRandSpinning] = useState(false);

  const eligiblePool = useMemo(
    () =>
      buildEligiblePatternPool(PATTERN_LIBRARY, {
        jugglerCount: randJugglers,
      }),
    [randJugglers],
  );

  const randSources = useMemo(() => {
    if (!randResult) return { sources: [], missing: [] as string[] };
    return getPatternSources(randResult);
  }, [randResult]);

  const randExcerpt = useMemo(() => {
    if (!randResult) return undefined;
    return getPatternExcerpt(randResult.id);
  }, [randResult]);

  const handleSpin = useCallback(() => {
    setRandSpinning(true);
    setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Randomizer] Drawing from pool of ${eligiblePool.eligible.length} patterns for ${randJugglers} jugglers`);
      }
      const drawn = drawRandomPattern(eligiblePool.eligible, randHistory, RANDOMIZER_AVOID_RECENT);
      if (drawn) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Randomizer] Drew "${drawn.name}"`);
        }
        setRandResult(drawn);
        setRandHistory((prev) => [...prev, { pattern: drawn, drawnAt: Date.now() }]);
      } else {
        setRandResult(null);
      }
      setRandSpinning(false);
    }, 1200);
  }, [eligiblePool.eligible, randHistory]);

  return (
    <section className="grid patternpals-grid">
      <article className="card patternpals-randomizer" id="patternpals-randomizer">
        <div className="patternpals-randomizer-header">
          <div className="patternpals-randomizer-title">
            <p className="patternpals-detail-label">🎰 Pattern Randomizer 🎰</p>
            <h2>Spin the Wheel!</h2>
          </div>
        </div>
        <p className="muted patternpals-randomizer-intro">Set your group size with tokens, spin to draw a pattern — may the odds be ever in your favor.</p>

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
                onClick={() => setRandJugglers(Math.min(10, randJugglers + 1))}
                aria-label="Add one juggler"
              >
                ➕
              </button>
            </div>
          </div>

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
              {randSpinning ? '🎡 SPINNING... 🎡' : eligiblePool.eligible.length === 0 ? '⚠️ No patterns' : '🎰 SPIN 🎰'}
            </span>
            <span className="patternpals-spin-count">({eligiblePool.eligible.length} eligible)</span>
          </button>
        </div>

        {randResult ? (
          <div className={`patternpals-result-wheel ${randSpinning ? 'revealing' : 'revealed'}`}>
            <div className="patternpals-wheel-backdrop">🎊 ✨ 🎊</div>
            <div className="patternpals-result-card">
              <div className="patternpals-result-header">
                <h3 className="patternpals-result-name">{randResult.name}</h3>
              </div>
              <p className="patternpals-result-description">{randResult.description}</p>
              <div className="patternpals-result-metadata">
                <span className="patternpals-metadata-badge">{getPatternTypeClassification(randResult).displayName}</span>
                <span className="patternpals-metadata-badge">👥 {randJugglers} (playing this version)</span>
                {getPatternObjectCount(randResult) ? (
                  <span className="patternpals-metadata-badge">🎪 {getPatternObjectCount(randResult)}</span>
                ) : null}
                {getPatternRhythm(randResult) ? <span className="patternpals-metadata-badge">♪ {getPatternRhythm(randResult)}</span> : null}
              </div>
              <div className="patternpals-result-actions">
                <button
                  type="button"
                  className="patternpals-result-button secondary"
                  onClick={handleSpin}
                  disabled={randSpinning}
                >
                  🎲 Reroll
                </button>
                <button
                  type="button"
                  className="patternpals-result-button tertiary"
                  onClick={() => { setRandResult(null); setRandHistory([]); }}
                >
                  Reset
                </button>
              </div>

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
                      <span key={idx} className="patternpals-history-item" title={e.pattern.name}>
                        {e.pattern.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
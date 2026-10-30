/**
 * External sources we link out to (never copy from), plus per-pattern provenance.
 *
 * - Passist (https://passist.org, Christian Helbling, GPLv3 web app): animates and explains a
 *   4-handed siteswap; deep link is /siteswap/<siteswap>?jugglers=2.
 * - Christian Kästner (CMU): "Modern Club Passing" (CC BY 4.0) and his searchable list of
 *   compatible 4-handed siteswaps. We compute compatibility locally with the book's definition
 *   (same period, same catching interface) and link to the list for the full table.
 * - Passing Pattern Anthology (Markus Walter, CC BY-SA 4.0): the notation we reuse with attribution.
 */
import { getPatternExcerpt } from './excerpts';
import { getPatternSources } from './atlas';
import type { Pattern } from './types';

export type ExternalLink = {
  provider: 'passist' | 'kaestner-list' | 'modern-passing' | 'anthology';
  label: string;
  href: string;
  attribution: string;
};

export const PASSIST_BASE = 'https://passist.org';
export const KAESTNER_COMPATIBLE_LIST = 'https://www.cs.cmu.edu/~ckaestne/siteswaps.xhtml';
export const MODERN_PASSING_SITESWAPS = 'https://modernpassing.com/4a-4hsw-notation.html';
export const MODERN_PASSING_COMPATIBLE = 'https://modernpassing.com/4h-4hsw-compatible.html';
export const ANTHOLOGY_HOME = 'https://houseofsuns.org/ppa/ppa.html';

export const passistSiteswapUrl = (siteswap: string, jugglers = 2) =>
  `${PASSIST_BASE}/siteswap/${encodeURIComponent(siteswap.toLowerCase().replace(/[^0-9a-z]/g, ''))}?jugglers=${jugglers}`;

export const getExternalLinks = (pattern: Pattern): ExternalLink[] => {
  const links: ExternalLink[] = [];
  const derived = pattern.derived;
  const jugglers = pattern.numJugglers ?? pattern.requiredJugglers;
  if (derived?.siteswap) {
    links.push({
      provider: 'passist',
      label: `Animate ${derived.siteswap} on Passist`,
      href: passistSiteswapUrl(derived.siteswap, jugglers),
      attribution: 'Passist by Christian Helbling (GPLv3)',
    });
    links.push({
      provider: 'kaestner-list',
      label: 'Compatible siteswaps list',
      href: KAESTNER_COMPATIBLE_LIST,
      attribution: 'Christian Kästner, Carnegie Mellon University',
    });
    links.push({
      provider: 'modern-passing',
      label: 'How to read 4-handed siteswaps',
      href: MODERN_PASSING_SITESWAPS,
      attribution: 'Modern Club Passing, Christian Kästner (CC BY 4.0)',
    });
  }
  if (derived?.anthology) {
    links.push({
      provider: 'anthology',
      label: `Passing Pattern Anthology p.${derived.anthology.page}`,
      href: ANTHOLOGY_HOME,
      attribution: 'Markus Walter (CC BY-SA 4.0)',
    });
  }
  return links;
};

export type ProvenanceLine = { field: string; value: string; source: string };

/** Human-readable provenance for the card: where each stored fact came from. */
export const getProvenance = (pattern: Pattern): ProvenanceLine[] => {
  const lines: ProvenanceLine[] = [];
  const excerpt = getPatternExcerpt(pattern.id);
  const { sources } = getPatternSources(pattern);
  if (excerpt) {
    lines.push({ field: 'Pattern', value: pattern.name, source: `${excerpt.sourceTitle}, page ${excerpt.page}` });
  } else if (sources.length > 0) {
    lines.push({ field: 'Pattern', value: pattern.name, source: sources.map((book) => book.title).join('; ') });
  }
  const derived = pattern.derived;
  if (derived?.numJugglers !== undefined) {
    lines.push({ field: 'Jugglers', value: String(derived.numJugglers) + (derived.maxJugglers === null ? '+' : derived.maxJugglers ? `–${derived.maxJugglers}` : ''), source: derived.jugglersProvenance ?? 'book' });
  }
  if (derived?.numClubs !== undefined) {
    lines.push({ field: 'Clubs', value: String(derived.numClubs), source: derived.clubsProvenance ?? 'book' });
  }
  if (derived?.siteswap) {
    lines.push({ field: 'Siteswap', value: derived.siteswap, source: `${derived.notationSource ?? 'book'}; validated locally` });
  }
  if (derived?.syncPair) {
    lines.push({ field: 'Local siteswaps', value: derived.syncPair.join(' | '), source: `${derived.notationSource ?? 'book'}; validated locally` });
  }
  if (derived?.related?.length) {
    lines.push({ field: 'Related patterns', value: derived.related.map((r) => r.name).join(', '), source: 'Will Murray, "Related patterns"' });
  }
  lines.push({ field: 'Difficulty', value: 'band', source: 'heuristic (clubs per juggler, rhythm, tricks, movement); not from a book' });
  return lines;
};

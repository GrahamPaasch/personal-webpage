import { getPost, listPostSlugs } from '@/lib/posts';

export default async function sitemap() {
  const base = 'https://www.grahampaasch.com';
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();

  const staticPages = [
    '',
    '/agent',
    '/agent/for-agents',
    '/career-vision',
    '/design/voice-system',
    '/graffiti',
    '/hobbies',
    '/hobbies/juggling',
    '/hobbies/shona-music',
    '/hobbies/viola',
    '/naf-discovery',
    '/patternpals',
    '/professional',
    '/prompt-pack',
    '/resume-tool',
    '/sidewalks-of-rage/',
    '/status',
    '/tools',
    '/tools/subnet',
    '/tools/bgp-communities',
    '/tools/config-diff',
    '/tools/metronome',
    '/tools/tempo-ramp',
    '/tools/drone',
    '/tools/practice-timer',
    '/tools/practice-log',
    '/tools/setlist',
    '/tools/ear-trainer',
    '/tools/tuner',
    '/tools/chord-looper',
    '/tools/rhythm-trainer',
    '/tools/scale-randomizer',
    '/version',
    '/voice-specimen',
    '/wellness',
    '/wellness/box-breathing',
    '/wellness/coherent-breathing',
    '/writings',
  ].map((p) => ({
    url: base + p,
    lastModified: buildTime,
  }));

  const posts = listPostSlugs()
    .map((slug) => getPost(slug))
    .filter(Boolean)
    .map((post) => ({
      url: `${base}/writings/${post!.meta.slug}`,
      lastModified: post!.meta.date,
    }));
  return [...staticPages, ...posts];
}

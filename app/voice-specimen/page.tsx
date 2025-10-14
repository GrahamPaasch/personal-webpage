/**
 * README: Wrap MDX documents with <VoiceMDXProvider/> and use data-voice attributes or frontmatter
 * (ai | human | unified) to inherit the correct authorship styling automatically.
 */
import type { Metadata } from 'next';
import VoiceSpecimenExtreme from '@/components/VoiceSystem';

export const metadata: Metadata = {
  title: 'Voice Specimen · Authorship System',
  description: 'Extreme contrast reference for AI, Human, and Unified voice treatments.',
};

export default function VoiceSpecimenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-12 px-6 py-16">
      <VoiceSpecimenExtreme />
    </main>
  );
}

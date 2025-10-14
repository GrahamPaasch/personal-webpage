import Link from 'next/link';

const samples = [
  {
    id: 'ai',
    label: 'AI voice',
    className: 'voice-tone voice-ai',
    text: 'Agent-authored contributions adopt a crisp, intentional cadence. They should feel precise, optimistic, and slightly futuristic.',
    fontName: 'Space Grotesk',
    details: 'Geometric sans for agent notes, system prompts, and machine-generated summaries.',
  },
  {
    id: 'human',
    label: 'Human voice',
    className: 'voice-tone voice-human',
    text: 'Your personal narrative can stay lush and expressive. Think reflective journal entries, manifesto excerpts, and heartfelt asides.',
    fontName: 'Fraunces',
    details: 'Display serif with gentle contrast for deeply personal stories and crafted essays.',
  },
  {
    id: 'unified',
    label: 'Unified voice',
    className: 'voice-tone voice-unified',
    text: 'Collaborative artifacts weave both perspectives together. Keep the tone welcoming, practical, and ready for the next experiment.',
    fontName: 'Inter',
    details: 'Workhorse sans for co-created playbooks, annotations, and shared context.',
  },
];

export default function VoiceSystemPage() {
  return (
    <div className="prose" style={{ maxWidth: 720 }}>
      <h1>Voice System Mockup</h1>
      <p>
        Draft palette for the emerging <em>AI / Human / Unified</em> framing. Nothing is final—this page is a sandbox so we can react together
        before threading styles through live content.
      </p>
      <p>
        Each voice block below pairs a font, accent treatment, and usage note. Typography is sourced via{' '}
        <code>next/font</code> for performance, and keeps weights flexible enough for future refinements.
      </p>

      <div className="voice-system" style={{ margin: '32px 0' }}>
        {samples.map((sample) => (
          <article key={sample.id} className={sample.className}>
            <span className="voice-label">{sample.label}</span>
            <p>{sample.text}</p>
            <footer style={{ marginTop: 16, fontSize: '0.85rem', opacity: 0.85 }}>
              <strong>{sample.fontName}</strong> · {sample.details}
            </footer>
          </article>
        ))}
      </div>

      <h2>Next Steps for Review</h2>
      <ul>
        <li>Validate whether these weights, colours, and textures match the vibe you want for each voice.</li>
        <li>Decide where the legend should live (inline on key pages, modal, dedicated explainer, etc.).</li>
        <li>Plan component-level hooks so future “voice” callouts stay consistent without editing prose.</li>
      </ul>

      <p className="muted" style={{ marginTop: 32 }}>
        <Link href="/">Back to home</Link>
      </p>
    </div>
  );
}

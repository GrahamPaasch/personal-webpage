import Link from 'next/link';

const samples = [
  {
    id: 'i',
    label: 'I said',
    className: 'voice-tone voice-i',
    text: 'I lead with a reflective, craft-forward tone. These passages should feel intentional, lyrical, and unmistakably me.',
    fontName: 'Fraunces',
    details: 'Display serif with gentle contrast for personal reflections, essays, and key pull quotes.',
  },
  {
    id: 'you',
    label: 'You said',
    className: 'voice-tone voice-you',
    text: 'Your feedback and collaborator notes stay grounded and approachable. This voice reads like a trusted colleague adding context.',
    fontName: 'Inter',
    details: 'Workhorse sans for body copy, annotations, and community contributions.',
  },
  {
    id: 'we',
    label: 'We said',
    className: 'voice-tone voice-we',
    text: 'Collective insights, AI outputs, and shared frameworks lean into a precise, slightly futuristic register.',
    fontName: 'Space Grotesk',
    details: 'Geometric sans used for summaries, timecapsules, and co-created artifacts.',
  },
];

export default function VoiceSystemPage() {
  return (
    <div className="prose" style={{ maxWidth: 720 }}>
      <h1>Voice System Mockup</h1>
      <p>
        Draft palette for the emerging <em>I said / You said / We said</em> framing. Nothing is final—this page is a sandbox so we can react together
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

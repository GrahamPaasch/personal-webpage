import Link from 'next/link';

const samples = [
  {
    id: 'ai',
    label: 'AI voice',
    className: 'voice-tone voice-ai',
    text: 'Agent-authored contributions adopt a terminal, computational aesthetic. Monospace signals machine-generated precision.',
    fontName: 'JetBrains Mono',
    details: 'JetBrains Mono for all AI text—terminal style, technical, precise.',
  },
  {
    id: 'human',
    label: 'Human voice',
    className: 'voice-tone voice-human',
    text: 'Personal narrative stays ornate and expressive—Renaissance flourishes signal handcrafted human authorship.',
    fontName: 'Playfair Display + EB Garamond',
    details: 'Playfair Display for headings and decorative elements; EB Garamond for body text.',
  },
  {
    id: 'unified',
    label: 'Unified voice',
    className: 'voice-tone voice-unified',
    text: 'Collaborative artifacts weave both perspectives together. Keep the tone welcoming, practical, and ready for the next experiment.',
    fontName: 'Inter',
    details: 'Workhorse sans for co-created playbooks, annotations, and shared context with tabular digits.',
  },
];

export default function VoiceSystemPage() {
  return (
    <div className="prose" style={{ maxWidth: 720 }}>
      <h1>Voice System Mockup</h1>
      <p>
        Draft palette for the emerging <em>AI / Human / Unified</em> framing. Nothing is final—this page is a sandbox so we can react together before threading
        styles through live content.
      </p>
      <p>
        Each voice block below pairs a font, accent treatment, and usage note. Typography is sourced via{' '}
        <code>next/font</code> for performance, and keeps weights flexible enough for future refinements.
      </p>

      <div className="voice-system" style={{ margin: '32px 0' }}>
        {samples.map((sample) => (
          <article key={sample.id} className={sample.className}>
            <span className="voice-label">{sample.label}</span>
            <p
              data-voice={
                sample.id === 'unified' ? 'unified' : sample.id === 'human' ? 'human' : 'ai'
              }
              data-role={sample.id === 'human' ? 'text' : undefined}
              data-case={sample.id === 'ai' ? 'sentence' : undefined}
            >
              {sample.text}
            </p>
            <footer style={{ marginTop: 16, fontSize: '0.85rem' }}>
              <strong>{sample.fontName}</strong> · {sample.details}
            </footer>
          </article>
        ))}
      </div>

      <h2>Quick Rules to Ship</h2>
      <ul>
        <li data-voice="unified">Unified defaults to Inter 18/1.6 with tabular digits and a slashed zero for metrics and UI.</li>
        <li data-voice="human">Human essays use Playfair Display for headings; EB Garamond appears in body text with ornate flourishes.</li>
        <li data-voice="ai">Agent callouts lean on JetBrains Mono with assertive tracking—terminal monospace instantly signals AI authorship.</li>
        <li data-voice="unified">Keep readable measure around 65ch and audit contrast (≥4.5:1) on every background.</li>
      </ul>

      <h3 data-voice="ai">Agent Prompt Example</h3>
      <pre className="ai-mono" style={{ fontSize: '0.95rem', padding: 16 }}>
        <code>{`/agents/brief
voice=ai
zero-shot=false
deadline=2024-09-09T17:00Z`}</code>
      </pre>

      <p data-voice="ai" style={{ marginTop: 12 }}>
        STATUS · SYNC WINDOW OPENS IN 02:15:00
      </p>

      <h3 data-voice="human" data-role="display">Pull Quote Sample</h3>
      <blockquote data-voice="human" data-role="display" style={{ fontSize: '1.4rem', lineHeight: 1.4 }}>
        When I let the machine sketch with me, the work shifts from solitary to symphonic.
      </blockquote>

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

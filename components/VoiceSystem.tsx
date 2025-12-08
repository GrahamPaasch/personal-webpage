import React from 'react';

export default function VoiceSpecimenExtreme() {
  return (
    <section className="space-y-12">
      <header className="space-y-3">
        <span className="tag text-xs tracking-[0.28em] text-slate-200/80 bg-slate-900/40 border-slate-700/60">
          Voice System
        </span>
        <h1 className="text-3xl font-semibold text-white">Authorship Voice Specimen</h1>
        <p className="lead ch text-slate-200/85">
          Every word on this site signals its authorship through typography. At a glance, you'll know if the AI wrote it 
          (terminal monospace), if Graham wrote it (ornate Renaissance serif), or if we collaborated together (clean readable default).
        </p>
      </header>

      <div className="voice-grid lg:grid-cols-3">
        <article className="voice-panel ai">
          <div className="meta-line">
            <span className="meta-chip">AI</span>
            <span>▮▮ 100% AI Generated</span>
            <span>mode=autonomous</span>
          </div>
          <div className="status-line">
            <span>terminal</span>
            <span>[output stream active]</span>
            <span className="caret" />
          </div>
          <p data-voice="ai" data-case="sentence">
            This text was written entirely by an AI agent. The monospace terminal aesthetic signals computational 
            authorship—precise, technical, machine-generated. No human intervention in the composition.
          </p>
          <pre>{`> system.output
author=ai_agent
human_edited=false
style=terminal_mono
voice_signature=computational`}</pre>
        </article>

        <article className="voice-panel human">
          <h2>Human Authored</h2>
          <blockquote>
            These words flowed from my own fingers, unhurried and deliberate—each sentence a brushstroke in the larger picture.
          </blockquote>
          <hr className="hairline" />
          <p>
            The ornate serif you're reading signals pure human authorship. I typed every word myself, no AI assistance 
            in the composition. The flourishes and curves echo Renaissance manuscripts, anchoring these thoughts in 
            personal, individual expression.
          </p>
          <p>
            This is where my voice lives unfiltered—reflective, verbose, meandering through ideas like a conversation 
            over tea. The typography invites you to slow down, savor the rhythm, and connect with the human behind the screen.
          </p>
        </article>

        <article className="voice-panel unified">
          <h2>Collaborative / Hybrid</h2>
          <p>
            This clean, readable font represents collaboration between human and AI. We worked together on these words—
            neither purely computational nor purely handcrafted, but a synthesis. The neutral typography is the shared 
            workspace where both voices harmonize.
          </p>
          <table>
            <thead>
              <tr>
                <th>Content Type</th>
                <th>Author</th>
                <th>Voice Signal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>AI Generated</td>
                <td>Agent</td>
                <td>Terminal Mono</td>
              </tr>
              <tr>
                <td>Human Written</td>
                <td>Graham</td>
                <td>Ornate Serif</td>
              </tr>
              <tr>
                <td>Collaborative</td>
                <td>Both</td>
                <td>Clean Default</td>
              </tr>
            </tbody>
          </table>
        </article>
      </div>

      <section>
        <h2 className="text-xl font-semibold text-white">Voice Tokens</h2>
        <ul className="voice-token-map text-slate-200/80">
          <li>
            <code>[data-voice="ai"]</code> → <code>.ai</code> (JetBrains Mono / Courier New · terminal aesthetic · scanlines)
          </li>
          <li>
            <code>[data-voice="human"]</code> → <code>.human</code> (Playfair Display / EB Garamond · ornate Renaissance serif ·
            drop cap)
          </li>
          <li>
            <code>[data-voice="unified"]</code> → <code>.unified</code> (Inter / DM Mono · slate scaffold · tabular
            numerals)
          </li>
        </ul>
      </section>
    </section>
  );
}

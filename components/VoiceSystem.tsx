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
          Extreme contrast between authorship modes so readers can instantly identify when the AI agent, Graham, or the
          unified partnership is speaking. These panels demonstrate layout, tone, and supporting utilities.
        </p>
      </header>

      <div className="voice-grid lg:grid-cols-3">
        <article className="voice-panel ai">
          <div className="meta-line">
            <span className="meta-chip">agent</span>
            <span>▮▮ a2a://gp.agent/core</span>
            <span>temp=0.2</span>
          </div>
          <div className="status-line">
            <span>status</span>
            <span>[sync window: 02:15:00]</span>
            <span className="caret" />
          </div>
          <p data-voice="ai" data-case="sentence">
            Operational parameters locked. Awaiting human brief escalation. All outbound responses run through policy
            gateway with active neon signature.
          </p>
          <pre>{`/brief/compose
role=research-liaison
tone=succinct
constraints=[no-speculation, cite-primary, surface-alerts]
deadline=2024-09-09T17:00Z`}</pre>
        </article>

        <article className="voice-panel human">
          <h2>Pull Quote</h2>
          <blockquote>
            When the rhythm of the machine softens, I can hear my own pulse again—and the work becomes a duet.
          </blockquote>
          <hr className="hairline" />
          <p>
            The studio light is warm, the kettle’s on, and every research thread is sprawled across the desk in a quiet
            constellation of index cards. This is where the essays begin—carefully, slowly, like tracing a melody in the
            dark.
          </p>
          <p>
            I invite the agent to listen before it speaks. Together we chart what to surface, what to hold back, and
            where the reader needs a moment of stillness. The page should feel like conversation, not output.
          </p>
        </article>

        <article className="voice-panel unified">
          <h2>Unified Log</h2>
          <p>
            Shared artifacts live in the neutral scaffold. Numbers align, states persist, and collaborators can scan the
            plan without deciphering tone.
          </p>
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Workshop Outline</td>
                <td>Graham</td>
                <td>09·10</td>
                <td>In review</td>
              </tr>
              <tr>
                <td>Agent Brief</td>
                <td>Copilot</td>
                <td>09·08</td>
                <td>Queued</td>
              </tr>
              <tr>
                <td>Site Metrics</td>
                <td>Unified</td>
                <td>09·12</td>
                <td>On track</td>
              </tr>
            </tbody>
          </table>
        </article>
      </div>

      <section>
        <h2 className="text-xl font-semibold text-white">Voice Tokens</h2>
        <ul className="voice-token-map text-slate-200/80">
          <li>
            <code>[data-voice="ai"]</code> → <code>.ai</code> (Oxanium / JetBrains Mono · neon grid · scanlines)
          </li>
          <li>
            <code>[data-voice="human"]</code> → <code>.human</code> (Cormorant Garamond / Crimson Pro · ivory paper ·
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

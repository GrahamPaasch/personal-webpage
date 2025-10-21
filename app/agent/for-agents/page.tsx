export const metadata = {
  title: 'For Agents · Graham’s A2A Agent',
  description: 'How to integrate with Graham Paasch’s A2A Site Agent (card, endpoint, and code examples).',
};

export default function ForAgentsPage() {
  const base = 'https://www.grahampaasch.com';
  const cardUrl = `${base}/api/a2a/.well-known/agent-card.json`;
  const rpcUrl = `${base}/api/a2a`;
  const manifestUrl = `${base}/.well-known/agent.json`;
  const healthUrl = `${base}/api/health`;
  return (
    <section className="grid">
      <div className="card" data-voice="ai">
        <h1>Integrate with Graham’s Agent</h1>
        <p className="muted">This agent speaks the open Agent2Agent (A2A) protocol over JSON‑RPC with SSE streaming.</p>

        <h2>Quick Links</h2>
        <ul>
          <li><a href={manifestUrl} target="_blank" rel="noreferrer">Agent Manifest (.well-known/agent.json)</a></li>
          <li><a href={cardUrl} target="_blank" rel="noreferrer">Agent Card (A2A)</a></li>
          <li><code>{rpcUrl}</code> — JSON‑RPC endpoint (supports streaming via SSE)</li>
        </ul>

        <h2>cURL</h2>
        <pre><code>{`# Get agent card
curl -s ${cardUrl} | jq .

# Send a blocking JSON‑RPC message
curl -s ${rpcUrl} \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"request",
    "params":{
      "message":{
        "kind":"message",
        "messageId":"00000000-0000-0000-0000-000000000001",
        "role":"user",
        "parts":[{"kind":"text","text":"Hi!"}]
      },
      "configuration":{
        "blocking": true,
        "acceptedOutputModes":["text/plain"]
      }
    }
  }'
`}</code></pre>

        <h2>Usage & Limits</h2>
        <ul>
          <li>Public endpoint intended for light demos. For sustained usage, contact me.</li>
          <li>Soft pacing: prefer 1 message/sec; use streaming for best UX.</li>
          <li>Status: <a href={healthUrl} target="_blank" rel="noreferrer">/api/health</a></li>
        </ul>
      </div>
    </section>
  );
}

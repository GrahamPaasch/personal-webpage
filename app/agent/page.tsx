import Image from 'next/image';
import A2AChat from '@/app/components/A2AChat';

export const metadata = {
  title: 'Chat with Graham\'s Agent',
  description: 'A2A-enabled chat agent embedded on the site.',
};

export default function AgentPage() {
  return (
    <section className="grid">
      <div className="card" data-voice="ai">
        <div className="agent-header">
          <div className="agent-title">
            <h1>Chat with Graham’s Agent</h1>
            <p className="muted">This agent uses the open Agent2Agent (A2A) protocol.</p>
            <p style={{ marginTop: '6px' }}>
              <a href="/agent/for-agents" className="muted" style={{ textDecoration: 'underline' }}>
                For agents: integration guide →
              </a>
            </p>
          </div>
          <div className="agent-avatar">
            <Image src="/images/agent-avatar.svg" alt="Graham’s Agent avatar" width={120} height={120} priority />
          </div>
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: "Graham Paasch’s A2A Site Agent",
              applicationCategory: 'AIApplication',
              operatingSystem: 'Web',
              url: 'https://www.grahampaasch.com/agent',
              image: 'https://www.grahampaasch.com/images/agent-avatar.svg',
              offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
              isAccessibleForFree: true,
              author: { '@type': 'Person', name: 'Graham Paasch', url: 'https://www.grahampaasch.com' },
              softwareVersion: '0.1.0',
              potentialAction: {
                '@type': 'InteractAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://www.grahampaasch.com/api/a2a',
                  httpMethod: 'POST',
                  encodingType: 'application/json'
                },
                instrument: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://www.grahampaasch.com/api/a2a/.well-known/agent-card.json',
                  description: 'A2A Agent Card'
                }
              }
            })
          }}
        />
        <A2AChat />
      </div>
    </section>
  );
}

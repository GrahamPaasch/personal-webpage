import A2AChat from '@/app/components/A2AChat';

export const metadata = {
  title: 'Chat with Graham\'s Agent',
  description: 'A2A-enabled chat agent embedded on the site.',
};

export default function AgentPage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>Chat with Graham’s Agent</h1>
        <p className="muted">This agent uses the open Agent2Agent (A2A) protocol.</p>
        <A2AChat />
      </div>
    </section>
  );
}


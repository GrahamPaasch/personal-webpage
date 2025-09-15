import './globals.css';
import Link from 'next/link';
import FullScreenChat from '@/app/components/FullScreenChat';

export const metadata = {
  metadataBase: new URL('https://www.grahampaasch.com'),
  title: {
    default: 'Graham Paasch — Vigil Pathfinder',
    template: '%s | Graham Paasch',
  },
  description: 'Hobbies, writings (as Vigil Pathfinder), and professional work by Graham Paasch.',
  openGraph: {
    title: 'Graham Paasch — Vigil Pathfinder',
    description: 'Hobbies, writings, and professional life.',
    url: 'https://www.grahampaasch.com',
    siteName: 'Graham Paasch',
    locale: 'en_US',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: any) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">Graham Paasch</Link>
            <Link href="/version" className="version-chip">v{process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}</Link>
            <nav className="nav">
              <Link href="/hobbies">Hobbies</Link>
              <Link href="/writings">Writings</Link>
              <Link href="/professional">Professional</Link>
              <Link href="/career-vision">Career Vision</Link>
              <Link href="/agent">Chat</Link>
            </nav>
          </div>
        </header>
        <main className="container content">{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>© {new Date().getFullYear()} Graham Paasch</span>
            <span>Pen name: Vigil Pathfinder</span>
            <nav className="nav" style={{ display: 'flex', gap: 12 }}>
              <a href="/agent/for-agents">For Agents</a>
              <a href="/.well-known/agent.json" target="_blank" rel="noreferrer">Agent Manifest</a>
              <a href="/api/a2a/.well-known/agent-card.json" target="_blank" rel="noreferrer">Agent Card</a>
            </nav>
            <span className="muted">v{process.env.NEXT_PUBLIC_APP_VERSION} · {process.env.NEXT_PUBLIC_BUILD_TIME?.slice(0, 19).replace('T', ' ')}Z</span>
          </div>
        </footer>
        <FullScreenChat />
      </body>
    </html>
  );
}

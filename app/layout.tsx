import './globals.css';
import Link from 'next/link';

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
            <nav className="nav">
              <Link href="/hobbies">Hobbies</Link>
              <Link href="/writings">Writings</Link>
              <Link href="/professional">Professional</Link>
              <Link href="/agent">Chat</Link>
            </nav>
          </div>
        </header>
        <main className="container content">{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>© {new Date().getFullYear()} Graham Paasch</span>
            <span>Pen name: Vigil Pathfinder</span>
          </div>
        </footer>
        <a href="/agent" className="chat-fab" aria-label="Chat">
          💬
        </a>
        <style jsx global>{`
          .chat-fab { position: fixed; right: 20px; bottom: 20px; width: 48px; height: 48px; border-radius: 50%; background: #0a5025; color: #dcfce7; display: flex; align-items: center; justify-content: center; text-decoration: none; border: 1px solid #14532d; box-shadow: 0 4px 20px rgba(0,0,0,0.25); font-size: 20px; }
          .chat-fab:hover { background: #0b6a31; }
        `}</style>
      </body>
    </html>
  );
}

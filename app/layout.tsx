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
        <FullScreenChat />
      </body>
    </html>
  );
}

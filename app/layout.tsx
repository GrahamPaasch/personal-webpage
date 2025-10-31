import './globals.css';
import Link from 'next/link';
import {
  Fraunces,
  IBM_Plex_Mono,
  Inter,
  Space_Grotesk,
  Source_Serif_4,
} from 'next/font/google';
import FullScreenChat from '@/app/components/FullScreenChat';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-unified',
  weight: ['400', '500', '600', '700'],
});

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-human',
  weight: ['400', '500', '700'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-ai',
  weight: ['400', '500', '600'],
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-human-text',
  weight: ['400', '500', '600', '700'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-ai-mono',
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  metadataBase: new URL('https://www.grahampaasch.com'),
  title: {
    default: 'Graham Paasch',
    template: '%s | Graham Paasch',
  },
  description: 'Hobbies, writings, and professional work by Graham Paasch.',
  openGraph: {
    title: 'Graham Paasch',
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
      <body
        className={`${inter.variable} ${fraunces.variable} ${spaceGrotesk.variable} ${sourceSerif.variable} ${plexMono.variable}`}
      >
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">Graham Paasch</Link>
            <Link href="/version" className="version-chip">v{process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}</Link>
            <nav className="nav">
              <Link href="/hobbies">Hobbies</Link>
              <Link href="/writings">Writings</Link>
              <Link href="/professional">Professional</Link>
              <Link href="/links">Links</Link>
              <Link href="/resume-tool">Resume Tool</Link>
              <Link href="/career-vision">Career Vision</Link>
              <Link href="/graffiti">Graffiti</Link>
              <Link href="/prompt-pack">Prompt Studio</Link>
              <Link href="/agent">Chat</Link>
            </nav>
          </div>
        </header>
        <main className="container content">{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>© {new Date().getFullYear()} Graham Paasch</span>
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

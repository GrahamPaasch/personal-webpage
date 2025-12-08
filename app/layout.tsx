import './globals.css';
import Link from 'next/link';
import {
  DM_Mono,
  EB_Garamond,
  Inter,
  JetBrains_Mono,
  Playfair_Display,
} from 'next/font/google';
import FullScreenChat from '@/app/components/FullScreenChat';
import MobileNav from '@/app/components/MobileNav';
import EasterEgg from '@/app/components/EasterEgg';
import BackToTop from '@/app/components/BackToTop';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-unified',
  weight: ['400', '500', '600', '700'],
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-human',
  weight: ['400', '700'],
});

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-human-text',
  weight: ['400', '600'],
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-ai-mono',
  weight: ['400', '500', '600'],
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-voice-dm',
  weight: ['400'],
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
        className={`${inter.variable} ${playfairDisplay.variable} ${ebGaramond.variable} ${jetBrainsMono.variable} ${dmMono.variable}`}
      >
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">Graham Paasch</Link>
            <Link href="/version" className="version-chip">v{process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}</Link>
            <MobileNav />
          </div>
        </header>
        <main id="main-content" className="container content">{children}</main>
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
        <EasterEgg />
        <BackToTop />
      </body>
    </html>
  );
}

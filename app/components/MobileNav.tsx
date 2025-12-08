'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/hobbies', label: 'Hobbies' },
  { href: '/writings', label: 'Writings' },
  { href: '/professional', label: 'Professional' },
  { href: '/resume-tool', label: 'Resume Tool' },
  { href: '/career-vision', label: 'Career Vision' },
  { href: '/graffiti', label: 'Graffiti' },
  { href: '/prompt-pack', label: 'Prompt Studio' },
  { href: '/agent', label: 'Chat' },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
    // Scroll to top when navigating - helps user see the content changed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <>
      {/* Desktop Navigation - hidden on mobile */}
      <nav className="nav nav-desktop">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? 'active' : ''}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile Navigation */}
      <div className="mobile-nav-container">
        <button
          className="hamburger-button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          <span className={`hamburger-icon ${isOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span className="hamburger-label">Menu</span>
        </button>

        {/* Backdrop */}
        <div
          className={`mobile-nav-backdrop ${isOpen ? 'visible' : ''}`}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />

        {/* Mobile Menu Drawer */}
        <nav
          className={`mobile-nav-drawer ${isOpen ? 'open' : ''}`}
          aria-label="Mobile navigation"
        >
          <div className="mobile-nav-header">
            <span className="mobile-nav-title">Navigation</span>
            <button
              className="mobile-nav-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close navigation menu"
            >
              ✕
            </button>
          </div>
          <div className="mobile-nav-links">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`mobile-nav-link ${pathname === link.href ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
                {pathname === link.href && (
                  <span className="mobile-nav-active-indicator">●</span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
}

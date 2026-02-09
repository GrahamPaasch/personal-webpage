'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/hobbies', label: 'Hobbies' },
  { href: '/writings', label: 'Writings' },
  { href: '/professional', label: 'Professional' },
  { href: '/tools', label: 'Toolbox' },
  { href: '/resume-tool', label: 'Resume Tool' },
  { href: '/career-vision', label: 'Career Vision' },
  { href: '/graffiti', label: 'Graffiti' },
  { href: '/prompt-pack', label: 'Prompt Studio' },
  { href: '/agent', label: 'Chat' },
];

export default function MobileNav() {
  const pathname = usePathname();
  // Store the pathname the menu was opened on, so it auto-closes on navigation
  // without needing an effect that calls setState.
  const [openForPathname, setOpenForPathname] = useState<string | null>(null);
  const isOpen = openForPathname === pathname;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // Prevent body scroll when menu is open.
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

  // Focus management + focus trap when open.
  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
    } else if (wasOpenRef.current) {
      (lastActiveRef.current || triggerRef.current)?.focus?.();
    }
    wasOpenRef.current = isOpen;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpenForPathname(null);
        return;
      }

      if (e.key !== 'Tab') return;

      const root = drawerRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0);

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const openMenu = () => {
    lastActiveRef.current = document.activeElement as HTMLElement | null;
    setOpenForPathname(pathname);
  };

  const closeMenu = () => {
    setOpenForPathname(null);
  };

  return (
    <>
      {/* Desktop Navigation - hidden on mobile */}
      <nav className="nav nav-desktop">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`))
                ? 'active'
                : ''
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile Navigation */}
      <div className="mobile-nav-container">
        <button
          ref={triggerRef}
          className="hamburger-button"
          onClick={() => (isOpen ? closeMenu() : openMenu())}
          aria-expanded={isOpen}
          aria-controls="mobile-nav-drawer"
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          <span className={`hamburger-icon ${isOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span className="hamburger-label">Menu</span>
        </button>

        {isOpen ? (
          <>
            {/* Backdrop */}
            <div
              className="mobile-nav-backdrop visible"
              onClick={closeMenu}
              aria-hidden="true"
            />

            {/* Mobile Menu Drawer */}
            <nav
              id="mobile-nav-drawer"
              ref={drawerRef}
              className="mobile-nav-drawer open"
              aria-label="Mobile navigation"
            >
              <div className="mobile-nav-header">
                <span className="mobile-nav-title">Navigation</span>
                <button
                  ref={closeRef}
                  className="mobile-nav-close"
                  onClick={closeMenu}
                  aria-label="Close navigation menu"
                >
                  &times;
                </button>
              </div>
              <div className="mobile-nav-links">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`mobile-nav-link ${
                      pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`))
                        ? 'active'
                        : ''
                    }`}
                    onClick={closeMenu}
                  >
                    {link.label}
                    {pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`)) ? (
                      <span className="mobile-nav-active-indicator" aria-hidden="true">
                        &bull;
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </nav>
          </>
        ) : null}
      </div>
    </>
  );
}

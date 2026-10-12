import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import icon from '../assets/infovantage-icon.png';

const NAV = [
  { to: '/software', label: 'ITSM Software' },
  { to: '/software#pricing', label: 'Pricing' },
  { to: '/support', label: 'Support' },
  { to: '/login', label: 'Sign in' },
];

export default function MarketingLayout({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu on navigation, and make in-page links like /software#pricing actually scroll.
  useEffect(() => {
    setOpen(false);
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const current = (to) => {
    const [path, hash] = to.split('#');
    return location.pathname === path && (hash ? location.hash === `#${hash}` : !location.hash) ? 'page' : undefined;
  };

  return (
    <div className="min-h-screen bg-white text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={icon} alt="" className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-tight">Infovantage <span className="font-medium text-ink/50">ITSM</span></span>
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <Link key={n.label} to={n.to} aria-current={current(n.to)} className="text-sm font-medium text-ink/70 hover:text-ink aria-[current=page]:text-ink">
                {n.label}
              </Link>
            ))}
            <Link to="/start" className="rounded-md bg-patina-500 px-4 py-2 text-sm font-semibold text-white hover:bg-patina-600">
              Request a demo
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="rounded-md p-2 text-ink/70 hover:bg-stone-100 md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? (<><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></>) : (<><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>)}
            </svg>
          </button>
        </div>

        {open && (
          <nav id="mobile-menu" aria-label="Mobile" className="border-t border-stone-200 px-5 py-4 md:hidden">
            <ul className="flex flex-col gap-1">
              {NAV.map((n) => (
                <li key={n.label}>
                  <Link to={n.to} aria-current={current(n.to)} className="block rounded-md px-2 py-2.5 text-sm font-medium text-ink/80 hover:bg-stone-50">
                    {n.label}
                  </Link>
                </li>
              ))}
              <li className="pt-2">
                <Link to="/start" className="block rounded-md bg-patina-500 px-4 py-2.5 text-center text-sm font-semibold text-white">Request a demo</Link>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1}>{children}</main>

      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="mb-8 flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div className="max-w-xs">
              <div className="mb-2 flex items-center gap-2">
                <img src={icon} alt="" className="h-5 w-5" />
                <span className="font-display text-sm font-bold">Infovantage ITSM</span>
              </div>
              <p className="text-xs text-ink/60">Simple, affordable IT incident and ticket management for small businesses and IT support teams.</p>
            </div>
            <div className="flex gap-12 text-sm">
              <nav aria-label="Product">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Product</div>
                <ul className="flex flex-col gap-2 text-ink/70">
                  <li><Link to="/software" className="hover:text-ink">ITSM Software</Link></li>
                  <li><Link to="/software#pricing" className="hover:text-ink">Pricing</Link></li>
                  <li><Link to="/start" className="hover:text-ink">Request a demo</Link></li>
                  <li><Link to="/login" className="hover:text-ink">Sign in</Link></li>
                </ul>
              </nav>
              <nav aria-label="Company and legal">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Company</div>
                <ul className="flex flex-col gap-2 text-ink/70">
                  <li><Link to="/support" className="hover:text-ink">Support</Link></li>
                  <li><Link to="/privacy" className="hover:text-ink">Privacy notice</Link></li>
                  <li><Link to="/terms" className="hover:text-ink">Terms of service</Link></li>
                  <li><a href="/api/docs" className="hover:text-ink">API docs</a></li>
                </ul>
              </nav>
            </div>
          </div>
          <div className="border-t border-stone-200 pt-6 text-xs text-ink/50">
            © {new Date().getFullYear()} Infovantage Consulting. Prices are proposed launch prices in South African rand and may change before the paid plans open.
          </div>
        </div>
      </footer>
    </div>
  );
}

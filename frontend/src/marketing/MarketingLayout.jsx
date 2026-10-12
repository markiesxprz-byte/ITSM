import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import icon from '../assets/infovantage-icon.png';

export default function MarketingLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={icon} alt="Infovantage" className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-tight">Infovantage</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <Link to="/#modules" className="text-sm font-medium text-ink/70 hover:text-ink">Product</Link>
            <Link to="/pricing" className="text-sm font-medium text-ink/70 hover:text-ink">Pricing</Link>
            <Link to="/login" className="text-sm font-medium text-ink/70 hover:text-ink">Sign in</Link>
            <Link
              to="/start"
              className="rounded-md bg-patina-500 px-4 py-2 text-sm font-semibold text-white hover:bg-patina-600"
            >
              Start free trial
            </Link>
          </nav>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open menu"
            className="rounded-md p-2 text-ink/70 hover:bg-stone-100 md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-stone-200 px-5 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <Link to="/#modules" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-ink/70">Product</Link>
              <Link to="/pricing" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-ink/70">Pricing</Link>
              <Link to="/login" onClick={() => setMenuOpen(false)} className="text-sm font-medium text-ink/70">Sign in</Link>
              <button
                onClick={() => { setMenuOpen(false); navigate('/start'); }}
                className="w-fit rounded-md bg-patina-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Start free trial
              </button>
            </div>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="mb-8 flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div className="max-w-xs">
              <div className="mb-2 flex items-center gap-2">
                <img src={icon} alt="Infovantage" className="h-5 w-5" />
                <span className="font-display text-sm font-bold">Infovantage</span>
              </div>
              <p className="text-xs text-ink/50">
                ITSM built for teams who don't have a dedicated ITIL administrator — incidents, requests, problems, changes, CMDB, and a knowledge base in one tool.
              </p>
            </div>
            <div className="flex gap-12">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Product</div>
                <div className="flex flex-col gap-2 text-sm text-ink/60">
                  <Link to="/#modules" className="hover:text-ink">Modules</Link>
                  <Link to="/pricing" className="hover:text-ink">Pricing</Link>
                  <Link to="/start" className="hover:text-ink">Start a trial</Link>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Account</div>
                <div className="flex flex-col gap-2 text-sm text-ink/60">
                  <Link to="/login" className="hover:text-ink">Sign in</Link>
                  <a href="/api/docs" target="_blank" rel="noreferrer" className="hover:text-ink">API docs</a>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-stone-200 pt-6 text-xs text-ink/40">
            © {new Date().getFullYear()} Infovantage Consulting. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

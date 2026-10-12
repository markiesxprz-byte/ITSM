import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import icon from '../assets/infovantage-icon.png';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '◆', roles: ['admin', 'agent', 'requester'] },
  { to: '/incidents', label: 'Incidents', icon: '▲', roles: ['admin', 'agent', 'requester'] },
  { to: '/service-requests', label: 'Service Requests', icon: '◇', roles: ['admin', 'agent', 'requester'] },
  { to: '/problems', label: 'Problems', icon: '●', roles: ['admin', 'agent'] },
  { to: '/changes', label: 'Changes', icon: '▣', roles: ['admin', 'agent', 'requester'] },
  { to: '/cmdb', label: 'CMDB', icon: '▦', roles: ['admin', 'agent'] },
  { to: '/knowledge', label: 'Knowledge Base', icon: '▤', roles: ['admin', 'agent', 'requester'] },
  { to: '/admin', label: 'Administration', icon: '⚙', roles: ['admin'] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user?.role));
  const currentItem = items.find((item) => (location.pathname.startsWith(item.to)));

  // Close the mobile drawer automatically whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebarContent = (
    <>
      <div className="px-5 pb-5 pt-6">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-md bg-white p-1.5">
              <img src={icon} alt="Infovantage" className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-lg font-bold leading-tight tracking-tight">Infovantage</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-50/50">ITSM</div>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="mt-0.5 rounded-md p-1.5 text-stone-50/60 hover:bg-white/10 hover:text-stone-50"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors md:py-2 ${
                isActive
                  ? 'bg-patina-500 text-white font-medium'
                  : 'text-stone-50/70 hover:bg-white/5 hover:text-stone-50'
              }`
            }
          >
            <span className="w-4 text-center text-xs">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-5 py-4">
        <div className="text-sm font-medium">{user?.name}</div>
        <div className="text-xs capitalize text-stone-50/50">{user?.role}</div>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="mt-3 text-xs text-stone-50/60 hover:text-stone-50 hover:underline"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-stone-50 dark:bg-slate-900">
      {/* Desktop sidebar — always visible at md and up */}
      <aside className="hidden w-60 flex-shrink-0 flex-col bg-slate-850 text-stone-50 md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile drawer — off-canvas, toggled by the hamburger in the mobile top bar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-slate-850 text-stone-50 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — hidden at md and up, where the sidebar is always visible instead */}
        <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-850 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-ink/70 hover:bg-stone-100 dark:text-stone-50/70 dark:hover:bg-white/10"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <img src={icon} alt="Infovantage" className="h-5 w-5" />
          <div className="font-display text-sm font-semibold text-ink dark:text-stone-50">
            {currentItem?.label || 'Infovantage ITSM'}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

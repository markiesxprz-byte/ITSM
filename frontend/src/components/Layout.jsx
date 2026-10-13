import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import icon from '../assets/infovantage-icon.png';
import client from '../api/client';
import Modal from './Modal';
import { Button, Field, Input } from './ui';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '◆', roles: ['admin', 'agent', 'requester'] },
  { to: '/incidents', label: 'Incidents', icon: '▲', roles: ['admin', 'agent', 'requester'] },
  { to: '/service-requests', label: 'Service Requests', icon: '◇', roles: ['admin', 'agent', 'requester'] },
  { to: '/problems', label: 'Problems', icon: '●', roles: ['admin', 'agent'] },
  { to: '/changes', label: 'Changes', icon: '▣', roles: ['admin', 'agent'] },
  { to: '/cmdb', label: 'CMDB', icon: '▦', roles: ['admin', 'agent'] },
  { to: '/knowledge', label: 'Knowledge Base', icon: '▤', roles: ['admin', 'agent', 'requester'] },
  { to: '/reports', label: 'Reports', icon: '◩', roles: ['admin', 'agent'] },
  { to: '/admin', label: 'Administration', icon: '⚙', roles: ['admin'] },
];

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/auth/change-password', form);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change the password.');
    }
  }
  return (
    <Modal open onClose={onClose} title="Change your password">
      {done ? (
        <div>
          <p className="mb-4 text-sm text-ink/70">Your password was changed.</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <Field label="Current password">
            <Input type="password" required value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" required minLength={8} value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} autoComplete="new-password" />
          </Field>
          {error && <div className="mb-3 rounded-md bg-brick-50 px-3 py-2 text-sm text-brick-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit">Change password</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// Shown to everyone signed in when the workspace is read-only because the subscription has lapsed.
function AccessBanner() {
  const [a, setA] = useState(null);
  useEffect(() => { client.get('/billing/access').then((res) => setA(res.data)).catch(() => {}); }, []);
  if (!a || !a.enforce || a.writable) return null;
  return (
    <div role="alert" className="mb-5 rounded-md bg-brick-50 px-4 py-3 text-sm text-brick-600">
      <strong>This workspace is read-only.</strong> Its subscription is no longer in good standing. You can still read and export tickets, but cannot change them. Ask an administrator to open Administration → Billing.
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

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
        <button onClick={() => setPwOpen(true)} className="mt-3 block text-xs text-stone-50/60 hover:text-stone-50 hover:underline">
          Change password
        </button>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="mt-2 block text-xs text-stone-50/60 hover:text-stone-50 hover:underline"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-stone-50 dark:bg-slate-900">
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
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
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8"><AccessBanner />{children}</div>
        </main>
      </div>
    </div>
  );
}

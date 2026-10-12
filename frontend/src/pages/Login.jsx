import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { Button, Field, Input } from '../components/ui';
import logo from '../assets/infovantage-logo.png';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Whether this workspace lets people create their own accounts (the server enforces it either way).
  const [reg, setReg] = useState(null);
  useEffect(() => {
    client.get('/auth/registration')
      .then((res) => { setReg(res.data); if (res.data.first_run) setMode('register'); })
      .catch(() => setReg({ open: true }));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-850 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img src={logo} alt="Infovantage Consulting" className="mx-auto mb-1 h-24 w-auto" />
          <div className="text-sm text-ink/50">IT Service Management</div>
        </div>

        {reg && !reg.open && (
          <div className="mb-6 rounded-md bg-stone-50 px-3 py-2 text-sm text-ink/60">
            Accounts on this workspace are created by your administrator.
          </div>
        )}
        {reg && reg.open && (
        <div className="mb-6 flex rounded-md bg-stone-100 p-1 text-sm">
          <button
            className={`flex-1 rounded py-1.5 font-medium ${mode === 'login' ? 'bg-white shadow-sm' : 'text-ink/50'}`}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            className={`flex-1 rounded py-1.5 font-medium ${mode === 'register' ? 'bg-white shadow-sm' : 'text-ink/50'}`}
            onClick={() => setMode('register')}
          >
            Create account
          </button>
        </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <Field label="Full name">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jordan Lee"
              />
            </Field>
          )}
          <Field label="Email">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'At least 8 characters' : undefined}>
            <Input
              type="password"
              required
              minLength={mode === 'register' ? 8 : undefined}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </Field>
          {mode === 'register' && (
            <Field label="Department" hint="Optional">
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Sales, Engineering, HR…"
              />
            </Field>
          )}

          {error && <div className="mb-4 rounded-md bg-brick-50 px-3 py-2 text-sm text-brick-600">{error}</div>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {mode === 'register' && (
          <div className="mt-6 rounded-md bg-stone-50 px-3 py-2 text-xs text-ink/50">
            {reg && reg.first_run
              ? 'This workspace has no accounts yet. The account you create now becomes its administrator.'
              : reg && reg.domain ? `Use your @${reg.domain} email address.` : 'Your administrator may need to approve what you can access.'}
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-patina-500 text-white hover:bg-patina-600',
    secondary: 'bg-white border border-stone-200 text-ink hover:bg-stone-100 dark:bg-slate-850 dark:border-white/10 dark:text-stone-50 dark:hover:bg-white/5',
    danger: 'bg-brick-500 text-white hover:bg-brick-600',
    ghost: 'text-ink/70 hover:bg-stone-100 dark:text-stone-50/70 dark:hover:bg-white/5',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-medium text-ink dark:text-stone-50">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/50 dark:text-stone-50/50">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-patina-500 dark:bg-slate-850 dark:border-white/10 dark:text-stone-50 dark:placeholder:text-stone-50/30';

export function Input({ className = '', ...props }) {
  return <input className={`${inputBase} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${inputBase} min-h-[100px] resize-y ${className}`} {...props} />;
}

export function Select({ children, className = '', ...props }) {
  return (
    <select className={`${inputBase} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 py-16 text-center dark:border-white/10">
      <div className="font-display text-base font-semibold text-ink dark:text-stone-50">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-sm text-ink/50 dark:text-stone-50/50">{hint}</div>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`rounded-lg border border-stone-200 bg-white dark:border-white/10 dark:bg-slate-850 ${className}`}>{children}</div>;
}

import React from 'react';

export default function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-2 pt-6 sm:p-4 sm:pt-12">
      <div className={`w-full ${width} rounded-xl bg-white shadow-xl dark:bg-slate-850`}>
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-white/10 sm:px-6 sm:py-4">
          <h2 className="font-display text-base font-semibold text-ink dark:text-stone-50 sm:text-lg">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-ink/50 hover:bg-stone-100 hover:text-ink dark:text-stone-50/50 dark:hover:bg-white/10 dark:hover:text-stone-50"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

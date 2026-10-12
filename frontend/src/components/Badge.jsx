import React from 'react';

const STATUS_STYLES = {
  new: 'bg-stone-200 text-ink',
  in_progress: 'bg-patina-100 text-patina-700',
  on_hold: 'bg-amber-50 text-amber-600',
  pending_approval: 'bg-amber-50 text-amber-600',
  approved: 'bg-patina-100 text-patina-700',
  scheduled: 'bg-patina-100 text-patina-700',
  resolved: 'bg-patina-500 text-white',
  fulfilled: 'bg-patina-500 text-white',
  completed: 'bg-patina-500 text-white',
  closed: 'bg-stone-200 text-ink/60',
  rejected: 'bg-brick-50 text-brick-600',
  failed: 'bg-brick-50 text-brick-600',
  investigating: 'bg-amber-50 text-amber-600',
  root_cause_identified: 'bg-patina-100 text-patina-700',
  known_error: 'bg-brick-50 text-brick-600',
  draft: 'bg-stone-200 text-ink/60',
};

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || 'bg-stone-200 text-ink';
  const label = (status || '').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${style}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

const PRIORITY_STYLES = {
  P1: 'bg-brick-500 text-white',
  P2: 'bg-brick-50 text-brick-600',
  P3: 'bg-amber-50 text-amber-600',
  P4: 'bg-stone-200 text-ink/70',
};

const PRIORITY_LABELS = {
  P1: 'P1 · Critical',
  P2: 'P2 · High',
  P3: 'P3 · Medium',
  P4: 'P4 · Low',
};

export function PriorityBadge({ priority }) {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.P3;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${style}`}>
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}

export function TicketNumber({ children }) {
  return (
    <span className="ticket-plate inline-block rounded bg-slate-850 px-2 py-0.5 text-xs font-medium text-stone-50">
      {children}
    </span>
  );
}

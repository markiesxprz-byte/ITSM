import React from 'react';

// A large-scale abstraction of the Infovantage mark's own visual language (ascending
// bars + an upward arrow) used as the landing page's one signature moment. Respects
// prefers-reduced-motion by falling back to a static reveal.
export default function AscendingMotif({ className = '' }) {
  return (
    <svg
      viewBox="0 0 440 420"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="barGradA" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#154E96" />
          <stop offset="100%" stopColor="#2C82E6" />
        </linearGradient>
        <linearGradient id="barGradB" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#2C82E6" />
          <stop offset="100%" stopColor="#5AA0F0" />
        </linearGradient>
        <linearGradient id="arrowGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#5AA0F0" />
          <stop offset="100%" stopColor="#FFC200" />
        </linearGradient>
      </defs>

      <g className="motif-bar" style={{ transformOrigin: '60px 360px' }}>
        <rect x="30" y="260" width="60" height="100" rx="6" fill="url(#barGradA)" />
      </g>
      <g className="motif-bar motif-bar-2" style={{ transformOrigin: '160px 360px' }}>
        <rect x="130" y="190" width="60" height="170" rx="6" fill="url(#barGradA)" />
      </g>
      <g className="motif-bar motif-bar-3" style={{ transformOrigin: '260px 360px' }}>
        <rect x="230" y="120" width="60" height="240" rx="6" fill="url(#barGradB)" />
      </g>
      <g className="motif-bar motif-bar-4" style={{ transformOrigin: '360px 360px' }}>
        <rect x="330" y="60" width="60" height="300" rx="6" fill="url(#barGradB)" />
      </g>

      <g className="motif-arrow">
        <path
          d="M50 300 C 140 260, 220 180, 300 110 L 380 40"
          stroke="url(#arrowGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M340 32 L392 30 L400 82 Z" fill="#FFC200" />
      </g>

      <style>{`
        .motif-bar { animation: riseBar 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .motif-bar-2 { animation-delay: 0.08s; }
        .motif-bar-3 { animation-delay: 0.16s; }
        .motif-bar-4 { animation-delay: 0.24s; }
        .motif-arrow { animation: drawArrow 0.9s 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes riseBar {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 1; }
        }
        @keyframes drawArrow {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motif-bar, .motif-arrow { animation: none; }
        }
      `}</style>
    </svg>
  );
}

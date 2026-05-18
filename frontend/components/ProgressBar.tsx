'use client';

import React from 'react';

interface ProgressBarProps {
  score: number;
  label?: string;
  showLabel?: boolean;
}

export default function ProgressBar({ score, label, showLabel = true }: ProgressBarProps) {
  const clamped = Math.min(Math.max(score, 0), 150);
  const widthPercent = Math.min(clamped, 100);
  const color = clamped >= 80 ? 'bg-green-500' : clamped >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const bgColor = clamped >= 80 ? 'bg-green-100' : clamped >= 50 ? 'bg-amber-100' : 'bg-red-100';

  return (
    <div className="w-full">
      {label && <p className="text-xs text-slate-500 mb-1">{label}</p>}
      <div className="flex items-center gap-2">
        <div className={`flex-1 h-2 rounded-full ${bgColor}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${color}`}
            style={{ width: `${widthPercent}%` }}
          />
        </div>
        {showLabel && (
          <span className="text-xs font-semibold text-slate-600 min-w-[40px] text-right">
            {clamped.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

'use client';

import React from 'react';

// Interruptor tipo toggle (switch) reutilizable. Envuelve un checkbox real (peer)
// para conservar accesibilidad/teclado y estilar el riel + la perilla con Tailwind.
const TRACK_ON: Record<string, string> = {
  green: 'peer-checked:bg-green-500',
  amber: 'peer-checked:bg-amber-500',
  blue: 'peer-checked:bg-blue-500',
  cyan: 'peer-checked:bg-cyan-500',
  red: 'peer-checked:bg-red-500',
};

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  color?: keyof typeof TRACK_ON;
  disabled?: boolean;
  className?: string;
}

export default function Toggle({ checked, onChange, label, color = 'green', disabled = false, className = '' }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-2 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
      <span className="relative inline-block shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className={`block w-9 h-5 rounded-full bg-slate-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-white/30 ${TRACK_ON[color]}`} />
        <span className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      {label && <span className="text-sm text-slate-300">{label}</span>}
    </label>
  );
}

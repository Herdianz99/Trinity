'use client';

import { useEffect, useState } from 'react';

// Input de cantidad compartido (POS y portal de clientes). Permite borrar todo mientras se
// escribe (no reaparece el 0) y decimales (0.25). Acepta PUNTO y COMA: algunos teclados
// Android en español solo muestran la coma en el teclado numerico -> se convierte a punto.
// Mantiene el texto crudo mientras se edita y confirma al salir; si queda vacio, 0 o
// invalido, revierte al valor anterior.
export default function QtyInput({
  value,
  onCommit,
  className,
  disabled,
}: {
  value: number;
  onCommit: (qty: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  // Si el valor cambia desde afuera (botones +/-), refrescar el texto cuando no se esta editando.
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onFocus={(e) => {
        setEditing(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        // coma -> punto; solo digitos y un punto
        let v = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        setText(v);
      }}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(text);
        if (!isNaN(n) && n > 0) onCommit(n);
        else setText(String(value)); // revertir: nunca queda en vacio/0/negativo
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}

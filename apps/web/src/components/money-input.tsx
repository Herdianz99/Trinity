'use client';

import { useState, useEffect } from 'react';

interface Props {
  value: number;
  onValueChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Input numérico que permite escribir el punto (o coma) decimal sin que se borre.
 * Un `<input type="number">` controlado con estado numérico pierde el "1." mientras se
 * escribe (y en locale es-VE el separador esperado puede ser la coma), así que acá se
 * mantiene el TEXTO crudo mientras se edita y se devuelve el número parseado.
 */
export default function MoneyInput({ value, onValueChange, className, placeholder, disabled }: Props) {
  const [raw, setRaw] = useState<string>(value ? String(value) : '');

  // Sincroniza el texto cuando el valor externo cambia por código (ej. recálculo por tasa)
  // y no coincide con lo que hay escrito. No pisa la edición en curso si el número ya coincide.
  useEffect(() => {
    const parsed = parseFloat(raw.replace(',', '.'));
    if ((isNaN(parsed) ? 0 : parsed) !== value) {
      setRaw(value ? String(value) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.');
        // permitir vacío, un punto suelto, y dígitos con un solo punto decimal
        if (v !== '' && !/^\d*\.?\d*$/.test(v)) return;
        setRaw(v);
        const n = v === '' || v === '.' ? 0 : parseFloat(v);
        onValueChange(isNaN(n) ? 0 : n);
      }}
      onBlur={() => {
        // normaliza el display al número final ("1." -> "1"); si está vacío lo deja vacío
        if (raw === '' || raw === '.') { setRaw(''); return; }
        const n = parseFloat(raw.replace(',', '.'));
        if (!isNaN(n)) setRaw(String(n));
      }}
    />
  );
}

'use client';

import { useState, useEffect } from 'react';

interface Props {
  value: number;
  onValueChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  // Si true, muestra separador de miles en vivo (es-VE: "1.234,56"). El decimal se
  // escribe con coma y los miles se agrupan con punto. Por defecto false (compat).
  thousands?: boolean;
}

// Agrupa la parte entera con "." de miles: "1234567" -> "1.234.567".
const groupInt = (intPart: string) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Muestra el número crudo ("." decimal) en formato es-VE ("," decimal, "." miles).
function toDisplay(raw: string): string {
  if (raw === '') return '';
  const [i, d] = raw.split('.');
  const gi = groupInt(i || '');
  return d !== undefined ? `${gi},${d}` : gi;
}

/**
 * Input numérico que permite escribir el punto (o coma) decimal sin que se borre.
 * Un `<input type="number">` controlado con estado numérico pierde el "1." mientras se
 * escribe (y en locale es-VE el separador esperado puede ser la coma), así que acá se
 * mantiene el TEXTO crudo mientras se edita y se devuelve el número parseado.
 * Con `thousands` además muestra el separador de miles mientras se escribe.
 */
export default function MoneyInput({ value, onValueChange, className, placeholder, disabled, thousands }: Props) {
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
      value={thousands ? toDisplay(raw) : raw}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onChange={(e) => {
        // En modo miles quitamos los "." (miles) y pasamos la "," (decimal) a "."; en modo
        // normal solo convertimos la "," a "." (comportamiento original).
        const v = thousands
          ? e.target.value.replace(/\./g, '').replace(/,/g, '.')
          : e.target.value.replace(',', '.');
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

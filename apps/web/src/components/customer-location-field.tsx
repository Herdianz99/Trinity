'use client';

import { useState } from 'react';
import { MapPin, Crosshair, Loader2, ExternalLink, X } from 'lucide-react';

export interface CustomerLocation {
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  locationUpdatedAt?: string | null;
}

export function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// Precision a partir de la cual se avisa que la ubicacion puede estar corrida (GPS bajo techo, PC sin GPS).
const LOW_ACCURACY_M = 100;

function geoErrorText(err: GeolocationPositionError) {
  if (err.code === err.PERMISSION_DENIED) return 'El navegador no dio permiso de ubicacion. Activalo en la configuracion del sitio y vuelve a intentar.';
  if (err.code === err.TIMEOUT) return 'El GPS tardo demasiado. Intenta de nuevo, mejor al aire libre.';
  return 'No se pudo obtener la ubicacion de este dispositivo.';
}

// Ubicacion GPS del cliente para despachos: toma la posicion ACTUAL del telefono (hay que estar en el
// local del cliente). Se guarda junto con el resto del formulario.
export default function CustomerLocationField({ value, onChange, disabled }: {
  value: CustomerLocation;
  onChange: (v: CustomerLocation) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const has = value.latitude != null && value.longitude != null;

  function capture() {
    setError('');
    if (!('geolocation' in navigator)) { setError('Este navegador no permite tomar la ubicacion.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onChange({
          latitude: Math.round(pos.coords.latitude * 1e6) / 1e6,
          longitude: Math.round(pos.coords.longitude * 1e6) / 1e6,
          locationAccuracyM: Math.round(pos.coords.accuracy),
          locationUpdatedAt: null, // la fecha la pone el servidor al guardar
        });
      },
      (err) => { setBusy(false); setError(geoErrorText(err)); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  return (
    <div className="p-3 rounded-lg border border-slate-700/50 bg-slate-800/30 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-200 flex items-center gap-1.5"><MapPin size={15} className="text-emerald-400" /> Ubicacion para despachos</span>
        <button type="button" onClick={capture} disabled={disabled || busy} className="btn-secondary !py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
          {busy ? 'Buscando GPS…' : has ? 'Volver a tomar' : 'Tomar ubicacion actual'}
        </button>
      </div>
      {has ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-mono text-slate-300">{value.latitude}, {value.longitude}</span>
          {value.locationAccuracyM != null && (
            <span className={value.locationAccuracyM > LOW_ACCURACY_M ? 'text-amber-400' : 'text-slate-500'}>
              precision ±{value.locationAccuracyM} m{value.locationAccuracyM > LOW_ACCURACY_M && ' (baja: intenta al aire libre o desde el telefono)'}
            </span>
          )}
          <a href={mapsUrl(value.latitude!, value.longitude!)} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
            Ver en Google Maps <ExternalLink size={11} />
          </a>
          {!disabled && (
            <button type="button" onClick={() => onChange({ latitude: null, longitude: null, locationAccuracyM: null, locationUpdatedAt: null })} className="text-red-400 hover:text-red-300 inline-flex items-center gap-1">
              <X size={11} /> Quitar
            </button>
          )}
          {value.locationUpdatedAt && (
            <span className="text-slate-500 w-full">Tomada el {new Date(value.locationUpdatedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Sin ubicacion. Estando en el local del cliente, toca el boton para guardar la posicion del GPS (luego guarda el cliente).</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

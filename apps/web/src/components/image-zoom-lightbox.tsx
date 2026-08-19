'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// Visor de imagen a pantalla completa CON ZOOM real (rueda del mouse, botones +/-,
// arrastrar para moverse, doble clic para acercar y pellizco en táctil). Pensado para
// leer documentos escaneados (ej. factura física de compra).
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ImageZoomLightbox({
  url,
  alt = 'Imagen',
  onClose,
}: {
  url: string;
  alt?: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const reset = useCallback(() => { setZoom(1); setPos({ x: 0, y: 0 }); }, []);

  // Portal a document.body: evita que un padre con transform/filter/backdrop-blur
  // "atrape" el position:fixed y recorte el modal dentro de su rectángulo.
  useEffect(() => { setMounted(true); }, []);

  // Reset al cambiar de imagen y cerrar con ESC.
  useEffect(() => { reset(); }, [url, reset]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Zoom hacia el cursor: mantiene fijo el punto bajo el puntero.
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;
    setZoom((z) => {
      const nz = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
      const k = nz / z;
      if (nz === MIN_ZOOM) { setPos({ x: 0, y: 0 }); return nz; }
      setPos((p) => ({ x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }));
      return nz;
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, [zoomAt]);

  // Botones +/- hacen zoom hacia el centro.
  const stepZoom = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  // Arrastrar para moverse (solo con zoom).
  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setPos({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  };
  const endDrag = () => { drag.current = null; };

  // Táctil: 1 dedo = mover (con zoom); 2 dedos = pellizco.
  const touchDist = (t: React.TouchList) => {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinch.current = { dist: touchDist(e.touches), zoom };
      drag.current = null;
    } else if (e.touches.length === 1 && zoom > 1) {
      drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: pos.x, oy: pos.y };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const nz = clamp(pinch.current.zoom * (touchDist(e.touches) / pinch.current.dist), MIN_ZOOM, MAX_ZOOM);
      setZoom(nz);
      if (nz === MIN_ZOOM) setPos({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && drag.current) {
      e.preventDefault();
      setPos({ x: drag.current.ox + (e.touches[0].clientX - drag.current.x), y: drag.current.oy + (e.touches[0].clientY - drag.current.y) });
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current = null;
    if (e.touches.length === 0) drag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (zoom > 1) reset();
    else zoomAt(e.clientX, e.clientY, 2.5);
  };

  if (!mounted) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm overflow-hidden touch-none"
      onClick={(e) => { if (e.target === e.currentTarget && zoom <= 1) onClose(); }}
      onWheel={onWheel}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        draggable={false}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})` }}
        className={`max-w-full max-h-full object-contain select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
      />

      {/* Controles */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/60 border border-white/10 px-2 py-1.5 backdrop-blur">
        <button onClick={() => stepZoom(1 / 1.4)} disabled={zoom <= MIN_ZOOM} className="p-2 rounded-full text-white/90 hover:bg-white/10 disabled:opacity-30" title="Alejar" aria-label="Alejar"><ZoomOut size={18} /></button>
        <span className="w-12 text-center text-xs font-medium text-white/80 tabular-nums">{Math.round(zoom * 100)}%</span>
        <button onClick={() => stepZoom(1.4)} disabled={zoom >= MAX_ZOOM} className="p-2 rounded-full text-white/90 hover:bg-white/10 disabled:opacity-30" title="Acercar" aria-label="Acercar"><ZoomIn size={18} /></button>
        <button onClick={reset} disabled={zoom === 1} className="p-2 rounded-full text-white/90 hover:bg-white/10 disabled:opacity-30" title="Restablecer" aria-label="Restablecer"><RotateCcw size={16} /></button>
      </div>

      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70" title="Cerrar" aria-label="Cerrar"><X size={26} /></button>
    </div>,
    document.body,
  );
}

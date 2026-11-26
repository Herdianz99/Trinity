'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ImageOff, X, ZoomIn } from 'lucide-react';

export interface TotemCard {
  code: string;
  name: string;
  price: string;
  available: boolean;
  imageUrl: string | null;
}

interface ProductCarouselProps {
  cards: TotemCard[];
  onInteract?: () => void;
  onModalChange?: (open: boolean) => void;
}

const SPEED_PX_PER_SEC = 34;          // vitrina continua lenta (~1 tarjeta cada 7-8 s)
const INITIAL_DELAY_MS = 1_200;       // deja terminar la animacion de entrada antes de deslizar
const RESUME_AFTER_TOUCH_MS = 5_000;  // pausa al tocar/arrastrar antes de retomar suavemente
const END_HOLD_MS = 2_200;            // pausa al llegar a la ultima tarjeta antes de volver al inicio
const RETURN_HOLD_MS = 2_000;         // pausa tras volver al inicio antes de iniciar el siguiente ciclo

// Precio para la tarjeta: "12.50$ bcv" -> "$12.50"
function formatCardPrice(raw: string): string {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*\$/);
  return m ? `$${m[1]}` : raw;
}

export default function ProductCarousel({ cards, onInteract, onModalChange }: ProductCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const leftFadeRef = useRef<HTMLDivElement | null>(null);
  const rightFadeRef = useRef<HTMLDivElement | null>(null);

  const [selected, setSelected] = useState<TotemCard | null>(null);
  const [scrollable, setScrollable] = useState(false);

  // Refs transitorios para animacion a 60 fps sin re-renders de React en cada cuadro.
  const posRef = useRef(0);
  const draggingRef = useRef(false);
  const pausedUntilRef = useRef(0);
  const endHoldUntilRef = useRef(0);
  const returningUntilRef = useRef(0);
  const dragStartRef = useRef({ x: 0, y: 0, moved: false });
  const modalOpenRef = useRef(false);

  const cardsKey = cards.map((c) => c.code).join('|');

  // Nueva consulta o limpieza: cerrar modal y volver al principio del carrusel.
  useEffect(() => {
    setSelected(null);
    posRef.current = 0;
    draggingRef.current = false;
    endHoldUntilRef.current = 0;
    returningUntilRef.current = 0;
    pausedUntilRef.current = Date.now() + INITIAL_DELAY_MS;
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [cardsKey]);

  // Avisar al contenedor del totem cuando hay un producto abierto (pausa auto-scroll y modo espera).
  useEffect(() => {
    const open = selected !== null;
    modalOpenRef.current = open;
    onModalChange?.(open);
    if (!open) {
      pausedUntilRef.current = Date.now() + 2_000;
    }
  }, [selected, onModalChange]);

  // Escape cierra el modal ampliado.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  // Sincroniza indicadores visuales (degradados en bordes + barra de progreso) directo en DOM.
  const syncIndicators = (el: HTMLDivElement) => {
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const hasOverflow = maxScroll > 6;
    if (leftFadeRef.current) {
      leftFadeRef.current.style.opacity = hasOverflow && el.scrollLeft > 8 ? '1' : '0';
    }
    if (rightFadeRef.current) {
      rightFadeRef.current.style.opacity = hasOverflow && el.scrollLeft < maxScroll - 8 ? '1' : '0';
    }
    if (progressRef.current && hasOverflow) {
      const ratio = el.clientWidth / el.scrollWidth;
      const pct = Math.max(14, Math.min(100, ratio * 100));
      const travel = 100 - pct;
      const offset = (el.scrollLeft / maxScroll) * travel;
      progressRef.current.style.width = `${pct}%`;
      progressRef.current.style.transform = `translateX(${(offset / pct) * 100}%)`;
    }
  };

  // Detecta si el carrusel desborda horizontalmente (para activar auto-deslizamiento y ayudas).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const hasOverflow = el.scrollWidth - el.clientWidth > 6;
      setScrollable(hasOverflow);
      syncIndicators(el);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [cardsKey]);

  // Bucle de deslizamiento continuo lento (acumula sub-pixeles en posRef para suavidad en Android Chrome).
  useEffect(() => {
    if (!scrollable) return;
    let rafId = 0;
    let lastTs = 0;

    const tick = (ts: number) => {
      rafId = requestAnimationFrame(tick);
      const el = trackRef.current;
      if (!el) return;
      const dt = lastTs ? Math.min(0.08, (ts - lastTs) / 1000) : 0;
      lastTs = ts;

      const now = Date.now();
      if (draggingRef.current || modalOpenRef.current || now < pausedUntilRef.current || now < returningUntilRef.current) {
        return;
      }

      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 6) return;

      if (endHoldUntilRef.current > 0) {
        if (now < endHoldUntilRef.current) return;
        endHoldUntilRef.current = 0;
        posRef.current = 0;
        returningUntilRef.current = now + 900;
        pausedUntilRef.current = now + RETURN_HOLD_MS;
        el.scrollTo({ left: 0, behavior: 'smooth' });
        return;
      }

      posRef.current += SPEED_PX_PER_SEC * dt;
      if (posRef.current >= maxScroll) {
        posRef.current = maxScroll;
        el.scrollLeft = maxScroll;
        syncIndicators(el);
        endHoldUntilRef.current = now + END_HOLD_MS;
        return;
      }
      el.scrollLeft = posRef.current;
      syncIndicators(el);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [scrollable, cardsKey]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
    draggingRef.current = true;
    endHoldUntilRef.current = 0;
    returningUntilRef.current = 0;
    onInteract?.();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || dragStartRef.current.moved) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > 10) dragStartRef.current.moved = true;
  };

  const handlePointerRelease = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (trackRef.current) posRef.current = trackRef.current.scrollLeft;
    pausedUntilRef.current = Date.now() + RESUME_AFTER_TOUCH_MS;
  };

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    syncIndicators(el);
    const now = Date.now();
    // Si el desplazamiento no vino de nuestro rAF (inercia tactil o rueda), sincronizar y pausar.
    if (now >= returningUntilRef.current && Math.abs(el.scrollLeft - posRef.current) > 3) {
      posRef.current = el.scrollLeft;
      endHoldUntilRef.current = 0;
      pausedUntilRef.current = now + RESUME_AFTER_TOUCH_MS;
      onInteract?.();
    }
  };

  const handleCardClick = (card: TotemCard) => {
    if (dragStartRef.current.moved) return;
    onInteract?.();
    setSelected(card);
  };

  if (cards.length === 0) return null;

  const allAvailable = cards.every((c) => c.available);
  const countLabel =
    cards.length === 1
      ? '1 producto · Toca para ampliar'
      : allAvailable
        ? `${cards.length} opciones disponibles`
        : `${cards.length} opciones encontradas`;

  return (
    <section className="mt-4 w-full" aria-label="Productos encontrados">
      {/* Encabezado compacto: cantidad + pista visual de interaccion */}
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-[clamp(0.9rem,1.9vw,1.35rem)] font-bold text-sky-100 ring-1 ring-white/15">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          {countLabel}
        </span>
        {scrollable ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3.5 py-1 text-[clamp(0.85rem,1.75vw,1.25rem)] font-bold text-emerald-200 ring-1 ring-emerald-400/30">
            Desliza o toca uno
            <ChevronRight className="h-4 w-4 animate-[nudge-x_1.6s_ease-in-out_infinite]" />
          </span>
        ) : cards.length > 1 ? (
          <span className="text-[clamp(0.85rem,1.7vw,1.2rem)] font-semibold text-sky-200/80">
            Toca uno para ver en grande
          </span>
        ) : null}
      </div>

      {/* Pista horizontal con degradados laterales sutiles */}
      <div className="relative w-full">
        <div
          ref={leftFadeRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#091b3d] to-transparent opacity-0 transition-opacity duration-300"
        />
        <div
          ref={rightFadeRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-[#091b3d] to-transparent opacity-0 transition-opacity duration-300"
        />

        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerRelease}
          onPointerCancel={handlePointerRelease}
          onTouchStart={() => {
            draggingRef.current = true;
            endHoldUntilRef.current = 0;
            onInteract?.();
          }}
          onTouchEnd={handlePointerRelease}
          onWheel={() => {
            pausedUntilRef.current = Date.now() + RESUME_AFTER_TOUCH_MS;
            onInteract?.();
          }}
          onScroll={handleScroll}
          className={`totem-carousel flex w-full gap-3.5 overflow-x-auto px-1 pb-2 pt-0.5 touch-pan-x ${
            scrollable ? 'justify-start' : 'justify-center'
          }`}
        >
          {cards.map((c, i) => (
            <button
              key={c.code}
              type="button"
              onClick={() => handleCardClick(c)}
              style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}
              className="group relative flex w-[clamp(172px,29vw,285px)] shrink-0 animate-[card-in_.4s_ease-out_both] flex-col overflow-hidden rounded-2xl bg-white text-left text-slate-900 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/30 transition-transform duration-150 active:scale-[0.97]"
            >
              <div className="relative flex aspect-square w-full items-center justify-center bg-slate-50 p-2.5">
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    draggable={false}
                    loading={i < 4 ? 'eager' : 'lazy'}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageOff className="h-12 w-12 text-slate-300" />
                )}
                <span
                  aria-hidden="true"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/55 text-white shadow-sm backdrop-blur-sm"
                >
                  <ZoomIn className="h-4 w-4" />
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-between border-t border-slate-100 px-3 py-2.5">
                <p className="line-clamp-2 text-[clamp(15px,2vw,24px)] font-bold leading-tight text-slate-900">
                  {c.name}
                </p>
                <p
                  className={`mt-1.5 text-[clamp(1.45rem,3.2vw,2.6rem)] font-extrabold leading-none ${
                    c.available ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {c.available ? formatCardPrice(c.price) : 'Agotado'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Barra de progreso discreta cuando hay mas productos fuera de pantalla */}
      {scrollable ? (
        <div className="mx-auto mt-1.5 h-1.5 w-[min(60%,360px)] overflow-hidden rounded-full bg-white/15">
          <div
            ref={progressRef}
            className="h-full rounded-full bg-emerald-400/90 transition-[width] duration-150"
            style={{ width: '30%' }}
          />
        </div>
      ) : null}

      {/* Modal de vista ampliada al tocar cualquier producto */}
      {selected ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selected.name}
          onClick={() => {
            onInteract?.();
            setSelected(null);
          }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#040d21]/85 p-5 backdrop-blur-md animate-[modal-fade_.18s_ease-out_both]"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onInteract?.();
            }}
            className="relative flex w-full max-w-[min(92vw,760px)] animate-[card-in_.22s_ease-out_both] flex-col overflow-hidden rounded-[32px] bg-white text-slate-900 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)]"
          >
            {/* Zona de imagen grande */}
            <div className="relative flex h-[min(45dvh,540px)] w-full items-center justify-center bg-slate-50 p-6">
              {selected.imageUrl ? (
                <img
                  src={selected.imageUrl}
                  alt={selected.name}
                  draggable={false}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <ImageOff className="h-20 w-20" />
                  <span className="text-xl font-semibold">Sin foto registrada</span>
                </div>
              )}
              <button
                type="button"
                aria-label="Cerrar vista ampliada"
                onClick={() => {
                  onInteract?.();
                  setSelected(null);
                }}
                className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-lg transition active:scale-95"
              >
                <X className="h-8 w-8" />
              </button>
            </div>

            {/* Detalle legible desde 1.5 m en el TV */}
            <div className="border-t border-slate-100 px-7 py-6">
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[clamp(0.95rem,2vw,1.35rem)] font-bold ${
                    selected.available
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      selected.available ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  />
                  {selected.available ? 'Disponible' : 'Agotado'}
                </span>
                <span className="rounded-full bg-slate-100 px-3.5 py-1 text-[clamp(0.9rem,1.8vw,1.25rem)] font-semibold text-slate-600">
                  Cód. {selected.code}
                </span>
              </div>

              <h2 className="text-[clamp(1.6rem,3.6vw,2.75rem)] font-extrabold leading-tight text-slate-900">
                {selected.name}
              </h2>

              <div className="mt-4 flex items-baseline gap-3">
                <p
                  className={`text-[clamp(2.4rem,5.5vw,4.2rem)] font-extrabold leading-none ${
                    selected.available ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {selected.available ? formatCardPrice(selected.price) : 'Agotado'}
                </p>
                {selected.available ? (
                  <span className="rounded-xl bg-emerald-50 px-3 py-1 text-[clamp(1rem,2.1vw,1.5rem)] font-bold text-emerald-700 ring-1 ring-emerald-200">
                    Tasa BCV
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  onInteract?.();
                  setSelected(null);
                }}
                className="mt-6 w-full rounded-2xl bg-slate-900 py-4 text-[clamp(1.25rem,2.6vw,1.9rem)] font-extrabold text-white shadow-md transition active:scale-[0.98]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        .totem-carousel { scrollbar-width: none; -ms-overflow-style: none; }
        .totem-carousel::-webkit-scrollbar { display: none; }
        @keyframes nudge-x { 0%,100% { transform: translateX(0) } 50% { transform: translateX(4px) } }
        @keyframes modal-fade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </section>
  );
}

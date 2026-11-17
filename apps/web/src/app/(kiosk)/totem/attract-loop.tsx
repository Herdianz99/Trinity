'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

// Lo que devuelve GET /totem/playlist.
export interface TotemSlide {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'PRODUCT' | 'INTRO';
  durationSec: number;
  url: string | null;
  thumbUrl?: string | null;
  product?: { code: string; name: string; price: string };
}
export interface TotemPlaylist {
  idleSeconds: number;
  showCallToAction: boolean;
  intro: { url: string; thumbUrl: string | null } | null;
  items: TotemSlide[];
}

// Secuencia: presentacion de Clover -> anuncios -> presentacion -> ...
export function buildSequence(p: TotemPlaylist | null): TotemSlide[] {
  if (!p) return [];
  const intro: TotemSlide[] = p.intro ? [{ id: 'intro', type: 'INTRO', durationSec: 0, url: p.intro.url, thumbUrl: p.intro.thumbUrl }] : [];
  return [...intro, ...p.items];
}

const VIDEO_SAFETY_MS = 150_000; // un video que se queda trabado no detiene el bucle

/**
 * Modo espera del totem: pantalla completa con la presentacion y la publicidad en bucle.
 * Cualquier toque la cierra (onExit) sin que el toque llegue al boton de hablar.
 * Sonido: Chrome solo deja reproducir con sonido si hubo un toque en la pagina; si lo bloquea (p. ej. la
 * pagina se recargo tras un corte de luz) el video sigue sin sonido y lo recupera con el siguiente toque.
 */
export default function AttractLoop({ playlist, onExit }: { playlist: TotemPlaylist; onExit: () => void }) {
  const sequence = useMemo(() => buildSequence(playlist), [playlist]);
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const slide = sequence.length ? sequence[index % sequence.length] : null;
  const next = () => setIndex((i) => (sequence.length ? (i + 1) % sequence.length : 0));
  const isVideo = slide?.type === 'VIDEO' || slide?.type === 'INTRO';

  // Si la lista cambia (llego publicidad nueva) y el indice ya no existe, volver al inicio.
  useEffect(() => { if (index >= sequence.length) setIndex(0); }, [sequence.length, index]);

  // Imagenes y productos: tiempo fijo. Videos: hasta que terminan (con tope de seguridad).
  useEffect(() => {
    if (!slide) return;
    const ms = isVideo ? VIDEO_SAFETY_MS : Math.max(3, slide.durationSec) * 1000;
    const t = setTimeout(next, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index, sequence.length]);

  // Una sola diapositiva de video: hay que repetirla a mano (el indice no cambia).
  const onEnded = () => {
    if (sequence.length === 1 && videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => undefined); }
    else next();
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;
    v.muted = false;
    v.play().catch((err: DOMException) => {
      if (err?.name === 'NotAllowedError') { v.muted = true; v.play().catch(() => next()); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index]);

  // Precargar la siguiente imagen para que no aparezca a medias.
  useEffect(() => {
    if (sequence.length < 2) return;
    const n = sequence[(index + 1) % sequence.length];
    if (n && !(n.type === 'VIDEO' || n.type === 'INTRO') && n.url) { const img = new Image(); img.src = n.url; }
  }, [index, sequence]);

  if (!slide) return null;

  const exit = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    videoRef.current?.pause();
    onExit();
  };

  const bg = isVideo ? slide.thumbUrl : slide.url;

  return (
    <div data-totem-attract className="fixed inset-0 z-[60] overflow-hidden bg-[#06132b]" onPointerDown={exit} onContextMenu={(e) => e.preventDefault()}>
      {slide.type === 'PRODUCT' ? (
        <ProductSlide key={`${slide.id}-${index}`} slide={slide} />
      ) : (
        <div key={`${slide.id}-${index}`} className="absolute inset-0 animate-[totem-fade_.6s_ease-out_both]">
          {/* Fondo desenfocado para lo que no es vertical (no deja barras negras) */}
          {bg && <img src={bg} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />}
          {isVideo ? (
            <video
              ref={videoRef}
              src={slide.url ?? undefined}
              playsInline
              autoPlay
              preload="auto"
              onEnded={onEnded}
              onError={next}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <img src={slide.url ?? ''} alt="" onError={next} className="absolute inset-0 h-full w-full object-contain" />
          )}
        </div>
      )}

      {playlist.showCallToAction && slide.type !== 'INTRO' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[3vh] flex justify-center px-[4vw]">
          <div className="flex items-center gap-[2vw] rounded-full bg-emerald-600/95 py-[1.2vh] pl-[1.2vh] pr-[4vw] text-white shadow-2xl ring-4 ring-white/20 animate-[totem-cta_2.4s_ease-in-out_infinite]">
            <img src="/_next/image?url=%2Fclover%2Fclover.png&w=256&q=75" alt="" className="h-[7vh] w-[7vh] rounded-full bg-white/90 object-cover object-top" />
            <span className="text-[clamp(1.2rem,4.2vw,3rem)] font-extrabold leading-tight">¡Toca la pantalla y pregúntale a Clover!</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes totem-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes totem-cta { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
        @keyframes totem-rise { from { opacity: 0; transform: translateY(4vh) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}

// Producto con su precio de hoy, pensado para pantalla vertical y para leerse a varios metros.
function ProductSlide({ slide }: { slide: TotemSlide }) {
  const p = slide.product!;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center px-[6vw] pb-[14vh] pt-[5vh] text-white animate-[totem-fade_.6s_ease-out_both]"
      style={{ background: 'radial-gradient(120% 70% at 50% 18%, #1b3f7a 0%, #0c2148 45%, #06132b 100%)', fontFamily: 'var(--font-clover), system-ui, sans-serif' }}
    >
      <span className="rounded-full bg-amber-400 px-[4vw] py-[0.8vh] text-[clamp(1rem,3vw,2.2rem)] font-extrabold uppercase tracking-[0.2em] text-amber-950">
        Disponible en tienda
      </span>
      <div className="mt-[3vh] flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[4vw] bg-white p-[3vw] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] animate-[totem-rise_.7s_ease-out_both]">
        {slide.url
          ? <img src={slide.url} alt={p.name} className="h-full w-full object-contain" />
          : <ImageOff className="h-[20vw] w-[20vw] text-slate-300" />}
      </div>
      <p className="mt-[3vh] line-clamp-3 text-center text-[clamp(1.6rem,5.4vw,4.2rem)] font-bold leading-[1.1] animate-[totem-rise_.7s_.1s_ease-out_both]">
        {p.name}
      </p>
      <div className="mt-[2vh] flex items-baseline gap-[2vw] animate-[totem-rise_.7s_.2s_ease-out_both]">
        <span className="text-[clamp(3.5rem,15vw,11rem)] font-extrabold leading-none text-emerald-300 drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">{p.price}</span>
        <span className="text-[clamp(1.2rem,4vw,3rem)] font-bold uppercase text-emerald-100/80">BCV</span>
      </div>
    </div>
  );
}

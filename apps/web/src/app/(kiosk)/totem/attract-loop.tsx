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

const VIDEO_SAFETY_MS = 150_000; // tope absoluto por video (el maximo admitido dura ~2 min)
const STALL_MS = 10_000; // un video que no avanza en este tiempo (sin red o decodificador trabado) se salta

const isVideoSlide = (s: TotemSlide | null | undefined) => s?.type === 'VIDEO' || s?.type === 'INTRO';

// Suelta el decodificador: en las placas Android de cartelera hay muy pocos y, si no se liberan,
// despues de varias vueltas del bucle el video se congela.
function releaseVideo(v: HTMLVideoElement) {
  v.pause();
  if (v.hasAttribute('src')) { v.removeAttribute('src'); v.load(); }
}

// Descarga cada video una vez, en orden, para dejarlo en la cache HTTP del navegador (Spaces lo sirve con
// cache de un año): las vueltas siguientes salen del disco y no del WiFi de la tienda. Es 'no-cors' porque
// el CDN no manda CORS; la respuesta opaca igual queda en cache para el <video>. Si falla, el video baja normal.
const warmed = new Set<string>();
let warmChain: Promise<unknown> = Promise.resolve();
function warmVideo(url: string) {
  if (warmed.has(url)) return;
  warmed.add(url);
  warmChain = warmChain.then(() => fetch(url, { mode: 'no-cors', cache: 'force-cache' }).catch(() => { warmed.delete(url); }));
}

/**
 * Modo espera del totem: pantalla completa con la presentacion y la publicidad en bucle.
 * Cualquier toque la cierra (onExit) sin que el toque llegue al boton de hablar.
 * Sonido: Chrome solo deja reproducir con sonido si hubo un toque en la pagina; si lo bloquea (p. ej. la
 * pagina se recargo tras un corte de luz) el video sigue sin sonido y lo recupera con el siguiente toque.
 *
 * Videos: UN solo <video> para todo el bucle (crear uno por vuelta agotaba el decodificador de la placa),
 * sin fondo desenfocado ni animaciones encima mientras corre, y con vigilancia: si no avanza, se salta.
 */
export default function AttractLoop({ playlist, onExit }: { playlist: TotemPlaylist; onExit: () => void }) {
  const sequence = useMemo(() => buildSequence(playlist), [playlist]);
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const slide = sequence.length ? sequence[index % sequence.length] : null;
  const next = () => setIndex((i) => (sequence.length ? (i + 1) % sequence.length : 0));
  const isVideo = isVideoSlide(slide);

  // Si la lista cambia (llego publicidad nueva) y el indice ya no existe, volver al inicio.
  useEffect(() => { if (index >= sequence.length) setIndex(0); }, [sequence.length, index]);

  useEffect(() => {
    sequence.forEach((s) => { if (isVideoSlide(s) && s.url) warmVideo(s.url); });
  }, [sequence]);

  // Al salir del modo espera, soltar el video.
  useEffect(() => {
    const v = videoRef.current;
    return () => { if (v) releaseVideo(v); };
  }, []);

  // Imagenes y productos: tiempo fijo. Videos: hasta que terminan (con tope de seguridad).
  useEffect(() => {
    if (!slide) return;
    const ms = isVideo ? VIDEO_SAFETY_MS : Math.max(3, slide.durationSec) * 1000;
    const t = setTimeout(skip, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index, sequence.length]);

  // Pasa a lo siguiente. Si la lista es un solo video el indice no cambia: se reinicia ese video desde cero
  // (load() tambien rearma el decodificador si se habia trabado).
  const skip = () => {
    const v = videoRef.current;
    if (sequence.length === 1 && v && isVideo) { v.load(); v.play().catch(() => undefined); }
    else next();
  };

  const play = (v: HTMLVideoElement) => {
    v.muted = false;
    v.play().catch((err: DOMException) => {
      if (err?.name === 'NotAllowedError') { v.muted = true; v.play().catch(() => skip()); }
    });
  };

  // Una sola diapositiva de video: hay que repetirla a mano (el indice no cambia).
  const onEnded = () => {
    const v = videoRef.current;
    if (sequence.length === 1 && v) { v.currentTime = 0; play(v); }
    else next();
  };

  // Carga el video de la diapositiva en el reproductor unico; en imagenes y productos lo suelta.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!isVideo || !slide?.url) { releaseVideo(v); return; }
    if (v.getAttribute('src') !== slide.url) v.src = slide.url;
    else v.currentTime = 0;
    play(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index]);

  // Vigilancia: si el video no avanza en STALL_MS (sin red, sin datos o decodificador colgado), se salta.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;
    let lastTime = -1;
    let lastMove = Date.now();
    const id = setInterval(() => {
      if (v.ended) return;
      if (v.currentTime !== lastTime) { lastTime = v.currentTime; lastMove = Date.now(); return; }
      if (Date.now() - lastMove > STALL_MS) { lastMove = Date.now(); skip(); }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index, sequence.length]);

  // Un error del reproductor solo cuenta si estaba mostrando un video (al soltarlo queda sin src).
  const onVideoError = () => { if (isVideo && videoRef.current?.hasAttribute('src')) skip(); };

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

  return (
    <div data-totem-attract className="fixed inset-0 z-[60] overflow-hidden bg-[#06132b]" onPointerDown={exit} onContextMenu={(e) => e.preventDefault()}>
      {slide.type === 'PRODUCT' ? (
        <ProductSlide key={`${slide.id}-${index}`} slide={slide} />
      ) : !isVideo && (
        <div key={`${slide.id}-${index}`} className="absolute inset-0 animate-[totem-fade_.6s_ease-out_both]">
          {/* Fondo desenfocado para lo que no es vertical (no deja barras negras). Solo en imagenes: detras de
              un video obligaba a la placa a recomponer el desenfoque en cada cuadro. */}
          {slide.url && <img src={slide.url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />}
          <img src={slide.url ?? ''} alt="" onError={next} className="absolute inset-0 h-full w-full object-contain" />
        </div>
      )}

      {/* Reproductor unico (siempre montado): ver releaseVideo. */}
      <video
        ref={videoRef}
        playsInline
        preload="auto"
        poster={isVideo ? slide.thumbUrl ?? undefined : undefined}
        onEnded={onEnded}
        onError={onVideoError}
        className={isVideo ? 'absolute inset-0 h-full w-full object-contain' : 'hidden'}
      />

      {playlist.showCallToAction && slide.type !== 'INTRO' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[3vh] flex justify-center px-[4vw]">
          <div className={`flex items-center gap-[2vw] rounded-full bg-emerald-600/95 py-[1.2vh] pl-[1.2vh] pr-[4vw] text-white shadow-2xl ring-4 ring-white/20 ${isVideo ? '' : 'animate-[totem-cta_2.4s_ease-in-out_infinite]'}`}>
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

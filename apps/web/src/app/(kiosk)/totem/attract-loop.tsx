'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { jsHeapMb, reportDecoderCaps, reportDiag } from './totem-diagnostics';

// Seguimiento invisible de cada reproducción (diagnóstico, Sesión 192).
interface PlayTrack {
  file: string;
  type: string;
  start: number; // performance.now() al empezar
  dropped0: number;
  total0: number;
  waiting: number; // veces que el video se quedó esperando datos
}
const quality = (v: HTMLVideoElement) => {
  try {
    const q = v.getVideoPlaybackQuality();
    return { dropped: q.droppedVideoFrames, total: q.totalVideoFrames };
  } catch { return { dropped: 0, total: 0 }; }
};
const bufferedEnd = (v: HTMLVideoElement) => {
  try { return v.buffered.length ? Math.round(v.buffered.end(v.buffered.length - 1) * 10) / 10 : 0; } catch { return 0; }
};

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
  const intentionalPause = useRef(false); // distingue nuestras pausas (salir/cambiar) de pausas externas de Android/Chrome
  const pauseRetries = useRef(0);
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>();
  const slide = sequence.length ? sequence[index % sequence.length] : null;
  const next = () => setIndex((i) => (sequence.length ? (i + 1) % sequence.length : 0));
  const isVideo = isVideoSlide(slide);

  // ---- Diagnóstico invisible: una línea por reproducción (cuadros perdidos, esperas, cómo terminó) ----
  const track = useRef<PlayTrack | null>(null);
  const startTrack = (v: HTMLVideoElement, s: TotemSlide) => {
    const q = quality(v);
    track.current = {
      file: (s.url ?? '').split('/').pop() ?? '', type: s.type, start: performance.now(),
      dropped0: q.dropped, total0: q.total, waiting: 0,
    };
  };
  // `el`: al desmontar, React ya soltó videoRef; se pasa el elemento guardado al montar.
  const finishTrack = (reason: string, el?: HTMLVideoElement | null) => {
    const t = track.current;
    const v = videoRef.current ?? el;
    if (!t || !v) return;
    track.current = null;
    const q = quality(v);
    const frames = q.total - t.total0;
    const dropped = q.dropped - t.dropped0;
    const wallMs = performance.now() - t.start;
    if (frames === 0 && wallMs < 1000 && reason === 'exit') return; // montaje doble de React en desarrollo
    reportDiag('play', {
      reason, file: t.file, type: t.type,
      durSec: Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null,
      atSec: Math.round(v.currentTime * 10) / 10,
      wallSec: Math.round((performance.now() - t.start) / 100) / 10,
      frames, dropped, dropPct: frames > 0 ? Math.round((dropped / frames) * 1000) / 10 : null,
      waiting: t.waiting, heapMb: jsHeapMb(),
    });
  };

  // Si la lista cambia (llego publicidad nueva) y el indice ya no existe, volver al inicio.
  useEffect(() => { if (index >= sequence.length) setIndex(0); }, [sequence.length, index]);

  useEffect(() => {
    sequence.forEach((s) => { if (isVideoSlide(s) && s.url) warmVideo(s.url); });
  }, [sequence]);

  // Al salir del modo espera, soltar el video.
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      clearTimeout(pauseTimer.current);
      intentionalPause.current = true;
      finishTrack('exit', v);
      if (v) releaseVideo(v);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imagenes y productos: tiempo fijo. Videos: hasta que terminan (con tope de seguridad).
  useEffect(() => {
    if (!slide) return;
    const ms = isVideo ? VIDEO_SAFETY_MS : Math.max(3, slide.durationSec) * 1000;
    const t = setTimeout(() => { if (isVideo) finishTrack('timeout'); skip(); }, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index, sequence.length]);

  // Pasa a lo siguiente. Si la lista es un solo video el indice no cambia: se reinicia ese video desde cero
  // (load() tambien rearma el decodificador si se habia trabado).
  const skip = () => {
    const v = videoRef.current;
    if (sequence.length === 1 && v && isVideo && slide) { v.load(); startTrack(v, slide); v.play().catch(() => undefined); }
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
    finishTrack('ended');
    if (sequence.length === 1 && v && slide) { v.currentTime = 0; startTrack(v, slide); play(v); }
    else next();
  };

  // Carga el video de la diapositiva en el reproductor unico; en imagenes y productos lo suelta.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    clearTimeout(pauseTimer.current);
    pauseRetries.current = 0;
    finishTrack('switch'); // por si la anterior no terminó por sus medios (no manda nada si ya terminó)
    if (!isVideo || !slide?.url) {
      intentionalPause.current = true;
      releaseVideo(v);
      return;
    }
    intentionalPause.current = false;
    if (v.getAttribute('src') !== slide.url) v.src = slide.url;
    else v.currentTime = 0;
    startTrack(v, slide);
    play(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index]);

  // Si Chrome/Android vuelve a primer plano tras una interrupcion, reanudar el video solo.
  useEffect(() => {
    const onVisible = () => {
      const v = videoRef.current;
      if (document.visibilityState === 'visible' && isVideo && v && v.paused && !v.ended && !intentionalPause.current) {
        play(v);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo]);

  // Vigilancia: si el video no avanza en STALL_MS (sin red, sin datos o decodificador colgado), se salta.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return;
    let lastTime = -1;
    let lastMove = Date.now();
    // Diagnóstico: imagen congelada con el tiempo avanzando (el audio sigue, el decodificador no saca cuadros).
    // Solo se reporta (una vez por reproducción); no cambia el comportamiento.
    let frameRef = { frames: -1, at: 0 };
    let frozenReported = false;
    const id = setInterval(() => {
      if (v.ended) return;
      const { total } = quality(v);
      if (total !== frameRef.frames) frameRef = { frames: total, at: v.currentTime };
      else if (!frozenReported && !v.paused && v.currentTime - frameRef.at > 3) {
        frozenReported = true;
        reportDiag('frozen', {
          file: (slide?.url ?? '').split('/').pop(), atSec: Math.round(v.currentTime * 10) / 10,
          sinceSec: Math.round((v.currentTime - frameRef.at) * 10) / 10, readyState: v.readyState, ...quality(v),
        });
      }
      if (v.currentTime !== lastTime) { lastTime = v.currentTime; lastMove = Date.now(); return; }
      if (Date.now() - lastMove > STALL_MS) {
        lastMove = Date.now();
        reportDiag('stall', {
          file: (slide?.url ?? '').split('/').pop(), atSec: Math.round(v.currentTime * 10) / 10,
          bufferedEnd: bufferedEnd(v), readyState: v.readyState, networkState: v.networkState,
          paused: v.paused, muted: v.muted, ...quality(v),
        });
        finishTrack('stall');
        skip();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, index, sequence.length]);

  // Un error del reproductor solo cuenta si estaba mostrando un video (al soltarlo queda sin src).
  const onVideoError = () => {
    const v = videoRef.current;
    if (!isVideo || !v?.hasAttribute('src')) return;
    reportDiag('error', { file: (slide?.url ?? '').split('/').pop(), code: v.error?.code ?? null, msg: v.error?.message ?? null, atSec: v.currentTime });
    finishTrack('error');
    skip();
  };
  const onWaiting = () => { if (track.current) track.current.waiting++; };
  // Pausa externa (Android Audio Focus / Chrome 158 / aviso del sistema): se reanuda solo sin congelar 10 s.
  const onVideoPause = () => {
    const v = videoRef.current;
    if (!isVideo || !v || intentionalPause.current || v.ended || !v.hasAttribute('src')) return;
    const retry = ++pauseRetries.current;
    reportDiag('unexpected_pause', {
      file: (slide?.url ?? '').split('/').pop(),
      atSec: Math.round(v.currentTime * 10) / 10,
      readyState: v.readyState,
      muted: v.muted,
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      retry,
    });
    if (retry > 3) return; // el watchdog de stall lo saltara si Android bloquea por completo
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      const cur = videoRef.current;
      if (!cur || intentionalPause.current || cur.ended || !cur.paused) return;
      // En el 1er intento mantiene sonido; si vuelve a pausarse (ej. Audio Focus), continua sin sonido para no trabarse.
      if (retry >= 2) cur.muted = true;
      cur.play().catch(() => { cur.muted = true; cur.play().catch(() => undefined); });
    }, 200);
  };
  const onMetadata = () => {
    const v = videoRef.current;
    if (v && slide?.url) reportDecoderCaps(slide.url, v.videoWidth, v.videoHeight);
  };

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
    clearTimeout(pauseTimer.current);
    intentionalPause.current = true;
    finishTrack('touch'); // antes de pausar: así queda dónde iba y cuántos cuadros salieron
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
        onWaiting={onWaiting}
        onPause={onVideoPause}
        onLoadedMetadata={onMetadata}
        className={isVideo ? 'absolute inset-0 h-full w-full object-contain' : 'hidden'}
      />

      {playlist.showCallToAction && slide.type !== 'INTRO' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[3vh] flex justify-center px-[4vw]">
          <div className={`flex items-center gap-[2vw] rounded-full bg-emerald-600/95 py-[1.2vh] pl-[1.2vh] pr-[4vw] text-white shadow-2xl ring-4 ring-white/20 ${isVideo ? '' : 'animate-[totem-cta_2.4s_ease-in-out_infinite]'}`}>
            <img src="/clover/clover-avatar.webp" alt="Clover" className="h-[7vh] w-[7vh] rounded-full bg-[#0d2550] object-cover ring-2 ring-white/30" />
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

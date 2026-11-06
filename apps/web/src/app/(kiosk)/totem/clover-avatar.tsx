'use client';
import Image from 'next/image';

export type CloverState = 'idle' | 'listening' | 'thinking' | 'speaking';

const HALO: Record<CloverState, string> = {
  idle: 'bg-sky-500/25 scale-95',
  listening: 'bg-emerald-400/70 scale-110 animate-pulse',
  thinking: 'bg-amber-300/40 scale-100 animate-pulse',
  speaking: 'bg-sky-300/50 scale-105',
};

// Imagen fija de Clover + halo segun el estado, vaiven suave al hablar y puntos al pensar.
// El borde de la imagen se difumina con una mascara para que se funda con el fondo.
// compact: mas pequeno cuando hay tarjetas de producto en pantalla.
export default function CloverAvatar({ state, compact = false }: { state: CloverState; compact?: boolean }) {
  return (
    <div className={`relative mx-auto aspect-[1088/1456] transition-[width] duration-500 ${compact ? 'w-[min(40vw,24dvh,260px)]' : 'w-[min(62vw,40dvh,400px)]'}`}>
      <div className={`absolute -inset-[6%] rounded-full blur-3xl transition-all duration-700 ${HALO[state]}`} />
      <div className={`absolute inset-0 ${state === 'speaking' ? 'clover-sway' : state === 'idle' ? 'clover-breathe' : ''}`}>
        <Image
          src="/clover/clover.png"
          alt="Clover, asistente virtual"
          fill
          priority
          sizes="400px"
          className="object-cover"
          style={{
            WebkitMaskImage: 'radial-gradient(closest-side at 50% 46%, #000 72%, transparent 100%)',
            maskImage: 'radial-gradient(closest-side at 50% 46%, #000 72%, transparent 100%)',
          }}
        />
      </div>
      {state === 'thinking' && (
        <div className="absolute bottom-[8%] left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-[#06132b]/80 px-5 py-3 ring-1 ring-white/15 backdrop-blur">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-3 w-3 animate-bounce rounded-full bg-amber-300" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes clover-sway { 0%,100% { transform: rotate(-1.2deg) translateY(0) } 50% { transform: rotate(1.2deg) translateY(-8px) } }
        @keyframes clover-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.015) } }
        .clover-sway { animation: clover-sway 1.1s ease-in-out infinite; transform-origin: 50% 100%; }
        .clover-breathe { animation: clover-breathe 4s ease-in-out infinite; transform-origin: 50% 100%; }
      `}</style>
    </div>
  );
}

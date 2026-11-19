// Diagnóstico INVISIBLE del tótem (Sesión 192): manda al API datos de reproducción de video para
// averiguar por qué se congela en la placa Android. No muestra nada en pantalla; todo error se ignora.
// En el servidor: buscar "TotemDiag" en los logs de PM2 de trinity-api.

const MAX_EVENTS_PER_PAGE = 2000; // tope por carga de página, por si algo entra en bucle
let sent = 0;

export function reportDiag(event: string, data: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || sent >= MAX_EVENTS_PER_PAGE) return;
  sent++;
  try {
    fetch('/api/proxy/totem/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data: { ...data, upMin: Math.round(performance.now() / 600) / 100 } }),
      keepalive: true,
    }).catch(() => undefined);
  } catch { /* nunca romper la pantalla por el diagnóstico */ }
}

/** Memoria del JS (solo Chrome) en MB. */
export function jsHeapMb(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

/** Datos del equipo, una vez al cargar la página. */
export function reportBoot() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number } };
  reportDiag('boot', {
    ua: navigator.userAgent,
    ram: nav.deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    net: nav.connection?.effectiveType ?? null,
    downMbps: nav.connection?.downlink ?? null,
    heapMb: jsHeapMb(),
  });
}

// Pregunta al navegador si decodifica un H.264 Main 4.0 de ese tamaño, si lo hace fluido y si es por
// hardware (powerEfficient=true casi siempre significa hardware). Se compara el tamaño real (vertical)
// con el mismo video acostado y con 720p vertical.
const reportedCaps = new Set<string>();
export async function reportDecoderCaps(url: string, width: number, height: number) {
  if (reportedCaps.has(url) || !width || !height) return;
  reportedCaps.add(url);
  const mc = (navigator as Navigator & { mediaCapabilities?: MediaCapabilities }).mediaCapabilities;
  const ask = async (w: number, h: number) => {
    if (!mc?.decodingInfo) return null;
    try {
      const r = await mc.decodingInfo({
        type: 'file',
        video: { contentType: 'video/mp4; codecs="avc1.4D4028"', width: w, height: h, bitrate: 5_000_000, framerate: 30 },
      });
      return { ok: r.supported, smooth: r.smooth, hw: r.powerEfficient };
    } catch { return null; }
  };
  const [real, acostado, v720] = await Promise.all([ask(width, height), ask(height, width), ask(720, 1280)]);
  reportDiag('caps', { file: url.split('/').pop(), size: `${width}x${height}`, real, acostado, v720 });
}

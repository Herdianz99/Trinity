import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TtsVoiceOption {
  id: string;
  name: string;
  description: string;
}

// Voces masculinas naturales de Gemini TTS (español latino). El encargado puede elegir en el
// selector oculto del tótem (mantener presionado "Clover · Asistente El Trébol" 2 s).
export const GEMINI_TTS_VOICES: TtsVoiceOption[] = [
  { id: 'Orus', name: 'Orus', description: 'Masculina cálida y firme (recomendada)' },
  { id: 'Charon', name: 'Charon', description: 'Masculina serena e informativa' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Masculina enérgica y cercana' },
  { id: 'Puck', name: 'Puck', description: 'Masculina joven y animada' },
  { id: 'Alnilam', name: 'Alnilam', description: 'Masculina clara y directa' },
  { id: 'Enceladus', name: 'Enceladus', description: 'Masculina suave y amable' },
];

export const DEFAULT_TTS_VOICE = 'Orus';
const ALLOWED_VOICE_IDS = new Set(GEMINI_TTS_VOICES.map((v) => v.id));

const DEFAULT_MODEL = 'gemini-3.8-flash-lite-tts';
const FALLBACK_MODEL = 'gemini-2.5-flash-preview-tts';
// En Gemini 3.8 TTS el campo `text` se lee literal (verbatim): el tono va en `speechMetadata.style`.
const VOICE_STYLE = 'cálido, amable, natural, español latinoamericano, atención al cliente, ritmo ágil';

const MAX_CACHE_ENTRIES = 60;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 12_000;

interface CacheEntry {
  wav: Buffer;
  expiresAt: number;
}

/** Envuelve PCM 16-bit mono sin cabecera (audio/L16) en un WAV estándar reproducible por cualquier navegador. */
function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function parseSampleRate(mime: string): number {
  const m = mime.match(/rate=(\d+)/i);
  const n = m ? Number(m[1]) : 24000;
  return Number.isFinite(n) && n >= 8000 && n <= 96000 ? n : 24000;
}

/**
 * Voz natural IA (Gemini TTS) para el tótem Clover. Usa GEMINI_API_KEY del .env del API.
 * Sin clave, queda inerte (enabled=false) y el tótem usa la síntesis local del navegador.
 * Cachea frases en memoria (LRU) para que avisos repetidos suenen al instante sin re-llamar a la API.
 */
@Injectable()
export class TotemTtsService {
  private readonly logger = new Logger(TotemTtsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<Buffer>>();

  constructor(private config: ConfigService) {}

  private apiKey(): string {
    return (this.config.get<string>('GEMINI_API_KEY') ?? '').trim();
  }

  private primaryModel(): string {
    return (this.config.get<string>('GEMINI_TTS_MODEL') ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  get enabled(): boolean {
    return this.apiKey().length > 0;
  }

  voicesInfo() {
    return {
      enabled: this.enabled,
      defaultVoice: DEFAULT_TTS_VOICE,
      voices: GEMINI_TTS_VOICES,
    };
  }

  private getCached(key: string): Buffer | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    // LRU: mover al final
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.wav;
  }

  private setCached(key: string, wav: Buffer) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { wav, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  async synthesize(rawText: string, requestedVoice?: string): Promise<Buffer> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Voz natural IA no configurada (falta GEMINI_API_KEY)');
    }
    const text = (rawText ?? '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!text) throw new ServiceUnavailableException('Texto vacío');

    const voice = requestedVoice && ALLOWED_VOICE_IDS.has(requestedVoice) ? requestedVoice : DEFAULT_TTS_VOICE;
    const cacheKey = `${voice}:${text}`;
    const hit = this.getCached(cacheKey);
    if (hit) return hit;

    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const promise = this.callGemini(text, voice)
      .then((wav) => {
        this.setCached(cacheKey, wav);
        return wav;
      })
      .finally(() => {
        this.inflight.delete(cacheKey);
      });

    this.inflight.set(cacheKey, promise);
    return promise;
  }

  private async callGemini(text: string, voice: string): Promise<Buffer> {
    const primary = this.primaryModel();
    const models = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];
    let lastError = 'sin respuesta';

    for (const model of models) {
      try {
        const part = model.includes('3.8')
          ? { text, speechMetadata: { style: VOICE_STYLE } }
          : { text };
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey(),
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [part] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                },
              },
            }),
          },
        );
        if (!res.ok) {
          const errText = (await res.text()).slice(0, 220);
          lastError = `HTTP ${res.status} (${model}): ${errText}`;
          this.logger.warn(`Gemini TTS fallo: ${lastError}`);
          if (res.status === 404 || res.status === 400 || res.status === 503) continue;
          break;
        }
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
        };
        const inline = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
        if (!inline?.data) {
          lastError = `Sin audio en respuesta (${model})`;
          this.logger.warn(`Gemini TTS: ${lastError}`);
          continue;
        }
        const raw = Buffer.from(inline.data, 'base64');
        const mime = (inline.mimeType ?? '').toLowerCase();
        if (mime.includes('wav') || (raw.length > 4 && raw.subarray(0, 4).toString('ascii') === 'RIFF')) {
          return raw;
        }
        return pcmToWav(raw, parseSampleRate(mime));
      } catch (e) {
        lastError = `${model}: ${(e as Error).message}`;
        this.logger.warn(`Gemini TTS error: ${lastError}`);
      }
    }
    throw new ServiceUnavailableException(`No se pudo generar el audio (${lastError})`);
  }
}

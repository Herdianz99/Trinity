/**
 * Cola antirafagas + bloqueo por conversacion para Chatwoot (docs/CHATBOT-FASE3-PLAN.md §5.2).
 *
 * - Espera de silencio (debounceMs): si el cliente manda varios mensajes seguidos ("Hola" /
 *   "Buenas" / "precio del cemento" / foto), se reinicia el temporizador y se procesan TODOS
 *   juntos en una sola llamada a la IA.
 * - Una respuesta a la vez por conversacion: si llegan mensajes mientras la IA esta pensando,
 *   se acumulan y se procesan en la vuelta siguiente (nunca en paralelo).
 * - Epoch de cancelacion: si un asesor toma la conversacion mientras la IA esta respondiendo,
 *   cancel(key) incrementa el epoch para que el procesador descarte la respuesta al terminar.
 */
export class ChatwootBurstQueue<T> {
  private readonly buffers = new Map<string, T[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly running = new Set<string>();
  private readonly epochs = new Map<string, number>();

  private readonly processor: (key: string, batch: T[], epoch: number) => Promise<void>;
  private readonly onError?: (key: string, err: unknown) => void;

  constructor(
    processor: (key: string, batch: T[], epoch: number) => Promise<void>,
    onError?: (key: string, err: unknown) => void,
  ) {
    this.processor = processor;
    this.onError = onError;
  }

  epoch(key: string): number {
    return this.epochs.get(key) ?? 0;
  }

  enqueue(key: string, item: T, debounceMs: number): void {
    const list = this.buffers.get(key) ?? [];
    list.push(item);
    this.buffers.set(key, list);

    // Si ya hay un turno en ejecucion, el bloque finally reprogramara los mensajes acumulados.
    if (this.running.has(key)) return;

    this.schedule(key, debounceMs);
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    this.buffers.delete(key);
    this.epochs.set(key, this.epoch(key) + 1);
  }

  clearAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.buffers.clear();
  }

  private schedule(key: string, debounceMs: number): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const delay = Math.max(0, debounceMs);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.flush(key, delay);
    }, delay);
    this.timers.set(key, timer);
  }

  private async flush(key: string, followUpDebounceMs: number): Promise<void> {
    if (this.running.has(key)) return;
    const batch = this.buffers.get(key);
    if (!batch || batch.length === 0) return;
    this.buffers.delete(key);

    this.running.add(key);
    const startEpoch = this.epoch(key);
    try {
      await this.processor(key, batch, startEpoch);
    } catch (err) {
      this.onError?.(key, err);
    } finally {
      this.running.delete(key);
      // Si llegaron mensajes nuevos mientras la IA respondia (y no se cancelo la conversacion),
      // procesarlos en la siguiente vuelta con una breve espera por si siguen escribiendo.
      const pending = this.buffers.get(key);
      if (pending && pending.length > 0) {
        this.schedule(key, followUpDebounceMs);
      }
    }
  }
}

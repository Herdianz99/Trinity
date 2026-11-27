// Horario de atención de asesores humanos para escalado del chatbot (hora Caracas).
// Módulo puro: sin Nest ni Prisma, verificable con `node apps/api/src/modules/chatbot/advisor-schedule.check.ts`.

export const ADVISOR_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type AdvisorDayKey = (typeof ADVISOR_DAY_KEYS)[number];

export interface AdvisorDaySlot {
  enabled: boolean;
  start: string; // 'HH:MM' 24h
  end: string;   // 'HH:MM' 24h
}

export interface AdvisorSchedule {
  enabled: boolean;
  days: Record<AdvisorDayKey, AdvisorDaySlot>;
  outOfHoursMessage?: string | null;
}

export interface AdvisorAvailability {
  configured: boolean;
  open: boolean;
  scheduleSummary: string | null;
  nextOpenLabel: string | null;
  customMessage: string | null;
}

const CARACAS_TZ = 'America/Caracas';
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DAY_NAMES: Record<AdvisorDayKey, string> = {
  mon: 'lunes',
  tue: 'martes',
  wed: 'miércoles',
  thu: 'jueves',
  fri: 'viernes',
  sat: 'sábado',
  sun: 'domingo',
};

const WEEKDAY_MAP: Record<string, AdvisorDayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

export function defaultAdvisorSchedule(): AdvisorSchedule {
  return {
    enabled: false,
    days: {
      mon: { enabled: true, start: '08:00', end: '17:00' },
      tue: { enabled: true, start: '08:00', end: '17:00' },
      wed: { enabled: true, start: '08:00', end: '17:00' },
      thu: { enabled: true, start: '08:00', end: '17:00' },
      fri: { enabled: true, start: '08:00', end: '17:00' },
      sat: { enabled: true, start: '08:00', end: '17:00' },
      sun: { enabled: false, start: '09:00', end: '17:00' },
    },
    outOfHoursMessage: '',
  };
}

export function timeToMinutes(hhmm: string): number | null {
  const m = TIME_RE.exec((hhmm || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatTime12h(hhmm: string): string {
  const m = TIME_RE.exec((hhmm || '').trim());
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const min = m[2];
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${suffix}`;
}

export function caracasWeekdayAndMinutes(now: Date = new Date()): { dayKey: AdvisorDayKey; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CARACAS_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dayKey = WEEKDAY_MAP[get('weekday')] ?? 'mon';
  const hour = parseInt(get('hour'), 10) || 0;
  const minute = parseInt(get('minute'), 10) || 0;
  return { dayKey, minutes: hour * 60 + minute };
}

/** Valida y normaliza un horario enviado por la UI/API. Lanza Error con mensaje claro si hay formato inválido. */
export function validateAdvisorSchedule(raw: unknown): AdvisorSchedule | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El horario de asesores tiene un formato inválido');
  }
  const obj = raw as Record<string, unknown>;
  const enabled = Boolean(obj.enabled);
  const rawDays = (obj.days && typeof obj.days === 'object' ? obj.days : {}) as Record<string, unknown>;
  const defaults = defaultAdvisorSchedule().days;

  const days = {} as Record<AdvisorDayKey, AdvisorDaySlot>;
  for (const key of ADVISOR_DAY_KEYS) {
    const entry = (rawDays[key] && typeof rawDays[key] === 'object' ? rawDays[key] : defaults[key]) as Record<string, unknown>;
    const dayEnabled = Boolean(entry.enabled);
    const start = typeof entry.start === 'string' ? entry.start.trim() : defaults[key].start;
    const end = typeof entry.end === 'string' ? entry.end.trim() : defaults[key].end;

    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (dayEnabled) {
      if (startMin === null || endMin === null) {
        throw new Error(`Hora inválida en ${DAY_NAMES[key]} (usa formato HH:MM)`);
      }
      if (startMin >= endMin) {
        throw new Error(`En ${DAY_NAMES[key]}, la hora de inicio debe ser menor a la hora de cierre`);
      }
    }

    days[key] = {
      enabled: dayEnabled,
      start: startMin !== null ? start : defaults[key].start,
      end: endMin !== null ? end : defaults[key].end,
    };
  }

  const outOfHoursMessage =
    typeof obj.outOfHoursMessage === 'string' ? obj.outOfHoursMessage.trim().slice(0, 600) : '';

  return { enabled, days, outOfHoursMessage };
}

/** Parseo defensivo para lectura desde BD (nunca lanza excepciones). */
export function parseAdvisorSchedule(raw: unknown): AdvisorSchedule | null {
  try {
    return validateAdvisorSchedule(raw);
  } catch {
    return null;
  }
}

/** Resume el horario activo en texto natural: ej. "lunes a sábado de 8:00 am a 5:00 pm". */
export function formatScheduleSummary(schedule: AdvisorSchedule): string | null {
  const groups: { from: AdvisorDayKey; to: AdvisorDayKey; start: string; end: string }[] = [];

  for (const key of ADVISOR_DAY_KEYS) {
    const slot = schedule.days[key];
    if (!slot?.enabled) continue;
    const prev = groups[groups.length - 1];
    const prevIdx = prev ? ADVISOR_DAY_KEYS.indexOf(prev.to) : -2;
    const curIdx = ADVISOR_DAY_KEYS.indexOf(key);
    if (prev && prevIdx === curIdx - 1 && prev.start === slot.start && prev.end === slot.end) {
      prev.to = key;
    } else {
      groups.push({ from: key, to: key, start: slot.start, end: slot.end });
    }
  }

  if (groups.length === 0) return null;

  const parts = groups.map((g) => {
    const dayRange = g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]} a ${DAY_NAMES[g.to]}`;
    return `${dayRange} de ${formatTime12h(g.start)} a ${formatTime12h(g.end)}`;
  });

  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

function findNextOpenLabel(schedule: AdvisorSchedule, currentDayKey: AdvisorDayKey, currentMinutes: number): string | null {
  const startIdx = ADVISOR_DAY_KEYS.indexOf(currentDayKey);
  for (let offset = 0; offset <= 7; offset++) {
    const key = ADVISOR_DAY_KEYS[(startIdx + offset) % 7];
    const slot = schedule.days[key];
    if (!slot?.enabled) continue;
    const openMin = timeToMinutes(slot.start);
    if (openMin === null) continue;
    if (offset === 0 && currentMinutes >= openMin) continue;

    const hourStr = formatTime12h(slot.start);
    if (offset === 0) return `hoy a las ${hourStr}`;
    if (offset === 1) return `mañana a las ${hourStr}`;
    return `el ${DAY_NAMES[key]} a las ${hourStr}`;
  }
  return null;
}

export function evaluateAdvisorAvailability(raw: unknown, now: Date = new Date()): AdvisorAvailability {
  const schedule = parseAdvisorSchedule(raw);
  if (!schedule || !schedule.enabled) {
    return { configured: false, open: true, scheduleSummary: null, nextOpenLabel: null, customMessage: null };
  }

  const { dayKey, minutes } = caracasWeekdayAndMinutes(now);
  const todaySlot = schedule.days[dayKey];
  const startMin = todaySlot?.enabled ? timeToMinutes(todaySlot.start) : null;
  const endMin = todaySlot?.enabled ? timeToMinutes(todaySlot.end) : null;
  const open = startMin !== null && endMin !== null && minutes >= startMin && minutes < endMin;

  return {
    configured: true,
    open,
    scheduleSummary: formatScheduleSummary(schedule),
    nextOpenLabel: open ? null : findNextOpenLabel(schedule, dayKey, minutes),
    customMessage: schedule.outOfHoursMessage?.trim() || null,
  };
}

/** Construye el mensaje claro para escalados sin IA cuando los asesores están fuera de horario. */
export function buildOutOfHoursEscalationText(
  avail: AdvisorAvailability,
  kind: 'fallback' | 'long_list' | 'attachment',
): string {
  if (avail.customMessage) {
    if (kind === 'long_list') return `¡Gracias por enviarnos tu lista de materiales! ${avail.customMessage}`;
    if (kind === 'attachment') return `Recibí tu nota de voz o archivo. ${avail.customMessage}`;
    return avail.customMessage;
  }

  const when = avail.nextOpenLabel
    ? `para contactarte ${avail.nextOpenLabel}`
    : 'para contactarte al abrir';
  const scheduleBit = avail.scheduleSummary ? ` (${avail.scheduleSummary})` : '';

  if (kind === 'long_list') {
    return `¡Gracias por enviarnos tu lista de materiales! En este momento nuestros asesores están fuera de horario${scheduleBit}. Ya dejamos tu lista registrada ${when} con tu presupuesto.`;
  }
  if (kind === 'attachment') {
    return `Recibí tu nota de voz o archivo. En este momento nuestros asesores están fuera de horario${scheduleBit}. Ya dejamos tu mensaje registrado ${when}.`;
  }
  return `En este momento nuestros asesores están fuera de horario${scheduleBit}. Ya dejamos tu consulta registrada ${when}.`;
}

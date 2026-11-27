// Verificación sin jest: node apps/api/src/modules/chatbot/advisor-schedule.check.ts
import assert from 'node:assert/strict';
import {
  buildOutOfHoursEscalationText,
  defaultAdvisorSchedule,
  evaluateAdvisorAvailability,
  formatScheduleSummary,
  formatTime12h,
  validateAdvisorSchedule,
} from './advisor-schedule.ts';

// 1. Formato 12h
assert.equal(formatTime12h('08:00'), '8:00 am');
assert.equal(formatTime12h('12:00'), '12:00 pm');
assert.equal(formatTime12h('17:00'), '5:00 pm');
assert.equal(formatTime12h('00:30'), '12:30 am');

// 2. Desactivado o nulo -> siempre abierto (no afecta empresas sin configurar)
assert.deepEqual(evaluateAdvisorAvailability(null), {
  configured: false, open: true, scheduleSummary: null, nextOpenLabel: null, customMessage: null,
});
assert.equal(evaluateAdvisorAvailability(defaultAdvisorSchedule()).open, true);

// 3. Horario real del usuario: Lun-Sáb 8:00 am - 5:00 pm, Domingo apagado
const sched = { ...defaultAdvisorSchedule(), enabled: true };
assert.equal(formatScheduleSummary(sched), 'lunes a sábado de 8:00 am a 5:00 pm');

// Viernes 2026-11-27 10:30 Caracas (-04:00) -> EN HORARIO
const friMorning = evaluateAdvisorAvailability(sched, new Date('2026-11-27T10:30:00-04:00'));
assert.equal(friMorning.configured, true);
assert.equal(friMorning.open, true);
assert.equal(friMorning.nextOpenLabel, null);

// Viernes 2026-11-27 20:00 Caracas (ya es sábado 00:00 UTC!) -> FUERA DE HORARIO, vuelven mañana 8:00 am
const friNight = evaluateAdvisorAvailability(sched, new Date('2026-11-27T20:00:00-04:00'));
assert.equal(friNight.open, false);
assert.equal(friNight.nextOpenLabel, 'mañana a las 8:00 am');

// Sábado 2026-11-28 18:00 Caracas -> FUERA DE HORARIO, domingo apagado -> vuelven el lunes a las 8:00 am
const satNight = evaluateAdvisorAvailability(sched, new Date('2026-11-28T18:00:00-04:00'));
assert.equal(satNight.open, false);
assert.equal(satNight.nextOpenLabel, 'el lunes a las 8:00 am');

// Domingo 2026-11-29 11:00 Caracas -> FUERA DE HORARIO (domingo apagado) -> vuelven mañana a las 8:00 am
const sunNoon = evaluateAdvisorAvailability(sched, new Date('2026-11-29T11:00:00-04:00'));
assert.equal(sunNoon.open, false);
assert.equal(sunNoon.nextOpenLabel, 'mañana a las 8:00 am');

// Lunes 2026-11-30 07:15 Caracas -> FUERA DE HORARIO (antes de abrir) -> vuelven hoy a las 8:00 am
const monEarly = evaluateAdvisorAvailability(sched, new Date('2026-11-30T07:15:00-04:00'));
assert.equal(monEarly.open, false);
assert.equal(monEarly.nextOpenLabel, 'hoy a las 8:00 am');

// Borde exacto: 08:00 abre, 17:00 cierra
assert.equal(evaluateAdvisorAvailability(sched, new Date('2026-11-30T08:00:00-04:00')).open, true);
assert.equal(evaluateAdvisorAvailability(sched, new Date('2026-11-30T17:00:00-04:00')).open, false);

// 4. Resumen con horarios distintos por día
const mixed = {
  ...sched,
  days: { ...sched.days, sat: { enabled: true, start: '08:00', end: '13:00' }, sun: { enabled: true, start: '09:00', end: '17:00' } },
};
assert.equal(
  formatScheduleSummary(mixed),
  'lunes a viernes de 8:00 am a 5:00 pm, sábado de 8:00 am a 1:00 pm y domingo de 9:00 am a 5:00 pm',
);

// 5. Mensajes fuera de horario sin IA
const msgFallback = buildOutOfHoursEscalationText(satNight, 'fallback');
assert.ok(msgFallback.includes('fuera de horario'));
assert.ok(msgFallback.includes('el lunes a las 8:00 am'));

const customSched = { ...sched, outOfHoursMessage: 'Ahorita estamos cerrados, te escribimos mañana por WhatsApp.' };
const satCustom = evaluateAdvisorAvailability(customSched, new Date('2026-11-28T18:00:00-04:00'));
assert.equal(buildOutOfHoursEscalationText(satCustom, 'fallback'), 'Ahorita estamos cerrados, te escribimos mañana por WhatsApp.');

// 6. Validación de errores
assert.throws(() => validateAdvisorSchedule({
  enabled: true,
  days: { ...sched.days, mon: { enabled: true, start: '18:00', end: '08:00' } },
}), /inicio debe ser menor/);

console.log('advisor-schedule.check.ts OK');

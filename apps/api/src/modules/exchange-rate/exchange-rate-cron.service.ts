import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExchangeRateService } from './exchange-rate.service';
import { caracasDateKey, caracasToday } from '../../common/timezone';

/**
 * Trae la tasa del BCV automáticamente. El server corre en UTC, por eso los @Cron
 * llevan timeZone 'America/Caracas' (sin él dispararían a la hora equivocada).
 *
 * Estrategia (acordada con Diego):
 *  - BCV publica en la tarde (4-6pm) la tasa que rige AL DÍA SIGUIENTE (y por ley,
 *    la del viernes rige sáb/dom/lun). Scrapeamos a las 8pm y 10pm y la guardamos
 *    bajo la fecha de MAÑANA → a las 00:00 el POS ya tiene "la de hoy" (evita el
 *    error "registra la tasa antes de facturar") y la tienda cambia sola.
 *  - Nunca pisa una tasa MANUAL; si BCV se cae, no toca la existente (fetchAndSave).
 */
@Injectable()
export class ExchangeRateCronService {
  private readonly logger = new Logger(ExchangeRateCronService.name);

  constructor(private readonly service: ExchangeRateService) {}

  /** Fecha-clave (medianoche UTC de la fecha-Caracas) de MAÑANA. */
  private tomorrowKey(): Date {
    const tomorrowYmd = caracasToday(new Date(Date.now() + 24 * 60 * 60 * 1000));
    return caracasDateKey(tomorrowYmd);
  }

  // 8pm y 10pm Caracas: margen sobre las 4-6pm que publica BCV; el 2do intento cubre
  // si a las 8 aún no había actualizado. Ambos corren el mismo día-Caracas → misma fecha-mañana.
  @Cron('0 0 20,22 * * *', { timeZone: 'America/Caracas' })
  async scrapeForTomorrow() {
    const target = this.tomorrowKey();
    const res = await this.service.fetchAndSave(target);
    if (res) {
      this.logger.log(`Tasa BCV ${res.rate} guardada para ${target.toISOString().slice(0, 10)}`);
    } else {
      this.logger.warn('No se pudo obtener/guardar la tasa BCV (se conserva la existente)');
    }
  }

  // 7am Caracas: red de seguridad. Si HOY no tiene tasa (BCV estuvo caído anoche),
  // intenta traerla y guardarla bajo HOY para no bloquear la facturación del día.
  @Cron('0 0 7 * * *', { timeZone: 'America/Caracas' })
  async morningCatchUp() {
    const today = await this.service.getToday();
    if (today) return; // ya hay tasa de hoy
    const res = await this.service.fetchAndSave(caracasDateKey());
    if (res) {
      this.logger.log(`Catch-up matutino: tasa BCV ${res.rate} guardada para hoy`);
    } else {
      this.logger.warn('Catch-up matutino: sin tasa de hoy y BCV no respondió');
    }
  }
}

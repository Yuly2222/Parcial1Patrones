import { HttpError } from './http';

/**
 * Inyección de fallas sintéticas para DEMOSTRAR el rollback automático del
 * Canary (Fase 4, Opción A) de forma reproducible, sin tener que romper
 * lógica de negocio real a propósito cada vez que se graba la evidencia.
 *
 * CHAOS_ERROR_RATE (0-100) se define en infra/template.yaml como parámetro
 * `ChaosErrorRatePercent` -> variable de entorno de las 4 Lambdas. En
 * operación normal vale 0 (no hace nada). Para la demo: se sube (ej. 50) y
 * se hace `sam deploy` — eso publica una versión nueva, CodeDeploy le manda
 * el 10% del tráfico, una fracción de esas invocaciones falla a propósito,
 * las alarmas de CloudWatch se disparan dentro de la ventana de 5 minutos,
 * y CodeDeploy revierte el 100% del tráfico a la versión anterior solo.
 */
const CHAOS_ERROR_RATE = Number(process.env.CHAOS_ERROR_RATE ?? '0');

export function maybeInjectChaos(): void {
  if (CHAOS_ERROR_RATE <= 0) return;
  if (Math.random() * 100 < CHAOS_ERROR_RATE) {
    throw new HttpError(500, `Falla sintética inyectada (CHAOS_ERROR_RATE=${CHAOS_ERROR_RATE}) — demo de rollback`);
  }
}

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getSupabaseClient } from './shared/supabaseClient';
import { jsonResponse, parseJsonBodyOptional, withErrorHandling, HttpError } from './shared/http';
import { logger } from './shared/logger';
import { getAuthenticatedUser, requireOperador } from './shared/auth';
import type { Ciudad } from './shared/types';

interface RecalcularBody {
  ciudad?: Ciudad;
  radio_metros?: number;
  min_puntos?: number;
}

// Invocable por HTTP (API Gateway, para recálculo manual/demo) o por
// EventBridge Scheduler (invocación directa sin requestContext, para
// recalcular periódicamente en producción). El clustering en sí
// (ST_ClusterDBSCAN) vive en geospatial.recalcular_clusters (ver
// supabase/migrations) para que corra dentro de Postgres/PostGIS en vez de
// traer miles de puntos al Lambda para agruparlos en memoria.
async function recalcular(body: RecalcularBody) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.schema('geospatial').rpc('recalcular_clusters', {
    p_ciudad: body.ciudad ?? null,
    p_radio_metros: body.radio_metros ?? 500,
    p_min_puntos: body.min_puntos ?? 3,
  });

  if (error) throw new HttpError(500, error.message);

  logger.info('Clusters recalculados', { cantidad: data?.length ?? 0, ciudad: body.ciudad ?? 'todas' });
  return data;
}

export const handler = withErrorHandling(async (event: APIGatewayProxyEventV2) => {
  const esInvocacionHttp = !!event?.requestContext;

  let body: RecalcularBody;
  if (esInvocacionHttp) {
    // Invocación vía API Gateway: requiere operador (de esa ciudad) o admin.
    // La invocación programada (EventBridge Scheduler, sin requestContext) es
    // interna a la cuenta AWS y no pasa por un usuario humano autenticado.
    const usuario = await getAuthenticatedUser(event);
    body = parseJsonBodyOptional<RecalcularBody>(event);
    requireOperador(usuario, body.ciudad);
  } else {
    body = (event as unknown as RecalcularBody) ?? {};
  }

  const clusters = await recalcular(body);
  return jsonResponse(200, { clusters });
});

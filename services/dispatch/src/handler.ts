import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getSupabaseClient } from './shared/supabaseClient';
import { jsonResponse, parseJsonBody, withErrorHandling, HttpError } from './shared/http';
import { logger } from './shared/logger';
import type { EstadoDespacho } from './shared/types';

interface CrearDespachoBody {
  solicitud_id: string;
  radio_km?: number;
}

// POST /v1/despachos — asigna automáticamente la cuadrilla disponible más
// cercana a la solicitud, según disponibilidad geográfica (PostGIS). La
// selección + el "for update skip locked" viven en la función SQL
// dispatch.asignar_cuadrilla_cercana (ver supabase/migrations) para que la
// operación sea atómica bajo picos de tráfico concurrente: dos despachos
// en paralelo nunca pueden robarse la misma cuadrilla.
async function crearDespacho(event: APIGatewayProxyEventV2) {
  const body = parseJsonBody<CrearDespachoBody>(event);
  if (!body.solicitud_id) throw new HttpError(400, 'solicitud_id es obligatorio');

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.schema('dispatch').rpc('asignar_cuadrilla_cercana', {
    p_solicitud_id: body.solicitud_id,
    p_radio_km: body.radio_km ?? 50,
  });

  if (error) {
    logger.warn('No se pudo asignar despacho', { solicitud_id: body.solicitud_id, error: error.message });
    throw new HttpError(422, error.message);
  }

  logger.info('Despacho creado', { despacho: data });
  return jsonResponse(201, data);
}

const ESTADOS_VALIDOS: EstadoDespacho[] = ['en_camino', 'en_sitio', 'completado', 'cancelado'];

interface ActualizarDespachoBody {
  estado: EstadoDespacho;
  notas?: string;
}

// PATCH /v1/despachos/{id} — actualización de estado por parte del operador/cuadrilla.
async function actualizarDespacho(event: APIGatewayProxyEventV2) {
  const id = event.pathParameters?.id;
  if (!id) throw new HttpError(400, 'Falta el id del despacho en la ruta');

  const body = parseJsonBody<ActualizarDespachoBody>(event);
  if (!ESTADOS_VALIDOS.includes(body.estado)) {
    throw new HttpError(400, `estado inválido: debe ser uno de ${ESTADOS_VALIDOS.join(', ')}`);
  }

  const supabase = await getSupabaseClient();
  const patch: Record<string, unknown> = { estado: body.estado, notas: body.notas ?? null };
  if (body.estado === 'completado') patch.completado_en = new Date().toISOString();

  const { data, error } = await supabase
    .schema('dispatch')
    .from('despachos')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new HttpError(error.code === 'PGRST116' ? 404 : 500, error.message);

  // Efectos secundarios de cierre: libera la cuadrilla y marca la solicitud
  // como resuelta. Se hace en dos updates simples en vez de una función SQL
  // porque no requiere atomicidad estricta (a diferencia de la asignación).
  if (body.estado === 'completado' && data.cuadrilla_id) {
    await supabase.schema('dispatch').from('cuadrillas').update({ estado: 'disponible' }).eq('id', data.cuadrilla_id);
    await supabase.schema('intake').from('solicitudes').update({ estado: 'resuelta' }).eq('id', data.solicitud_id);
  }
  if (body.estado === 'cancelado' && data.cuadrilla_id) {
    await supabase.schema('dispatch').from('cuadrillas').update({ estado: 'disponible' }).eq('id', data.cuadrilla_id);
  }

  logger.info('Despacho actualizado', { id, estado: body.estado });
  return jsonResponse(200, data);
}

export const handler = withErrorHandling(async (event) => {
  const method = event.requestContext.http.method;
  logger.info('Solicitud entrante', { method, path: event.rawPath });

  if (method === 'POST') return crearDespacho(event);
  if (method === 'PATCH' && event.pathParameters?.id) return actualizarDespacho(event);

  throw new HttpError(404, `Ruta no soportada: ${method} ${event.rawPath}`);
});

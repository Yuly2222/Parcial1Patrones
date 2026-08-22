import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getSupabaseClient } from './shared/supabaseClient';
import { jsonResponse, parseJsonBody, withErrorHandling, HttpError } from './shared/http';
import { logger } from './shared/logger';
import { getAuthenticatedUser, requireOperador } from './shared/auth';
import { CIUDADES, TIPOS_SOLICITUD, type Ciudad, type TipoSolicitud } from './shared/types';

interface CrearSolicitudBody {
  tipo: TipoSolicitud;
  ciudad: Ciudad;
  latitud: number;
  longitud: number;
  descripcion?: string;
  datos_criticos: Record<string, unknown>;
}

function validar(body: CrearSolicitudBody): void {
  if (!TIPOS_SOLICITUD.includes(body.tipo)) {
    throw new HttpError(400, `tipo inválido: debe ser uno de ${TIPOS_SOLICITUD.join(', ')}`);
  }
  if (!CIUDADES.includes(body.ciudad)) {
    throw new HttpError(400, `ciudad inválida: debe ser una de ${CIUDADES.join(', ')}`);
  }
  if (typeof body.latitud !== 'number' || typeof body.longitud !== 'number') {
    throw new HttpError(400, 'latitud y longitud son obligatorias y deben ser numéricas');
  }
  if (!body.datos_criticos || typeof body.datos_criticos !== 'object') {
    throw new HttpError(400, 'datos_criticos es obligatorio (objeto con los campos según el tipo)');
  }
}

// POST /v1/emergencias — recepción masiva de reportes ciudadanos.
// La validación de integridad de payload y el cálculo determinístico de
// severidad viven en el trigger intake.aplicar_reglas_triage() (Fase 1);
// aquí solo se valida la forma básica de la solicitud HTTP antes de tocar la DB.
async function crearSolicitud(event: APIGatewayProxyEventV2) {
  // solicitante_id NUNCA viene del body: se toma del JWT verificado para que
  // nadie pueda radicar una emergencia suplantando a otro ciudadano.
  const usuario = await getAuthenticatedUser(event);
  const body = parseJsonBody<CrearSolicitudBody>(event);
  validar(body);

  const supabase = await getSupabaseClient();

  // geography(Point,4326) acepta EWKT como texto de entrada vía PostgREST.
  const ubicacionEwkt = `SRID=4326;POINT(${body.longitud} ${body.latitud})`;

  const { data, error } = await supabase
    .schema('intake')
    .from('solicitudes')
    .insert({
      tipo: body.tipo,
      ciudad: body.ciudad,
      ubicacion: ubicacionEwkt,
      solicitante_id: usuario.id,
      descripcion: body.descripcion ?? null,
      datos_criticos: body.datos_criticos,
    })
    .select()
    .single();

  if (error) {
    logger.error('Error al insertar solicitud', error, { tipo: body.tipo, ciudad: body.ciudad });
    // 23514 = check constraint / payload incompleto (validado por el trigger de Fase 1)
    throw new HttpError(error.code === '23514' ? 422 : 500, error.message);
  }

  logger.info('Solicitud creada', {
    id: data.id,
    tipo: data.tipo,
    prioridad: data.prioridad,
    estado: data.estado,
  });

  return jsonResponse(201, data);
}

// GET /v1/emergencias/zona/{ciudad} — listado para el panel de operadores.
async function listarPorCiudad(event: APIGatewayProxyEventV2) {
  const ciudad = event.pathParameters?.ciudad as Ciudad | undefined;
  if (!ciudad || !CIUDADES.includes(ciudad)) {
    throw new HttpError(400, `ciudad inválida: debe ser una de ${CIUDADES.join(', ')}`);
  }

  const usuario = await getAuthenticatedUser(event);
  requireOperador(usuario, ciudad);

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .schema('intake')
    .from('solicitudes')
    .select('*')
    .eq('ciudad', ciudad)
    .order('prioridad', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new HttpError(500, error.message);
  return jsonResponse(200, data);
}

export const handler = withErrorHandling(async (event) => {
  const method = event.requestContext.http.method;
  logger.info('Solicitud entrante', { method, path: event.rawPath });

  if (method === 'POST') return crearSolicitud(event);
  if (method === 'GET' && event.pathParameters?.ciudad) return listarPorCiudad(event);

  throw new HttpError(404, `Ruta no soportada: ${method} ${event.rawPath}`);
});

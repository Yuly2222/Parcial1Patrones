import crypto from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getSupabaseClient } from './shared/supabaseClient';
import { jsonResponse, parseJsonBody, withErrorHandling, HttpError } from './shared/http';
import { logger } from './shared/logger';
import { getSecret } from './shared/config';

// Puntero no sensible; el contenido real vive en Secrets Manager.
const NOTIFICATION_SECRET_ID = process.env.NOTIFICATION_SECRET_ID ?? 'emergencias/prod/notification';
const INBOUND_HEADER = 'x-supabase-webhook-secret';

interface WebhookPayloadSupabase {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, any>;
  old_record?: Record<string, any>;
}

// Verifica que la solicitud entrante realmente venga del Database Webhook de
// Supabase (configurado con un header custom), no de un tercero adivinando la URL.
async function verificarOrigen(event: APIGatewayProxyEventV2): Promise<void> {
  const secret = await getSecret(NOTIFICATION_SECRET_ID);
  const esperado = secret['inbound_webhook_secret'] as string | undefined;
  const recibido = event.headers?.[INBOUND_HEADER] ?? event.headers?.[INBOUND_HEADER.toLowerCase()];

  if (!esperado || recibido !== esperado) {
    throw new HttpError(401, 'Firma de webhook entrante inválida');
  }
}

async function firmarPayload(payload: string): Promise<string> {
  const secret = await getSecret(NOTIFICATION_SECRET_ID);
  const signingSecret = secret['webhook_signing_secret'] as string;
  return crypto.createHmac('sha256', signingSecret).update(payload).digest('hex');
}

// POST /v1/notificaciones/eventos — recibe el Database Webhook de Supabase
// sobre intake.solicitudes (INSERT/UPDATE) y reenvía (fan-out firmado) a los
// organismos suscritos por ciudad. NOTA: dispatch.despachos no tiene columna
// `ciudad` propia (ver Fase 1); si se conecta un webhook sobre despachos,
// el filtrado por ciudad queda fuera de alcance de este entregable (habría
// que unir con intake.solicitudes).
async function despacharEvento(event: APIGatewayProxyEventV2) {
  await verificarOrigen(event);

  const payload = parseJsonBody<WebhookPayloadSupabase>(event);
  const { record, table, type } = payload;
  const ciudad = record?.ciudad ?? null;

  const supabase = await getSupabaseClient();

  const { data: suscripciones, error } = await supabase
    .schema('notification')
    .from('suscripciones')
    .select('*')
    .eq('activo', true)
    .or(ciudad ? `ciudad.eq.${ciudad},ciudad.is.null` : 'ciudad.is.null');

  if (error) throw new HttpError(500, error.message);

  const suscripcionesWebhook = (suscripciones ?? []).filter((s) => s.canal === 'webhook');

  const cuerpo = JSON.stringify({
    evento: `${table}.${type.toLowerCase()}`,
    data: record,
    emitido_en: new Date().toISOString(),
  });
  const firma = await firmarPayload(cuerpo);

  const resultados = await Promise.allSettled(
    suscripcionesWebhook.map((s) =>
      fetch(s.destino, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emergencias-Signature': firma },
        body: cuerpo,
      })
    )
  );

  const eventosBitacora = suscripcionesWebhook.map((s, i) => ({
    solicitud_id: table === 'solicitudes' ? record.id : (record.solicitud_id ?? null),
    tipo_evento: `${table}.${type.toLowerCase()}`,
    payload: record,
    estado: resultados[i]?.status === 'fulfilled' ? 'enviado' : 'fallido',
    enviado_en: new Date().toISOString(),
  }));

  if (eventosBitacora.length > 0) {
    await supabase.schema('notification').from('eventos').insert(eventosBitacora);
  }

  logger.info('Broadcast de notificación completado', {
    tabla: table,
    tipo: type,
    suscriptores: suscripcionesWebhook.length,
  });

  return jsonResponse(200, { notificados: suscripcionesWebhook.length });
}

export const handler = withErrorHandling(despacharEvento);

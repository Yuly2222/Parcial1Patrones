import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { logger } from './logger';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? 'https://TU-APP.vercel.app',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
};

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

function decodeBody(event: APIGatewayProxyEventV2): string | null {
  if (!event.body) return null;
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
}

/** Body obligatorio: lanza 400 si falta o no es JSON válido. */
export function parseJsonBody<T>(event: APIGatewayProxyEventV2): T {
  const raw = decodeBody(event);
  if (!raw) throw new HttpError(400, 'El cuerpo de la solicitud está vacío');
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'El cuerpo de la solicitud no es JSON válido');
  }
}

/** Body opcional: devuelve {} si no viene body (útil para endpoints tipo "trigger"). */
export function parseJsonBodyOptional<T>(event: APIGatewayProxyEventV2): Partial<T> {
  const raw = decodeBody(event);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Partial<T>;
  } catch {
    throw new HttpError(400, 'El cuerpo de la solicitud no es JSON válido');
  }
}

type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>;

/** Envoltura de manejo de errores centralizado: nunca deja escapar un stack trace al cliente. */
export function withErrorHandling(handler: Handler): Handler {
  return async (event) => {
    if (event.requestContext?.http?.method === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    try {
      return await handler(event);
    } catch (error) {
      if (error instanceof HttpError) {
        logger.warn(error.message, { statusCode: error.statusCode, path: event.rawPath });
        return jsonResponse(error.statusCode, { error: error.message });
      }
      logger.error('Error no controlado', error, { path: event.rawPath });
      return jsonResponse(500, { error: 'Error interno del servidor' });
    }
  };
}

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getSupabaseClient } from './supabaseClient';
import { HttpError } from './http';

/**
 * Autenticación/autorización de llamadas HTTP entrantes desde el frontend
 * (Fase 3). El backend usa la Service Role Key y por lo tanto NO pasa por
 * RLS (Fase 1) — RLS protege el acceso directo Supabase<->frontend, pero el
 * tráfico frontend->API Gateway->Lambda debe validar el JWT y el rol por su
 * cuenta. Sin esto, cualquiera podría enviar un `solicitante_id` ajeno en
 * el body y suplantar a otro ciudadano.
 */

export interface AuthenticatedUser {
  id: string;
  rol: 'ciudadano' | 'operador' | 'admin';
  ciudadAsignada: string | null;
}

function extraerToken(event: APIGatewayProxyEventV2): string {
  const header = event.headers?.authorization ?? event.headers?.Authorization;
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Falta el header Authorization: Bearer <token>');
  return token;
}

export async function getAuthenticatedUser(event: APIGatewayProxyEventV2): Promise<AuthenticatedUser> {
  const token = extraerToken(event);
  const supabase = await getSupabaseClient();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new HttpError(401, 'Token inválido o expirado');
  }

  const { data: profile, error: profileError } = await supabase
    .schema('core')
    .from('profiles')
    .select('rol, ciudad_asignada')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    throw new HttpError(403, 'El usuario autenticado no tiene un perfil registrado en core.profiles');
  }

  return { id: userData.user.id, rol: profile.rol, ciudadAsignada: profile.ciudad_asignada };
}

/** Exige rol operador (de la ciudad indicada) o admin. */
export function requireOperador(user: AuthenticatedUser, ciudad?: string): void {
  if (user.rol === 'admin') return;
  if (user.rol !== 'operador') {
    throw new HttpError(403, 'Esta acción requiere rol de operador o admin');
  }
  if (ciudad && user.ciudadAsignada !== ciudad) {
    throw new HttpError(403, `El operador no está asignado a ${ciudad}`);
  }
}

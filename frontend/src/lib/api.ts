import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('No hay sesión activa');
  return { Authorization: `Bearer ${token}` };
}

/** Llama al API Gateway (Fase 3) con el JWT de la sesión actual de Supabase. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE_URL) throw new Error('Falta VITE_API_BASE_URL');

  const headers = { 'Content-Type': 'application/json', ...(await authHeader()), ...(init.headers ?? {}) };
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    // El formulario del ciudadano trata cualquier falla como "sin conexión" para no
    // asustar a alguien reportando una emergencia real — este log es solo para que
    // quien esté probando/depurando vea la causa real (CORS, 500, etc.) en la consola.
    console.error(`[apiFetch] ${path} -> ${response.status}`, body.error ?? '(sin cuerpo)');
    throw new Error(body.error ?? `Error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

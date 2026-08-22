import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadCommonConfig } from './config';

// Singleton a nivel de módulo: se crea una sola vez por cold-start y se
// reutiliza en invocaciones "warm" del mismo contenedor Lambda.
let client: SupabaseClient | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (client) return client;

  const { supabaseUrl, supabaseServiceRoleKey } = await loadCommonConfig();

  // Service Role Key: solo vive server-side (Lambda), leída desde Secrets
  // Manager. Bypassa RLS por diseño — cada microservicio queda a cargo de
  // aplicar sus propias reglas de negocio, ya que RLS (Fase 1) gobierna el
  // acceso directo desde el frontend (Vercel), no el tráfico backend-a-backend.
  client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

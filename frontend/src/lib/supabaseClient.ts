import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Configúralas en Vercel (Project Settings > Environment Variables) o en .env.local para desarrollo. ' +
      'NUNCA la service_role key aquí — solo la clave pública "anon".'
  );
}

// Cliente público: solo la anon key + el JWT de sesión del usuario. Todo lo
// que este cliente puede leer/escribir está gobernado por RLS (Fase 1).
export const supabase = createClient(url, anonKey);

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export interface Perfil {
  id: string;
  rol: 'ciudadano' | 'operador' | 'admin';
  ciudad_asignada: string | null;
}

/**
 * Lee el perfil (core.profiles) del usuario autenticado. Si es un ciudadano
 * anónimo entrando por primera vez, crea su fila de perfil (RLS de Fase 1
 * permite insert donde id = auth.uid()).
 */
export function useProfile(session: Session | null) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!session) {
      setPerfil(null);
      setCargando(false);
      return;
    }

    let cancelado = false;

    (async () => {
      setCargando(true);
      const { data, error } = await supabase
        .schema('core')
        .from('profiles')
        .select('id, rol, ciudad_asignada')
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelado) return;

      if (!error && data) {
        setPerfil(data as Perfil);
      } else if (session.user.is_anonymous) {
        const { data: nuevo } = await supabase
          .schema('core')
          .from('profiles')
          .insert({ id: session.user.id, rol: 'ciudadano' })
          .select('id, rol, ciudad_asignada')
          .single();
        if (!cancelado) setPerfil((nuevo as Perfil) ?? null);
      }

      if (!cancelado) setCargando(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [session]);

  return { perfil, cargando };
}

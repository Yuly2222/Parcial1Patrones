import { Suspense, lazy } from 'react';
import { useAuth } from './hooks/useAuth';
import { useProfile } from './hooks/useProfile';
import { Login } from './components/Login';
import { CiudadanoForm } from './components/CiudadanoForm';
import { supabase } from './lib/supabaseClient';

// Leaflet/react-leaflet solo lo necesita el operador (panel de mando). Se
// separa en su propio chunk para que el formulario del ciudadano — el que
// de verdad se usa en redes degradadas, según el enunciado — no pague ese
// peso de bundle.
const OperadorDashboard = lazy(() =>
  import('./components/OperadorDashboard').then((m) => ({ default: m.OperadorDashboard }))
);

export default function App() {
  const { session, cargando: cargandoSesion } = useAuth();
  const { perfil, cargando: cargandoPerfil } = useProfile(session);

  if (cargandoSesion || (session && cargandoPerfil)) {
    return <div className="pantalla-carga">Cargando…</div>;
  }

  if (!session || !perfil) {
    return <Login />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span>
          Emergencias 2026 · {perfil.rol === 'ciudadano' ? 'Ciudadano' : `Operador (${perfil.ciudad_asignada ?? 'admin'})`}
        </span>
        <button className="boton-link" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </header>
      <main>
        {perfil.rol === 'ciudadano' ? (
          <CiudadanoForm />
        ) : (
          <Suspense fallback={<div className="pantalla-carga">Cargando panel…</div>}>
            <OperadorDashboard perfil={perfil} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

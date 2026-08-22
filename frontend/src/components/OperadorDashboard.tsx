import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { supabase } from '../lib/supabaseClient';
import { apiFetch } from '../lib/api';
import type { Perfil } from '../hooks/useProfile';
import type { Ciudad, Solicitud } from '../lib/types';
import '../lib/leafletIconFix';
import 'leaflet/dist/leaflet.css';

const CENTROS: Record<Ciudad, [number, number]> = {
  Chocó: [5.6947, -76.6413],
  Pereira: [4.8133, -75.6961],
  Cali: [3.4516, -76.532],
  Manizales: [5.0689, -75.5174],
};

const COLOR_PRIORIDAD: Record<string, string> = {
  P1: '#c0392b',
  P2: '#e67e22',
  P3: '#f1c40f',
  P4: '#3498db',
};

const ESTADOS_CERRADOS = ['resuelta', 'cancelada', 'duplicada'];

function coordsDe(solicitud: Solicitud): [number, number] | null {
  const geo = solicitud.ubicacion;
  if (typeof geo === 'object' && geo?.coordinates) {
    return [geo.coordinates[1], geo.coordinates[0]];
  }
  return null;
}

export function OperadorDashboard({ perfil }: { perfil: Perfil }) {
  const ciudad: Ciudad = (perfil.rol === 'admin' ? 'Cali' : perfil.ciudad_asignada) as Ciudad;
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    apiFetch<Solicitud[]>(`/v1/emergencias/zona/${encodeURIComponent(ciudad)}`)
      .then((data) => activo && setSolicitudes(data))
      .catch((err) => activo && setError(err instanceof Error ? err.message : 'Error al cargar solicitudes'))
      .finally(() => activo && setCargando(false));

    // Realtime (Fase 1): el panel se actualiza solo, sin polling.
    const canal = supabase
      .channel(`solicitudes-${ciudad}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'intake', table: 'solicitudes', filter: `ciudad=eq.${ciudad}` },
        (payload) => {
          const nueva = payload.new as Solicitud;
          if (payload.eventType === 'DELETE' || !nueva) return;
          setSolicitudes((prev) => [nueva, ...prev.filter((s) => s.id !== nueva.id)]);
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [ciudad]);

  async function despachar(id: string) {
    try {
      await apiFetch('/v1/despachos', { method: 'POST', body: JSON.stringify({ solicitud_id: id }) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo despachar');
    }
  }

  const activas = useMemo(
    () =>
      solicitudes
        .filter((s) => !ESTADOS_CERRADOS.includes(s.estado))
        .sort((a, b) => a.prioridad.localeCompare(b.prioridad)),
    [solicitudes]
  );

  if (!ciudad) {
    return <p className="mensaje-error">Tu perfil de operador no tiene ciudad asignada.</p>;
  }

  return (
    <div className="dashboard">
      <aside className="lista-solicitudes">
        <h2>
          {ciudad} — {activas.length} activas
        </h2>
        {cargando && <p>Cargando…</p>}
        {error && <p className="mensaje-error">{error}</p>}
        <ul>
          {activas.map((s) => (
            <li key={s.id} style={{ borderLeftColor: COLOR_PRIORIDAD[s.prioridad] }}>
              <div className="linea-titulo">
                <strong>{s.prioridad}</strong> · {s.tipo} · {s.estado}
              </div>
              {s.descripcion && <p>{s.descripcion}</p>}
              {(s.estado === 'recibida' || s.estado === 'en_triage') && (
                <button onClick={() => despachar(s.id)}>Despachar cuadrilla</button>
              )}
            </li>
          ))}
          {!cargando && activas.length === 0 && <li className="vacio">Sin solicitudes activas</li>}
        </ul>
      </aside>

      <MapContainer center={CENTROS[ciudad]} zoom={12} className="mapa">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {activas.map((s) => {
          const coords = coordsDe(s);
          if (!coords) return null;
          return (
            <Marker key={s.id} position={coords}>
              <Popup>
                <strong>{s.prioridad}</strong> · {s.tipo}
                <br />
                {s.descripcion}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

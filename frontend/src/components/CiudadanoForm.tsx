import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api';
import { encolar, obtenerPendientes, reintentarCola } from '../lib/offlineQueue';
import { obtenerUbicacion } from '../lib/geolocation';
import { CIUDADES, TIPOS_SOLICITUD, type Ciudad, type TipoSolicitud } from '../lib/types';

type Estado = 'idle' | 'enviando' | 'enviado' | 'encolado' | 'error';

async function enviarAlBackend(payload: Record<string, unknown>): Promise<unknown> {
  return apiFetch('/v1/emergencias', { method: 'POST', body: JSON.stringify(payload) });
}

export function CiudadanoForm() {
  const [tipo, setTipo] = useState<TipoSolicitud>('usar_rescate');
  const [ciudad, setCiudad] = useState<Ciudad>('Chocó');
  const [descripcion, setDescripcion] = useState('');
  const [camposTipo, setCamposTipo] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<Estado>('idle');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState(obtenerPendientes().length);

  useEffect(() => {
    const flush = () => reintentarCola(enviarAlBackend).then(() => setPendientes(obtenerPendientes().length));
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  function campo(clave: string, etiqueta: string, placeholder?: string) {
    return (
      <label key={clave}>
        {etiqueta}
        <input
          value={camposTipo[clave] ?? ''}
          placeholder={placeholder}
          onChange={(e) => setCamposTipo((prev) => ({ ...prev, [clave]: e.target.value }))}
          required
        />
      </label>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEstado('enviando');
    setMensaje(null);

    try {
      const { lat, lng } = await obtenerUbicacion();
      const payload = {
        tipo,
        ciudad,
        latitud: lat,
        longitud: lng,
        descripcion: descripcion || undefined,
        datos_criticos: camposTipo,
      };

      try {
        await enviarAlBackend(payload);
        setEstado('enviado');
        setMensaje('Reporte enviado. Un organismo de socorro lo atenderá según su prioridad.');
        setCamposTipo({});
        setDescripcion('');
      } catch {
        encolar(payload);
        setPendientes(obtenerPendientes().length);
        setEstado('encolado');
        setMensaje('Sin conexión: tu reporte quedó guardado en este dispositivo y se enviará solo cuando vuelva la señal.');
      }
    } catch (err) {
      setEstado('error');
      setMensaje(err instanceof Error ? err.message : 'No se pudo obtener tu ubicación');
    }
  }

  return (
    <div className="ciudadano-form">
      {pendientes > 0 && (
        <div className="banner-offline">{pendientes} reporte(s) pendientes de envío (sin conexión)</div>
      )}

      <form onSubmit={onSubmit} className="tarjeta">
        <label>
          Tipo de emergencia
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSolicitud)}>
            {TIPOS_SOLICITUD.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Ciudad
          <select value={ciudad} onChange={(e) => setCiudad(e.target.value as Ciudad)}>
            {CIUDADES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {tipo === 'usar_rescate' && [
          campo('personas_afectadas', 'Personas atrapadas/heridas', 'ej. 3 personas'),
          campo('condiciones_riesgo', 'Condiciones de riesgo', 'ej. fuga de gas, fuego'),
        ]}
        {tipo === 'albergue' && [
          campo('conteo_damnificados', 'Damnificados', 'ej. 2 adultos, 1 niño'),
          campo('estado_habitabilidad', 'Estado de habitabilidad', 'ej. no habitable'),
        ]}
        {tipo === 'suministros' && campo('categoria_insumo', 'Insumo necesitado', 'ej. agua potable')}
        {tipo === 'evaluacion_danos' && [
          campo('tipo_edificacion', 'Tipo de edificación', 'ej. vivienda de 2 pisos'),
          campo('nivel_agrietamiento', 'Nivel de agrietamiento', 'ej. grietas visibles en muros'),
        ]}

        <label>
          Descripción adicional (opcional)
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
        </label>

        <button type="submit" disabled={estado === 'enviando'}>
          {estado === 'enviando' ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </form>

      {mensaje && <p className={`mensaje mensaje-${estado}`}>{mensaje}</p>}
    </div>
  );
}

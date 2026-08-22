export type Ciudad = 'Chocó' | 'Pereira' | 'Cali' | 'Manizales';

export const CIUDADES: Ciudad[] = ['Chocó', 'Pereira', 'Cali', 'Manizales'];

export type TipoSolicitud = 'usar_rescate' | 'albergue' | 'suministros' | 'evaluacion_danos';

export const TIPOS_SOLICITUD: { value: TipoSolicitud; label: string }[] = [
  { value: 'usar_rescate', label: 'Búsqueda y Rescate / Emergencia Médica' },
  { value: 'albergue', label: 'Albergue y Refugio Temporal' },
  { value: 'suministros', label: 'Suministros Básicos y Asistencia Humanitaria' },
  { value: 'evaluacion_danos', label: 'Evaluación de Daños Estructurales' },
];

export type Prioridad = 'P1' | 'P2' | 'P3' | 'P4';

export type EstadoSolicitud =
  | 'recibida'
  | 'en_triage'
  | 'despachada'
  | 'en_atencion'
  | 'resuelta'
  | 'cancelada'
  | 'duplicada';

export interface UbicacionGeoJson {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface Solicitud {
  id: string;
  tipo: TipoSolicitud;
  prioridad: Prioridad;
  estado: EstadoSolicitud;
  ciudad: Ciudad;
  ubicacion: UbicacionGeoJson | string;
  descripcion: string | null;
  datos_criticos: Record<string, unknown>;
  created_at: string;
}

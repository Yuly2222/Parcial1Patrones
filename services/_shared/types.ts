export type Ciudad = 'Chocó' | 'Pereira' | 'Cali' | 'Manizales';

export const CIUDADES: Ciudad[] = ['Chocó', 'Pereira', 'Cali', 'Manizales'];

export type TipoSolicitud = 'usar_rescate' | 'albergue' | 'suministros' | 'evaluacion_danos';

export const TIPOS_SOLICITUD: TipoSolicitud[] = [
  'usar_rescate',
  'albergue',
  'suministros',
  'evaluacion_danos',
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

export interface Solicitud {
  id: string;
  tipo: TipoSolicitud;
  prioridad: Prioridad;
  estado: EstadoSolicitud;
  ciudad: Ciudad;
  ubicacion: unknown;
  solicitante_id: string;
  descripcion?: string;
  datos_criticos: Record<string, unknown>;
  created_at: string;
}

export type EstadoDespacho = 'asignado' | 'en_camino' | 'en_sitio' | 'completado' | 'cancelado';

export interface Despacho {
  id: string;
  solicitud_id: string;
  cuadrilla_id: string | null;
  estado: EstadoDespacho;
  distancia_km: number | null;
  asignado_en: string;
  completado_en: string | null;
  notas: string | null;
}

// Cola offline-first (4.4 del enunciado): si el envío falla (sin señal,
// típico en zonas afectadas), el reporte se guarda en localStorage y se
// reintenta solo al recuperar conexión — el ciudadano no pierde su reporte.
const QUEUE_KEY = 'emergencias:cola_offline';

export interface SolicitudPendiente {
  id: string;
  payload: Record<string, unknown>;
  creado_en: string;
}

function leerCola(): SolicitudPendiente[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function guardarCola(cola: SolicitudPendiente[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(cola));
}

export function encolar(payload: Record<string, unknown>): void {
  const cola = leerCola();
  cola.push({ id: crypto.randomUUID(), payload, creado_en: new Date().toISOString() });
  guardarCola(cola);
}

export function obtenerPendientes(): SolicitudPendiente[] {
  return leerCola();
}

function quitarDeCola(id: string): void {
  guardarCola(leerCola().filter((item) => item.id !== id));
}

/** Reintenta uno por uno; se detiene en el primer fallo (probablemente seguimos sin señal). */
export async function reintentarCola(enviar: (payload: Record<string, unknown>) => Promise<unknown>): Promise<void> {
  for (const item of leerCola()) {
    try {
      await enviar(item.payload);
      quitarDeCola(item.id);
    } catch {
      break;
    }
  }
}

type LogMeta = Record<string, unknown>;

function write(level: string, message: string, meta: LogMeta = {}): void {
  // Log JSON estructurado a stdout -> capturado automáticamente por CloudWatch Logs.
  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...meta }));
}

export const logger = {
  info: (message: string, meta?: LogMeta) => write('INFO', message, meta),
  warn: (message: string, meta?: LogMeta) => write('WARN', message, meta),
  error: (message: string, error?: unknown, meta?: LogMeta) =>
    write('ERROR', message, {
      ...meta,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
    }),
};

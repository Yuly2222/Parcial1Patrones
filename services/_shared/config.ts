import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from './logger';

/**
 * Cliente de configuración/secretos dinámicos (objetivo 4.5 del taller):
 * cero .env con valores sensibles en el repo. Los únicos "env vars" que este
 * módulo lee son PUNTEROS no sensibles (una ruta de SSM, un nombre de
 * secreto) — nunca la credencial en sí. Todo el contenido real se resuelve
 * en tiempo de cold-start contra SSM Parameter Store / Secrets Manager, y
 * se cachea en memoria del contenedor para no pagar esa latencia en cada
 * invocación (patrón estándar de Lambda).
 */

const REGION = process.env.AWS_REGION ?? 'us-east-1';
const CACHE_TTL_MS = 5 * 60 * 1000;

const ssm = new SSMClient({ region: REGION });
const secretsManager = new SecretsManagerClient({ region: REGION });

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

let paramsCache: CacheEntry<Record<string, string>> | null = null;
const secretsCache = new Map<string, CacheEntry<Record<string, unknown>>>();

function isFresh(entry: CacheEntry<unknown> | null | undefined): boolean {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export async function getParamsByPath(path: string): Promise<Record<string, string>> {
  if (isFresh(paramsCache)) return paramsCache!.value;

  const result: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const response = await ssm.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      })
    );
    for (const param of response.Parameters ?? []) {
      const key = param.Name?.split('/').pop();
      if (key) result[key] = param.Value ?? '';
    }
    nextToken = response.NextToken;
  } while (nextToken);

  paramsCache = { value: result, fetchedAt: Date.now() };
  logger.info('Parámetros de SSM recargados', { path, claves: Object.keys(result) });
  return result;
}

export async function getSecret(secretId: string): Promise<Record<string, unknown>> {
  const cached = secretsCache.get(secretId);
  if (isFresh(cached)) return cached!.value;

  const response = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretId }));
  const value = response.SecretString ? JSON.parse(response.SecretString) : {};
  secretsCache.set(secretId, { value, fetchedAt: Date.now() });
  logger.info('Secreto recargado desde Secrets Manager', { secretId });
  return value;
}

export interface CommonConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

// Punteros por defecto (no sensibles). Se pueden sobreescribir con env vars
// del propio Lambda si el equipo prefiere otra convención de nombres/rutas.
const PARAM_PREFIX = process.env.CONFIG_PATH ?? '/emergencias/prod/common';
const SUPABASE_SECRET_ID = process.env.SUPABASE_SECRET_ID ?? 'emergencias/prod/supabase';

export async function loadCommonConfig(): Promise<CommonConfig> {
  const [params, secret] = await Promise.all([
    getParamsByPath(PARAM_PREFIX),
    getSecret(SUPABASE_SECRET_ID),
  ]);

  const supabaseUrl = params['supabase_url'];
  const supabaseServiceRoleKey = secret['service_role_key'] as string | undefined;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      `Configuración incompleta: falta "supabase_url" en SSM (${PARAM_PREFIX}) o ` +
        `"service_role_key" en Secrets Manager (${SUPABASE_SECRET_ID})`
    );
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

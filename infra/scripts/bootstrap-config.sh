#!/usr/bin/env bash
# Crea en SSM Parameter Store / Secrets Manager la configuración y los
# secretos que los 4 Lambdas leen en runtime (objetivo 4.5 del taller:
# cero secretos en el repo). Ejecutar UNA vez por ambiente.
#
# Uso (los valores sensibles se pasan por variables de entorno, nunca como
# argumento de línea de comandos, para que no queden en el historial de shell):
#
#   export SUPABASE_URL="https://xxxx.supabase.co"
#   export SUPABASE_SERVICE_ROLE_KEY="ey..."
#   export WEBHOOK_SIGNING_SECRET="$(openssl rand -hex 32)"
#   export INBOUND_WEBHOOK_SECRET="$(openssl rand -hex 32)"
#   AWS_REGION=us-east-1 ./infra/scripts/bootstrap-config.sh

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"

: "${SUPABASE_URL:?Falta SUPABASE_URL en el entorno}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Falta SUPABASE_SERVICE_ROLE_KEY en el entorno}"
: "${WEBHOOK_SIGNING_SECRET:?Falta WEBHOOK_SIGNING_SECRET en el entorno (ej. openssl rand -hex 32)}"
: "${INBOUND_WEBHOOK_SECRET:?Falta INBOUND_WEBHOOK_SECRET en el entorno (ej. openssl rand -hex 32)}"

echo "==> Parámetros no sensibles (SSM Parameter Store)"

aws ssm put-parameter --region "${AWS_REGION}" \
  --name "/emergencias/prod/common/supabase_url" \
  --type "String" --overwrite --value "${SUPABASE_URL}"

aws ssm put-parameter --region "${AWS_REGION}" \
  --name "/emergencias/prod/geospatial/cluster_radius_meters" \
  --type "String" --overwrite --value "500"

aws ssm put-parameter --region "${AWS_REGION}" \
  --name "/emergencias/prod/geospatial/cluster_min_points" \
  --type "String" --overwrite --value "3"

echo "==> Secretos (Secrets Manager)"

upsert_secret() {
  local name="$1" value="$2"
  if aws secretsmanager describe-secret --region "${AWS_REGION}" --secret-id "${name}" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --region "${AWS_REGION}" --secret-id "${name}" --secret-string "${value}" >/dev/null
  else
    aws secretsmanager create-secret --region "${AWS_REGION}" --name "${name}" --secret-string "${value}" >/dev/null
  fi
  echo "  - ${name} listo"
}

upsert_secret "emergencias/prod/supabase" \
  "$(printf '{"service_role_key":"%s"}' "${SUPABASE_SERVICE_ROLE_KEY}")"

upsert_secret "emergencias/prod/notification" \
  "$(printf '{"webhook_signing_secret":"%s","inbound_webhook_secret":"%s"}' \
     "${WEBHOOK_SIGNING_SECRET}" "${INBOUND_WEBHOOK_SECRET}")"

echo "==> Listo. Recuerda: INBOUND_WEBHOOK_SECRET es el valor que va en el"
echo "    header 'x-supabase-webhook-secret' al configurar el Database Webhook"
echo "    de Supabase apuntando al endpoint del Service 4 (Fase 3)."

#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IAM_DIR="${SCRIPT_DIR}/../iam"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "Cuenta AWS: ${ACCOUNT_ID} · Región: ${AWS_REGION}"

SERVICES=(intake-triage dispatch geospatial notification)

for service in "${SERVICES[@]}"; do
  role_name="emergencias-${service}-role"
  policy_file="${IAM_DIR}/${service}-policy.json"
  rendered_file="$(mktemp)"

  sed -e "s/{{REGION}}/${AWS_REGION}/g" -e "s/{{ACCOUNT_ID}}/${ACCOUNT_ID}/g" \
    "${policy_file}" > "${rendered_file}"

  if aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    echo "==> ${role_name} ya existe, actualizando policy"
  else
    echo "==> Creando ${role_name}"
    aws iam create-role --role-name "${role_name}" \
      --assume-role-policy-document "file://${IAM_DIR}/trust-policy-lambda.json" >/dev/null
  fi

  aws iam put-role-policy --role-name "${role_name}" \
    --policy-name least-privilege \
    --policy-document "file://${rendered_file}" >/dev/null

  rm -f "${rendered_file}"

  arn="arn:aws:iam::${ACCOUNT_ID}:role/${role_name}"
  echo "    ARN: ${arn}"
done

echo
echo "==> Los 4 roles están listos. Guarda estos ARNs para el 'sam deploy' (parámetros *RoleArn):"
for service in "${SERVICES[@]}"; do
  echo "  ${service}: arn:aws:iam::${ACCOUNT_ID}:role/emergencias-${service}-role"
done

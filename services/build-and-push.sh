#!/usr/bin/env bash
# Construye las 4 imágenes OCI y las publica en Amazon ECR.
# Requiere: Docker corriendo, AWS CLI configurado con permisos de ECR.
#
# Uso:
#   AWS_REGION=us-east-1 ./build-and-push.sh
#   ./build-and-push.sh intake-triage        # una sola imagen

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
SERVICES=(intake-triage dispatch geospatial notification)
TARGETS=("${@:-${SERVICES[@]}}")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Cuenta AWS: ${ACCOUNT_ID} · Región: ${AWS_REGION}"
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${REGISTRY}"

for service in "${TARGETS[@]}"; do
  repo="emergencias/${service}"

  aws ecr describe-repositories --repository-names "${repo}" --region "${AWS_REGION}" >/dev/null 2>&1 || \
    aws ecr create-repository --repository-name "${repo}" --region "${AWS_REGION}" \
      --image-scanning-configuration scanOnPush=true >/dev/null

  tag="${REGISTRY}/${repo}:$(git -C "${SCRIPT_DIR}/.." rev-parse --short HEAD 2>/dev/null || date +%s)"

  echo "==> Construyendo ${service} -> ${tag}"
  docker build --provenance=false --sbom=false -f "${SCRIPT_DIR}/${service}/Dockerfile" -t "${tag}" -t "${REGISTRY}/${repo}:latest" "${SCRIPT_DIR}"

  echo "==> Publicando ${service}"
  docker push "${tag}"
  docker push "${REGISTRY}/${repo}:latest"

  echo "==> ${service} publicado en ${tag}"
done

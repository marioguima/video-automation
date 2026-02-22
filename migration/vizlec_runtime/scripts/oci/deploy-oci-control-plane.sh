#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OCI_DIR="${ROOT_DIR}/infra/oci"
ENV_FILE="${OCI_DIR}/.env"
DYNAMIC_TEMPLATE="${OCI_DIR}/traefik/dynamic.template.yml"
DYNAMIC_FILE="${OCI_DIR}/traefik/dynamic.yml"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${OCI_DIR}/.env.example" "${ENV_FILE}"
  echo "Arquivo criado: ${ENV_FILE}"
  echo "Edite o .env e execute novamente."
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

if [[ -z "${CONTROL_DOMAIN:-}" ]]; then
  echo "CONTROL_DOMAIN não definido em ${ENV_FILE}"
  exit 1
fi
if [[ -z "${LETSENCRYPT_EMAIL:-}" ]]; then
  echo "LETSENCRYPT_EMAIL não definido em ${ENV_FILE}"
  exit 1
fi

mkdir -p "${OCI_DIR}/letsencrypt" "${OCI_DIR}/data"
touch "${OCI_DIR}/letsencrypt/acme.json"
chmod 600 "${OCI_DIR}/letsencrypt/acme.json"

sed "s/__CONTROL_DOMAIN__/${CONTROL_DOMAIN}/g" "${DYNAMIC_TEMPLATE}" > "${DYNAMIC_FILE}"

docker compose --env-file "${ENV_FILE}" -f "${OCI_DIR}/docker-compose.yml" config >/dev/null
docker compose --env-file "${ENV_FILE}" -f "${OCI_DIR}/docker-compose.yml" up -d --build

echo "Deploy concluído."
echo "Teste:"
echo "curl -I http://${CONTROL_DOMAIN}"
echo "curl -vk https://${CONTROL_DOMAIN}/health"

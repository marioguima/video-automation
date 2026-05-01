#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-control.vizlec-dev.test}"
LAB_ENV_PATH="${2:-infra/lab/.env}"
SKIP_CERT="${SKIP_CERT:-0}"
SKIP_UP="${SKIP_UP:-0}"

set_or_append_env_var() {
  local file="$1"
  local name="$2"
  local value="$3"

  if [[ ! -f "$file" ]]; then
    touch "$file"
  fi

  if grep -q "^${name}=" "$file"; then
    sed -i "s|^${name}=.*$|${name}=${value}|g" "$file"
  else
    echo "${name}=${value}" >> "$file"
  fi
}

echo "== Fase 1 / eternidade-server =="
echo "Domínio: ${DOMAIN}"

if [[ ! -f "${LAB_ENV_PATH}" ]]; then
  cp infra/lab/.env.example "${LAB_ENV_PATH}"
  echo "Arquivo criado: ${LAB_ENV_PATH}"
fi

set_or_append_env_var "${LAB_ENV_PATH}" "WEB_APP_BASE_URL" "https://${DOMAIN}"

DYNAMIC_PATH="infra/lab/traefik/dynamic.yml"
if [[ ! -f "${DYNAMIC_PATH}" ]]; then
  echo "Arquivo não encontrado: ${DYNAMIC_PATH}"
  exit 1
fi

sed -i -E "s|Host\(\`[^\`]+\`\)|Host(\`${DOMAIN}\`)|g" "${DYNAMIC_PATH}"
sed -i -E "s|certFile: /etc/certs/.*|certFile: /etc/certs/${DOMAIN}.pem|g" "${DYNAMIC_PATH}"
sed -i -E "s|keyFile: /etc/certs/.*|keyFile: /etc/certs/${DOMAIN}-key.pem|g" "${DYNAMIC_PATH}"

if [[ "${SKIP_CERT}" != "1" ]]; then
  bash scripts/lab/generate-lab-cert.sh "${DOMAIN}"
fi

[[ -f "infra/lab/certs/${DOMAIN}.pem" ]] || { echo "Certificado não encontrado."; exit 1; }
[[ -f "infra/lab/certs/${DOMAIN}-key.pem" ]] || { echo "Chave não encontrada."; exit 1; }

docker compose --env-file "${LAB_ENV_PATH}" -f infra/lab/docker-compose.yml config >/dev/null
echo "docker compose config: OK"

if [[ "${SKIP_UP}" != "1" ]]; then
  docker compose --env-file "${LAB_ENV_PATH}" -f infra/lab/docker-compose.yml up -d --build
  echo "Stack iniciada."
fi

echo "Próximo passo: exportar CA para developer e deus-server."
echo "Comando: mkcert -CAROOT"

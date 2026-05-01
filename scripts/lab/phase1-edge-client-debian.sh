#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Uso: bash scripts/lab/phase1-edge-client-debian.sh <SERVER_IP> <CA_CERT_PATH> [DOMAIN]"
  echo "Exemplo: bash scripts/lab/phase1-edge-client-debian.sh 192.168.1.10 /tmp/rootCA.pem control.vizlec-dev.test"
  exit 1
fi

SERVER_IP="$1"
CA_CERT_PATH="$2"
DOMAIN="${3:-control.vizlec-dev.test}"
HOSTS_FILE="/etc/hosts"

echo "== Fase 1 / deus-server (Debian) =="
echo "Servidor: ${SERVER_IP}"
echo "Domínio: ${DOMAIN}"

if [[ ! -f "${CA_CERT_PATH}" ]]; then
  echo "Certificado da CA não encontrado: ${CA_CERT_PATH}"
  exit 1
fi

if ! grep -qE "^[[:space:]]*${SERVER_IP}[[:space:]]+${DOMAIN}([[:space:]]|$)" "${HOSTS_FILE}"; then
  echo "${SERVER_IP} ${DOMAIN}" | sudo tee -a "${HOSTS_FILE}" >/dev/null
  echo "Entrada adicionada em ${HOSTS_FILE}"
else
  echo "Entrada de hosts já existe."
fi

sudo cp "${CA_CERT_PATH}" "/usr/local/share/ca-certificates/${DOMAIN}-rootCA.crt"
sudo update-ca-certificates
echo "CA instalada no trust store do Debian."

echo "Teste de resolução:"
getent hosts "${DOMAIN}" || true

echo "Teste TLS (health):"
curl -vk "https://${DOMAIN}/health"

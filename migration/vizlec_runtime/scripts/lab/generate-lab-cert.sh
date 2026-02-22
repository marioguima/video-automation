#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-control.vizlec-dev.test}"
OUT_DIR="${2:-infra/lab/certs}"

install_mkcert() {
  if command -v mkcert >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    echo "Instalando mkcert via apt..."
    sudo apt-get update
    sudo apt-get install -y mkcert libnss3-tools
  fi

  if ! command -v mkcert >/dev/null 2>&1; then
    echo "mkcert não encontrado. Instale manualmente e rode novamente."
    echo "Exemplo Debian: sudo apt-get install -y mkcert libnss3-tools"
    exit 1
  fi
}

install_mkcert

mkdir -p "${OUT_DIR}"

echo "Instalando CA local no trust store..."
mkcert -install

CERT_PATH="${OUT_DIR}/${DOMAIN}.pem"
KEY_PATH="${OUT_DIR}/${DOMAIN}-key.pem"

echo "Gerando certificado para ${DOMAIN}..."
mkcert -cert-file "${CERT_PATH}" -key-file "${KEY_PATH}" "${DOMAIN}"

echo "Certificado gerado:"
echo " - ${CERT_PATH}"
echo " - ${KEY_PATH}"

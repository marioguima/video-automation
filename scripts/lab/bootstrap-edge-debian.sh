#!/usr/bin/env bash
set -euo pipefail

SERVER_IP=""
CA_CERT_PATH=""
DOMAIN="control.vizlec-dev.test"
INSTALL_GPU=1
AUTO_REBOOT=0
INSTALL_OLLAMA=0
INSTALL_DOCKER=1
SETUP_TLS=0

usage() {
  cat <<'EOF'
Uso:
  bash scripts/lab/bootstrap-edge-debian.sh [opcoes]

Opcoes:
  --server-ip <ip>           IP do control plane (obrigatorio com --setup-tls)
  --ca-cert-path <arquivo>   Caminho do rootCA.pem (obrigatorio com --setup-tls)
  --domain <dominio>         Dominio do control plane (padrao: control.vizlec-dev.test)
  --setup-tls                Configura hosts + trust da CA para HTTPS do lab
  --no-gpu                   Nao instala stack NVIDIA
  --auto-reboot              Reinicia automaticamente se necessario
  --no-docker                Nao instala Docker Engine/Compose
  --install-ollama           Instala e sobe o servico Ollama
  -h, --help                 Exibe esta ajuda
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-ip)
      SERVER_IP="$2"
      shift 2
      ;;
    --ca-cert-path)
      CA_CERT_PATH="$2"
      shift 2
      ;;
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --setup-tls)
      SETUP_TLS=1
      shift
      ;;
    --no-gpu)
      INSTALL_GPU=0
      shift
      ;;
    --auto-reboot)
      AUTO_REBOOT=1
      shift
      ;;
    --no-docker)
      INSTALL_DOCKER=0
      shift
      ;;
    --install-ollama)
      INSTALL_OLLAMA=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opcao invalida: $1"
      usage
      exit 1
      ;;
  esac
done

require_sudo() {
  if ! sudo -n true 2>/dev/null; then
    echo "Este script requer sudo."
  fi
}

install_base_packages() {
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl software-properties-common
}

install_docker_if_needed() {
  if [[ "${INSTALL_DOCKER}" != "1" ]]; then
    echo "Instalacao do Docker ignorada (--no-docker)."
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Instalando Docker..."
    curl -fsSL https://get.docker.com | sudo sh
  fi

  sudo systemctl enable --now docker

  if ! docker compose version >/dev/null 2>&1; then
    echo "Instalando docker-compose-plugin..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
  fi
}

ensure_non_free_sources() {
  local sources="/etc/apt/sources.list"

  if [[ ! -f "${sources}" ]]; then
    echo "Arquivo ${sources} nao encontrado. Ajuste os repositorios manualmente."
    return
  fi

  sudo cp "${sources}" "${sources}.bak-vizlec" 2>/dev/null || true

  sudo sed -i -E \
    's/^deb (.*) main$/deb \1 main contrib non-free non-free-firmware/g' \
    "${sources}"

  sudo sed -i -E \
    's/^deb (.*) main contrib non-free$/deb \1 main contrib non-free non-free-firmware/g' \
    "${sources}"
}

install_nvidia_stack() {
  if [[ "${INSTALL_GPU}" != "1" ]]; then
    echo "Stack NVIDIA ignorada (--no-gpu)."
    return
  fi

  echo "Configurando repositorios non-free para driver NVIDIA..."
  ensure_non_free_sources
  sudo apt-get update
  sudo apt-get install -y nvidia-driver fbset
  sudo update-grub

  if nvidia-smi >/dev/null 2>&1 && fbset -i >/dev/null 2>&1; then
    echo "NVIDIA e framebuffer prontos."
    return
  fi

  echo "Driver instalado, mas validacao final exige reboot."
  if [[ "${AUTO_REBOOT}" == "1" ]]; then
    echo "Reiniciando automaticamente em 10 segundos..."
    sleep 10
    sudo reboot
  else
    echo "Execute manualmente:"
    echo "  sudo reboot"
    echo "Depois valide:"
    echo "  nvidia-smi"
    echo "  fbset -i"
  fi
}

install_ollama_if_needed() {
  if [[ "${INSTALL_OLLAMA}" != "1" ]]; then
    return
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    echo "Instalando Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
  fi

  sudo systemctl enable --now ollama
}

setup_tls_if_requested() {
  if [[ "${SETUP_TLS}" != "1" ]]; then
    return
  fi

  if [[ -z "${SERVER_IP}" || -z "${CA_CERT_PATH}" ]]; then
    echo "Para --setup-tls, informe --server-ip e --ca-cert-path."
    exit 1
  fi

  if [[ ! -f "${CA_CERT_PATH}" ]]; then
    echo "Certificado da CA nao encontrado: ${CA_CERT_PATH}"
    exit 1
  fi

  local hosts_file="/etc/hosts"

  if ! grep -qE "^[[:space:]]*${SERVER_IP}[[:space:]]+${DOMAIN}([[:space:]]|$)" "${hosts_file}"; then
    echo "${SERVER_IP} ${DOMAIN}" | sudo tee -a "${hosts_file}" >/dev/null
    echo "Entrada adicionada em ${hosts_file}"
  else
    echo "Entrada de hosts ja existe."
  fi

  sudo cp "${CA_CERT_PATH}" "/usr/local/share/ca-certificates/${DOMAIN}-rootCA.crt"
  sudo update-ca-certificates
  echo "CA instalada no trust store do Debian."

  echo "Teste de resolucao:"
  getent hosts "${DOMAIN}" || true

  echo "Teste TLS (health):"
  curl -vk "https://${DOMAIN}/health"
}

check_local_integrations() {
  echo
  echo "== Verificacao de integracoes locais (edge) =="

  if command -v ollama >/dev/null 2>&1; then
    if curl -fsS "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
      echo "[OK] Ollama respondendo em 127.0.0.1:11434"
    else
      echo "[WARN] Ollama instalado, mas nao respondeu em 127.0.0.1:11434"
    fi
  else
    echo "[WARN] Ollama nao instalado."
  fi

  if curl -fsS "http://127.0.0.1:8188/" >/dev/null 2>&1; then
    echo "[OK] ComfyUI respondendo em 127.0.0.1:8188"
  else
    echo "[WARN] ComfyUI nao respondeu em 127.0.0.1:8188"
  fi

  if curl -fsS "http://127.0.0.1:8020/health" >/dev/null 2>&1; then
    echo "[OK] TTS respondendo em 127.0.0.1:8020/health"
  else
    echo "[WARN] TTS nao respondeu em 127.0.0.1:8020/health"
  fi
}

main() {
  echo "== Bootstrap Debian / edge (deus-server) =="

  require_sudo
  install_base_packages
  install_docker_if_needed
  install_nvidia_stack
  install_ollama_if_needed
  setup_tls_if_requested
  check_local_integrations

  echo
  echo "Bootstrap do edge finalizado."
  echo "Observacao: deus-server e runtime-only (sem codigo-fonte do produto)."
  echo "Observacao: ComfyUI permanece externo ao Docker nesta fase."
}

main

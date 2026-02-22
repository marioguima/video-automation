#!/usr/bin/env bash
set -euo pipefail

DOMAIN="control.vizlec-dev.test"
REPO_URL="https://github.com/marioguima/vizlec.git"
REPO_DIR="${HOME}/vizlec"
BRANCH=""
SKIP_DOCKER=0
SKIP_MKCERT=0

usage() {
  cat <<'EOF'
Uso:
  bash scripts/lab/bootstrap-control-plane-debian.sh [opcoes]

Opcoes:
  --domain <dominio>         Dominio do control plane (padrao: control.vizlec-dev.test)
  --repo-url <url>           URL do repositorio git
  --repo-dir <caminho>       Diretorio local do repositorio
  --branch <nome>            Branch para checkout/update
  --skip-docker              Nao instala Docker
  --skip-mkcert              Nao instala mkcert/libnss3-tools
  -h, --help                 Exibe esta ajuda
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --repo-dir)
      REPO_DIR="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --skip-docker)
      SKIP_DOCKER=1
      shift
      ;;
    --skip-mkcert)
      SKIP_MKCERT=1
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

need_sudo() {
  if ! sudo -n true 2>/dev/null; then
    echo "Este script requer sudo."
  fi
}

install_base_packages() {
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl git gnupg lsb-release
}

install_docker_if_needed() {
  if [[ "${SKIP_DOCKER}" == "1" ]]; then
    echo "Instalacao do Docker ignorada (--skip-docker)."
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Instalando Docker..."
    curl -fsSL https://get.docker.com | sudo sh
  fi

  sudo systemctl enable --now docker

  if ! docker compose version >/dev/null 2>&1; then
    echo "Instalando plugin docker compose..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
  fi
}

install_mkcert_if_needed() {
  if [[ "${SKIP_MKCERT}" == "1" ]]; then
    echo "Instalacao do mkcert ignorada (--skip-mkcert)."
    return
  fi

  if ! command -v mkcert >/dev/null 2>&1; then
    echo "Instalando mkcert..."
    sudo apt-get update
    sudo apt-get install -y mkcert libnss3-tools
  fi
}

checkout_repo() {
  if [[ -d "${REPO_DIR}/.git" ]]; then
    echo "Repositorio ja existe em ${REPO_DIR}, atualizando..."
    git -C "${REPO_DIR}" fetch --all --prune
    if [[ -n "${BRANCH}" ]]; then
      git -C "${REPO_DIR}" checkout "${BRANCH}"
      git -C "${REPO_DIR}" pull --ff-only origin "${BRANCH}"
    else
      git -C "${REPO_DIR}" pull --ff-only
    fi
    return
  fi

  echo "Clonando repositorio em ${REPO_DIR}..."
  if [[ -n "${BRANCH}" ]]; then
    git clone --branch "${BRANCH}" "${REPO_URL}" "${REPO_DIR}"
  else
    git clone "${REPO_URL}" "${REPO_DIR}"
  fi
}

run_phase_script() {
  if [[ ! -f "${REPO_DIR}/scripts/lab/phase1-control-plane.sh" ]]; then
    echo "Script nao encontrado: ${REPO_DIR}/scripts/lab/phase1-control-plane.sh"
    exit 1
  fi

  echo "Executando bootstrap da Fase 1 no control plane..."
  (cd "${REPO_DIR}" && bash scripts/lab/phase1-control-plane.sh "${DOMAIN}")
}

main() {
  echo "== Bootstrap Debian / control plane =="
  echo "Dominio: ${DOMAIN}"
  echo "Repo: ${REPO_DIR}"

  need_sudo
  install_base_packages
  install_docker_if_needed
  install_mkcert_if_needed
  checkout_repo
  run_phase_script

  echo
  echo "Bootstrap finalizado."
  echo "Proximo passo: exportar rootCA do control plane para as outras maquinas."
  echo "Comando para localizar CA: mkcert -CAROOT"
}

main

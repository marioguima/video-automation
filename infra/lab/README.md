# Lab HTTPS (Fase 1)

Este diretório cria o ambiente de laboratório para simular uma VPS local com HTTPS real.
Se você for testar com servidor online na OCI, use `infra/oci/README.md`.

## 0. Mapeamento das máquinas no seu ambiente
1. `eternidade-server` (Debian): servidor do control plane.
2. `deus-server` (Debian + RTX 3060): edge/worker para processamento pesado.
3. `developer` (Windows): máquina de desenvolvimento e navegador do usuário.

## 1. Pré-requisitos
1. Docker e Docker Compose.
2. `mkcert` (o script tenta instalar automaticamente se não existir).
3. Entrada de host local para o domínio de laboratório.
4. Se o `deus-server` usar GPU NVIDIA (obrigatório para workloads de IA em GPU), preparar driver antes de qualquer fase:
```bash
sudo nano /etc/apt/sources.list
```
Garantir `contrib`, `non-free` e `non-free-firmware` nas linhas da sua versão Debian e executar:
```bash
sudo apt update
sudo apt install -y nvidia-driver
sudo apt install -y fbset
sudo update-grub
sudo reboot
```
Após reiniciar:
```bash
nvidia-smi
fbset -i
```
Persistência da GPU (`nvidia-persistenced`) é opcional no lab:
1. manter desativada por padrão para economizar energia;
2. ativar apenas se o primeiro job de IA estiver com latência inicial alta.

## 2. Configuração
1. Copie `infra/lab/.env.example` para `infra/lab/.env`.
2. Ajuste os segredos em `infra/lab/.env`.
3. No `eternidade-server` (Debian), rode o fluxo automatizado da Fase 1:
```bash
bash scripts/lab/phase1-control-plane.sh control.vizlec-dev.test
```
Se quiser apenas gerar certificado manualmente no Debian:
```bash
bash scripts/lab/generate-lab-cert.sh control.vizlec-dev.test
```
Alternativa Windows (quando necessário):
```powershell
pwsh ./scripts/lab/phase1-control-plane.ps1 -Domain control.vizlec-dev.test
```

## 2.1 Bootstrap one-command por máquina (Debian)
Objetivo: `deus-server` como runtime-only (sem código-fonte do produto).

1. `eternidade-server` (control plane):
```bash
git clone https://github.com/marioguima/vizlec.git ~/vizlec || true
cd ~/vizlec
bash scripts/lab/bootstrap-control-plane-debian.sh --domain control.vizlec-dev.test
```

2. `deus-server` (edge, com GPU NVIDIA) sem clonar o repositório:
```bash
curl -fsSL https://raw.githubusercontent.com/marioguima/vizlec/main/scripts/lab/bootstrap-edge-debian.sh -o /tmp/bootstrap-edge-debian.sh
chmod +x /tmp/bootstrap-edge-debian.sh
bash /tmp/bootstrap-edge-debian.sh --install-ollama
```
Se quiser já configurar trust TLS no `deus-server` no mesmo comando:
```bash
bash /tmp/bootstrap-edge-debian.sh --setup-tls --server-ip 192.168.1.10 --ca-cert-path /tmp/rootCA.pem --domain control.vizlec-dev.test --install-ollama
```
Observação: se o script indicar reboot para concluir o driver NVIDIA, reinicie e rode novamente para confirmar validações.
No final, o script mostra status `[OK]/[WARN]` das integrações locais (`Ollama`, `ComfyUI`, `TTS`).

## 3. Subida
O script do `eternidade-server` já sobe a stack por padrão.
Execução manual, se necessário:
```bash
docker compose --env-file infra/lab/.env -f infra/lab/docker-compose.yml up -d --build
```

## 4. Cliente (`developer`) e edge (`deus-server`)
1. Copie o arquivo `rootCA.pem` do `eternidade-server` para o `developer` e também para o `deus-server`:
```bash
mkcert -CAROOT
```
O arquivo está em `<CAROOT>\rootCA.pem`.

2. No `developer`, execute:
```powershell
pwsh ./scripts/lab/phase1-client-browser.ps1 -ServerIp 192.168.1.10 -Domain control.vizlec-dev.test -CaCertPath "C:\caminho\rootCA.pem"
```
Isso:
1. adiciona entrada no `hosts`;
2. importa a CA no store do usuário;
3. testa resolução e HTTPS.

3. No `deus-server` (Debian), execute:
```bash
bash /tmp/bootstrap-edge-debian.sh --setup-tls --server-ip 192.168.1.10 --ca-cert-path /tmp/rootCA.pem --domain control.vizlec-dev.test
```
Isso instala a CA no Debian, ajusta `/etc/hosts` e testa HTTPS.

## 5. Validação
1. Redirect:
```bash
curl -I http://control.vizlec-dev.test
```
2. Health HTTPS:
```bash
curl -vk https://control.vizlec-dev.test/health
```

## 6. Observações
1. A API sobe com `AUTH_COOKIE_SECURE=true` para validar sessão segura em HTTPS.
2. As integrações locais (Ollama, ComfyUI, XTTS) são acessadas via `host.docker.internal`.

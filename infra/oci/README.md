# OCI Control Plane (Internet público)

Este diretório é o caminho para subir o `control plane` online em uma instância OCI (ARM ou AMD), com HTTPS público via Let's Encrypt.

## 1. Topologia recomendada
1. `oci-control-plane` (instância OCI): Traefik + API + banco SQLite inicial.
2. `deus-server` (Debian + GPU): worker e serviços de IA.
3. `developer` (Windows): acesso web e operação.

## 2. Pré-requisitos OCI
1. Instância com IP público e domínio DNS apontando para esse IP.
2. Portas abertas no OCI Security List/NSG:
   - `80/tcp`
   - `443/tcp`
   - `22/tcp` (admin)
3. Repositório clonado na instância.

## 3. Bootstrap da instância OCI
Na instância OCI recém-criada (`oci-control-plane`):
```bash
sudo bash scripts/oci/bootstrap-oci-control-plane.sh
```

## 4. Configuração
1. Copiar:
```bash
cp infra/oci/.env.example infra/oci/.env
```
2. Editar `infra/oci/.env`:
   - `CONTROL_DOMAIN` (ex.: `control-dev.seudominio.com`)
   - `LETSENCRYPT_EMAIL`
   - segredos (`AUTH_JWT_SECRET`, `INTERNAL_JOBS_EVENT_TOKEN`)
   - URLs de integração para o edge (`deus-server`)
   - Observação: para Let's Encrypt, use domínio público real (não usar `.local` ou `.test`).

## 5. Deploy
```bash
bash scripts/oci/deploy-oci-control-plane.sh
```

## 6. Validação
```bash
curl -I http://control-dev.seudominio.com
curl -vk https://control-dev.seudominio.com/health
```

## 7. Observações de produção inicial
1. OCI Always Free é excelente para teste e início de operação.
2. Para reduzir risco de reclaim por idle, prefira conta Pay As You Go mantendo recursos free elegíveis.
3. Antes de produção com clientes pagantes:
   - backup externo diário do `data/`;
   - monitoramento e alertas;
   - plano de migração para banco gerenciado.

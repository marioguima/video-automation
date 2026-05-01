# FlowShopy Documentation

Esta pasta contem somente a documentacao ativa do produto FlowShopy.

FlowShopy e uma plataforma content-first para criar conteudo uma vez e gerar saidas em video para multiplas plataformas, formatos e aspect ratios. A direcao do produto segue COPE: Create Once, Publish Everywhere.

## Ordem de leitura

1. `01-product-vision.md`
   - Define o produto, valor entregue, usuario, escopo e experiencia esperada.

2. `02-product-specification.md`
   - Detalha funcionalidades, entidades de produto, fluxos, visoes de tela e criterios de aceite.

3. `03-technical-architecture.md`
   - Explica arquitetura, stack, dominio, banco, API, worker, jobs, assets e decisoes tecnicas.

4. `04-development-and-operations.md`
   - Como rodar, configurar, validar, testar, debugar e operar em desenvolvimento.

5. `05-production-infrastructure.md`
   - Como empacotar, distribuir, subir em producao, infraestrutura necessaria e modelo local/cloud/hibrido.

6. `06-integrations-and-external-services.md`
   - LLMs, Gemini, Ollama, TTS, ComfyUI, ffmpeg, Playwright, plataformas sociais, pagamentos e APIs externas.

7. `07-sales-and-distribution-plan.md`
   - Plano de venda, distribuicao, modelo comercial, onboarding, suporte, planos e go-to-market.

8. `08-roadmap-status-and-handoff.md`
   - Estado real da implementacao, proximos passos, criterios de aceite, comandos e handoff para retomar trabalho.

9. `09-decision-log.md`
   - Decisoes ja tomadas, tradeoffs, itens removidos da documentacao antiga e assuntos em aberto.

10. `10-api-endpoint-inventory.md`
   - Inventario tecnico gerado dos endpoints HTTP declarados na API.

## Regra de manutencao

Documentacao boa e documentacao que reduz ambiguidade.

Ao alterar produto, arquitetura, infraestrutura ou plano comercial:

- atualize o documento canônico correspondente;
- remova duplicacoes;
- registre decisoes relevantes em `09-decision-log.md`;
- atualize o status em `08-roadmap-status-and-handoff.md`.

Nao adicionar novos documentos sem necessidade clara. Se uma informacao cabe em um dos arquivos acima, ela deve ir nele.

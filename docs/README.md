# FlowShopy Documentation

Esta pasta contém somente a documentação ativa do produto FlowShopy.

FlowShopy é uma plataforma content-first para criar conteúdo uma vez e gerar saídas em vídeo para múltiplas plataformas, formatos e aspect ratios. A direção do produto segue COPE: Create Once, Publish Everywhere.

## Ordem de leitura

1. `01-product-vision.md`
   - Define o produto, valor entregue, usuário, escopo e experiência esperada.

2. `02-product-specification.md`
   - Detalha funcionalidades, entidades de produto, fluxos, visões de tela e critérios de aceite.

3. `03-technical-architecture.md`
   - Explica arquitetura, stack, domínio, banco, API, worker, jobs, assets e decisões técnicas.

4. `04-development-and-operations.md`
   - Como rodar, configurar, validar, testar, debugar e operar em desenvolvimento.

5. `05-production-infrastructure.md`
   - Como empacotar, distribuir, subir em produção, infraestrutura necessária e modelo local/cloud/hibrido.

6. `06-integrations-and-external-services.md`
   - LLMs, Gemini, Ollama, TTS, ComfyUI, ffmpeg, Playwright, plataformas sociais, pagamentos e APIs externas.

7. `07-sales-and-distribution-plan.md`
   - Plano de venda, distribuição, modelo comercial, onboarding, suporte, planos e go-to-market.

8. `08-roadmap-status-and-handoff.md`
   - Estado real da implementação, próximos passos, critérios de aceite, comandos e handoff para retomar trabalho.

9. `09-decision-log.md`
   - Decisões já tomadas, tradeoffs, itens removidos da documentação antiga e assuntos em aberto.

10. `10-api-endpoint-inventory.md`
   - Inventário técnico gerado dos endpoints HTTP declarados na API.

11. `12-desktop-local-runtime.md`
   - Arquitetura local-first em Electron, distribuição desktop, runtime instalado e plano de execução do produto híbrido.

## Regra de manutenção

Documentação boa é documentação que reduz ambiguidade.

Ao alterar produto, arquitetura, infraestrutura ou plano comercial:

- atualize o documento canônico correspondente;
- remova duplicações;
- registre decisões relevantes em `09-decision-log.md`;
- atualize o status em `08-roadmap-status-and-handoff.md`.

Não adicionar novos documentos sem necessidade clara. Se uma informação cabe em um dos arquivos acima, ela deve ir nele.

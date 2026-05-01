# VizLec API

API REST do VizLec, construída com [Fastify](https://fastify.dev/).

## Iniciando

```bash
# A partir da raiz do projeto
pnpm dev:api

# Ou diretamente na pasta da API
cd apps/api && pnpm dev
```

A API estará disponível em `http://127.0.0.1:4010`.

## Documentação Interativa (Scalar)

A API utiliza o [Scalar](https://scalar.com/) para documentação interativa. O Scalar é uma alternativa moderna ao Swagger UI que oferece:

- ✅ Interface visual moderna e limpa
- ✅ Exemplos de código em múltiplas linguagens (cURL, JavaScript, Python, etc.)
- ✅ Funcionalidade "Try it" para testar endpoints diretamente
- ✅ Navegação por categorias (tags)
- ✅ Tema escuro/claro

### Como acessar

Com a API rodando, acesse:

| Recurso | URL |
|---------|-----|
| **Documentação Scalar** | http://127.0.0.1:4010/reference |
| **OpenAPI JSON** | http://127.0.0.1:4010/reference/openapi.json |

### Usando a documentação

1. **Navegue pelas categorias** - No menu lateral, os endpoints estão organizados por tags:
   - **Auth** - Autenticação (login, logout, registro)
   - **Team** - Gerenciamento de equipe e convites
   - **Courses** - CRUD de cursos
   - **Modules** - CRUD de módulos
   - **Lessons** - CRUD de lições
   - **Slides** - Gerenciamento de slides
   - **Jobs** - Jobs de processamento (TTS, imagens, vídeo)
   - **Voices** - Vozes disponíveis para TTS
   - **Settings** - Configurações do sistema
   - **Notifications** - Notificações
   - **Integrations** - Status de integrações (Ollama, XTTS, ComfyUI)
   - **Health** - Status do sistema

2. **Explore um endpoint** - Clique em qualquer endpoint para ver:
   - Descrição e parâmetros
   - Exemplos de request/response
   - Código de exemplo em várias linguagens

3. **Teste diretamente** - Use o botão "Try it" para:
   - Preencher parâmetros
   - Enviar a requisição
   - Ver a resposta em tempo real

### Autenticação

A maioria dos endpoints requer autenticação via cookie de sessão (`vizlec_session`).

**Endpoints públicos** (não requerem autenticação):
- `/health`
- `/auth/*`
- `/settings`
- `/reference` (documentação)

**Para testar endpoints protegidos:**
1. Faça login via `/auth/login` primeiro
2. O cookie de sessão será automaticamente incluído nas próximas requisições

### Exemplo: Testando via cURL

```bash
# Health check (público)
curl http://127.0.0.1:4010/health

# Login
curl -X POST http://127.0.0.1:4010/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "sua-senha"}' \
  -c cookies.txt

# Listar cursos (autenticado)
curl http://127.0.0.1:4010/courses -b cookies.txt
```

## Estrutura da API

```
apps/api/
├── src/
│   └── index.ts    # Servidor Fastify + todas as rotas
├── package.json
├── tsconfig.json
└── README.md       # Este arquivo
```

## Tecnologias

- **[Fastify](https://fastify.dev/)** - Framework web
- **[@fastify/swagger](https://github.com/fastify/fastify-swagger)** - Geração de OpenAPI spec
- **[@scalar/fastify-api-reference](https://github.com/scalar/scalar)** - Documentação interativa
- **[@fastify/jwt](https://github.com/fastify/fastify-jwt)** - Autenticação JWT
- **[@fastify/websocket](https://github.com/fastify/fastify-websocket)** - WebSocket para eventos em tempo real
- **[Prisma](https://www.prisma.io/)** - ORM (via `@vizlec/db`)

## Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `pnpm dev` | Inicia em modo desenvolvimento (hot reload) |
| `pnpm start` | Inicia em modo produção |
| `pnpm typecheck` | Verifica tipos TypeScript |
| `pnpm test` | Executa todos os testes `*.test.ts` da API |
| `pnpm test:one -- <arquivo>` | Executa um arquivo de teste específico |

## Como testar

### Rodar todos os testes da API

```bash
# dentro de apps/api
pnpm test

# ou pela raiz do monorepo
pnpm --filter @vizlec/api test
```

### Rodar um único arquivo de teste

```bash
# dentro de apps/api
pnpm test:one -- test/auth-scope-flow.test.ts

# ou pela raiz do monorepo
pnpm --filter @vizlec/api run test:one -- test/auth-scope-flow.test.ts
```

### Teste do fluxo de escopo

```bash
pnpm test:one -- test/auth-scope-flow.test.ts
```

Este teste valida o fluxo:
`bootstrap-admin -> /auth/me -> /auth/context -> login -> /auth/context`.

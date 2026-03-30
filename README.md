# Crypto Trading Bot SaaS

Bot automatizado de trading de criptomoedas com Node.js + TypeScript, arquitetura pronta para SaaS, painel web, analise por IA, gestao de risco, backtesting e modo padrao em simulacao.

## Stack

- Backend: Node.js + TypeScript + Express
- Banco: PostgreSQL
- Mercado: CoinGecko + Binance
- IA: OpenAI API
- Automacao: `node-cron`
- Painel: dashboard HTML servido pelo backend
- Deploy: Docker ou Render

## Capacidades

- Multiusuario com autenticacao JWT
- Configuracao isolada por usuario
- Criptografia AES-256-GCM para chaves de API
- Analise tecnica com EMA, RSI, ATR, VWAP e MACD
- Analise por IA com fallback heuristico
- Motor de ordens com `simulation` e `real`
- Validacao de risco antes de qualquer ordem
- Stop loss, take profit, trailing stop, break-even e cooldown
- Scheduler continuo para execucao automatica
- Backtesting com slippage e taxas
- Alertas via Telegram
- Dashboard premium com login, risco, Binance, historico e metricas

## Estrutura

```text
.
|-- public/
|   `-- index.html
|-- sql/
|   `-- schema.sql
|-- src/
|   |-- config/
|   |-- core/
|   |-- db/
|   |-- lib/
|   |-- middleware/
|   |-- routes/
|   `-- services/
|-- .env.example
|-- Dockerfile
|-- docker-compose.yml
|-- package.json
|-- render.yaml
`-- tsconfig.json
```

## API principal

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/credentials/binance`
- `GET /api/bot/settings`
- `PUT /api/bot/settings`
- `POST /api/bot/start`
- `POST /api/bot/stop`
- `POST /api/bot/run-once`
- `GET /api/dashboard/summary`
- `POST /api/backtest`

## Configuracao local

### 1. Variaveis de ambiente

Copie [`.env.example`](C:/Users/Guilherme%20Neves/Downloads/crypto-trading-bot-certo-main/.env.example) para `.env` e ajuste:

```env
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/crypto_bot
JWT_SECRET=troque-isto-por-uma-chave-longa
ENCRYPTION_SECRET=troque-isto-com-32-ou-mais-caracteres
DEFAULT_MODE=simulation
ANALYSIS_INTERVAL_MINUTES=5
MAX_CANDIDATES_PER_CYCLE=10
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
BINANCE_API_BASE_URL=https://api.binance.com
OPENAI_API_URL=https://api.openai.com/v1/chat/completions
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### 2. Dependencias

```bash
npm install
```

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

### 4. Build e start

```bash
npm run build
npm start
```

## Observacao sobre o banco

O app executa automaticamente [sql/schema.sql](C:/Users/Guilherme%20Neves/Downloads/crypto-trading-bot-certo-main/sql/schema.sql) no boot e depois aplica upgrades extras. Isso simplifica o primeiro deploy no Render e reduz dependencia de rodar `psql` manualmente.

## Deploy no Render

O projeto inclui [render.yaml](C:/Users/Guilherme%20Neves/Downloads/crypto-trading-bot-certo-main/render.yaml) para facilitar o deploy.

### Opcao 1. Blueprint

1. Suba este repositorio para o GitHub.
2. No Render, escolha `New +` -> `Blueprint`.
3. Selecione o repositorio.
4. O Render vai criar automaticamente:
   - um banco PostgreSQL
   - um Web Service Node
5. Depois do primeiro deploy, ajuste no painel:
   - `APP_BASE_URL=https://SEU-SERVICO.onrender.com`
   - `OPENAI_API_KEY`
   - `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`, se usar alertas

### Opcao 2. Manual

Crie um `Web Service` com:

```text
Build Command: npm install && npm run build
Start Command: npm start
Health Check Path: /api/health
```

E configure:

```env
NODE_ENV=production
PORT=10000
APP_BASE_URL=https://SEU-SERVICO.onrender.com
DATABASE_URL=postgres://...
JWT_SECRET=uma-chave-longa-e-segura
ENCRYPTION_SECRET=outra-chave-longa-com-32+-caracteres
DEFAULT_MODE=simulation
ANALYSIS_INTERVAL_MINUTES=5
MAX_CANDIDATES_PER_CYCLE=10
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
BINANCE_API_BASE_URL=https://api.binance.com
OPENAI_API_URL=https://api.openai.com/v1/chat/completions
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## Fluxo recomendado

1. Crie sua conta no painel.
2. Cadastre Binance.
3. Configure risco.
4. Rode em `simulation`.
5. Teste `run-once`.
6. Ative o scheduler.
7. Rode backtests.
8. So depois avalie `mode=real`.

## Observacoes importantes

- O modo recomendado para primeiro deploy publico e `simulation`.
- Nao coloque em `real` sem validar risco, slippage, sizing e credenciais.
- A OpenAI apoia a decisao, mas a execucao continua protegida por regras duras de risco.
- Para crescer depois, o proximo passo natural e separar worker, observabilidade e filas.

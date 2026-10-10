# Jungle Gaming - Distributed Wagering Processor

Um motor de processamento de transações de iGaming altamente escalável, resiliente a concorrência massiva e desenhado em torno de Princípios de Domain-Driven Design (DDD). 

Construído para assegurar integridade financeira rigorosa através da implementação dos padrões **Unit of Work**, **Optimistic Locking** e **Inbox/Outbox** em PostgreSQL e AWS SQS FIFO.

---

## 🚀 Tech Stack

- **Runtime:** [Bun 1.x](https://bun.sh/) (Extremamente rápido e moderno)
- **Framework:** [NestJS](https://nestjs.com/) (Arquitetura limpa e escalável)
- **Base de Dados:** [PostgreSQL](https://www.postgresql.org/) (ACID garantido)
- **ORM:** [MikroORM](https://mikro-orm.io/) (Data Mapper e Unit of Work)
- **Mensageria:** [AWS SQS FIFO](https://aws.amazon.com/sqs/) via [LocalStack](https://localstack.cloud/)
- **Testes:** [Vitest](https://vitest.dev/)

---

## 📋 Pré-requisitos

Para correres este projeto localmente irás precisar de:
1. **[Bun](https://bun.sh/)** (versão `1.0` ou superior).
2. **[Docker](https://www.docker.com/)** e **Docker Compose** instalados e em execução.

---

## 🛠️ Instruções de Setup

Segue os passos abaixo para preparares e levantares o ambiente local.

**1. Instalar as dependências**
```bash
bun install
```

**2. Levantar a infraestrutura (PostgreSQL e LocalStack SQS)**
```bash
docker compose up -d
```
> *Nota: O LocalStack inicializa a fila FIFO `wager-transactions.fifo` automaticamente.*

**3. Atualizar o esquema da Base de Dados**
Garante que a base de dados tem as tabelas corretamente estruturadas (podes optar por rodar `migration:up` caso existam migrações geradas):
```bash
bunx mikro-orm schema:update --run
# ou
# bunx mikro-orm migration:up
```

---

## 🧪 Testes

### Suite de Testes Normal / Unitária
Para executares os testes correntes:
```bash
bunx vitest run
```

### ⚠️ Testes de Integração e Concorrência Extrema
O projeto engloba um derradeiro teste de fogo (**Concorrência e Fluxo Transacional**). 
Estes testes comunicam com o **PostgreSQL e o SQS reais** (nada de mocks!). Adicionalmente, realizam operações de `TRUNCATE CASCADE` antes de correr para garantirem um ambiente isolado.

Para evitar que a limpeza de um ficheiro corrompa o fluxo do outro quando executados em paralelo pelo motor de testes, deves **corrê-los individualmente ou em sequência**:
```bash
# 1. Testar o Fluxo Transacional (Outbox -> SQS -> Inbox -> Ledger)
bunx vitest run src/test/integration/transactional-flow.spec.ts

# 2. Testar Race Conditions, Hot Wallets e Desordem Temporal
bunx vitest run src/test/concurrency/concurrency.spec.ts
```

---

## 🏃 Execução da Aplicação

Com a base de dados e SQS a correr no docker, inicia o servidor NestJS em modo de desenvolvimento:

```bash
bun run start:dev
```
A API ficará disponível em `http://localhost:3000`.

*(Uma *collection* de testes manuais e exemplos de requisições pode ser encontrada no ficheiro `api.http` na raiz do projeto)*.

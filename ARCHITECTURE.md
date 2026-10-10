# Architecture & Design Decisions

Este documento detalha as principais decisões de engenharia, arquitetura e modelagem adotadas para o Distributed Wagering Processor, com o objetivo de garantir consistência absoluta, resiliência sob alta carga e conformidade estrita com os requisitos de negócio.

## 1. Autenticação e Gestão de Identidade

Optou-se por **não implementar uma solução artesanal de autenticação** no código da aplicação. Em sistemas de missão crítica, a gestão de identidade, credenciais e fluxos OAuth2/OIDC deve ser delegada a um *Identity Provider* (IdP) externo especializado e robusto, como o **Keycloak** ou o **Zitadel**. 

A arquitetura prevê esta integração por intermédio de tokens JWT. O sistema fornece uma `NoOpAuthGuard` intencionalmente desenhada como um ponto de extensão natural. Numa fase posterior, este *guard* assumirá o papel de validar as assinaturas (via JWKS) e os *claims* dos tokens JWT originados pelo IdP, bloqueando acessos indevidos antes que atinjam o nosso domínio.

## 2. Modelagem Financeira (Money)

Operações financeiras não admitem os erros de arredondamento inerentes aos números de ponto flutuante (`float`/`double`) representados em norma IEEE 754.

Para assegurar uma precisão matemática imaculada:
- Envolvemos a biblioteca **`decimal.js`** num **Value Object (`Money`)**. O domínio comunica estritamente através deste objeto, impedindo mutações inválidas ou operações entre moedas distintas (imposto via `CurrencyMismatchError`).
- Na camada de infraestrutura, criámos um *Custom Type* no MikroORM que mapeia a instância de `Money` para o tipo de dados nativo **`DECIMAL(19,2)`** do PostgreSQL, garantindo que a base de dados reflete o valor com precisão absoluta de cêntimos.

## 3. ORM e Transações (Unit of Work)

A escolha do **MikroORM** justifica-se pelo seu suporte nativo e maduro ao padrão **Unit of Work** (UoW) e à **Identity Map**. 

Diferente do Active Record, onde cada entidade se responsabiliza pela sua própria persistência (fragmentando a transação), o Unit of Work do MikroORM acumula as mutações em memória (Aggregates, Ledger Entries, Outbox Events) e, no final do fluxo, realiza o `flush` em massa, englobando todas as operações numa **única transação SQL atómica**. Isto garante de forma inquestionável que nunca teremos uma alteração de saldo sem o correspondente evento emitido na Outbox, protegendo o sistema contra falhas de rede, *crashes* da API ou inconsistências de dados.

## 4. Concorrência e Ordenação (Estratégia Híbrida)

Enfrentar condições de corrida (sobreposição de pedidos para a mesma carteira simultaneamente) é o maior desafio em iGaming. Adotámos uma estratégia híbrida focada em **Resiliência e Escalabilidade Horizontal**:

1. **Optimistic Locking no Domínio (Retry Loop)**: 
   O agregado `Wallet` possui uma coluna `_version`. Sempre que um saldo é alterado, o motor do ORM exige que a versão na BD bata certo com a versão em memória. Em caso de *race condition*, a BD rejeita a gravação concorrente. A Camada de Aplicação (`ProcessWagerTransactionUseCase`) interceta esta falha de bloqueio otimista e efetua um **Retry Loop** (Backoff transparente). Se esgotar as tentativas permitidas, lança um erro 503 transitório (`ConcurrencyConflictError`), pedindo ao cliente que repita o pedido.
2. **Pessimistic Locking nos Workers (`FOR UPDATE SKIP LOCKED`)**:
   Para garantir que dezenas de réplicas do processo NestJS não entram em conflito (deadlock) ao processar a tabela da Outbox, o *Worker* executa consultas raw SQL com `FOR UPDATE SKIP LOCKED`. Esta cláusula de base de dados permite que cada Worker consuma apenas os registos "livres", ignorando instantaneamente os registos já bloqueados por outras réplicas.

## 5. Idempotência e Mensageria (Inbox/Outbox Pattern)

O sistema nervoso assíncrono comunica através de filas SQS FIFO, garantindo a ordem absoluta das mensagens. Para alcançar a entrega fiável e tolerância a falhas:

- **Outbox Pattern (*At-Least-Once Delivery*)**: As mensagens assíncronas geradas pelo domínio são guardadas transacionalmente na tabela de Outbox. Um Worker (Cron) desvinculado envia depois estas mensagens para a Amazon SQS. Se o SQS estiver em baixo, o Worker tenta de novo mais tarde, não afetando a latência do cliente HTTP.
- **Inbox Pattern (Deduplicação e Idempotência)**: Mensagens repetidas (da rede, ou de tentativas excessivas do Outbox) são travadas à porta pelo Padrão Inbox. O SQS Consumer valida o ID do evento (Idempotency Key / Message ID) extraído restritamente do envelope do *payload* contra a tabela `inbox_messages`. Se já existir, a mensagem é silenciosamente ignorada (*Ack*). A API principal complementa a idempotência gerando um `PayloadHash` canónico utilizando a biblioteca **`fast-json-stable-stringify`**. Este método processa recursivamente todas as chaves de negócio críticas, garantindo a criação de um Hash Determinístico (SHA-256) absolutamente imune a mutações triviais ou rearranjos de formatação no JSON do cliente, prevenindo qualquer burla de chaves de idempotência recicladas.

## 6. Integridade Relacional Rigorosa (Imutabilidade do Ledger)

Adicionalmente às proteções aplicacionais (TypeScript/ORM), delegámos as responsabilidades mais severas à Base de Dados. 

Para impedir qualquer alteração maliciosa ou anomalia catastrófica na fonte de verdade (o Ledger Financeiro):
- Implementámos um **TRIGGER PL/pgSQL estrito** na tabela `wallet_ledger_entries`. Este Trigger bloqueia proativamente toda e qualquer instrução `UPDATE` e `DELETE` ao nível do motor relacional, lançando uma exceção de interdição. Assim, garante-se uma **imutabilidade absoluta (*append-only*)** blindada pelo PostgreSQL.
- Constraints de Tabela adicionais `CHECK (money > 0)` e `CHECK (balance_after >= 0)` asseguram que a base de dados reprova diretamente entradas ilógicas que contornem, por algum lapso, a camada de negócio.

## 7. Infraestrutura de Mensageria e Ciclo de Vida do Processo

A arquitetura previne dead-loops de processamento e desordem nos pipelines adotando uma Separação de Responsabilidades e um Ciclo de Vida disciplinado:

- **Separação de Filas (Ingress/Egress)**: O tráfego de entrada e de saída nunca colide. Os dados afluentes entram numa fila restrita de ingestão (`wager-transactions.fifo`), e o `OutboxPublisherWorker` exaure os eventos gerados para um tópico/fila perfeitamente segregada (`wagering-events.fifo`).
- **Graceful Shutdown Robusto (Semáforo de Processamento)**: Perante a emissão de sinais de terminação do sistema operacional (`SIGTERM`/`SIGINT`), instanciámos *shutdown hooks* conjugados a um contador de processos em voo. O sistema encerra de imediato a receção de novas tarefas mas entra num estado suspenso, mantendo os recursos vivos unicamente até o processamento das mensagens SQS já puxadas terminar por completo. Desta forma, inviabilizamos cenários onde um _connection pool_ encerraria precocemente causando falhas falsas ou perda de ACK na AWS.

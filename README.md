# Blockchain — edição gratuita para iPhone

PWA pessoal com **Send Now pela API serverless**, Web Push/VAPID e PostgreSQL. Funciona com **Vercel Hobby + Neon Free + endereço `*.vercel.app`**, dentro das cotas gratuitas e para uso pessoal não comercial. Não exige cartão, domínio comprado, certificado pago, Apple Developer, VPS, Docker, worker nem computador ligado após o deploy.

Não é carteira Bitcoin nem serviço financeiro. Os templates são mensagens criadas pelo usuário; a identidade nativa da notificação continua sendo Blockchain.

## Serviços e custo

| Serviço | Plano / uso | Cartão obrigatório | Custo obrigatório |
| --- | --- | --- | --- |
| Vercel | Hobby; frontend, Functions, HTTPS e subdomínio vercel.app | Não | R$ 0 |
| Neon | Free; PostgreSQL, pooling e suspensão automática | Não | R$ 0 |
| GitHub | Free, conta pessoal; repositório para importação | Não | R$ 0 |
| Web Push/VAPID | Protocolos do navegador, sem assinatura adicional | Não | R$ 0 |
| Safari / Tela de Início | iPhone com iOS 16.4 ou superior | Não | R$ 0 |

Selecione explicitamente os planos gratuitos; nenhum trial pago, add-on ou integração de cobrança é necessário. Crie o banco diretamente no Neon e copie a conexão; não é necessário comprá-lo pelo Marketplace da Vercel. São pressupostos um iPhone e acesso à internet já disponíveis.

As cotas dos provedores não são ilimitadas. Ao atingi-las, o serviço pode ficar indisponível até a renovação da cota; esta aplicação não faz upgrades nem compras. A Vercel restringe Hobby a uso pessoal **não comercial**. O Neon Free anunciou em 02/10/2026 1 GB de banco por projeto e 100 CU-h de compute mensais por projeto. Confirme os limites exibidos na sua conta; os planos podem mudar. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Neon Free atualizado](https://neon.com/blog/neon-free-plan-1-gb-per-project), [Neon sem cartão](https://neon.com/blog/thousands-of-neon-projects-now-included-in-your-pricing-plan).

## Arquitetura

```text
iPhone → Blockchain instalado → Create Notification → Send Now
       → API Node.js serverless da Vercel Hobby (maxDuration=60)
       → PostgreSQL Neon: sessão, registro e controle de duplicidade
       → Web Push com VAPID → serviço de push da Apple → próprio iPhone
       → histórico: aceite ou falha real
```

O handler aguarda a tentativa de envio antes de responder. Não depende de cron, polling contínuo, fila externa, processo persistente ou trabalho depois da resposta HTTP. O runtime Node.js da Function existe apenas durante as invocações gerenciadas pela Vercel.

Preservados: pareamento/autenticação por dispositivo; composer e preview; templates (criar, editar, usar, duplicar, excluir); imagens privadas; histórico; Settings; Diagnostics; manifest; Service Worker; instalação PWA e fallback offline.

As imagens ficam em `bytea` no PostgreSQL, sem Blob Storage nem filesystem da função. O Prisma reutiliza o cliente em instâncias aquecidas e limita por padrão cada instância a uma conexão; use a URL **pooled** do Neon.

## Scheduled: removido nesta edição

**Não existe agendamento ativo, precisão de horário prometida ou retry automático.** A aba Scheduled, campos de data/fuso e ações de editar/cancelar agenda foram removidos. Campos de agendamento enviados por clientes antigos são rejeitados com HTTP 400, nunca convertidos silenciosamente em Send Now. Endpoints antigos de alteração de agenda retornam 410; o cron e o módulo scheduler foram excluídos. `vercel.json` não contém `crons`; `CRON_SECRET` não é utilizado. Diagnostics informa a indisponibilidade da agenda sem marcar um heartbeat inexistente como erro.

Alternativas pesquisadas em 05/10/2026:

- **Vercel Hobby Cron:** apenas uma execução diária, com precisão dentro de uma janela de uma hora; inadequado para a agenda anterior por minuto. [Limites oficiais](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- **cron-job.org:** oferece chamadas gratuitas por minuto, mas acrescenta uma conta, segredo, endpoint e monitoramento; pontualidade não é garantida. Polling contínuo também impede o banco de aproveitar ociosidade/suspensão e consome o compute gratuito. [FAQ oficial](https://cron-job.org/en/faq/).
- **QStash Free:** 1.000 mensagens/dia e atraso máximo de sete dias na tabela consultada. Polling por minuto seriam 1.440 chamadas/dia; envio por mensagem exigiria redesenhar autenticação de callbacks, cancelamento e limites de datas. [Preços oficiais](https://upstash.com/pricing/qstash).

Portanto, existem cron services gratuitos, mas não preservam a arquitetura mínima e a precisão anterior sem novas dependências/limitações. A escolha desta edição, conforme a prioridade do projeto, é manter **Send Now** e remover Scheduled. Não foi introduzido cron diário enganoso, timer de navegador ou GitHub Actions como agendador.

## Deploy completo — primeira instalação

1. **Crie uma conta Neon Free** em [neon.com](https://neon.com). Crie um projeto PostgreSQL; mantenha suspensão automática e escolha uma região próxima à região da Function Vercel. Não ative add-ons pagos.
2. Em **Connect**, selecione o banco/branch correto, habilite **Connection pooling** e copie a URI PostgreSQL, começando com `postgresql://` e contendo `-pooler` no host. Guarde como `DATABASE_URL`; preserve `sslmode=require` e os demais parâmetros entregues pelo Neon. Não copie comandos `psql`, aspas externas nem uma URL HTTP.
3. Extraia este projeto. Em um computador com **Node.js 24**, abra o terminal dentro da pasta que contém `package.json` e rode:

   ```sh
   npm ci
   npm run vapid
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Guarde as duas chaves exibidas pelo comando VAPID e use o último valor como `PAIRING_CODE`. O computador só é necessário para preparar/publicar o código. Não deixe nenhum servidor rodando. Em atualização de instalação existente, **preserve o par VAPID e o pareamento existentes**.
4. Crie um repositório na sua **conta pessoal GitHub Free**, preferencialmente privado, e envie o conteúdo desta pasta. `package.json`, `vercel.json` e `prisma/` devem ficar na raiz escolhida. Não envie `.env`, `node_modules`, `.next`, `.runtime` ou credenciais. Os arquivos de ignore já estão incluídos. Repositórios de organização possuem restrições no Hobby; use conta pessoal.
5. Em [Vercel](https://vercel.com), escolha **Hobby**, **Add New → Project → Import Git Repository**. Autorize o repositório e selecione Next.js. Root Directory: pasta do `package.json`; Node.js: **24.x**. Mantenha o Build Command do `vercel.json`: **`npm run vercel-build`**; Output Directory padrão.
6. Antes de **Deploy**, adicione estas cinco variáveis em **Production**, sem aspas externas:

   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | URI pooled do Neon |
   | `PAIRING_CODE` | Código aleatório gerado, mínimo 24 caracteres |
   | `VAPID_PUBLIC_KEY` | Public Key do comando VAPID |
   | `VAPID_PRIVATE_KEY` | Private Key do comando VAPID |
   | `VAPID_SUBJECT` | `mailto:seu-email-real@gmail.com` ou outro email que você já tenha |

   Não é necessário comprar um domínio para o email. Não prefixe segredos com `NEXT_PUBLIC_`. Mantenha **Automatically expose System Environment Variables** habilitado. O app usa `VERCEL_PROJECT_PRODUCTION_URL` para obter a origem estável HTTPS automaticamente. Se essa opção estiver desligada, adicione `APP_ORIGIN=https://nome-do-projeto.vercel.app` com a URL real exibida pela Vercel, sem barra final. [Variáveis do sistema](https://vercel.com/docs/environment-variables/system-environment-variables).
7. Clique **Deploy**. Em Production, o build aplica `prisma migrate deploy`, gera Prisma Client e compila Next.js. O script deriva a conexão **direta** do mesmo Neon removendo `-pooler` apenas do hostname reconhecido `.neon.tech`, sem alterar a URL usada pelo runtime. Assim não é preciso copiar uma segunda URL nem executar SQL manualmente. Falhas de migration interrompem o deploy. HTTPS e domínio `*.vercel.app` são fornecidos pela Vercel.
8. Abra a **URL estável de produção**, como `https://nome-do-projeto.vercel.app`, no **Safari do iPhone**. Evite URLs temporárias de preview. O deployment de produção precisa ser acessível normalmente ao aparelho.
9. Toque **Compartilhar → Adicionar à Tela de Início**. Mantenha “Abrir como App da Web” ativado, se aparecer. Abra **Blockchain pelo novo ícone**, não pela aba Safari.
10. Siga o onboarding e **pareie** usando `PAIRING_CODE`, atribuindo um nome ao aparelho. O pareamento é a autenticação; não há serviço pago de login.
11. Toque **Enable Notifications** e aceite a permissão do iOS. A solicitação acontece diretamente após seu toque, como exigido pelo Safari. Requer iOS 16.4 ou superior. Não exige inscrição paga Apple Developer. [Documentação WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
12. Toque **Send Test** no onboarding ou em Settings. O servidor envia ao endpoint real da subscription desse iPhone. Confira a notificação e a Central de Notificações. Se necessário, deixe a PWA em segundo plano após tocar, sem desligar a internet.
13. Em **Create Notification**, preencha nome, título e mensagem; toque **Send Now**. Confira History e o recebimento. Em **Settings → Advanced diagnostics → Run Diagnostics**, confira backend, banco, VAPID, Service Worker, permissão e subscription.

Depois disso, o computador pode ser desligado. Mudanças em environment variables requerem novo deployment para entrar em vigor. Guarde o código e as chaves com segurança.

## Atualizar uma instalação existente

Preserve o banco, as chaves VAPID, os dados de sessão e a **mesma origem HTTPS**. Faça backup antes da atualização e interrompa o agendador antigo antes do deploy, inclusive cron externo configurado manualmente. O novo `vercel.json` não registra nenhum cron. Remova a variável antiga `CRON_SECRET` do painel.

A migration original é mantida. A nova migration cancela registros `Scheduled`, acrescenta ao histórico o horário/fuso antigo e elimina os jobs pendentes. Conteúdo, imagens, templates, subscriptions, sessões e histórico permanecem. Os itens cancelados aparecem em History e podem ser reutilizados por **Send Again**. Tabelas legadas ficam apenas por compatibilidade de schema; não têm consumidores em runtime. Não publique a versão antiga em paralelo após a atualização.

Para uma migração de outro PostgreSQL, restaure o backup completo, incluindo `_prisma_migrations`, no Neon antes do deploy; não rode `db push`/reset nem recrie o schema por cima. Não é preciso manter a infraestrutura antiga ligada depois do corte.

**Troca de domínio:** cookies, Service Worker e subscriptions pertencem à origem. Migrar de outro domínio para `*.vercel.app` exige instalar novamente, parear e habilitar push. Novo pareamento cria um espaço isolado nesta versão; os dados antigos permanecem no banco, mas não há transferência automática da sessão/histórico para a nova origem. Para preservar o acesso existente, mantenha a origem original ou planeje a transferência autenticada antes do corte. Não confunda armazenamento preservado com sessão automaticamente transferida.

## Semântica do envio e limites

- **Sent:** serviço de push aceitou a mensagem; não confirma exibição no aparelho. **Failed:** tentativa falhou; consulte o detalhe. HTTP 404/410 remove a subscription expirada para permitir nova inscrição.
- **Pending / Unconfirmed:** a tentativa pode estar em andamento ou ter sido interrompida; não há aceite confirmado nem retry em segundo plano. Atualize History e confira o aparelho antes de **Send Again**, que é uma nova tentativa explícita. Uma falha de rede pode ocorrer após o provedor aceitar a mensagem.
- O registro é reivindicado atomicamente antes da chamada externa. A mesma chave de idempotência não dispara outra tentativa quando o registro já foi reivindicado. Isso evita duplicatas automáticas em concorrência ou interrupção. Não promete entrega exatamente uma vez. Excluir registros remove também a chave de idempotência; não repita requisições antigas após excluir.
- O envio tem timeout de transporte de 12 segundos e a Function limite de 60 segundos. Cold start e banco suspenso podem aumentar a latência inicial. A interface não simula sucesso nem usa timers como prova de entrega. Um registro Unconfirmed só pode ser excluído após dois minutos, para proteger uma tentativa em andamento.
- Sem Scheduled, retries automáticos ou criação/envio offline. O fallback offline apenas orienta a reconectar. Notificações já aceitas continuam a cargo do serviço de push, com TTL de 24 horas.
- Rede, Foco, resumo de notificações, permissões, bateria e políticas do iOS podem atrasar/impedir exibição. A aparência, nome/ícone nativos e som são controlados pelo sistema. Imagens e perfis são preservados no app/preview; não há promessa de trocar a identidade nativa Blockchain ou mostrar imagem customizada no banner do iPhone.
- Upload máximo de 2 MB na API e 20 megapixels; JPEG/PNG/WebP são regravados em WebP 256×256. HEIC deve ser convertido antes. Máximo de 100 imagens e 100 templates por dispositivo; History mostra os 500 registros mais recentes. Dados antigos ainda ocupam armazenamento até exclusão.
- Limites de requisição: 20 solicitações de envio/minuto e 60 escritas/minuto por dispositivo; pareamento global 10 tentativas/5 minutos. Uso pessoal; sem garantia de disponibilidade ilimitada.

## Configuração opcional e desenvolvimento

`DESTINATION_ORIGINS`: lista de origens HTTPS externas permitidas, separadas por vírgula. Sem ela, apenas a própria origem é aceita. O clique na notificação abre detalhes na PWA; links externos exigem toque explícito. `APP_ORIGIN` sobrescreve a origem automática. `DIRECT_URL` é opcional para migrations com outro provedor; deve apontar ao mesmo banco. Para Neon não é necessária. Nenhuma variável de cron é usada.

Para desenvolvimento, copie `.env.example` para `.env`, use PostgreSQL de teste e `APP_ORIGIN=http://localhost:3000`. Depois:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

`npm start` é apenas verificação local do build. A Vercel não precisa que você o mantenha rodando. `npm run build` compila sem mudar o banco; apenas **`npm run vercel-build` em Production** aplica migrations automaticamente. Builds de preview não aplicam migrations: mantenha credenciais de produção restritas a Production; previews sem banco servem apenas para revisão visual. Não conecte previews a subscriptions reais.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Para executar também integração, defina `TEST_DATABASE_URL` com banco **descartável já migrado**. Para HTTP, execute `npm start` contra esse mesmo banco e defina `TEST_APP_URL=http://localhost:3000`; deixe VAPID ausente no servidor de teste para verificar o erro real de configuração. Os testes de transporte usam doubles controlados, e a criptografia usa a biblioteca Web Push real. Não são um teste de recebimento físico no iPhone. A suíte sem banco informa explicitamente o skip. Veja [VALIDATION.md](VALIDATION.md) para a execução desta entrega.

## Troubleshooting

| Sintoma | Ação |
| --- | --- |
| Build/migration falha | Confira DATABASE_URL, TLS, senha, branch, acesso e cota Neon. Erros interrompem o deploy, não são ignorados. |
| Origin rejected | Abra o domínio estável Production; confira variável automática ou APP_ORIGIN exata e faça redeploy. |
| Pairing não configurado | PAIRING_CODE precisa ter ao menos 24 caracteres em Production. |
| VAPID não configurado | Adicione as duas chaves e VAPID_SUBJECT em Production; redeploy. |
| Push indisponível | Use a PWA aberta pelo ícone, com HTTPS, iOS 16.4+ e permissão concedida. |
| Failed / subscription expirada | Enable Notifications novamente; depois Send Again pelo histórico. |
| Unconfirmed | Atualize History e confira o aparelho. Não há worker tentando novamente. |
| Sent sem banner | Verifique Central de Notificações, Foco, permissão, internet e subscription do próprio aparelho. |
| Backend indisponível | Consulte Functions Logs e cotas Neon/Vercel; não há fallback fictício de dados. |
| Histórico de outra origem não aparece | Novo pareamento é outro espaço; consulte a limitação de migração de origem acima. |

Sessões usam cookies HttpOnly/Secure/SameSite=Strict e token de 256 bits com apenas hash no banco. Ownership, Origin, validação de payload/URLs, rate limiting persistido e proteção dos endpoints Web Push permanecem ativos. Não registre connection strings, cookies ou chave privada VAPID em tickets ou repositórios.

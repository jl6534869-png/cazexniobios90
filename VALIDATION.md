# Validação — Blockchain 1.1.0, edição gratuita

Executada em 05/10/2026 após remover o agendamento e manter envio imediato serverless.

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado, sem erros/warnings |
| `npm run typecheck` | Aprovado; inclui regeneração dos tipos das rotas |
| `npm test` com PostgreSQL e API HTTP | **22 testes aprovados, 0 falhas, 0 skips** (20 no runner TypeScript compilado + 2 de deploy) |
| `npm run build` | Production build aprovado |
| `npm run vercel-build`, com `VERCEL_ENV=production` e banco de teste | Migrations + geração Prisma + production build aprovados |
| Migração de dados antigos em schema transacional isolado | Conteúdo, sessões, subscriptions, templates, imagens e histórico preservados; Scheduled cancelado com horário/fuso registrado |
| Revisão visual | Home, Create, Settings e Diagnostics verificados; layout a 390×844; nenhum controle de agenda |

## Cobertura

- Web Push: duas chamadas concorrentes reivindicam a mesma notificação somente uma vez; a chamada usa o dispositivo proprietário.
- Falhas 429/503/rede são persistidas sem criar retry ou job. Subscription expirada é removida. Cancelled não envia.
- Interrupção ambígua mantém Unconfirmed. Falha no commit após aceite do provedor não vira sucesso fictício nem repete a chamada automaticamente.
- Idempotência: chave única por dispositivo e replay HTTP de registro concluído sem nova tentativa.
- API real no build de produção: autenticação, Origin, isolamento entre dispositivos, templates, imagem inválida, upload e leitura WebP autenticada, limite de payload e rate limiting.
- Campos de agendamento são rejeitados antes de criar qualquer registro. Rotas antigas de edição/cancelamento/envio antecipado retornam 410; não há handler ou configuração de cron.
- Diagnostics consulta PostgreSQL e informa indisponibilidade da agenda. VAPID ausente produz erro 503 real, inclusive observado pela interface; não há sucesso simulado.
- Exclusão protege tentativas recentes Unconfirmed e permite limpeza após dois minutos.
- Manifest e ícones existentes; Service Worker exibe push, trata payload inválido visivelmente e restringe clique à própria PWA.
- Biblioteca Web Push real gera criptografia AES128GCM e assinatura VAPID sem expor chave privada.
- Configuração da origem usa domínio estável de produção, sem confiar no host de preview. Pooling limita conexões por instância. Derivação da conexão direta Neon preserva credenciais, banco e TLS.

## Ambiente

Node.js 24.20.0, Next.js 16.3.8, Prisma 6.19.3, PostgreSQL 18.4 descartável, em loopback. O servidor Next local foi utilizado apenas durante verificações, com encerramento limitado por tempo; não faz parte da infraestrutura publicada. Não foi usado Docker. A CI incluída utiliza PostgreSQL nativo do runner GitHub; sua execução remota não foi testada nesta máquina.

Os testes de transporte substituem somente a chamada ao provedor por respostas/erros controlados. Eles exercitam persistência, concorrência e estado reais em PostgreSQL, mas **não comprovam entrega pela Apple**. Nenhum mock, conta de demonstração, chave real ou dado de teste é incluído como comportamento do app em produção.

## Limites de verificação e aceite no destino

- **Não foi realizado deploy numa conta Vercel nem conexão a um Neon real nesta rodada.** O pipeline foi executado localmente com PostgreSQL real; TLS/pooler, região e cotas gerenciadas precisam ser conferidos no destino.
- **Não foi recebida uma notificação num iPhone físico nesta rodada.** Após o deploy, instale pela Tela de Início, pareie, habilite a permissão, execute Send Test e confira a Central de Notificações. O README contém o passo a passo completo.
- Não há agendamento ou precisão temporal para validar nesta edição. Não existe worker oculto ou processo que substitua cron em testes/deploy.
- Sent comprova aceite pelo serviço de push, não exibição pelo sistema operacional. Rede, permissões e Foco continuam relevantes.
- O arquivo ZIP exclui `.env`, dependências, builds e banco de testes. As cinco variáveis obrigatórias devem ser configuradas pelo proprietário em Production.

# Arena Rivals

Plataforma web em HTML/CSS/JavaScript, com API Express e PostgreSQL/Supabase.

## Executar

Requer Node.js 22 ou superior. Execute `npm install`, depois `npm start` e abra
<http://localhost:3000>. As páginas devem ser acessadas pelo servidor.

O servidor usa a configuração pública existente em [supabase-config.js](./supabase-config.js).
Opcionalmente copie [.env.example](./.env.example) para `.env` e preencha
`SUPABASE_URL` e `SUPABASE_ANON_KEY`. Nunca use uma chave service_role no navegador.
O usuário entra pelo Supabase Auth; a API valida o token no serviço e encaminha
as operações usando esse mesmo token, preservando as políticas RLS.

## API

Documentação interativa: <http://localhost:3000/api/docs>.
Especificação OpenAPI: <http://localhost:3000/api/openapi.json>.
Saúde do servidor: `/api/health` (não verifica a conexão remota).

Envie `Authorization: Bearer <access_token>` nas rotas de dados.
As respostas usam `{ "data": ... }` ou `{ "error": "mensagem" }`.
Listagens gerais retornam até 100 registros. Comunidades e publicações têm páginas
de 24 itens, selecionadas com `page`. Membros da comunidade são listados até 100.

| Recurso | Operações disponíveis |
| --- | --- |
| jogadores | GET lista/detalhe; PATCH do próprio perfil |
| times | GET, POST, PATCH; desativação preserva histórico |
| campeonatos | GET, POST, PATCH, DELETE |
| inscricoes | GET, POST pendente, PATCH de aprovação/recusa pelo organizador |
| partidas | GET lista/detalhe |
| classificacao | GET lista; filtro minhas=1 e paginação |
| comunidades | GET, POST, PATCH do criador; busca, categoria e paginação |
| publicacoes | GET, POST, PATCH, DELETE |

Comunidades: `GET /api/comunidades?q=valorant&categoria=FPS&page=1`,
`GET /api/comunidades?minhas=1` e `GET /api/minhas-comunidades`.
`GET/POST/DELETE /api/comunidades/{id}/membros` lista, entra ou sai usando a sessão.
`GET /api/publicacoes?id_comunidade=1&page=1` retorna o feed com autor e curtidas.
`POST/DELETE /api/publicacoes/{id}/reacao` adiciona/remove a própria reação.
POST é idempotente: se já houver reação, não cria outra. Para trocar o tipo, remova
e adicione novamente. Donos não podem sair e usuários não podem se promover a dono.

`GET /api/meus-times` retorna times, elenco e convites do usuário autenticado.
`POST /api/times/{id}/membros` recebe `acao` com `convidar`, `aceitar`, `recusar`,
`sair`, `remover` ou `transferir`. Convite recebe também `username` (exato e sem @);
remoção e transferência recebem `id_jogador` (UUID). A identidade de quem aceita,
recusa ou sai é sempre extraída da sessão, nunca do corpo da requisição.

`POST /api/campeonatos/{id}/confrontos` gera as partidas e inicia o campeonato.
`POST /api/partidas/{id}/resultado` recebe `{ "placar_a": 2, "placar_b": 0 }`.
As duas operações só podem ser realizadas pelo organizador e usam funções SQL
transacionais. Confirmar novamente o mesmo resultado não repete pontos.

Todas as operações de dados das telas usam a API Express. Supabase Auth continua
responsável pelo cadastro, login, sessão e senha no navegador.
A disponibilidade das escritas depende das
permissões implantadas no banco.

## Banco e pendências

[schema.sql](./schema.sql) é um script de criação inicial, não uma migration
para bancos existentes. Não o execute novamente sobre um banco populado.
No SQL Editor do Supabase execute [001_integridade_competitiva.sql](./migrations/001_integridade_competitiva.sql)
uma vez após o esquema inicial. A migration pode ser reaplicada e não apaga registros.
Ela corrige as permissões de status dos times, controla aprovação/recusa pelo organizador,
reserva vagas para inscrições pendentes/aprovadas e impede reduzir o limite abaixo das reservas.
Partidas finalizadas ficam imutáveis; sua exclusão (inclusive por cascata) é bloqueada para
preservar o ranking. Não há recálculo retroativo de resultados históricos inconsistentes.
Horários de partidas são validados pelo dia UTC e devem estar dentro do período do campeonato.
Em 17/11/2026, foi confirmada a aplicação das migrations 001 e 002 no Supabase.

Depois execute [002_ciclo_competitivo.sql](./migrations/002_ciclo_competitivo.sql).
Essa segunda migration gera confrontos, finaliza partidas, avança vencedores e
encerra o campeonato automaticamente ao terminar. A tela de campeonatos possui
a ação “Confrontos e resultados” para registrar placares definitivos.
Eliminatória exige quantidade de aprovados igual a uma potência de dois (2, 4,
8, 16 etc.) e placar sem empate. Pontos corridos aceita número ímpar e empates.
Grupos foi removido das opções do formulário porque suas regras ainda não foram implementadas.
Chaves geradas anteriormente pelo algoritmo antigo não são convertidas automaticamente.
Use campeonatos novos para validar o fluxo após aplicar as migrations.

Para a gestão de membros, execute [003_membros_times.sql](./migrations/003_membros_times.sql)
após as duas anteriores. Abra “Meus times” no menu. É possível criar um time,
convidar jogadores, aceitar/recusar convites e transferir a capitania. Jogadores
participam de apenas um time ativo. O capitão precisa transferir a função antes
de sair ou desativar o time. As mudanças de elenco ficam bloqueadas enquanto o
time participa de campeonato em andamento. A desativação encerra os vínculos e
cancela reservas de inscrições em campeonatos ainda abertos/rascunho; histórico
de contratos não é apagado. A exclusão direta de times e vínculos foi desabilitada.
A migration 003 foi aplicada pela integração Supabase em 17/11/2026.

A migration [004_edicao_campeonatos.sql](./migrations/004_edicao_campeonatos.sql)
também foi aplicada pela integração Supabase em 17/11/2026.
O organizador pode editar os dados pelo botão “Editar”, antes de gerar confrontos.
Depois do início, estrutura, datas, valores e metadados ficam bloqueados para edição.
Campeonatos encerrados/cancelados não podem ser reabertos. O capitão pode cancelar
sua inscrição enquanto o campeonato estiver aberto/rascunho, antes dos confrontos.
O painel de resultados organiza as partidas por rodada, mostra vagas aguardando
vencedores e destaca o campeão no encerramento. Pontos corridos desempata por
pontos, saldo e vitórias; igualdade em todos os critérios é exibida como liderança
empatada, sem escolher um vencedor arbitrário.
O formulário oferece somente eliminatória e pontos corridos; grupos não faz parte
do escopo desta entrega. Taxas e prêmios são valores informativos, sem integração de pagamento.

### Verificação remota em 17/11/2026

Foram testados diretamente no Supabase, com identidades temporárias e papel
`authenticated`: convite/aceite, bloqueio de outro capitão, proibição de escrever
contratos diretamente, bloqueio de autoaprovação, aprovação pelo organizador,
edição antes do início, geração, congelamento do elenco, proteção dos resultados,
pontuação sem repetição, encerramento e bloqueio de edição tardia. Os cenários
passaram. Um rollback reverteu os registros; as contagens antes/depois de usuários,
perfis, times, contratos, campeonatos, inscrições, partidas e ranking coincidiram.
Sequências de IDs podem apresentar saltos normais após esse tipo de teste.

RLS permanece habilitada nas 12 tabelas. O aviso de search_path do trigger de
timestamp foi corrigido. A auditoria ainda sinaliza RPCs SECURITY DEFINER para
usuários autenticados (intencionais, com verificação de identidade e autorização)
e a proteção de senhas vazadas desabilitada no Auth. Ver referências:
[RPCs privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Após esta verificação, também foram executados os testes de navegador descritos abaixo.

## Comunidades integradas (passo 4)

A página mantém a identidade visual e consome a API para criar/editar comunidades,
buscar por nome, filtrar categorias, entrar/sair, consultar membros, publicar,
editar/excluir publicações e curtir/descurtir. Contadores vêm do banco. O criador
entra automaticamente como dono. Texto das publicações é exibido literalmente,
sem interpretação como HTML.

A migration [comunidades_integradas](./supabase/migrations/20261117215510_comunidades_integradas.sql)
foi criada pelo CLI e aplicada ao projeto remoto em 17/11/2026, após 001–004.
Para instalar em outro banco, execute o esquema inicial, as quatro migrations
da pasta `migrations` e então essa migration da pasta `supabase/migrations`.

Ainda precisam ser concluídos:
modelagem, Git, configuração final de autenticação/publicação e testes no domínio público.
Grupos permanece fora desta entrega.

## Home, partidas e histórico (passo 5)

A home consulta `GET /api/inicio?q=...` para mostrar comunidades, campeonatos,
jogos e confrontos reais. A vitrine usa os 8 registros recentes de comunidades,
12 campeonatos e 6 confrontos; os jogos são os desses campeonatos.
Os links abrem a comunidade ou o chaveamento selecionado. O clipe externo tem
identificação própria e não representa uma transmissão ao vivo da plataforma.

`GET /api/partidas?q=...&status=finalizada&minhas=1&page=1` aceita busca por time,
campeonato ou jogo, status, jogo exato e `campeonato` por ID. `minhas=1` usa os
vínculos ativos do jogador autenticado. Retorna até 24 itens, `page` e `hasMore`.
`GET /api/partidas/{id}` fornece o confronto com nomes dos times e campeonato.

O perfil consulta `GET /api/meu-historico?page=1`: resultados pontuados e vínculos
de time, inclusive encerrados. Cada lista tem até 24 itens por página. O histórico
usa o registro de pontuação da época, sem inferir o time pelo elenco atual.
Listas vazias e falhas exibem mensagens, sem dados demonstrativos.
Esta etapa não exige executar novo SQL.

## Verificação

Execute `npm test`. Os testes verificam isolamento dos arquivos públicos,
validação de identidade e entrada da API, encaminhamento do token RLS e
unicidade dos confrontos. Usam respostas simuladas e não escrevem no Supabase.
As regras SQL também são executadas em PostgreSQL embarcado com PGlite,
incluindo papéis RLS e identidades simuladas. Total atual: 21 testes de API/banco.

Execute `npx playwright install chromium` uma vez e depois `npm run test:e2e`
para os 16 testes de tela. Eles iniciam um servidor isolado na porta 3417 e usam
sessão/API simuladas: login, proteção, redirecionamento, perfil, logout durante
carregamento, menus em 360/768/1440 px, comunidade, home, filtros de partidas e histórico.

Além disso, o fluxo real foi testado no navegador com contas temporárias no Supabase:
cadastro via Auth API, login pela tela, alteração/persistência de bio, comunidade,
publicação, curtida, edição/persistência e logout. As sessões foram revogadas e
todas as contas/conteúdos QA removidos; os registros preexistentes foram preservados.
O script opt-in `test-live-login.js` reproduz esse cenário e imprime o UUID criado;
não faz parte de `npm test`, cria dados reais e exige limpeza administrativa desse
UUID ao concluir. Não armazena senha nem token em arquivo.
Veja [RELATORIO-TESTES.md](./RELATORIO-TESTES.md) para resultados e limites.

## API e autenticação (passo 6)

Campeonatos também usam a API para criar/desativar times, listar registros,
cancelar campeonatos, obter inscrições e classificação. `GET /api/campeonatos/{id}/painel`
retorna campeonato, rodadas, times e classificação, sem truncar a primeira página
de partidas da Data API. Para listas muito grandes, o painel recusa o carregamento
em vez de exibir um chaveamento incompleto (limite de 50 mil registros).

`GET /api/campeonatos?minhas=1`, `?disponiveis=1`, `GET /api/times?capitao=1` e
`GET /api/classificacao?minhas=1` usam filtros definidos no servidor. Propriedade
sempre vem da sessão. Essas listas e inscrições usam páginas de 100 registros,
ordenadas de forma estável. A tela percorre as páginas até concluir a listagem.
Início e encerramento continuam automáticos. A API aceita cancelamento apenas
com PATCH contendo exclusivamente `{"status":"cancelado"}`; as regras do banco
continuam verificando o organizador e o estado do campeonato.

Requisições autenticadas das telas compartilham tratamento de conexão e sessão.
Uma resposta 401 leva ao login preservando a página interna, busca e fragmento.
Falha temporária do serviço Auth retorna 502, sem confundir com senha/sessão inválida.
Login e cadastro liberam nova tentativa quando a rede falha. O SDK Supabase usado
pelas páginas está fixado em 2.119.0.

Recuperação de senha: [CONFIGURACAO-AUTH.md](./CONFIGURACAO-AUTH.md).
O código e a troca real de senha foram testados; falta autorizar a URL de retorno
e conferir o recebimento do e-mail. A integração atual não altera configurações do Auth.
Não há SQL adicional nesta etapa.

## Vercel

[vercel.json](./vercel.json) encaminha as requisições ao Express. Configure as
variáveis do Supabase no painel e autorize a URL publicada nos redirects do Auth.
O deploy e a autenticação em produção ainda não foram verificados.

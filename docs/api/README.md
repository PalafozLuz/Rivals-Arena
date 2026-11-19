# Arquitetura e API

O navegador entrega HTML/CSS/JS e usa Supabase Auth para identidade. As operações
de dados passam pela API Express; a API valida o token no Auth e usa esse mesmo
token no acesso REST/RPC ao PostgreSQL. RLS, grants, constraints e triggers
continuam atuando. Não há chave administrativa no cliente nem senha em tabela pública.

## Componentes

| Camada | Arquivos e responsabilidade |
| --- | --- |
| Interface | Páginas HTML, style.css, menu.js e scripts das funcionalidades |
| Sessão e requisições | auth.js; cliente compartilhado, destinos internos e mensagens |
| Servidor | server.js; lista explícita de arquivos públicos, JSON e roteamento |
| API | api.js; autenticação, validação, escrita, papéis e documentação |
| Consultas agregadas | dados-publicos.js; home, partidas, histórico e painel competitivo |
| Persistência | PostgreSQL/Supabase; 12 tabelas públicas e cinco migrations posteriores ao SQL inicial |
| Identidade | Supabase Auth; cadastro, login, recuperação e sessão |

Mesmo sem sessão, o servidor pode entregar o HTML; isso não concede acesso aos
endpoints de dados. A proteção efetiva é a validação da identidade e as políticas
de acesso. SELECTs concedidos a anon no banco não equivalem a endpoints públicos
da API Express, que exige token nos recursos.

## Contrato HTTP

- Documentação interativa: `http://localhost:3000/api/docs`.
- Especificação dinâmica: `/api/openapi.json`; [cópia exportada](openapi.json).
- Saúde: `/api/health`; verifica apenas o servidor, não a disponibilidade do banco.
- Dados exigem `Authorization: Bearer <access_token>`; use somente a própria sessão.
- Respostas de sucesso usam `{ "data": ... }`; falhas usam `{ "error": "mensagem" }`.
- Escritas usam JSON. IDs e campos são validados e propriedade é extraída da sessão.
- 200: leitura/alteração; 201: criação; 400: entrada/regra inválida; 401: sessão
  inválida; 403: sem permissão; 404: inexistente/sem acesso; 405: método não oferecido;
  502: falha de serviço; 503: operação/configuração indisponível em casos específicos.
- Dados autenticados recebem `Cache-Control: no-store`. Operações de resultado
  não fazem retry automático de escrita; consulte o estado após falha de conexão.

## Cobertura real de operações

| Entidade/recurso | Criar | Consultar | Atualizar | Excluir/encerrar |
| --- | --- | --- | --- | --- |
| Conta e perfil | Auth + trigger do perfil | GET jogadores e perfil | PATCH próprio perfil; senha via Auth | Sem exclusão pública da conta |
| Times | POST times | GET times/meus-times | PATCH próprio time; gestão via membros | Desativação por status, sem DELETE público |
| Contratos/elenco | Convite pela RPC de membros | GET meus-times/meu-historico | Aceite, recusa, saída, remoção, transferência | Encerrar vínculo; sem DELETE público |
| Campeonatos | POST campeonatos | GET lista/detalhe/painel | PATCH antes de confrontos; cancelamento controlado | DELETE disponibilizado, sujeito à RLS e bloqueio de partidas pontuadas |
| Inscrições | POST pendente | GET inscricoes | PATCH status conforme papel | Cancelar por status; sem DELETE público |
| Partidas | POST confrontos do campeonato (RPC) | GET partidas/detalhe/painel | POST resultado (RPC) | Sem DELETE público; pontuadas imutáveis |
| Classificação | Automática pelo resultado | GET classificacao/painel | Automática pelo resultado | Sem escrita pública |
| Histórico de ranking | Automático pelo resultado | GET meu-historico | Sem edição pública | Sem exclusão pública |
| Comunidades | POST comunidades | GET comunidades/minhas | PATCH pelo criador | Sem DELETE público |
| Participações sociais | POST membros | GET membros/minhas-comunidades | Papel comum no ingresso; sem promoção pública | DELETE própria participação, exceto dono |
| Publicações | POST publicacoes | GET publicacoes | PATCH próprio conteúdo | DELETE próprio texto |
| Reações | POST reacao | Embutidas no feed | Remover e reagir novamente | DELETE própria reação |

Essa matriz explicita as escolhas de integridade. Não existe endpoint genérico
para alterar classificação, fabricar pontos, escolher vencedor, trocar o autor
ou apagar históricos. Constraints e permissões podem recusar operações que o
framework consegue rotear. DELETE de campeonato não garante apagar evento pontuado.

## Consultas e paginação

| Rota | Filtros e resultado |
| --- | --- |
| GET /api/inicio | q; até 8 comunidades, 12 campeonatos e 6 confrontos; jogos desses campeonatos |
| GET /api/partidas | q, status, jogo, campeonato, minhas=1, page; 24 itens, page e hasMore |
| GET /api/partidas/{id} | Confronto com times e campeonato |
| GET /api/meu-historico | page; duas listas de até 24 itens, resultados/vínculos da própria sessão e hasMore |
| GET /api/campeonatos | minhas=1, disponiveis=1, page; 100 por página |
| GET /api/times | capitao=1, page; 100 por página |
| GET /api/classificacao | minhas=1, page; 100 por página; chave composta, sem rota de detalhe por ID único |
| GET /api/inscricoes | page; 100 por página, com dados do time/campeonato |
| GET /api/campeonatos/{id}/painel | Todas as rodadas e classificação, limite de segurança de 50 mil registros por lista |
| GET /api/comunidades | q, categoria, minhas=1, page; 24 por página |
| GET /api/publicacoes | id_comunidade, page; 24 por página, autor e reações |
| GET /api/meus-times | Elenco, convites e indicação de bloqueio competitivo |

Demais listagens genéricas usam até 100 registros/página, selecionados com page.
A lista de membros da comunidade tem limite de 100; listas auxiliares de
participação têm limite de 1000. Não se afirma paginação sem limite nesses auxiliares.

## Escritas específicas

`POST /api/times/{id}/membros` recebe acao: convidar, aceitar, recusar, sair,
remover ou transferir. Convite usa username exato; remoção/transferência usam
id_jogador. O ator das ações vem da sessão, não do corpo.

`POST /api/campeonatos/{id}/confrontos` gera e inicia em transação.
`POST /api/partidas/{id}/resultado` recebe somente placar_a e placar_b inteiros
de 0 a 1000000. Repetir exatamente o mesmo resultado é idempotente; alterá-lo
depois de processado é recusado.

Para cancelar campeonato, PATCH com somente `{ "status": "cancelado" }`.
Não se permite iniciar ou encerrar pela troca arbitrária de status na API.
Para inscrição, POST recebe id_time e id_campeonato, sem status: nasce pendente.

Membros sociais: GET/POST/DELETE `/api/comunidades/{id}/membros`.
Reações: POST/DELETE `/api/publicacoes/{id}/reacao`, tipo curtida por padrão.
POST de reação já existente ignora duplicata; para mudar o tipo, remover e adicionar.

## Segurança operacional e reprodução

Não publique tokens, senhas ou screenshots de headers de autorização. Os exemplos
de corpos não precisam de credenciais gravadas em arquivos. O Auth e o RLS são
configurações separadas; apenas esconder botões não concede nem revoga permissões.
Taxas/prêmios não representam cobrança e imagens são links, sem upload de arquivos.

Regenere a cópia OpenAPI com `npm run docs:gerar`. O script sobe e encerra um
servidor local temporário, sem executar escritas no Supabase. Use a documentação
interativa para consultar operações e o roteiro para apresentar as permissões.

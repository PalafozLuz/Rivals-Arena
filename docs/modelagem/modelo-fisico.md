# Modelo físico e decisões de dados

O modelo físico é o conjunto SQL abaixo, na ordem indicada. Não é apenas o
`schema.sql`: as migrations substituem regras iniciais e acrescentam permissões,
operações transacionais e a categoria da comunidade.

## Instalação em um Supabase novo

| Ordem | Script | Responsabilidade |
| --- | --- | --- |
| 1 | [schema.sql](../../schema.sql) | 12 tabelas, PK/FK, índices, triggers e políticas iniciais |
| 2 | [001](../../migrations/001_integridade_competitiva.sql) | Integridade de inscrição/resultado, vagas e unicidade de pontuação |
| 3 | [002](../../migrations/002_ciclo_competitivo.sql) | Gerar confrontos, confirmar resultados, avançar e encerrar |
| 4 | [003](../../migrations/003_membros_times.sql) | Convites, aceite, transferência, saída e preservação do elenco histórico |
| 5 | [004](../../migrations/004_edicao_campeonatos.sql) | Edição antes dos confrontos, estados finais e search_path |
| 6 | [Comunidades](../../supabase/migrations/20261117215510_comunidades_integradas.sql) | Categoria, dono automático, participação, feed e reações |

O Supabase já fornece o schema `auth`, os papéis e as funções de identidade.
Esses recursos não são recriados pelos scripts da aplicação. Em banco existente,
verifique as migrations já instaladas e execute somente as que faltarem; não
reaplique o SQL inicial. Não há migration nova nesta etapa documental.

## Tipos e chaves

- A PK do jogador é UUID, compartilhada com `auth.users.id`. Demais entidades
  independentes usam BIGINT gerado por identidade; o código da API trata IDs como
  inteiros seguros de JavaScript.
- Classificação, participação social e reação têm PK composta, respectivamente
  `(id_campeonato,id_time)`, `(id_comunidade,id_jogador)` e `(id_publicacao,id_jogador)`.
- Datas de calendário usam DATE; eventos usam TIMESTAMPTZ. Horários de partida,
  quando informados, são validados pelo dia UTC dentro do período do campeonato.
  A interface pode apresentar horários no fuso do navegador.
- Taxa de inscrição e prêmio usam NUMERIC, sem erro de arredondamento binário
  no armazenamento. São valores informativos; não existe pagamento integrado.
- Os tipos, padrões, nulabilidade, CHECKs e índices de cada coluna estão no
  [dicionário gerado](dicionario-dados.md). Os limites da API podem ser mais
  restritivos do que os da coluna, por exemplo nomes limitados a 100 caracteres.

## Normalização e dados derivados

As relações N:N são decompostas em contratos, inscrições, participações e reações.
Os atributos do relacionamento ficam na tabela associativa; nomes dos times e
jogadores são buscados por JOIN, em vez de repetidos nas inscrições ou partidas.
PKs compostas impedem duplicatas nos pares correspondentes. A modelagem evita
grupos repetidos e separa atributos de entidades distintas.

Há desnormalização deliberada: contadores no jogador e classificação agregada
armazenam dados derivados de partidas. São atualizados na mesma transação do
resultado, com registro individual no histórico e proteção contra processamento
duplicado. Portanto, não se afirma normalização estrita de todos os campos
derivados nem recálculo retroativo de dados antigos.

Jogos e categorias são textos controlados conforme o caso; não há tabela de
catálogo de jogos. O nome do jogo pode aparecer em campeonato e comunidade por
ser metadado independente, sem FK para um catálogo compartilhado.

## Regras executáveis

| Regra | Implementação principal |
| --- | --- |
| Perfil automático e capitão no elenco | Triggers de criação de usuário e time |
| Somente um time ativo por jogador | Índice parcial único em contratos + RPC de aceite |
| Aceite/recusa pelo convidado; remoção/transferência pelo capitão | `gerenciar_membro` |
| Elenco congelado durante campeonato em andamento | Verificações e bloqueios na gestão de membros/desativação |
| Vagas incluem pendentes e aprovados | Trigger de inscrição, com bloqueio do campeonato |
| Aprovação exclusiva do organizador | API, trigger e RLS de inscrição |
| Chave e resultado exclusivos do organizador | `gerar_confrontos` e `registrar_resultado` |
| Eliminatória com potência de dois e sem empate | RPCs e trigger de validação da partida |
| Pontos corridos sem confrontos duplicados | Algoritmo circular e chave campeonato/rodada/número |
| Resultado definitivo e repetição sem novos pontos | `resultado_processado`, trigger e retorno idempotente da RPC |
| Vencedor coerente com o placar | Trigger de validação; nunca escolhido pelo corpo da API |
| Exclusão de partida pontuada bloqueada | Trigger `proteger_resultado_exclusao`, inclusive em cascatas |
| Metadados estruturais editáveis antes dos confrontos | Trigger de proteção de edição |
| Comunidade com dono automático | Trigger de criação; saída do dono recusada |
| Publicação/reação exigem participação | Políticas RLS e identidade derivada da sessão |

## Pontuação

| Resultado | Time na classificação | Jogador no ranking |
| --- | --- | --- |
| Vitória | 3 pontos | 10 pontos |
| Empate em pontos corridos | 1 ponto | 5 pontos |
| Derrota | 0 pontos | 2 pontos |

Só os vínculos ativos dos times envolvidos são pontuados. A classificação também
registra jogos, vitórias, derrotas, empates e saldo. Pontos corridos ordena por
pontos, saldo e vitórias; igualdade nos três critérios é mostrada como liderança
empatada. Eliminatória avança o vencedor até a final. Não há desempate arbitrário
por ID, sorteio ou saldo para decidir o campeão de uma partida eliminatória.

## Exclusão, acesso e limites

As FKs especificam CASCADE ou SET NULL, mas isso não significa que o usuário
possa excluir todos os registros. RLS, grants, API e triggers restringem as ações.
Times são desativados e contratos encerrados; não há DELETE de times para o
usuário autenticado. Resultados processados e seus históricos devem ser preservados.

As 12 tabelas públicas têm RLS. A API valida o token no Auth e usa o mesmo token
nas operações; não usa chave administrativa para gravar. Existem leituras
permitidas por políticas para `anon` no banco, enquanto a API da aplicação exige
sessão. Não se deve confundir proteção visual da página com autorização de dados.

As RPCs privilegiadas verificam a identidade e o papel no registro antes de
operar, usam search_path definido e têm EXECUTE restrito. Os avisos e limites
da auditoria já registrados permanecem em [RELATORIO-TESTES.md](../../RELATORIO-TESTES.md).

O valor legado `grupos` permanece no CHECK inicial de formato. A API e as RPCs
aceitam somente eliminatória e pontos corridos. `moderador` existe no domínio de
papel social, mas não há tela ou fluxo público para atribuir esse papel nesta entrega.

Consulte a [conferência estrutural](conferencia.md): equivalência dos metadados
comparados não é prova de equivalência de todas as funções/políticas ou de produção.

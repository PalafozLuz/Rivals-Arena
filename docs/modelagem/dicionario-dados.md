# Dicionário de dados

Gerado pelos scripts SQL versionados, incluindo todas as migrations. Não contém registros de usuários.

PK = chave primária; FK = chave estrangeira; UK = unicidade (pode ser composta). Colunas de chaves compostas devem ser lidas em conjunto nas restrições.

## campeonatos

Evento organizado por um jogador.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_campeonato | bigint | Não | PK | IDENTITY BY DEFAULT |
| nome | varchar(150) | Não | — | — |
| jogo | varchar(100) | Não | — | — |
| descricao | text | Sim | — | — |
| formato | varchar(30) | Não | — | 'eliminatoria'::character varying |
| max_times | integer | Não | — | — |
| taxa_inscricao | numeric(10,2) | Não | — | 0 |
| premio | numeric(12,2) | Não | — | 0 |
| id_criador | uuid | Não | FK | — |
| data_inicio | date | Não | — | — |
| data_fim | date | Não | — | — |
| status | varchar(20) | Não | — | 'rascunho'::character varying |
| criado_em | timestamptz | Não | — | now() |
| atualizado_em | timestamptz | Não | — | now() |

Restrições efetivas:

- **campeonatos_datas_validas:** `CHECK ((data_fim >= data_inicio))`.
- **campeonatos_formato_valido:** `CHECK (((formato)::text = ANY ((ARRAY['eliminatoria'::character varying, 'pontos_corridos'::character varying, 'grupos'::character varying])::text[])))`.
- **campeonatos_id_criador_fkey:** `FOREIGN KEY (id_criador) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **campeonatos_jogo_check:** `CHECK ((length(TRIM(BOTH FROM jogo)) >= 2))`.
- **campeonatos_max_times_check:** `CHECK (((max_times >= 2) AND (max_times <= 1024)))`.
- **campeonatos_nome_check:** `CHECK ((length(TRIM(BOTH FROM nome)) >= 3))`.
- **campeonatos_pkey:** `PRIMARY KEY (id_campeonato)`.
- **campeonatos_premio_check:** `CHECK ((premio >= (0)::numeric))`.
- **campeonatos_status_valido:** `CHECK (((status)::text = ANY ((ARRAY['rascunho'::character varying, 'aberto'::character varying, 'em_andamento'::character varying, 'encerrado'::character varying, 'cancelado'::character varying])::text[])))`.
- **campeonatos_taxa_inscricao_check:** `CHECK ((taxa_inscricao >= (0)::numeric))`.

Índices (incluem os criados por PK/UK):

- `CREATE UNIQUE INDEX campeonatos_pkey ON public.campeonatos USING btree (id_campeonato)`.

## classificacao_campeonatos

Resumo de desempenho do time no campeonato.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_campeonato | bigint | Não | PK, FK | — |
| id_time | bigint | Não | PK, FK | — |
| pontos | integer | Não | — | 0 |
| jogos | integer | Não | — | 0 |
| vitorias | integer | Não | — | 0 |
| derrotas | integer | Não | — | 0 |
| empates | integer | Não | — | 0 |
| saldo_gols | integer | Não | — | 0 |

Restrições efetivas:

- **classificacao_campeonatos_derrotas_check:** `CHECK ((derrotas >= 0))`.
- **classificacao_campeonatos_empates_check:** `CHECK ((empates >= 0))`.
- **classificacao_campeonatos_id_campeonato_fkey:** `FOREIGN KEY (id_campeonato) REFERENCES campeonatos(id_campeonato) ON DELETE CASCADE`.
- **classificacao_campeonatos_id_time_fkey:** `FOREIGN KEY (id_time) REFERENCES times(id_time) ON DELETE CASCADE`.
- **classificacao_campeonatos_jogos_check:** `CHECK ((jogos >= 0))`.
- **classificacao_campeonatos_pkey:** `PRIMARY KEY (id_campeonato, id_time)`.
- **classificacao_campeonatos_pontos_check:** `CHECK ((pontos >= 0))`.
- **classificacao_campeonatos_vitorias_check:** `CHECK ((vitorias >= 0))`.

Índices (incluem os criados por PK/UK):

- `CREATE UNIQUE INDEX classificacao_campeonatos_pkey ON public.classificacao_campeonatos USING btree (id_campeonato, id_time)`.

## comunidades

Grupo social com dono e categoria.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_comunidade | bigint | Não | PK | IDENTITY BY DEFAULT |
| nome | varchar(120) | Não | UK | — |
| slug | varchar(140) | Não | UK | — |
| descricao | text | Sim | — | — |
| jogo | varchar(100) | Sim | — | — |
| imagem_url | text | Sim | — | — |
| id_criador | uuid | Não | FK | — |
| criada_em | timestamptz | Não | — | now() |
| categoria | text | Não | — | 'Geral'::text |

Restrições efetivas:

- **comunidades_categoria_check:** `CHECK ((categoria = ANY (ARRAY['Geral'::text, 'Brasileiros'::text, 'Simuladores'::text, 'RPG'::text, 'Battle Royale'::text, 'FPS'::text, 'Aventura'::text])))`.
- **comunidades_id_criador_fkey:** `FOREIGN KEY (id_criador) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **comunidades_nome_key:** `UNIQUE (nome)`.
- **comunidades_pkey:** `PRIMARY KEY (id_comunidade)`.
- **comunidades_slug_key:** `UNIQUE (slug)`.

Índices (incluem os criados por PK/UK):

- `CREATE INDEX comunidades_categoria_idx ON public.comunidades USING btree (categoria)`.
- `CREATE UNIQUE INDEX comunidades_nome_key ON public.comunidades USING btree (nome)`.
- `CREATE UNIQUE INDEX comunidades_pkey ON public.comunidades USING btree (id_comunidade)`.
- `CREATE UNIQUE INDEX comunidades_slug_key ON public.comunidades USING btree (slug)`.

## contratos

Convites, vínculos ativos e participações encerradas.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_contrato | bigint | Não | PK | IDENTITY BY DEFAULT |
| id_jogador | uuid | Não | FK | — |
| id_time | bigint | Não | FK | — |
| data_entrada | date | Não | — | CURRENT_DATE |
| data_saida | date | Sim | — | — |
| status | varchar(20) | Não | — | 'ativo'::character varying |

Restrições efetivas:

- **contratos_datas_validas:** `CHECK (((data_saida IS NULL) OR (data_saida >= data_entrada)))`.
- **contratos_id_jogador_fkey:** `FOREIGN KEY (id_jogador) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **contratos_id_time_fkey:** `FOREIGN KEY (id_time) REFERENCES times(id_time) ON DELETE CASCADE`.
- **contratos_pkey:** `PRIMARY KEY (id_contrato)`.
- **contratos_status_consistente:** `CHECK (((((status)::text = 'ativo'::text) AND (data_saida IS NULL)) OR ((status)::text = ANY ((ARRAY['inativo'::character varying, 'pendente'::character varying])::text[]))))`.
- **contratos_status_valido:** `CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'inativo'::character varying, 'pendente'::character varying])::text[])))`.

Índices (incluem os criados por PK/UK):

- `CREATE UNIQUE INDEX contratos_jogador_ativo_unico ON public.contratos USING btree (id_jogador) WHERE (((status)::text = 'ativo'::text) AND (data_saida IS NULL))`.
- `CREATE UNIQUE INDEX contratos_pkey ON public.contratos USING btree (id_contrato)`.
- `CREATE INDEX contratos_time_idx ON public.contratos USING btree (id_time)`.
- `CREATE UNIQUE INDEX contratos_time_jogador_ativo_unico ON public.contratos USING btree (id_time, id_jogador) WHERE (((status)::text = 'ativo'::text) AND (data_saida IS NULL))`.

## historico_ranking

Registro individual de pontos por resultado.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_historico | bigint | Não | PK | IDENTITY BY DEFAULT |
| id_jogador | uuid | Não | FK | — |
| id_campeonato | bigint | Sim | FK | — |
| id_partida | bigint | Sim | FK | — |
| pontos | integer | Não | — | — |
| motivo | varchar(100) | Não | — | — |
| criado_em | timestamptz | Não | — | now() |

Restrições efetivas:

- **historico_ranking_id_campeonato_fkey:** `FOREIGN KEY (id_campeonato) REFERENCES campeonatos(id_campeonato) ON DELETE SET NULL`.
- **historico_ranking_id_jogador_fkey:** `FOREIGN KEY (id_jogador) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **historico_ranking_id_partida_fkey:** `FOREIGN KEY (id_partida) REFERENCES partidas(id_partida) ON DELETE SET NULL`.
- **historico_ranking_pkey:** `PRIMARY KEY (id_historico)`.

Índices (incluem os criados por PK/UK):

- `CREATE UNIQUE INDEX historico_ranking_pkey ON public.historico_ranking USING btree (id_historico)`.

## inscricoes

Solicitação de participação de um time em um campeonato.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_inscricao | bigint | Não | PK | IDENTITY BY DEFAULT |
| id_time | bigint | Não | FK, UK | — |
| id_campeonato | bigint | Não | FK, UK | — |
| data_inscricao | timestamptz | Não | — | now() |
| status | varchar(20) | Não | — | 'pendente'::character varying |

Restrições efetivas:

- **inscricoes_id_campeonato_fkey:** `FOREIGN KEY (id_campeonato) REFERENCES campeonatos(id_campeonato) ON DELETE CASCADE`.
- **inscricoes_id_time_fkey:** `FOREIGN KEY (id_time) REFERENCES times(id_time) ON DELETE CASCADE`.
- **inscricoes_pkey:** `PRIMARY KEY (id_inscricao)`.
- **inscricoes_status_valido:** `CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'aprovada'::character varying, 'recusada'::character varying, 'cancelada'::character varying])::text[])))`.
- **inscricoes_time_campeonato_unicos:** `UNIQUE (id_time, id_campeonato)`.

Índices (incluem os criados por PK/UK):

- `CREATE INDEX inscricoes_campeonato_idx ON public.inscricoes USING btree (id_campeonato)`.
- `CREATE UNIQUE INDEX inscricoes_pkey ON public.inscricoes USING btree (id_inscricao)`.
- `CREATE UNIQUE INDEX inscricoes_time_campeonato_unicos ON public.inscricoes USING btree (id_time, id_campeonato)`.

## jogadores

Perfil público ligado à identidade do Supabase Auth.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_jogador | uuid | Não | PK, FK | — |
| nome | varchar(100) | Não | — | ''::character varying |
| username | varchar(50) | Não | UK | — |
| avatar_url | text | Sim | — | — |
| bio | text | Sim | — | — |
| pontuacao_ranking | integer | Não | — | 0 |
| vitorias | integer | Não | — | 0 |
| derrotas | integer | Não | — | 0 |
| data_cadastro | timestamptz | Não | — | now() |
| atualizado_em | timestamptz | Não | — | now() |

Restrições efetivas:

- **jogadores_derrotas_check:** `CHECK ((derrotas >= 0))`.
- **jogadores_id_jogador_fkey:** `FOREIGN KEY (id_jogador) REFERENCES auth.users(id) ON DELETE CASCADE`.
- **jogadores_pkey:** `PRIMARY KEY (id_jogador)`.
- **jogadores_pontuacao_ranking_check:** `CHECK ((pontuacao_ranking >= 0))`.
- **jogadores_username_key:** `UNIQUE (username)`.
- **jogadores_vitorias_check:** `CHECK ((vitorias >= 0))`.

Índices (incluem os criados por PK/UK):

- `CREATE UNIQUE INDEX jogadores_pkey ON public.jogadores USING btree (id_jogador)`.
- `CREATE UNIQUE INDEX jogadores_username_key ON public.jogadores USING btree (username)`.

## membros_comunidade

Participação e papel do jogador na comunidade.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_comunidade | bigint | Não | PK, FK | — |
| id_jogador | uuid | Não | PK, FK | — |
| papel | varchar(20) | Não | — | 'membro'::character varying |
| entrou_em | timestamptz | Não | — | now() |

Restrições efetivas:

- **membros_comunidade_id_comunidade_fkey:** `FOREIGN KEY (id_comunidade) REFERENCES comunidades(id_comunidade) ON DELETE CASCADE`.
- **membros_comunidade_id_jogador_fkey:** `FOREIGN KEY (id_jogador) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **membros_comunidade_pkey:** `PRIMARY KEY (id_comunidade, id_jogador)`.
- **membros_papel_valido:** `CHECK (((papel)::text = ANY ((ARRAY['membro'::character varying, 'moderador'::character varying, 'dono'::character varying])::text[])))`.

Índices (incluem os criados por PK/UK):

- `CREATE INDEX membros_comunidade_jogador_idx ON public.membros_comunidade USING btree (id_jogador, id_comunidade)`.
- `CREATE UNIQUE INDEX membros_comunidade_pkey ON public.membros_comunidade USING btree (id_comunidade, id_jogador)`.

## partidas

Confronto por rodada, placar e processamento de resultado.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_partida | bigint | Não | PK | IDENTITY BY DEFAULT |
| id_campeonato | bigint | Não | FK, UK | — |
| rodada | integer | Não | UK | — |
| numero_partida | integer | Não | UK | — |
| id_time_a | bigint | Sim | FK | — |
| id_time_b | bigint | Sim | FK | — |
| placar_a | integer | Não | — | 0 |
| placar_b | integer | Não | — | 0 |
| vencedor | bigint | Sim | FK | — |
| data_hora | timestamptz | Sim | — | — |
| status | varchar(20) | Não | — | 'agendada'::character varying |
| resultado_processado | boolean | Não | — | false |

Restrições efetivas:

- **partidas_chave_unica:** `UNIQUE (id_campeonato, rodada, numero_partida)`.
- **partidas_id_campeonato_fkey:** `FOREIGN KEY (id_campeonato) REFERENCES campeonatos(id_campeonato) ON DELETE CASCADE`.
- **partidas_id_time_a_fkey:** `FOREIGN KEY (id_time_a) REFERENCES times(id_time) ON DELETE SET NULL`.
- **partidas_id_time_b_fkey:** `FOREIGN KEY (id_time_b) REFERENCES times(id_time) ON DELETE SET NULL`.
- **partidas_numero_partida_check:** `CHECK ((numero_partida > 0))`.
- **partidas_pkey:** `PRIMARY KEY (id_partida)`.
- **partidas_placar_a_check:** `CHECK ((placar_a >= 0))`.
- **partidas_placar_b_check:** `CHECK ((placar_b >= 0))`.
- **partidas_rodada_check:** `CHECK ((rodada > 0))`.
- **partidas_status_valido:** `CHECK (((status)::text = ANY ((ARRAY['agendada'::character varying, 'em_andamento'::character varying, 'finalizada'::character varying, 'cancelada'::character varying])::text[])))`.
- **partidas_times_diferentes:** `CHECK (((id_time_a IS NULL) OR (id_time_b IS NULL) OR (id_time_a <> id_time_b)))`.
- **partidas_vencedor_fkey:** `FOREIGN KEY (vencedor) REFERENCES times(id_time) ON DELETE SET NULL`.
- **partidas_vencedor_valido:** `CHECK (((vencedor IS NULL) OR ((vencedor = id_time_a) OR (vencedor = id_time_b))))`.

Índices (incluem os criados por PK/UK):

- `CREATE INDEX partidas_campeonato_data_idx ON public.partidas USING btree (id_campeonato, data_hora)`.
- `CREATE UNIQUE INDEX partidas_chave_unica ON public.partidas USING btree (id_campeonato, rodada, numero_partida)`.
- `CREATE UNIQUE INDEX partidas_pkey ON public.partidas USING btree (id_partida)`.

## publicacoes

Texto publicado por um membro.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_publicacao | bigint | Não | PK | IDENTITY BY DEFAULT |
| id_comunidade | bigint | Não | FK | — |
| id_autor | uuid | Não | FK | — |
| conteudo | text | Não | — | — |
| criada_em | timestamptz | Não | — | now() |
| atualizada_em | timestamptz | Não | — | now() |

Restrições efetivas:

- **publicacoes_conteudo_check:** `CHECK ((length(TRIM(BOTH FROM conteudo)) > 0))`.
- **publicacoes_id_autor_fkey:** `FOREIGN KEY (id_autor) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **publicacoes_id_comunidade_fkey:** `FOREIGN KEY (id_comunidade) REFERENCES comunidades(id_comunidade) ON DELETE CASCADE`.
- **publicacoes_pkey:** `PRIMARY KEY (id_publicacao)`.

Índices (incluem os criados por PK/UK):

- `CREATE INDEX publicacoes_comunidade_data_idx ON public.publicacoes USING btree (id_comunidade, criada_em DESC)`.
- `CREATE UNIQUE INDEX publicacoes_pkey ON public.publicacoes USING btree (id_publicacao)`.

## reacoes_publicacao

Reação única de um jogador em uma publicação.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_publicacao | bigint | Não | PK, FK | — |
| id_jogador | uuid | Não | PK, FK | — |
| tipo | varchar(20) | Não | — | 'curtida'::character varying |
| criada_em | timestamptz | Não | — | now() |

Restrições efetivas:

- **reacoes_publicacao_id_jogador_fkey:** `FOREIGN KEY (id_jogador) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **reacoes_publicacao_id_publicacao_fkey:** `FOREIGN KEY (id_publicacao) REFERENCES publicacoes(id_publicacao) ON DELETE CASCADE`.
- **reacoes_publicacao_pkey:** `PRIMARY KEY (id_publicacao, id_jogador)`.
- **reacoes_tipo_valido:** `CHECK (((tipo)::text = ANY ((ARRAY['curtida'::character varying, 'apoio'::character varying, 'risada'::character varying])::text[])))`.

Índices (incluem os criados por PK/UK):

- `CREATE INDEX reacoes_jogador_idx ON public.reacoes_publicacao USING btree (id_jogador, id_publicacao)`.
- `CREATE UNIQUE INDEX reacoes_publicacao_pkey ON public.reacoes_publicacao USING btree (id_publicacao, id_jogador)`.

## times

Equipe e referência ao capitão atual.

| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |
| --- | --- | --- | --- | --- |
| id_time | bigint | Não | PK | IDENTITY BY DEFAULT |
| nome | varchar(100) | Não | — | — |
| logo_url | text | Sim | — | — |
| id_capitao | uuid | Não | FK | — |
| status | varchar(20) | Não | — | 'ativo'::character varying |
| data_criacao | timestamptz | Não | — | now() |
| atualizado_em | timestamptz | Não | — | now() |

Restrições efetivas:

- **times_id_capitao_fkey:** `FOREIGN KEY (id_capitao) REFERENCES jogadores(id_jogador) ON DELETE CASCADE`.
- **times_nome_check:** `CHECK ((length(TRIM(BOTH FROM nome)) >= 2))`.
- **times_pkey:** `PRIMARY KEY (id_time)`.
- **times_status_check:** `CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'inativo'::character varying])::text[])))`.

Índices (incluem os criados por PK/UK):

- `CREATE UNIQUE INDEX times_pkey ON public.times USING btree (id_time)`.

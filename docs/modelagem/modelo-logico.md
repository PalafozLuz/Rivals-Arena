# Modelo lógico

12 tabelas do domínio e 92 atributos. AUTH_USERS pertence ao Supabase, fora dessas 12 tabelas.

```mermaid
erDiagram
    campeonatos {
        bigint id_campeonato PK
        varchar_150_ nome
        varchar_100_ jogo
        text descricao
        varchar_30_ formato
        integer max_times
        numeric taxa_inscricao
        numeric premio
        uuid id_criador FK
        date data_inicio
        date data_fim
        varchar_20_ status
        timestamptz criado_em
        timestamptz atualizado_em
    }
    classificacao_campeonatos {
        bigint id_campeonato PK, FK
        bigint id_time PK, FK
        integer pontos
        integer jogos
        integer vitorias
        integer derrotas
        integer empates
        integer saldo_gols
    }
    comunidades {
        bigint id_comunidade PK
        varchar_120_ nome UK
        varchar_140_ slug UK
        text descricao
        varchar_100_ jogo
        text imagem_url
        uuid id_criador FK
        timestamptz criada_em
        text categoria
    }
    contratos {
        bigint id_contrato PK
        uuid id_jogador FK
        bigint id_time FK
        date data_entrada
        date data_saida
        varchar_20_ status
    }
    historico_ranking {
        bigint id_historico PK
        uuid id_jogador FK
        bigint id_campeonato FK
        bigint id_partida FK
        integer pontos
        varchar_100_ motivo
        timestamptz criado_em
    }
    inscricoes {
        bigint id_inscricao PK
        bigint id_time FK, UK
        bigint id_campeonato FK, UK
        timestamptz data_inscricao
        varchar_20_ status
    }
    jogadores {
        uuid id_jogador PK, FK
        varchar_100_ nome
        varchar_50_ username UK
        text avatar_url
        text bio
        integer pontuacao_ranking
        integer vitorias
        integer derrotas
        timestamptz data_cadastro
        timestamptz atualizado_em
    }
    membros_comunidade {
        bigint id_comunidade PK, FK
        uuid id_jogador PK, FK
        varchar_20_ papel
        timestamptz entrou_em
    }
    partidas {
        bigint id_partida PK
        bigint id_campeonato FK, UK
        integer rodada UK
        integer numero_partida UK
        bigint id_time_a FK
        bigint id_time_b FK
        integer placar_a
        integer placar_b
        bigint vencedor FK
        timestamptz data_hora
        varchar_20_ status
        boolean resultado_processado
    }
    publicacoes {
        bigint id_publicacao PK
        bigint id_comunidade FK
        uuid id_autor FK
        text conteudo
        timestamptz criada_em
        timestamptz atualizada_em
    }
    reacoes_publicacao {
        bigint id_publicacao PK, FK
        uuid id_jogador PK, FK
        varchar_20_ tipo
        timestamptz criada_em
    }
    times {
        bigint id_time PK
        varchar_100_ nome
        text logo_url
        uuid id_capitao FK
        varchar_20_ status
        timestamptz data_criacao
        timestamptz atualizado_em
    }
    jogadores ||--o{ campeonatos : "id_criador"
    campeonatos ||--o{ classificacao_campeonatos : "id_campeonato"
    times ||--o{ classificacao_campeonatos : "id_time"
    jogadores ||--o{ comunidades : "id_criador"
    jogadores ||--o{ contratos : "id_jogador"
    times ||--o{ contratos : "id_time"
    campeonatos |o--o{ historico_ranking : "id_campeonato"
    jogadores ||--o{ historico_ranking : "id_jogador"
    partidas |o--o{ historico_ranking : "id_partida"
    campeonatos ||--o{ inscricoes : "id_campeonato"
    times ||--o{ inscricoes : "id_time"
    AUTH_USERS ||--o| jogadores : "id_jogador"
    comunidades ||--o{ membros_comunidade : "id_comunidade"
    jogadores ||--o{ membros_comunidade : "id_jogador"
    campeonatos ||--o{ partidas : "id_campeonato"
    times |o--o{ partidas : "id_time_a"
    times |o--o{ partidas : "id_time_b"
    times |o--o{ partidas : "vencedor"
    jogadores ||--o{ publicacoes : "id_autor"
    comunidades ||--o{ publicacoes : "id_comunidade"
    jogadores ||--o{ reacoes_publicacao : "id_jogador"
    publicacoes ||--o{ reacoes_publicacao : "id_publicacao"
    jogadores ||--o{ times : "id_capitao"
```

[Abrir diagrama SVG para ampliar](modelo-logico.svg).

AUTH_USERS/jogadores usa PK/FK compartilhada: uma identidade possui no máximo um perfil; o trigger o cria no cadastro. As demais cardinalidades mostram as FKs. Restrições de unicidade, índices parciais, triggers e RPCs complementam os limites do diagrama. Consulte o [dicionário completo](dicionario-dados.md) e as [regras e decisões](modelo-fisico.md).

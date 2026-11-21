# Rivals Arena

O Rivals Arena é uma plataforma para jogadores encontrarem comunidades, montarem times e participarem de campeonatos.

## Acesse o projeto

- **Site:** [rivals-arena-beta.vercel.app](https://rivals-arena-beta.vercel.app/)
- **Código-fonte:** [GitHub — Rivals Arena](https://github.com/PalafozLuz/Rivals-Arena)

## Objetivo

Reunir em um só lugar as ferramentas para jogadores se conhecerem, organizarem equipes e acompanharem competições e partidas.

## O que o sistema oferece

- Cadastro, login e perfil de jogador.
- Criação de times, convites e gerenciamento de membros.
- Comunidades de jogos com publicações e reações.
- Criação e inscrição em campeonatos.
- Partidas, resultados e classificação.
- Páginas adaptadas para celular e computador.

## Tecnologias

- HTML, CSS e JavaScript.
- Node.js e Express na API.
- PostgreSQL e Supabase para banco de dados e autenticação.
- Vercel para publicação do site.

## Como executar localmente

É necessário ter **Node.js 22** instalado.

1. Baixe o repositório ou clone-o:

   ```bash
   git clone https://github.com/PalafozLuz/Rivals-Arena.git
   cd Rivals-Arena
   ```

2. Instale as dependências e inicie o servidor:

   ```bash
   npm install
   npm start
   ```

3. Abra [http://localhost:3000](http://localhost:3000).

O projeto já aponta para a configuração pública do Supabase em `supabase-config.js`. Para usar outro projeto Supabase, configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` no arquivo `.env`, seguindo o modelo `.env.example`. Use somente a chave pública `anon`; nunca coloque uma chave `service_role` no navegador.

## Banco de dados

Para criar um banco novo, execute `schema.sql` no Supabase. Depois, aplique as migrations nesta ordem:

1. [001 — Integridade competitiva](migrations/001_integridade_competitiva.sql)
2. [002 — Ciclo competitivo](migrations/002_ciclo_competitivo.sql)
3. [003 — Membros dos times](migrations/003_membros_times.sql)
4. [004 — Edição de campeonatos](migrations/004_edicao_campeonatos.sql)
5. [Comunidades integradas](supabase/migrations/20261117215510_comunidades_integradas.sql)
6. [Nome de usuário único](supabase/migrations/20261120220301_username_unico_sem_renomear.sql)
7. [Banner do perfil](supabase/migrations/20261121003401_perfil_banner.sql)

**Não execute `schema.sql` novamente em um banco que já tenha dados.**

Os scripts [criar-comunidades-jogos.sql](scripts/criar-comunidades-jogos.sql) e [criar-campeonatos-iniciais.sql](scripts/criar-campeonatos-iniciais.sql) inserem conteúdo inicial. Eles esperam que os perfis responsáveis já existam no banco.

## Modelagem e documentação

- [Índice da documentação](docs/README.md)
- Modelo conceitual: [descrição](docs/modelagem/modelo-conceitual.md) · [diagrama](docs/modelagem/modelo-conceitual.svg)
- Modelo lógico e DER: [descrição](docs/modelagem/modelo-logico.md) · [diagrama](docs/modelagem/modelo-logico.svg) · [arquivo Mermaid](docs/modelagem/modelo-logico.mmd)
- [Modelo físico](docs/modelagem/modelo-fisico.md)
- [Dicionário de dados](docs/modelagem/dicionario-dados.md)
- [Requisitos do sistema](docs/requisitos.md)
- [Roteiro de demonstração](docs/roteiro-demonstracao.md)

## Testes

- `npm test` — testes da API e do banco.
- `npm run test:e2e` — testes automatizados das telas; instale o navegador com `npx playwright install chromium` antes da primeira execução.

Na última verificação local, passaram **27 testes de API/banco** e **31 testes de tela**. Os testes de tela usam sessões e dados simulados; isso não substitui a validação de todos os fluxos com contas reais no site publicado.

## O que ainda falta

- Completar a busca da página inicial: ela filtra campeonatos e jogos, mas ainda não pesquisa times nem exibe resultados de comunidades.
- A recuperação de senha por e-mail está desativada no momento.
- Fazer a conferência final dos principais fluxos no site publicado com contas de teste.

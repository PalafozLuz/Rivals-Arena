# Requisitos, escopo e rastreabilidade

Base: briefing de seis páginas **EP 190 - RIVAL ARENA - Desenvolvimento de Sistemas**,
fornecido pelo usuário. As páginas 2 e 3 pedem interface web, API documentada e
banco em três níveis; páginas 4 e 5 trazem os critérios de avaliação. Este texto
registra decisões da equipe e evidências do código; não modifica o briefing.

## Objetivo e atores

A plataforma permite formar equipes, organizar competições e participar de
comunidades. Visitante acessa apresentação, login, cadastro e recuperação.
Jogador autenticado mantém perfil, participa de time/comunidades e consulta
campeonatos e partidas. Capitão administra sua equipe e solicita inscrições.
Organizador administra o campeonato que criou e confirma resultados.
Dono de comunidade edita o grupo; autores editam/excluem suas publicações.
Papéis são definidos pela relação com o registro, sem administrador global na interface.

## Requisitos funcionais

| ID | Requisito | Implementação/evidência | Situação |
| --- | --- | --- | --- |
| RF01 | Cadastrar, autenticar e encerrar sessão | Supabase Auth, auth.js, cadastro.html/login.html | Implementado; fluxo real testado |
| RF02 | Recuperar senha por e-mail e definir nova senha | recuperar-senha.html/redefinir-senha.html | Código e troca real testados; retorno/e-mail pendentes |
| RF03 | Consultar e editar perfil, bio, imagem e estatísticas | perfil.html, API jogadores, meu-historico | Implementado |
| RF04 | Criar e desativar time | times.html/campeonatos.html, API times | Implementado; preserva histórico |
| RF05 | Convidar, aceitar/recusar, sair, remover e transferir capitania | membros.js, API de membros, migration 003 | Implementado |
| RF06 | Criar, editar e cancelar campeonato | campeonatos.html, API campeonatos, migration 004 | Implementado com restrições de estado |
| RF07 | Solicitar, aprovar/recusar e cancelar inscrição | API inscricoes, migration 001 | Implementado; depende do papel |
| RF08 | Gerar confrontos eliminatórios ou por pontos corridos | RPC gerar_confrontos, migration 002 | Implementado; grupos fora do fluxo |
| RF09 | Confirmar placar e avançar vencedores | API resultado, RPC registrar_resultado | Implementado; resultado definitivo |
| RF10 | Atualizar classificação, ranking e histórico | Triggers e historico_ranking | Implementado e transacional |
| RF11 | Encerrar campeonato ao concluir sua competição | RPC registrar_resultado | Implementado |
| RF12 | Buscar comunidades/jogos/campeonatos e consultar partidas | Home e partidas, dados-publicos.js | Implementado com paginação e filtros |
| RF13 | Criar/editar comunidade e entrar/sair | comunidade.html, comunidades.js e API | Implementado; dono não pode sair |
| RF14 | Publicar, editar/excluir texto e reagir | API publicacoes e reacao, RLS | Implementado |
| RF15 | Apresentar clipe externo identificado como conteúdo da Twitch | homepage.html | Integração existente; conferir no domínio publicado |

## Regras de negócio

| ID | Regra | Evidência |
| --- | --- | --- |
| RN01 | No máximo um vínculo ativo de time por jogador | Índice parcial único + RPC de aceite |
| RN02 | Convite só vira vínculo ativo com aceite do convidado | gerenciar_membro |
| RN03 | Congelar elenco com campeonato em andamento | RPC de membros e trigger de desativação |
| RN04 | Pendentes/aprovadas reservam vagas; não reduzir limite abaixo das reservas | Migration 001 |
| RN05 | Somente organizador aprova/recusa e confirma resultados | API + RLS/triggers/RPCs |
| RN06 | Inscrição só em rascunho/aberto e data inicial não anterior ao dia do banco | Trigger de inscrição |
| RN07 | Horário informado deve caber no período, pelo dia UTC | Trigger de validação da partida |
| RN08 | Eliminatória exige 2, 4, 8... aprovados e placar sem empate | Migration 002 e validação da partida |
| RN09 | Pontos corridos gera cada par uma vez, inclusive para total ímpar | Método circular; testes de ciclo |
| RN10 | Pontos do time: vitória 3, empate 1, derrota 0 | Trigger de resultado |
| RN11 | Ranking individual: vitória 10, empate 5, derrota 2 | Trigger e histórico único por jogador/partida |
| RN12 | Repetir o mesmo resultado não repete pontos; outro resultado é recusado | registrar_resultado e resultado_processado |
| RN13 | Partida pontuada não pode ser alterada/excluída | Triggers de proteção |
| RN14 | Desempate da tabela por pontos, saldo e vitórias; igualdade permanece explícita | Painel de classificação |
| RN15 | Dono é membro automático; publicação e reação exigem participação | Migration de comunidades |

## Requisitos não funcionais e limites de evidência

| ID | Requisito | Evidência e limite |
| --- | --- | --- |
| RNF01 | Layout em desktop, tablet e celular | Suíte Chromium nas larguras 360/768/1440; revisar produção e outros navegadores |
| RNF02 | Integração HTTP e API organizada | Express, fetch, respostas JSON e documentação OpenAPI |
| RNF03 | Autorização por registro e integridade | Token validado no Auth, mesmo token no banco, RLS nas 12 tabelas, triggers/RPCs |
| RNF04 | Preservação da informação histórica | Desativação, encerramento de contratos, histórico de pontos e resultados definitivos |
| RNF05 | Código versionado e instruções reprodutíveis | GitHub, package-lock.json, README, testes e scripts SQL |
| RNF06 | Tratamento de erros e acessibilidade básica | Estados de carregamento, mensagens, rótulos, teclado e menu; sem auditoria WCAG completa |
| RNF07 | Tempo de resposta e escala adequados | Limites/paginação/índices/timeouts; sem benchmark ou teste de carga, sem SLA afirmado |
| RNF08 | Plataforma acessível por navegador em endereço público | Configuração Vercel presente; publicação e teste final ainda pendentes |

## Relação com as entregas do briefing

| Pedido do briefing | Entrega no repositório | Avaliação atual |
| --- | --- | --- |
| Front-end responsivo e funcional | HTML/CSS/JS e testes de telas | Implementado; falta conferência de produção |
| Framework de back-end e integração HTTP | server.js, api.js, dados-publicos.js | Express implementado |
| Endpoints padronizados e documentados | /api/docs, /api/openapi.json, docs/api | Implementado e exportado |
| CRUD das entidades | Matriz em docs/api/README.md | Operações disponíveis e restrições explícitas; não há DELETE público para toda tabela |
| Banco conceitual, lógico e físico | docs/modelagem, schema.sql e migrations | Documentado e conferido por metadados |
| Integridade, PK/FK e normalização | Dicionário, constraints e decisões físicas | Documentado; agregados derivados declarados |
| Git e README | PalafozLuz/Rivals-Arena e README.md | Repositório privado criado e primeiro envio confirmado |
| Regras de pontuação, limites e datas | Migrations e testes de banco/API | Implementado; evidências no relatório |

O critério de avaliação menciona CRUD para todas as entidades, enquanto a entrega
descritiva fala em entidades principais definidas pela equipe. A aplicação utiliza
operações de negócio e preservação histórica: não se apresenta uma tabela somente
de leitura como CRUD completo. A matriz registra a cobertura real para discussão
com o instrutor, sem inventar endpoints ou permitir exclusão de resultados por conveniência.

## Escopo e pendências

Grupos, matchmaking automático, streaming próprio, aplicativo Windows, pagamento,
upload binário de avatar/logo e administração global não foram implementados.
Inscrição atende à alternativa de participação prevista na contextualização.
Imagens são URLs e o clipe é conteúdo externo. O briefing contextualiza App + Web,
mas a entrega detalhada exige plataforma acessível via navegador; não foi criado app nativo.

Continuam pendentes: publicar na Vercel, autorizar URLs de Auth, receber e validar
o e-mail de recuperação, verificar o clipe no domínio publicado e executar o
roteiro completo com contas distintas em produção. Não há evidência de carga,
auditoria completa de acessibilidade ou homologação por instrutor nesta etapa.

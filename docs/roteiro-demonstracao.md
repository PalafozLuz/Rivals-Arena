# Roteiro de demonstração e aceite final

Objetivo: apresentar o sistema e executar o ciclo com identidades distintas.
Este é um roteiro de teste manual, não uma declaração de homologação concluída.

## Preparação

1. Execute `npm ci`, `npm start` e abra `http://localhost:3000`. Para produção,
   substitua o endereço pelo domínio realmente publicado e teste novamente.
2. Prepare quatro contas próprias de demonstração, em perfis de navegador
   separados: **Organizador**, **Capitão A**, **Capitão B** e **Membro A**.
   Não use somente abas normais para alternar identidades, pois compartilham sessão.
3. Escolha nomes exclusivos para não confundir dados de demonstrações anteriores.
   Não reutilize campeonatos com resultados já processados.
4. Use datas válidas, com início não anterior ao dia do banco. Confira o dia UTC
   se a demonstração ocorrer perto da virada de data no Brasil.
5. Tenha README, diagrama, dicionário e `/api/docs` abertos. Não mostre tokens,
   senhas, cabeçalhos de autenticação ou dados pessoais de outros jogadores.

## Apresentação técnica inicial (aproximadamente 3 minutos)

- Apresentar o problema: organizar competições amadoras e reunir jogadores.
- Mostrar a separação entre interface, API Express, Supabase Auth e PostgreSQL.
- Abrir o conceitual e explicar jogador, time, inscrição, partida e comunidade.
- No lógico, mostrar a PK composta da classificação e a tabela de contratos
  para manter o histórico; no físico, mostrar a ordem das migrations.
- Abrir `/api/docs`, conferir as rotas de geração e resultado e explicar que
  placar definitivo e pontuação são uma operação transacional.

## Cenário principal: eliminatória com dois times

| Passo | Conta | Ação | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Todas | Cadastrar e entrar | Perfil automático e sessão independente |
| 2 | Capitão A | Editar nome/bio e recarregar | Dados persistem; contadores reais |
| 3 | Capitão A | Criar Time A e convidar o usuário exato de Membro A | Convite pendente; convidado ainda não é membro ativo |
| 4 | Membro A | Aceitar convite em Meus times | Elenco contém capitão e membro |
| 5 | Capitão B | Criar Time B | Capitão incluído no elenco |
| 6 | Organizador | Criar campeonato eliminatório com limite 2 e datas válidas | Evento salvo e disponível para inscrição |
| 7 | Capitães A/B | Inscrever os próprios times | Duas inscrições pendentes; não aprovadas automaticamente |
| 8 | Organizador | Aprovar as duas inscrições | Status aprovadas e vagas respeitadas |
| 9 | Organizador | Gerar partidas | Uma final e campeonato em andamento |
| 10 | Capitão A | Tentar convidar/remover membro durante o campeonato | Alteração de elenco recusada |
| 11 | Capitão B | Abrir confronto | Consulta permitida; sem formulário autorizado de resultado |
| 12 | Organizador | Informar 2 × 1 e confirmar | Time A campeão; evento encerrado automaticamente |
| 13 | Todas | Recarregar partidas, perfil e histórico | Placar persistente e pontuação coerente |
| 14 | Capitão A | Consultar perfil do próprio jogador | Acrescentou 1 vitória e 10 pontos ao total inicial |
| 15 | Membro A | Consultar perfil | Acrescentou 1 vitória e 10 pontos; registro no histórico |
| 16 | Capitão B | Consultar perfil | Acrescentou 2 pontos por derrota; histórico do confronto |
| 17 | Organizador | Consultar classificação/painel | Time A 3 pontos, Time B 0; placar definitivo |
| 18 | Organizador | Reabrir painel e recarregar | Sem nova pontuação e sem edição do resultado |

Compare os **incrementos** aos valores anteriores, não valores absolutos de contas
reutilizadas. Se ocorrer falha de rede na confirmação, recarregue antes de tentar
novamente: o mesmo resultado pode já ter sido confirmado. O retry idempotente é
verificado pela suíte de banco/API; não force alteração de placar na demonstração.

## Cenário complementar: pontos corridos e empate

Com os times liberados após o encerramento, crie outro campeonato de pontos
corridos com dois aprovados. Gere o confronto e registre 1 × 1. Cada time deve
receber 1 ponto; cada membro ativo, 5 pontos individuais. Não há aumento de
vitórias. O campeonato encerra ao finalizar todas as partidas; a liderança
empatada deve ser explícita. Não é necessário inventar um campeão para desempatar.

Para demonstrar quantidade ímpar, prepare um terceiro capitão/time: três times
geram três confrontos únicos. Esse cenário já possui teste automatizado de banco,
mas sua execução manual exige uma quinta conta além das quatro do cenário principal.

## Comunidade e proteção de conteúdo

1. Organizador cria uma comunidade e aparece automaticamente como dono.
2. Membro A entra, publica texto, edita, recarrega e confere persistência.
3. Capitão B entra, reage e remove sua própria reação; contador acompanha o banco.
4. Capitão B não pode editar/excluir o texto de Membro A.
5. Membro A exclui a própria publicação. O dono não consegue sair da comunidade.
6. Home lista os registros reais e abre a comunidade selecionada. Busca e filtros
   de partidas mostram dados compatíveis ou mensagem vazia, sem transmissões fictícias.

## Permissões, datas e limites

Os bloqueios de terceiro na API/banco têm testes automatizados; botões ocultos
isoladamente não provam autorização. Apresente as evidências em
[RELATORIO-TESTES.md](../RELATORIO-TESTES.md), sem executar comandos destrutivos
ou expor tokens de outras contas. Para reforçar manualmente:

- Tentar cadastro com senhas diferentes e verificar a mensagem.
- Tentar data final anterior à inicial: operação deve ser recusada.
- Cancelar inscrição própria antes dos confrontos e confirmar que não apaga o histórico.
- Em campeonato novo, tentar gerar eliminatória com três aprovados: deve recusar
  sem iniciar ou criar chave parcial (exige terceiro time).
- Encerrar sessão e abrir perfil protegido: deve pedir login.

## Senha e endereço publicado

Siga [CONFIGURACAO-AUTH.md](../CONFIGURACAO-AUTH.md): autorize o endereço de
retorno, envie recuperação para a própria conta, abra o link e defina nova senha.
Conferir recebimento do e-mail e login no domínio publicado ainda é pendência.
Um teste com SDK simulado não comprova a entrega do e-mail.

## Revisão de dispositivos e encerramento (aproximadamente 3 minutos)

Em 360, 768 e 1440 px, conferir menu, campos, mensagens, cards e rolagem do
chaveamento. Repetir no domínio publicado, incluindo conteúdo da Twitch e URLs
de retorno. Mostrar GitHub, scripts SQL, relatório de testes e documentação.

Registrar por cenário: data, ambiente/URL, contas de demonstração sem senhas,
resultado esperado, resultado observado e evidência sem dados sensíveis.
Usar **Aprovado**, **Reprovado** ou **Não executado**; não preencher como aprovado
por antecipação. Registros reais de demonstração devem ficar identificados.
Não apagar partidas pontuadas para limpar a apresentação nem desabilitar triggers.

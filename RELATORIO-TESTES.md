# Verificação — Arena Rivals

Data: 17/11/2026. Projeto Supabase: Rivals Arena.

Atualização documental de 19/11/2026: `npm run docs:gerar` recriou o banco
descartável e comparou tipos, nulabilidade, padrões, PK/FK/UK/CHECK, índices e
habilitação de RLS com os metadados remotos: 12 tabelas, 92 atributos, 73 restrições,
26 índices, sem divergências no escopo comparado. Sem escrita no Supabase remoto.
OpenAPI com 25 caminhos exportada da aplicação local. Diagramas Mermaid
validados, exportados em SVG e inspecionados visualmente em Chromium.
As contagens de 21/16 abaixo correspondem às suítes já executadas na etapa
anterior, não a uma nova homologação de produção. Detalhes em
[docs/modelagem/conferencia.md](docs/modelagem/conferencia.md).

| Camada | Resultado |
| --- | --- |
| API e PostgreSQL local | 21 testes aprovados (`npm test`) |
| Interface isolada, sessão/API simuladas | 16 testes aprovados (`npm run test:e2e`) |
| Auth e perfil reais | Cadastro via API, login pela tela, alteração da bio, persistência após recarga e logout aprovados |
| Comunidade real | Criação, dono automático, publicação, curtida, edição e persistência aprovadas pelo navegador/API/Supabase |
| Permissões reais no Supabase | Dono, membro e terceiro verificados em transação com rollback |
| Responsividade | Menus e ausência de overflow nas páginas verificadas em 360, 768 e 1440 px |

## Passo 5

Testados busca da home, links para comunidade/confronto, filtros de status e times,
paginação, detalhe e histórico com vínculo encerrado. Texto cadastrado é exibido
como texto, inclusive entradas semelhantes a HTML. A API força o jogador da sessão
no histórico e nos vínculos, combina filtros e rejeita página/status/ID inválidos.

No Supabase real, a conta temporária validou carregamento da home, lista de partidas,
histórico vazio, relacionamentos explícitos e sintaxe dos filtros combinados na
Data API; após criar sua comunidade, ela apareceu na home e abriu pelo link.
Não havia partidas ou pontuação preexistentes: a apresentação de placares e
histórico preenchido foi validada com dados simulados nos testes de navegador.
Não substitui o teste completo em produção com times e usuários distintos.

Sessões QA confirmadas como zero antes de remover a conta e seu conteúdo.
Contagens preservadas: 2 usuários/perfis, 1 time, 1 campeonato, 1 contrato,
1 inscrição; zero partidas, histórico, comunidades, publicações e reações.

## Correções encontradas durante os testes

Passo 6: testes cobrem API de classificação/painel, filtros vinculados à sessão,
paginação e cancelamento permitido, rejeição de status forjado e distinção de
falha do Auth (502) e sessão inválida (401). No navegador: recuperação simulada,
confirmação de senha, link inválido, login sem rede, redirecionamento de sessão
expirada sem ciclo e edição/cancelamento de campeonato pela API. O SDK simulado
lança erro se uma tela tentar consultar o banco diretamente.

Passagem real adicional aprovada: criação de time, criação/edição/cancelamento
de campeonato, painel, comunidade e troca de senha seguida de login com a nova
senha. O envio real do e-mail de recuperação não foi testado e a URL de retorno
ainda precisa ser autorizada no painel. Nenhuma configuração do Auth foi alterada.
As duas contas QA desta etapa foram removidas após confirmar zero sessões.

- Os formulários de campeonato agora aguardam a inicialização da sessão para
  aceitar envio; isso evita navegação nativa antes de registrar os eventos.
- A regra CSS do formulário de senha respeita o atributo hidden.
- Mensagens de erro do perfil ficam visíveis mesmo com o editor fechado.

- Consulta do feed precisava indicar a chave do autor, pois havia mais de um
  relacionamento possível entre publicações e jogadores na Data API.
- Adicionar curtida com upsert tentava atualizar colunas que o usuário não deve
  alterar; a operação agora ignora duplicatas, mantendo a permissão restrita.
- O logout era registrado só após carregar o perfil; agora responde desde o início.
- A saída da comunidade não usa limite na exclusão, evitando rejeição do PostgREST.
- O rótulo acessível da busca foi ocultado visualmente, preservando o nome acessível.

## Dados e sessões

Foram usadas contas QA com credenciais aleatórias somente em memória. Ao concluir,
foi confirmado que não havia sessões ativas dessas contas, e apenas essas contas
foram removidas. Os vínculos sociais temporários foram eliminados por cascata.

Estado confirmado ao concluir o passo 5: 2 usuários, 2 perfis, 1 time, 1 campeonato e nenhum
registro de comunidade/publicação/reação. Nenhuma das contas QA criadas permanece.
Após o passo 6, havia 4 usuários/perfis, 2 times, 2 campeonatos, 2 contratos,
2 inscrições e 1 comunidade/publicação/reação. Os registros adicionais de outras
contas foram preservados; somente os dois UUIDs QA criados nesta execução foram
removidos após verificar que não tinham sessões.
Testes transacionais de permissões foram revertidos; sequências de IDs podem
apresentar saltos normais após operações revertidas.

## Limites

- Não é uma validação de produção/Vercel, concorrência sob carga ou todos os navegadores.
- A suíte de tela usa mocks; a passagem real usou uma conta temporária e foi
  complementada pelos testes de papéis reais no banco.
- Formato de grupos não faz parte da entrega atual.
- Persistem avisos já documentados da auditoria: RPCs privilegiadas intencionais,
  com checagem de identidade, e proteção de senhas vazadas desabilitada no Auth.

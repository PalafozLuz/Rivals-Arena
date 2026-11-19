# Documentação de entrega - Arena Rivals

Versão documental: 19/11/2026. Projeto: [PalafozLuz/Rivals-Arena](https://github.com/PalafozLuz/Rivals-Arena).

| Entrega | Arquivo |
| --- | --- |
| Visão do sistema, requisitos e rastreabilidade do briefing | [Requisitos e escopo](requisitos.md) |
| Entidades e relacionamentos do negócio | [Modelo conceitual](modelagem/modelo-conceitual.md) |
| Tabelas, atributos, PK/FK/UK e relacionamentos | [Modelo lógico](modelagem/modelo-logico.md) |
| Tipos, nulabilidade, padrões, restrições e índices | [Dicionário de dados](modelagem/dicionario-dados.md) |
| Ordem dos scripts, normalização e regras de integridade | [Modelo físico](modelagem/modelo-fisico.md) |
| Comparação entre SQL versionado e metadados do Supabase | [Conferência](modelagem/conferencia.md) |
| Arquitetura, endpoints e decisões de CRUD | [Documentação da API](api/README.md) |
| Especificação da API para importar em ferramentas | [OpenAPI JSON](api/openapi.json) |
| Sequência de apresentação e resultados esperados | [Roteiro de demonstração](roteiro-demonstracao.md) |
| Evidências de testes e limites conhecidos | [Relatório de testes](../RELATORIO-TESTES.md) |
| Execução local e configuração | [README principal](../README.md) |
| Pendência do e-mail de recuperação | [Configuração Auth](../CONFIGURACAO-AUTH.md) |

Os diagramas Mermaid são exibidos diretamente pelo GitHub ao abrir os arquivos
Markdown. O arquivo `.mmd` do modelo lógico pode ser importado em ferramentas que
aceitam Mermaid. Os catálogos JSON contêm somente estrutura, sem dados de usuários.

Diagramas exportados, sem depender de scripts ao abrir:
[conceitual SVG](modelagem/modelo-conceitual.svg) e [lógico SVG](modelagem/modelo-logico.svg).
Abra o SVG em uma nova aba para ampliar e ler todos os atributos.

## Conferência e atualização

Execute `npm ci` (ou `npm install`) e `npm run docs:gerar`. O comando recria um
PostgreSQL descartável com PGlite, aplica o SQL inicial e todas as migrations,
gera o modelo lógico/dicionário e exporta a OpenAPI de um servidor local temporário.
Compara a estrutura com a fotografia remota de 19/11/2026, sem conectar ao banco remoto.
Não execute `schema.sql` novamente em um Supabase já populado.

Os textos de requisitos, escopo, decisões e demonstração são mantidos manualmente.
A regeneração não altera páginas, dados reais, funções remotas ou configurações do Auth.

Para exportar os SVGs novamente: instale o Chromium com
`npx playwright install chromium` e execute `npm run docs:diagramas`. A exportação
usa Mermaid 12.3.0 pelo CDN jsDelivr e precisa de internet; valida a sintaxe e
salva os diagramas. Imagens intermediárias ficam em test-results, fora do Git.
O gerador do banco/OpenAPI não usa o CDN nem depende do navegador.

## Estado da entrega

Aplicação implementada e versionada. A documentação não certifica publicação na
Vercel nem recebimento de e-mail: essas verificações continuam pendentes.
O roteiro completo com contas distintas é uma sequência para execução final;
não deve ser apresentado como evidência de teste já realizado no domínio publicado.
Como o repositório é privado, a equipe precisa garantir acesso do instrutor ou
fornecer a cópia de entrega por um meio combinado com ele.

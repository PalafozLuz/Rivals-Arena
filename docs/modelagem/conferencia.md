# Conferência dos modelos

Data da consulta remota: 19/11/2026. Consulta somente a metadados; nenhum registro pessoal foi exportado.

Comparados SQL inicial + cinco migrations com o catálogo do Supabase:

| Item | Local | Remoto |
| --- | --- | --- |
| Tabelas públicas | 12 | 12 |
| Atributos | 92 | 92 |
| Restrições (PK/FK/UK/CHECK) | 73 | 73 |
| Índices | 26 | 26 |
| Tabelas com RLS | 12 | 12 |

Sem diferenças nos nomes/tipos/nulabilidade/padrões das colunas, definições das restrições e índices comparados. RLS habilitada nas 12 tabelas.

Limite: esta comparação não certifica equivalência das funções, grants, conteúdo das políticas ou dados. As regras executáveis são verificadas pelas suítes e pelo relatório de testes. O catálogo remoto é uma fotografia desta data; não uma consulta ao vivo ao abrir o documento.

Regerar: `npm run docs:gerar`. O comando recria apenas o banco descartável local e lê a fotografia remota versionada.

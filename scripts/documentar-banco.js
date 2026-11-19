// Gera documentação a partir de um banco descartável. Não acessa o Supabase remoto.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'docs','modelagem');
const sources=['schema.sql','migrations/001_integridade_competitiva.sql','migrations/002_ciclo_competitivo.sql','migrations/003_membros_times.sql','migrations/004_edicao_campeonatos.sql','supabase/migrations/20261117215510_comunidades_integradas.sql'];
const descriptions={jogadores:'Perfil público ligado à identidade do Supabase Auth.',times:'Equipe e referência ao capitão atual.',contratos:'Convites, vínculos ativos e participações encerradas.',campeonatos:'Evento organizado por um jogador.',inscricoes:'Solicitação de participação de um time em um campeonato.',partidas:'Confronto por rodada, placar e processamento de resultado.',classificacao_campeonatos:'Resumo de desempenho do time no campeonato.',historico_ranking:'Registro individual de pontos por resultado.',comunidades:'Grupo social com dono e categoria.',membros_comunidade:'Participação e papel do jogador na comunidade.',publicacoes:'Texto publicado por um membro.',reacoes_publicacao:'Reação única de um jogador em uma publicação.'};
const fence=String.fromCharCode(96).repeat(3);
const md=value=>String(value??'—').replaceAll('|','\\|').replaceAll('\n',' ');
const keyColumns=k=>k.definition.match(/\(([^)]+)\)/)[1].split(',').map(s=>s.trim());
function fk(k){const m=k.definition.match(/FOREIGN KEY \(([^)]+)\) REFERENCES (?:(\w+)\.)?(\w+)\(([^)]+)\)/);return {column:m[1],schema:m[2]||'public',table:m[3],target:m[4]};}
const write=(file,text)=>fs.writeFileSync(path.join(dir,file),text.trim()+'\n');
async function main(){
 fs.mkdirSync(dir,{recursive:true});const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
   CREATE TABLE auth.users(id UUID PRIMARY KEY,raw_user_meta_data JSONB DEFAULT '{}');
   CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
   GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;`);
  for(const file of sources)await db.exec(fs.readFileSync(path.join(root,file),'utf8'));
  const columns=(await db.query(`select table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale,is_identity from information_schema.columns where table_schema='public' order by table_name,ordinal_position`)).rows;
  // A nulabilidade é comparada por coluna; PG18 também a registra em pg_constraint.
  const constraints=(await db.query(`select c.relname as table_name,k.conname,k.contype,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and k.contype in ('p','f','u','c') order by c.relname,k.conname`)).rows;
  const indexes=(await db.query(`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`)).rows;
  const rls=(await db.query(`select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename`)).rows;
  const tables=[...new Set(columns.map(c=>c.table_name))];
  assert.equal(tables.length,12);assert.equal(columns.length,92);assert.equal(constraints.filter(k=>k.contype==='p').length,12);assert(rls.every(t=>t.rowsecurity));
  const type=c=>c.udt_name==='varchar'?`varchar(${c.character_maximum_length})`:c.udt_name==='numeric'?`numeric(${c.numeric_precision},${c.numeric_scale})`:({int8:'bigint',int4:'integer',timestamptz:'timestamptz',bool:'boolean'}[c.udt_name]||c.udt_name);
  let dictionary='# Dicionário de dados\n\nGerado pelos scripts SQL versionados, incluindo todas as migrations. Não contém registros de usuários.\n\nPK = chave primária; FK = chave estrangeira; UK = unicidade (pode ser composta). Colunas de chaves compostas devem ser lidas em conjunto nas restrições.\n\n';
  let diagram='erDiagram\n';
  for(const table of tables){
   const cols=columns.filter(c=>c.table_name===table),ks=constraints.filter(k=>k.table_name===table);
   dictionary+=`## ${table}\n\n${descriptions[table]}\n\n| Atributo | Tipo PostgreSQL | Nulo? | Chaves | Padrão |\n| --- | --- | --- | --- | --- |\n`;
   diagram+=`    ${table} {\n`;
   for(const c of cols){
    const keys=[];for(const [code,label] of [['p','PK'],['f','FK'],['u','UK']])if(ks.some(k=>k.contype===code&&keyColumns(k).includes(c.column_name)))keys.push(label);
    dictionary+=`| ${c.column_name} | ${type(c)} | ${c.is_nullable==='YES'?'Sim':'Não'} | ${keys.join(', ')||'—'} | ${md(c.is_identity==='YES'?'IDENTITY BY DEFAULT':c.column_default)} |\n`;
    diagram+=`        ${c.udt_name==='numeric'?'numeric':type(c).replace(/[()]/g,'_')} ${c.column_name}${keys.length?' '+keys.join(', '):''}\n`;
   }
   diagram+='    }\n';dictionary+='\nRestrições efetivas:\n\n';
   for(const k of ks)dictionary+=`- **${k.conname}:** \`${md(k.definition)}\`.\n`;
   const idx=indexes.filter(i=>i.tablename===table);dictionary+='\nÍndices (incluem os criados por PK/UK):\n\n';for(const i of idx)dictionary+=`- \`${md(i.indexdef)}\`.\n`;
   dictionary+='\n';
  }
  for(const k of constraints.filter(k=>k.contype==='f')){const f=fk(k);const c=columns.find(c=>c.table_name===k.table_name&&c.column_name===f.column);const parent=f.schema==='auth'?'AUTH_USERS':f.table;diagram+=`    ${parent} ${c.is_nullable==='YES'?'|o':'||'}--o{ ${k.table_name} : "${f.column}"\n`;}
  // Corrige a cardinalidade da FK que também é a PK do perfil.
  diagram=diagram.replace('AUTH_USERS ||--o{ jogadores','AUTH_USERS ||--o| jogadores');
  write('modelo-logico.mmd',diagram);
  write('modelo-logico.md',`# Modelo lógico\n\n12 tabelas do domínio e 92 atributos. AUTH_USERS pertence ao Supabase, fora dessas 12 tabelas.\n\n${fence}mermaid\n${diagram}${fence}\n\n[Abrir diagrama SVG para ampliar](modelo-logico.svg).\n\nAUTH_USERS/jogadores usa PK/FK compartilhada: uma identidade possui no máximo um perfil; o trigger o cria no cadastro. As demais cardinalidades mostram as FKs. Restrições de unicidade, índices parciais, triggers e RPCs complementam os limites do diagrama. Consulte o [dicionário completo](dicionario-dados.md) e as [regras e decisões](modelo-fisico.md).\n`);
  write('dicionario-dados.md',dictionary);
  write('catalogo-local.json',JSON.stringify({tables:columns,constraints,indexes,rls},null,2));
  const remotePath=path.join(dir,'catalogo-remoto.json');
  if(fs.existsSync(remotePath)){
   const remote=JSON.parse(fs.readFileSync(remotePath,'utf8'));
   const normalize=s=>s.replaceAll('public.','').replace(/\s+/g,' ').trim();
   const differences=[];
   const byName=new Map(remote.tables.map(c=>[c.table_name+'.'+c.column_name,c]));
   for(const c of columns){const other=byName.get(c.table_name+'.'+c.column_name);if(!other){differences.push('Coluna ausente no remoto: '+c.table_name+'.'+c.column_name);continue;}
    for(const key of ['udt_name','is_nullable','column_default','character_maximum_length','numeric_precision','numeric_scale'])if(normalize(String(c[key]))!==normalize(String(other[key])))differences.push(`${c.table_name}.${c.column_name}: ${key} difere`);
   }
   if(remote.tables.length!==columns.length)differences.push('Quantidade de colunas diferente.');
   const canonical=rows=>rows.map(k=>k.table_name+'|'+k.contype+'|'+normalize(k.definition)).sort();
   const left=canonical(constraints),right=canonical(remote.constraints);
   for(const item of left)if(!right.includes(item))differences.push('Restrição local não encontrada no remoto: '+item);
   for(const item of right)if(!left.includes(item))differences.push('Restrição remota não encontrada no local: '+item);
   for(const i of indexes)if(!remote.indexes.some(r=>r.tablename===i.tablename&&normalize(r.indexdef)===normalize(i.indexdef)))differences.push('Índice local não encontrado no remoto: '+i.indexname);
   for(const i of remote.indexes)if(!indexes.some(r=>r.tablename===i.tablename&&normalize(r.indexdef)===normalize(i.indexdef)))differences.push('Índice remoto não encontrado no local: '+i.indexname);
   if(!remote.rls.every(t=>t.rowsecurity)||remote.rls.length!==12)differences.push('RLS remoto diferente do esperado.');
   write('conferencia.md',`# Conferência dos modelos\n\nData da consulta remota: 19/11/2026. Consulta somente a metadados; nenhum registro pessoal foi exportado.\n\nComparados SQL inicial + cinco migrations com o catálogo do Supabase:\n\n| Item | Local | Remoto |\n| --- | --- | --- |\n| Tabelas públicas | ${tables.length} | ${remote.rls.length} |\n| Atributos | ${columns.length} | ${remote.tables.length} |\n| Restrições (PK/FK/UK/CHECK) | ${constraints.length} | ${remote.constraints.length} |\n| Índices | ${indexes.length} | ${remote.indexes.length} |\n| Tabelas com RLS | ${rls.filter(t=>t.rowsecurity).length} | ${remote.rls.filter(t=>t.rowsecurity).length} |\n\n${differences.length?differences.map(d=>'- '+d).join('\n'):'Sem diferenças nos nomes/tipos/nulabilidade/padrões das colunas, definições das restrições e índices comparados. RLS habilitada nas 12 tabelas.'}\n\nLimite: esta comparação não certifica equivalência das funções, grants, conteúdo das políticas ou dados. As regras executáveis são verificadas pelas suítes e pelo relatório de testes. O catálogo remoto é uma fotografia desta data; não uma consulta ao vivo ao abrir o documento.\n\nRegerar: \`npm run docs:gerar\`. O comando recria apenas o banco descartável local e lê a fotografia remota versionada.\n`);
   assert.equal(differences.length,0,'Diferenças entre catálogo local e remoto: '+differences.join('; '));
  }
  const app=require('../server');const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/openapi.json`);assert(response.ok);const api=await response.json();fs.mkdirSync(path.join(root,'docs','api'),{recursive:true});fs.writeFileSync(path.join(root,'docs','api','openapi.json'),JSON.stringify(api,null,2)+'\n');console.log(`Documentação: ${tables.length} tabelas, ${columns.length} atributos, ${Object.keys(api.paths).length} caminhos de API.`);}finally{await new Promise(resolve=>server.close(resolve));}
 }finally{await db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

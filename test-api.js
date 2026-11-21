const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createApi } = require('./api');
const app = require('./server');
async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('servidor entrega páginas e bloqueia fontes, SQL, dependências e caminhos internos', async () => {
  await serve(app, async base => {
    for (const route of ['/', '/perfil.html', '/times.html', '/membros.js', '/api/health', '/api/openapi.json']) assert.equal((await fetch(base + route)).status, 200, route);
    for (const route of ['/server.js', '/api.js', '/schema.sql', '/package.json', '/.env', '/node_modules/express/package.json', '/ANALISE-E-PLANO.md']) assert.equal((await fetch(base + route)).status, 404, route);
    assert.equal((await fetch(base + '/api/times')).status, 401);
  });
});
test('API verifica identidade, limita colunas, atribui dono e preserva token RLS', async () => {
  const calls = [];
  const user = '12345678-1234-1234-1234-123456789abc';
  const fake = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: user });
    return Response.json([{ id_time: 1, nome: 'Time A' }]);
  };
  const local = express();
  local.use(express.json());
  local.use('/api', createApi({ fetchImpl: fake, configProvider: () => ({ url: 'https://example.test', key: 'public-test' }) }));
  await serve(local, async base => {
    const headers = { Authorization: 'Bearer token-test', 'Content-Type': 'application/json' };
    assert.equal((await fetch(base + '/api/times', { method: 'POST', headers, body: JSON.stringify({ nome: 'Time A', id_capitao: user }) })).status, 400);
    const response = await fetch(base + '/api/times', { method: 'POST', headers, body: JSON.stringify({ nome: 'Time A' }) });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const write = calls.find(call => call.url.includes('/rest/'));
    assert.equal(JSON.parse(write.options.body).id_capitao, user);
    assert.equal(write.options.headers.Authorization, 'Bearer token-test');
    assert.equal((await fetch(base + '/api/jogadores/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', { method: 'PATCH', headers, body: '{"nome":"Outro"}' })).status, 403);
    assert.equal((await fetch(base + '/api/times', { method: 'POST', headers, body: '{"nome":"A"}' })).status, 400);
    assert.equal((await fetch(base + '/api/campeonatos', { method: 'POST', headers, body: '{"nome":"Copa","jogo":"Jogo","max_times":4,"data_inicio":"2026-02-30","data_fim":"2026-03-04"}' })).status, 400);
  });
});
test('API do perfil aceita banner válido, remoção e rejeita links inválidos e terceiros',async()=>{
 const user='12345678-1234-1234-1234-123456789abc',writes=[];
 const local=express();local.use(express.json());
 local.use('/api',createApi({configProvider:()=>({url:'https://example.test',key:'public-test'}),fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:user});
  writes.push(options);return Response.json([{id_jogador:user,...JSON.parse(options.body)}]);
 }}));
 await serve(local,async base=>{
  const send=(banner_url,id=user)=>fetch(base+'/api/jogadores/'+id,{method:'PATCH',headers:{Authorization:'Bearer token-test','Content-Type':'application/json'},body:JSON.stringify({banner_url})});
  assert.equal((await send('https://example.test/banner.png')).status,200);
  assert.equal(JSON.parse(writes[0].body).banner_url,'https://example.test/banner.png');
  assert.equal(writes[0].headers.Authorization,'Bearer token-test');
  assert.equal((await send('')).status,200);
  for(const bad of ['javascript:alert(1)','data:image/png;base64,aaaa','https://','https://example.test/'+ 'a'.repeat(2048)])assert.equal((await send(bad)).status,400);
  assert.equal((await send('https://example.test/banner.png','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).status,403);
  assert.equal(writes.length,2);
 });
});

test('token inválido não acessa dados do banco', async () => {
  let calls = 0;
  const local = express();
  local.use('/api', createApi({ fetchImpl: async () => { calls++; return new Response('', { status: 401 }); }, configProvider: () => ({ url: 'https://example.test', key: 'public-test' }) }));
  await serve(local, async base => {
    assert.equal((await fetch(base + '/api/times', { headers: { Authorization: 'Bearer expirado' } })).status, 401);
    assert.equal(calls, 1);
  });
});
test('API de resultados valida placares e encaminha apenas parâmetros da operação autenticada', async () => {
  const calls = [];
  const local = express();
  local.use(express.json());
  local.use('/api', createApi({ configProvider: () => ({ url: 'https://example.test', key: 'public-test' }),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'organizador' });
      calls.push({ url, options });
      if (url.endsWith('/gerar_confrontos')) return Response.json({ code: 'P0001', message: 'Somente o organizador pode gerar confrontos' }, { status: 400 });
      return Response.json({ id_partida: 7, status: 'finalizada' });
    }
  }));
  await serve(local, async base => {
    const headers = { Authorization: 'Bearer token-test', 'Content-Type': 'application/json' };
    for (const body of [{ placar_a: -1, placar_b: 0 }, { placar_a: 1.5, placar_b: 0 }, { placar_a: '1', placar_b: 0 }, { placar_a: 1, placar_b: 0, vencedor: 99 }]) {
      assert.equal((await fetch(base + '/api/partidas/7/resultado', { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal(calls.length, 0);
    assert.equal((await fetch(base + '/api/partidas/7/resultado', { method: 'POST', headers, body: '{"placar_a":2,"placar_b":0}' })).status, 200);
    assert.deepEqual(JSON.parse(calls[0].options.body), { p_partida: 7, p_placar_a: 2, p_placar_b: 0 });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token-test');
    assert.equal((await fetch(base + '/api/campeonatos/3/confrontos', { method: 'POST', headers })).status, 403);
  });
});
test('pontos corridos gera cada par uma vez para times pares e ímpares', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'campeonatos.html'), 'utf8');
  const expression = source.match(/const buildRoundRobinMatches = ([\s\S]*?);\s*const generateMatchesForChampionship/)[1];
  const generate = require('node:vm').runInNewContext('(' + expression + ')');
  for (const n of [2, 3, 4, 5, 8]) {
    const rounds = generate(Array.from({ length: n }, (_, i) => i + 1));
    const pairs = rounds.flat().map(pair => [...pair].sort((a, b) => a - b).join('-'));
    assert.equal(pairs.length, n * (n - 1) / 2);
    assert.equal(new Set(pairs).size, pairs.length);
    for (const round of rounds) assert.equal(new Set(round.flat()).size, round.flat().length);
  }
});
test('API de membros valida alvo e delega somente os parâmetros da ação autenticada', async () => {
  const calls = [];
  const local = express(); local.use(express.json());
  local.use('/api', createApi({ configProvider: () => ({ url: 'https://example.test', key: 'public-test' }), fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'usuario' });
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json({ sucesso: true });
  } }));
  await serve(local, async base => {
    const headers = { Authorization: 'Bearer token-test', 'Content-Type': 'application/json' };
    for (const body of [{ acao: 'convidar', username: '<img>' }, { acao: 'remover', id_jogador: 'outro' }, { acao: 'sair', id_capitao: 'usuario' }]) {
      assert.equal((await fetch(base + '/api/times/1/membros', { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal(calls.length, 0);
    assert.equal((await fetch(base + '/api/times/1/membros', { method: 'POST', headers, body: '{"acao":"convidar","username":"jogador"}' })).status, 200);
    assert.deepEqual(calls[0].body, { p_time: 1, p_acao: 'convidar', p_username: 'jogador', p_jogador: null });
    assert.equal((await fetch(base + '/api/meus-times')).status, 401);
  });
});
test('capitão pode cancelar sua inscrição pela API, mas não aprovar nem alterar seu time', async () => {
  const writes = [];
  const local = express(); local.use(express.json());
  local.use('/api', createApi({ configProvider: () => ({ url: 'https://example.test', key: 'test' }), fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'capitao' });
    if (options.method !== 'PATCH') return Response.json([{ campeonatos: { id_criador: 'organizador' }, times: { id_capitao: 'capitao' } }]);
    writes.push(JSON.parse(options.body)); return Response.json([{ id_inscricao: 1, status: 'cancelada' }]);
  } }));
  await serve(local, async base => {
    const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json' };
    const send = body => fetch(base+'/api/inscricoes/1',{method:'PATCH',headers,body:JSON.stringify(body)});
    assert.equal((await send({status:'aprovada'})).status,403);
    assert.equal((await send({status:'cancelada',id_time:7})).status,400);
    assert.equal((await send({status:'cancelada'})).status,200);
    assert.deepEqual(writes,[{status:'cancelada'}]);
  });
});
test('comunidade: identidade da sessão, autor protegido, feed sem ambiguidade e saída sem limite de exclusão',async()=>{
 const calls=[]; const local=express();local.use(express.json());
 const uid='00000000-0000-0000-0000-000000000001';
 local.use('/api',createApi({configProvider:()=>({url:'https://example.test',key:'test'}),fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:uid});
  calls.push({url:new URL(url),options});
  if(url.includes('/comunidades?') && url.includes('select=id_criador'))return Response.json([{id_criador:'outro'}]);
  return Response.json([]);
 }}));
 await serve(local,async base=>{
  const headers={Authorization:'Bearer test','Content-Type':'application/json'};
  const send=(url,method,body)=>fetch(base+url,{method,headers,body:body?JSON.stringify(body):undefined});
  assert.equal((await send('/api/comunidades/1/membros','POST',{id_jogador:'outro',papel:'dono'})).status,400);
  assert.equal((await send('/api/publicacoes','POST',{id_comunidade:1,conteudo:'Teste',id_autor:'outro'})).status,400);
  assert.equal((await send('/api/publicacoes','POST',{id_comunidade:1,conteudo:'   '})).status,400);
  assert.equal((await send('/api/comunidades/1/membros','POST')).status,200);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id_comunidade:1,id_jogador:uid});
  assert.equal((await send('/api/comunidades/1/membros','DELETE')).status,200);
  assert.equal(calls.at(-1).url.searchParams.has('limit'),false);
  assert.equal(calls.at(-1).url.searchParams.get('id_jogador'),`eq.${uid}`);
  assert.equal((await send('/api/publicacoes?id_comunidade=1','GET')).status,200);
  assert.match(calls.at(-1).url.searchParams.get('select'),/jogadores!publicacoes_id_autor_fkey/);
  assert.match(calls.at(-1).url.searchParams.get('select'),/jogadores!publicacoes_id_autor_fkey\(nome,username,avatar_url\)/);
  assert.equal(calls.at(-1).url.searchParams.get('minhas_reacoes.id_jogador'),`eq.${uid}`);
  assert.equal((await send('/api/publicacoes/1/reacao','POST',{tipo:'curtida'})).status,200);
  assert.match(calls.at(-1).options.headers.Prefer,/ignore-duplicates/);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id_publicacao:1,id_jogador:uid,tipo:'curtida'});
 });
});
test('API diferencia indisponibilidade de autenticação e recusa status forjado',async()=>{
 const local=express();local.use(express.json());const calls=[];let available=false;
 local.use('/api',createApi({configProvider:()=>({url:'https://example.test',key:'public'}),fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return available?Response.json({id:'organizador'}):new Response('',{status:503});
  calls.push({url,options});return Response.json([{id_campeonato:3,status:'cancelado'}]);
 }}));
 await serve(local,async base=>{
  const headers={Authorization:'Bearer qa','Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/campeonatos',{headers})).status,502);available=true;
  for(const body of [{status:'encerrado'},{status:'em_andamento'},{status:'cancelado',nome:'Outro'}])assert.equal((await fetch(base+'/api/campeonatos/3',{method:'PATCH',headers,body:JSON.stringify(body)})).status,400);
  assert.equal(calls.length,0);
  assert.equal((await fetch(base+'/api/campeonatos/3',{method:'PATCH',headers,body:'{"status":"cancelado"}'})).status,200);
  assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,'Bearer qa');
 });
});
test('filtros de proprietário usam sessão, classificação tem chave composta e paginação estável',async()=>{
 const local=express(),calls=[];
 local.use('/api',createApi({configProvider:()=>({url:'https://example.test',key:'public'}),fetchImpl:async url=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'jogador-atual'});calls.push(new URL(url));return Response.json([]);
 }}));
 await serve(local,async base=>{
  const headers={Authorization:'Bearer qa'};
  for(const path of ['/api/campeonatos?minhas=1&page=2&id_criador=outro','/api/times?capitao=1','/api/classificacao?minhas=1'])assert.equal((await fetch(base+path,{headers})).status,200);
  assert.equal(calls[0].searchParams.get('id_criador'),'eq.jogador-atual');assert.equal(calls[0].searchParams.get('offset'),'100');
  assert.match(calls[0].searchParams.get('select'),/times_confirmados:inscricoes!inscricoes_id_campeonato_fkey\(count\)/);
  assert.match(calls[0].searchParams.get('select'),/times_pendentes:inscricoes!inscricoes_id_campeonato_fkey\(count\)/);
  assert.equal(calls[0].searchParams.get('times_confirmados.status'),'eq.aprovada');
  assert.equal(calls[0].searchParams.get('times_pendentes.status'),'eq.pendente');
  assert.equal(calls[1].searchParams.get('id_capitao'),'eq.jogador-atual');
  assert.equal(calls[2].pathname,'/rest/v1/classificacao_campeonatos');assert.equal(calls[2].searchParams.get('order'),'id_campeonato.asc,id_time.asc');assert.equal(calls[2].searchParams.get('campeonatos.id_criador'),'eq.jogador-atual');
  assert.equal((await fetch(base+'/api/classificacao/3',{headers})).status,404);
 });
});

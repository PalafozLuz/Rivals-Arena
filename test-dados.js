const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createApi}=require('./api');
async function fixture(run){
 const calls=[];
 const app=express();
 app.use('/api',createApi({configProvider:()=>({url:'https://example.test',key:'public-test'}),fetchImpl:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'jogador-atual'});
  const u=new URL(url);calls.push({u,options});
  if(u.pathname.endsWith('/contratos'))return Response.json([{id_time:7}]);
  if(u.pathname.endsWith('/times'))return Response.json([{id_time:7}]);
  if(u.pathname.endsWith('/campeonatos'))return Response.json([{id_campeonato:3,jogo:'Valorant'}]);
  if(u.pathname.endsWith('/partidas'))return Response.json(Array.from({length:25},(_,i)=>({id_partida:i+1})));
  return Response.json([]);
 }}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{await run(path=>fetch(`http://127.0.0.1:${server.address().port}/api/`+path,{headers:{Authorization:'Bearer qa-token'}}),calls);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('partidas combina busca e times da sessão, pagina e preserva RLS',()=>fixture(async(get,calls)=>{
 const r=await get('partidas?minhas=1&q=Valorant&status=finalizada&page=2');assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.data.length,24);assert.equal(body.hasMore,true);
 const {u,options}=calls.find(c=>c.u.pathname.endsWith('/partidas'));
 assert.equal(u.searchParams.get('offset'),'24');assert.equal(u.searchParams.get('status'),'eq.finalizada');
 assert.equal(u.searchParams.get('and'),'(or(id_time_a.in.(7),id_time_b.in.(7)),or(id_time_a.in.(7),id_time_b.in.(7),id_campeonato.in.(3)))');
 assert.equal(options.headers.Authorization,'Bearer qa-token');
 assert.equal(calls.find(c=>c.u.pathname.endsWith('/contratos')).u.searchParams.get('id_jogador'),'eq.jogador-atual');
}));
test('home e partidas filtram homologação antes dos limites e preservam histórico e links diretos',()=>fixture(async(get,calls)=>{
 const r=await get('inicio?q=Valorant');assert.equal(r.status,200);
 const communities=calls.find(c=>c.u.pathname.endsWith('/comunidades')).u;
 const championships=calls.find(c=>c.u.pathname.endsWith('/campeonatos')&&c.u.searchParams.has('status')).u;
 const matches=calls.find(c=>c.u.pathname.endsWith('/partidas')).u;
 assert.equal(communities.searchParams.get('and'),'(nome.not.ilike.HOMOLOG*)');
 assert.equal(communities.searchParams.get('nome'),'ilike.*Valorant*');
 assert.equal(championships.searchParams.get('and'),'(nome.not.ilike.HOMOLOG*)');
 assert.equal(championships.searchParams.get('or'),'(nome.ilike.*Valorant*,jogo.ilike.*Valorant*)');
 assert.equal(matches.searchParams.get('campeonatos.nome'),'not.ilike.HOMOLOG*');
 assert.equal(matches.searchParams.get('limit'),'6');
 for(const path of ['partidas','partidas?page=2&minhas=1&status=finalizada&q=Valorant','partidas?campeonato=3&jogo=Valorant']){
  calls.length=0;assert.equal((await get(path)).status,200);
  const query=calls.find(c=>c.u.pathname.endsWith('/partidas')).u.searchParams;
  assert.equal(query.get('campeonatos.nome'),'not.ilike.HOMOLOG*');
  assert.equal(query.get('limit'),'25');
 }
 calls.length=0;await get('partidas/7');
 assert.equal(calls.find(c=>c.u.pathname.endsWith('/partidas')).u.searchParams.has('campeonatos.nome'),false);
 calls.length=0;await get('meu-historico');
 assert.equal(calls.some(c=>c.u.searchParams.toString().includes('HOMOLOG')),false);
}));

test('histórico usa sempre jogador autenticado e relacionamentos explícitos',()=>fixture(async(get,calls)=>{
 const r=await get('meu-historico?id_jogador=outra-pessoa');assert.equal(r.status,200);
 for(const {u} of calls){assert.equal(u.searchParams.get('id_jogador'),'eq.jogador-atual');}
 const history=calls.find(c=>c.u.pathname.endsWith('/historico_ranking')).u;
 assert.match(history.searchParams.get('select'),/partidas!historico_ranking_id_partida_fkey/);
}));

test('comunidades resolve slug exato e recusa identificador inválido',()=>fixture(async(get,calls)=>{
 assert.equal((await get('comunidades?slug=hollow-knight')).status,200);
 assert.equal(calls.at(-1).u.searchParams.get('slug'),'eq.hollow-knight');
 calls.length=0;
 assert.equal((await get('comunidades?slug=eq.minecraft')).status,400);
 assert.equal((await get('comunidades?slug=minecraft&slug=valorant')).status,400);
 assert.equal(calls.length,0);
}));
test('leituras rejeitam página, status e identificadores inválidos antes da consulta',()=>fixture(async(get,calls)=>{
 for(const path of ['partidas?page=-1','partidas?status=inventado','partidas/abc','meu-historico?page=1.5'])assert.equal((await get(path)).status,400,path);
 assert.equal(calls.length,0);
}));
test('painel retorna rodadas e classificação pela API com vínculos explícitos',async()=>{
 const app=express();const calls=[];
 app.use('/api',createApi({configProvider:()=>({url:'https://example.test',key:'public'}),fetchImpl:async url=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'jogador'});const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('/campeonatos'))return Response.json([{id_campeonato:3,nome:'Copa'}]);
  if(u.pathname.endsWith('/partidas'))return Response.json([{id_partida:1,rodada:1,time_a:{id_time:7,nome:'Alfa'},time_b:{id_time:8,nome:'Beta'}}]);
  return Response.json([{id_time:7,pontos:3,times:{id_time:7,nome:'Alfa'}}]);
 }}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/campeonatos/3/painel`,{headers:{Authorization:'Bearer qa'}});assert.equal(response.status,200);
  const {data}=await response.json();assert.equal(data.teams.length,2);assert.equal(data.matches[0].rodada,1);assert.equal(data.classification[0].pontos,3);
  for(const u of calls)assert.equal(u.searchParams.get('id_campeonato'),'eq.3');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

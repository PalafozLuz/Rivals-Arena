const express = require('express');
const MATCH_SELECT = 'id_partida,id_campeonato,rodada,numero_partida,id_time_a,id_time_b,placar_a,placar_b,vencedor,data_hora,status,campeonatos!partidas_id_campeonato_fkey!inner(id_campeonato,nome,jogo,formato,status),time_a:times!partidas_id_time_a_fkey(id_time,nome,logo_url),time_b:times!partidas_id_time_b_fkey(id_time,nome,logo_url)';
const HISTORY_SELECT = 'id_historico,pontos,motivo,criado_em,campeonatos!historico_ranking_id_campeonato_fkey(id_campeonato,nome,jogo),partidas!historico_ranking_id_partida_fkey(id_partida,rodada,status,placar_a,placar_b,data_hora,time_a:times!partidas_id_time_a_fkey(nome),time_b:times!partidas_id_time_b_fkey(nome))';
const textFilter = value => String(value || '').slice(0,80).replace(/[(),.*%\\]/g,' ').trim();
function pageNumber(value) {
  const page = Number(value || 1);
  if(!Number.isSafeInteger(page)||page<1||page>1000)throw Object.assign(Error('Página inválida.'),{status:400});
  return page;
}
function positiveId(value) {
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<1)throw Object.assign(Error('Identificador inválido.'),{status:400});
  return id;
}
function readRoutes(fetchImpl) {
  const router=express.Router();
  async function rest(req,table,params) {
    const query=new URLSearchParams(params);
    const response=await fetchImpl(`${req.remote.url}/rest/v1/${table}?${query}`,{headers:req.remote.headers,signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Não foi possível carregar os dados da arena.');
    return response.json();
  }
  const route=work=>async(req,res)=>{
    try{await work(req,res);}catch(error){res.status(error.status||502).json({error:error.status===400?error.message:'Não foi possível carregar os dados. Tente novamente.'});}
  };
  // Lê todas as rodadas, sem truncar o chaveamento no limite padrão da Data API.
  async function all(req,table,params) {
    const rows=[];
    for(let offset=0;offset<50000;offset+=500){
      const batch=await rest(req,table,{...params,limit:'500',offset:String(offset)});
      rows.push(...batch);if(batch.length<500)return rows;
    }
    throw Error('A lista é muito grande para carregar de uma vez.');
  }
  router.get('/campeonatos/:id/painel',route(async(req,res)=>{
    const id=positiveId(req.params.id);
    const championships=await rest(req,'campeonatos',{select:'*',id_campeonato:`eq.${id}`});
    if(!championships.length)return res.status(404).json({error:'Campeonato não encontrado.'});
    const [partidas,classificacao]=await Promise.all([
      all(req,'partidas',{select:'*,time_a:times!partidas_id_time_a_fkey(id_time,nome),time_b:times!partidas_id_time_b_fkey(id_time,nome)',id_campeonato:`eq.${id}`,order:'rodada.asc,numero_partida.asc,id_partida.asc'}),
      all(req,'classificacao_campeonatos',{select:'*,times!classificacao_campeonatos_id_time_fkey(id_time,nome)',id_campeonato:`eq.${id}`,order:'pontos.desc,saldo_gols.desc,vitorias.desc,id_time.asc'})
    ]);
    const teams=new Map();for(const m of partidas)for(const t of [m.time_a,m.time_b])if(t)teams.set(t.id_time,t);
    for(const c of classificacao)if(c.times)teams.set(c.times.id_time,c.times);
    res.json({data:{championship:championships[0],matches:partidas,teams:[...teams.values()],classification:classificacao}});
  }));
  async function matches(req,{preview=false}={}) {
    const page=pageNumber(req.query.page);
    const params={select:MATCH_SELECT,order:'data_hora.asc.nullslast,id_partida.desc',limit:preview?'6':'25',offset:preview?'0':String((page-1)*24)};
    // HOMOLOG identifica os campeonatos de validação, preservados no histórico.
    if(preview)params['campeonatos.nome']='not.ilike.HOMOLOG*';
    const groups=[];
    if(req.params.id)params.id_partida=`eq.${positiveId(req.params.id)}`;
    if(req.query.campeonato)params.id_campeonato=`eq.${positiveId(req.query.campeonato)}`;
    if(req.query.jogo)params['campeonatos.jogo']=`eq.${String(req.query.jogo).slice(0,100)}`;
    if(req.query.status && req.query.status!=='todos'){
      if(!['agendada','em_andamento','finalizada','cancelada'].includes(req.query.status))throw Object.assign(Error('Status inválido.'),{status:400});
      params.status=`eq.${req.query.status}`;
    }
    if(req.query.minhas==='1'){
      const contracts=await rest(req,'contratos',{select:'id_time',id_jogador:`eq.${req.user.id}`,status:'eq.ativo',limit:'100'});
      const ids=contracts.map(row=>Number(row.id_time)).filter(Number.isSafeInteger);
      if(!ids.length)return {items:[],page,hasMore:false};
      groups.push([`id_time_a.in.(${ids.join(',')})`,`id_time_b.in.(${ids.join(',')})`]);
    }
    const q=textFilter(req.query.q);
    if(q){
      const [teams,championships]=await Promise.all([
        rest(req,'times',{select:'id_time',nome:`ilike.*${q}*`,limit:'100'}),
        rest(req,'campeonatos',{select:'id_campeonato',or:`(nome.ilike.*${q}*,jogo.ilike.*${q}*)`,limit:'100'})
      ]);
      const teamsIds=teams.map(row=>Number(row.id_time)).filter(Number.isSafeInteger);
      const champsIds=championships.map(row=>Number(row.id_campeonato)).filter(Number.isSafeInteger);
      const terms=[];
      if(teamsIds.length)terms.push(`id_time_a.in.(${teamsIds.join(',')})`,`id_time_b.in.(${teamsIds.join(',')})`);
      if(champsIds.length)terms.push(`id_campeonato.in.(${champsIds.join(',')})`);
      if(!terms.length)return {items:[],page,hasMore:false};
      groups.push(terms);
    }
    if(groups.length===1)params.or=`(${groups[0].join(',')})`;
    if(groups.length>1)params.and=`(${groups.map(group=>`or(${group.join(',')})`).join(',')})`;
    const items=await rest(req,'partidas',params);
    return {items:preview?items:items.slice(0,24),page,hasMore:!preview&&items.length>24};
  }
  router.get('/inicio',route(async(req,res)=>{
    const q=textFilter(req.query.q);
    const communityQuery={select:'*,membros_comunidade(count)',and:'(nome.not.ilike.HOMOLOG*)',order:'criada_em.desc',limit:'8'};
    const championshipQuery={select:'id_campeonato,nome,jogo,formato,status,data_inicio,data_fim,max_times',and:'(nome.not.ilike.HOMOLOG*)',status:'neq.cancelado',order:'criado_em.desc',limit:'12'};
    if(q){communityQuery.nome=`ilike.*${q}*`;championshipQuery.or=`(nome.ilike.*${q}*,jogo.ilike.*${q}*)`;}
    const [communities,championships,schedule]=await Promise.all([rest(req,'comunidades',communityQuery),rest(req,'campeonatos',championshipQuery),matches(req,{preview:true})]);
    res.json({data:{comunidades:communities,campeonatos:championships,partidas:schedule.items,jogos:[...new Set(championships.map(item=>item.jogo).filter(Boolean))]}});
  }));
  router.get('/partidas',route(async(req,res)=>{const result=await matches(req);res.json({data:result.items,page:result.page,hasMore:result.hasMore});}));
  router.get('/partidas/:id',route(async(req,res)=>{
    const result=await matches(req);
    if(!result.items.length)return res.status(404).json({error:'Partida não encontrada.'});
    res.json({data:result.items[0]});
  }));
  router.get('/meu-historico',route(async(req,res)=>{
    const page=pageNumber(req.query.page);
    const [ranking,contracts]=await Promise.all([
      rest(req,'historico_ranking',{select:HISTORY_SELECT,id_jogador:`eq.${req.user.id}`,order:'criado_em.desc,id_historico.desc',limit:'25',offset:String((page-1)*24)}),
      rest(req,'contratos',{select:'id_contrato,status,data_entrada,data_saida,times!contratos_id_time_fkey(id_time,nome)',id_jogador:`eq.${req.user.id}`,order:'data_entrada.desc,id_contrato.desc',limit:'25',offset:String((page-1)*24)})
    ]);
    res.json({data:{resultados:ranking.slice(0,24),vinculos:contracts.slice(0,24)},page,hasMore:ranking.length>24||contracts.length>24});
  }));
  return router;
}
module.exports={readRoutes,MATCH_SELECT,HISTORY_SELECT};

/* Leitura autenticada das telas; conteúdo cadastrado sempre renderizado como texto. */
(() => {
  const $ = id => document.getElementById(id);
  const labels = {agendada:'Agendada',em_andamento:'Em andamento',finalizada:'Finalizada',cancelada:'Cancelada',aberto:'Inscrições abertas',encerrado:'Encerrado',cancelado:'Cancelado',ativo:'Ativo',inativo:'Encerrado',eliminatoria:'Eliminatória',pontos_corridos:'Pontos corridos'};
  const label = value => labels[value] || value || 'A definir';
  const date = value => {
    if (!value) return 'Horário a definir';
    const onlyDate=/^\d{4}-\d{2}-\d{2}$/.test(value), parsed=new Date(onlyDate?value+'T00:00:00':value);
    return Number.isFinite(parsed.getTime())?parsed.toLocaleString('pt-BR',onlyDate?{dateStyle:'short'}:{dateStyle:'short',timeStyle:'short'}):'Horário a definir';
  };
  function node(tag, text, className) { const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e; }
  function link(text, href) { const e=node('a',text,'arena-link');e.href=href;return e; }
  function card(title, lines, links=[]) {const e=node('article',undefined,'arena-card');e.append(node('h3',title));lines.filter(Boolean).forEach(t=>e.append(node('p',t)));const actions=node('div',undefined,'arena-actions');actions.append(...links);e.append(actions);return e;}
  const champLink = id => `campeonatos.html?campeonato=${encodeURIComponent(id)}#matches-list`;
  function matchCard(m, detail=false) {
    const score=m.status==='finalizada'?`${m.placar_a ?? '—'} × ${m.placar_b ?? '—'}`:'×';
    if(document.body.classList.contains('matches-refresh')) {
      const result=node('article',undefined,'match-card');
      const header=node('div',undefined,'match-card-heading');
      const status=node('span',label(m.status),'match-status');
      if(['agendada','em_andamento','finalizada','cancelada'].includes(m.status))status.dataset.status=m.status;
      header.append(node('p',m.campeonatos?.jogo||'Jogo a definir','match-game'),status);
      result.append(header,node('h3',`${m.time_a?.nome||'A definir'} ${score} ${m.time_b?.nome||'A definir'}`,'sr-only'));
      const board=node('div',undefined,'match-scoreboard');board.setAttribute('aria-hidden','true');
      const team = data => {
        const side=node('div',undefined,'match-team');
        const image=document.createElement('img');image.alt='';image.width=56;image.height=56;image.loading='lazy';
        const fallback=()=>{image.classList.add('is-default-logo');image.src='imagens/logo-menu.png';};
        image.onerror=()=>{image.onerror=null;fallback();};
        if(/^https?:\/\//i.test(data?.logo_url||''))image.src=data.logo_url;else fallback();
        side.append(image,node('span',data?.nome||'A definir'));return side;
      };
      board.append(team(m.time_a),node('strong',score,'match-score'),team(m.time_b));
      const footer=node('div',undefined,'match-card-footer');
      footer.append(node('p',m.campeonatos?.nome||'Campeonato a definir','match-championship'),node('p',`Rodada ${m.rodada??'a definir'} · ${date(m.data_hora)}`,'match-schedule'));
      const action=detail?link('Ver campeonato',champLink(m.id_campeonato)):link('Ver confronto',`partidas.html?partida=${encodeURIComponent(m.id_partida)}`);
      footer.appendChild(action);result.append(board,footer);return result;
    }
    return card(`${m.time_a?.nome || 'A definir'} ${score} ${m.time_b?.nome || 'A definir'}`,
      [m.campeonatos?.nome,m.campeonatos?.jogo,`${label(m.status)} · Rodada ${m.rodada ?? 'a definir'}`,date(m.data_hora)],
      detail?[link('Ver campeonato',champLink(m.id_campeonato))]:[link('Ver confronto',`partidas.html?partida=${encodeURIComponent(m.id_partida)}`)]);
  }
  function list(id, rows, render, empty) {$(id).replaceChildren(...(rows.length?rows.map(render):[node('p',empty,'arena-empty')]));}
  async function request(path) {
    return window.rivalsAuth.request('/api/'+path,{envelope:true});
  }
  function pager(prefix,page,hasMore) {$(prefix+'-page').textContent='Página '+page;$(prefix+'-prev').disabled=page===1;$(prefix+'-next').disabled=!hasMore;}
  function pagination(prefix,load) {let page=1;$(prefix+'-prev').onclick=()=>{if(page>1)load(--page);};$(prefix+'-next').onclick=()=>load(++page);return p=>page=p;}
  document.addEventListener('DOMContentLoaded',()=>{
    if($('home-message')) {
      let revision=0;
      const load=async()=>{const current=++revision;$('home-message').textContent='Carregando a arena...';
        try {const {data}=await request('inicio?'+new URLSearchParams({q:$('home-search-input').value.trim()}));if(current!==revision)return;
          list('home-championships',data.campeonatos,c=>card(c.nome,[c.jogo,label(c.status),label(c.formato)],[link('Ver campeonato',champLink(c.id_campeonato))]),'Nenhum campeonato encontrado.');
          list('home-games',data.jogos,j=>card(j,[],[link('Ver partidas','partidas.html?'+new URLSearchParams({jogo:j}))]),'Os jogos aparecerão quando houver campeonatos cadastrados.');
          list('home-matches',data.partidas,m=>matchCard(m),'Nenhum confronto cadastrado para esta busca.');
          $('home-message').textContent=$('home-search-input').value.trim()?'Resultados da busca.':'Arena atualizada.';
        }catch(e){if(current===revision)$('home-message').textContent=e.message;}
      };
      document.querySelector('.home-search').addEventListener('submit',e=>{e.preventDefault();load();});load();
    }
    if($('matches-grid')) {
      const params=new URLSearchParams(location.search);let mine=false,status='todos',revision=0;
      $('matches-search-input').value=params.get('q')||'';
      const setPage=pagination('matches',p=>load(p));
      const load=async(page=1)=>{setPage(page);const current=++revision;$('matches-message').textContent='Carregando partidas...';
        $('matches-prev').disabled=true;$('matches-next').disabled=true;
        const query=new URLSearchParams({page,status,minhas:mine?'1':'0',q:$('matches-search-input').value.trim()});
        for(const key of ['jogo','campeonato'])if(params.get(key))query.set(key,params.get(key));
        $('matches-context').textContent=params.get('jogo')?`Jogo: ${params.get('jogo')}`:params.get('campeonato')?`Campeonato nº ${params.get('campeonato')}`:'';
        try{const r=await request('partidas?'+query);if(current!==revision)return;
          list('matches-grid',r.data,m=>matchCard(m),'Nenhuma partida encontrada. Os confrontos aparecem após a geração pelo organizador.');pager('matches',page,r.hasMore);$('matches-message').textContent=`${r.data.length} partida(s) nesta página.`;
        }catch(e){if(current===revision){$('matches-grid').replaceChildren();$('matches-message').textContent=e.message;}}
      };
      $('matches-search').onsubmit=e=>{e.preventDefault();load();};
      document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{status=b.dataset.status;document.querySelectorAll('[data-status]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));load();});
      document.querySelectorAll('[data-mine]').forEach(b=>b.onclick=()=>{mine=b.dataset.mine==='1';document.querySelectorAll('[data-mine]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));load();});
      $('matches-clear').onclick=()=>{params.delete('jogo');params.delete('campeonato');$('matches-search-input').value='';status='todos';mine=false;document.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.status==='todos')));document.querySelectorAll('[data-mine]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mine==='0')));history.replaceState(null,'',location.pathname);load();};
      if(params.get('partida')){const detail=$('match-detail');detail.hidden=false;detail.textContent='Carregando confronto...';request('partidas/'+encodeURIComponent(params.get('partida'))).then(r=>detail.replaceChildren(node('h2','Detalhes do confronto'),matchCard(r.data,true))).catch(e=>detail.textContent=e.message);}
      load();
    }
    if($('history-results')) {
      let revision=0;const setPage=pagination('history',p=>load(p));
      const load=async(page=1)=>{setPage(page);const current=++revision;$('history-message').textContent='Carregando histórico...';$('history-prev').disabled=true;$('history-next').disabled=true;
        try{const {data,hasMore}=await request('meu-historico?page='+page);if(current!==revision)return;
          list('history-results',data.resultados,r=>{const m=r.partidas;return card(m?`${m.time_a?.nome||'A definir'} ${m.placar_a??'—'} × ${m.placar_b??'—'} ${m.time_b?.nome||'A definir'}`:r.motivo||'Registro de pontuação',[`${r.pontos>0?'+':''}${r.pontos} pontos`,r.campeonatos?.nome,r.motivo,date(r.criado_em)],m?[link('Ver confronto',`partidas.html?partida=${m.id_partida}`)]:[]);},'Você ainda não possui partidas pontuadas.');
          list('history-teams',data.vinculos,c=>card(c.times?.nome||'Time indisponível',[label(c.status),'Entrada: '+date(c.data_entrada),c.data_saida?'Saída: '+date(c.data_saida):'Vínculo atual'],[link('Meus times','times.html')]),'Você ainda não participou de um time.');
          pager('history',page,hasMore);$('history-message').textContent='Histórico de pontuação e participação em times.';
        }catch(e){if(current===revision)$('history-message').textContent=e.message;}
      };load();
    }
  });
})();

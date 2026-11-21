/* Exploração dos campeonatos cadastrados; identidade e permissões permanecem na API. */
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('championship-explore-grid');
  if (!grid) return;
  const message = document.getElementById('championship-explore-message');
  const search = document.getElementById('championship-search-input');
  const previous = document.getElementById('championship-explore-prev');
  const next = document.getElementById('championship-explore-next');
  const pageLabel = document.getElementById('championship-explore-page');
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const gameKey = value => {
    const name = normalize(value);
    if (['lol', 'leagueoflegends'].includes(name)) return 'leagueoflegends';
    if (['cssource', 'counterstrikesource'].includes(name)) return 'counterstrikesource';
    return name;
  };
  const logos = {amongus:'imagens/campeonato-among-us.png',valorant:'imagens/campeonato-valorant.png',fortnite:'imagens/campeonato-fortnite.png',leagueoflegends:'imagens/campeonato-lol.png',counterstrikesource:'imagens/campeonato-cs-source.png',brawlstars:'imagens/brawlstars.png'};
  const states = {rascunho:'Em preparação',aberto:'Inscrições abertas',em_andamento:'Em andamento',encerrado:'Encerrado',cancelado:'Cancelado'};
  const formats = {eliminatoria:'Eliminatória',pontos_corridos:'Pontos corridos'};
  const date = value => {
    if (!value) return 'A definir';
    const parsed = new Date(value + 'T00:00:00');
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('pt-BR') : 'A definir';
  };
  const node = (tag, text, className) => {const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  let championships = [], selectedGame = 'Todos', page = 1, version = 0, reloadTimer;
  const pageSize = 6;
  const renderCard = championship => {
    const card = node('article', undefined, 'championship-game-card');
    const copy = node('div', undefined, 'championship-game-copy');
    copy.append(node('p', states[championship.status] || championship.status || 'A definir', 'championship-game-status'));
    copy.append(node('h3', championship.jogo, 'championship-game-title'), node('p', championship.nome, 'championship-game-name'));
    const meta = node('div', undefined, 'championship-game-meta');
    meta.append(node('span', formats[championship.formato] || championship.formato), node('span', `${date(championship.data_inicio)} a ${date(championship.data_fim)}`));
    copy.appendChild(meta);
    const counts=node('div',undefined,'championship-team-counts');
    counts.append(node('p',`${championship.times_confirmados?.[0]?.count ?? 0} de ${championship.max_times} times confirmados`,'championship-confirmed-count'),node('p',`${championship.times_pendentes?.[0]?.count ?? 0} aguardando aprovação`,'championship-pending-count'));
    copy.appendChild(counts);
    const actions = node('div', undefined, 'championship-game-actions');
    const view = node('a', 'Ver campeonato', 'championship-card-link');
    view.href = `campeonatos.html?campeonato=${encodeURIComponent(championship.id_campeonato)}#matches-list`;
    actions.appendChild(view);
    if (['rascunho', 'aberto'].includes(championship.status)) {
      const join = node('button', 'Inscrever time', 'secondary-button');join.type='button';
      join.addEventListener('click', () => {
        const select=document.querySelector('#inscricao-form [name="id_campeonato"]');
        select.dataset.preselected=String(championship.id_campeonato);
        select.value=String(championship.id_campeonato);
        document.getElementById('inscrever-time').scrollIntoView({behavior:'smooth',block:'start'});
        document.querySelector('#inscricao-form [name="id_time"]').focus({preventScroll:true});
      });
      actions.appendChild(join);
    }
    const image = document.createElement('img');
    image.className='championship-game-logo';image.alt='';image.width=138;image.height=138;image.loading='lazy';
    const defaultImage = () => {image.classList.add('is-generic');image.src='imagens/logo-menu.png';};
    image.onerror=()=>{image.onerror=null;defaultImage();};
    if (logos[gameKey(championship.jogo)]) image.src=logos[gameKey(championship.jogo)];else defaultImage();
    card.append(copy,image,actions);
    return card;
  };
  const render = () => {
    const term=normalize(search.value.trim());
    const filtered=championships.filter(item=>(selectedGame==='Todos'||gameKey(item.jogo)===gameKey(selectedGame)) && (!term||normalize(`${item.nome} ${item.jogo}`).includes(term)));
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);
    grid.replaceChildren(...filtered.slice((page-1)*pageSize,page*pageSize).map(renderCard));
    if (!filtered.length) grid.appendChild(node('p','Nenhum campeonato encontrado. Escolha outro jogo ou tente uma nova busca.','championship-empty'));
    message.textContent=filtered.length ? `${filtered.length} campeonato${filtered.length===1?'':'s'} encontrado${filtered.length===1?'':'s'}.` : '';
    pageLabel.textContent=`Página ${page} de ${pages}`;previous.disabled=page===1;next.disabled=page===pages;
  };
  const load = async () => {
    const current=++version;message.textContent='Carregando campeonatos...';previous.disabled=true;next.disabled=true;
    try {
      const rows=[];
      for(let batchPage=1;batchPage<=1000;batchPage++){
        const batch=await window.rivalsAuth.request('/api/campeonatos?page='+batchPage);
        if(current!==version)return;
        rows.push(...batch);
        if(batch.length<100)break;
      }
      championships=rows.filter(item=>item.status!=='cancelado'&&!/^HOMOLOG/i.test(item.nome||''));render();
    } catch(error){if(current===version){grid.replaceChildren();message.textContent=error.message;}}
  };
  const scheduleReload = () => {clearTimeout(reloadTimer);reloadTimer=setTimeout(load,60);};
  window.addEventListener('rivals:campeonatos-atualizados',scheduleReload);
  document.querySelector('.search').addEventListener('submit',event=>{event.preventDefault();page=1;render();document.getElementById('explorar-campeonatos').scrollIntoView({behavior:'smooth',block:'start'});});
  search.addEventListener('input',()=>{page=1;render();});
  document.querySelectorAll('[data-game]').forEach(button=>button.addEventListener('click',()=>{
    selectedGame=button.dataset.game;page=1;
    document.querySelectorAll('[data-game]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});render();
  }));
  previous.addEventListener('click',()=>{if(page>1){page--;render();}});
  next.addEventListener('click',()=>{page++;render();});
  document.querySelectorAll('.tabs .tab').forEach(tab=>tab.addEventListener('click',()=>{
    document.querySelectorAll('.tabs .tab').forEach(item=>{item.classList.toggle('active',item===tab);if(item===tab)item.setAttribute('aria-current','location');else item.removeAttribute('aria-current');});
  }));
  scheduleReload();
});

document.addEventListener('DOMContentLoaded', async () => {
  const client = window.rivalsAuth?.client;
  if (!client) return;
  const message = document.getElementById('teams-message');
  const createForm = document.getElementById('create-team-form');
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  const user = session.user.id;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  async function request(url, method = 'GET', body) {
    return window.rivalsAuth.request(url,{method,body});
  }
  async function action(button, run) {
    button.disabled = true;
    try { await run(); await render(); message.textContent = 'Alteração salva.'; }
    catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  }
  function memberButton(label, team, body, confirmation) {
    const button = element('button', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (confirmation && !window.confirm(confirmation)) return;
      action(button, () => request(`/api/times/${team}/membros`, 'POST', body));
    });
    return button;
  }
  function teamHeading(name, role) {
    const heading=element('div','','teams-card-heading');
    const emblem=element('div','','teams-emblem');
    const image=document.createElement('img');image.src='imagens/logo-menu.png';image.alt='';image.width=40;image.height=28;emblem.append(image);
    const copy=element('div','','teams-card-copy');copy.append(element('p',role,'teams-role'),element('h3',name));
    heading.append(emblem,copy);return heading;
  }
  async function render() {
    const result = await request('/api/meus-times');
    const invites = document.getElementById('team-invites');
    const rosters = document.getElementById('team-rosters');
    invites.replaceChildren(); rosters.replaceChildren();
    document.getElementById('teams-invite-count').textContent=String(result.convites.length);
    document.getElementById('teams-roster-count').textContent=String(result.times.length);
    if (!result.convites.length) invites.append(element('p', 'Você não tem convites pendentes.','teams-empty'));
    if (!result.times.length) rosters.append(element('p', 'Crie um time ou aceite um convite para começar.','teams-empty'));
    for (const invite of result.convites) {
      const card = element('article', '', 'teams-card');
      card.append(teamHeading(invite.nome,'CONVITE PARA O ELENCO'),element('p','Você foi convidado para fazer parte deste time.','teams-card-intro'));
      const actions=element('div','','teams-card-actions');
      const decline=memberButton('Recusar', invite.id_time, { acao: 'recusar' });decline.className='teams-secondary';
      actions.append(memberButton('Aceitar', invite.id_time, { acao: 'aceitar' }),decline);card.append(actions);
      invites.append(card);
    }
    for (const team of result.times) {
      const captain = team.id_capitao === user;
      const card = element('article', '', 'teams-card');
      card.append(teamHeading(team.nome,captain?'VOCÊ É O CAPITÃO':'VOCÊ FAZ PARTE DESTE TIME'));
      const active=team.membros.filter(member=>member.status==='ativo').length;
      const pending=team.membros.filter(member=>member.status==='pendente').length;
      card.append(element('p',`${active} ${active===1?'membro ativo':'membros ativos'}${pending?` · ${pending} ${pending===1?'convite pendente':'convites pendentes'}`:''}`,'teams-roster-summary'));
      if (team.bloqueado) card.append(element('p', 'Elenco bloqueado durante campeonato em andamento.','teams-lock-notice'));
      const list = element('ul', '', 'teams-members');
      for (const member of team.membros) {
        const row = element('li');
        const info=element('div','','teams-member-info');
        const avatar=document.createElement('img');avatar.src='imagens/avatar-padrao.svg';avatar.alt='';avatar.width=36;avatar.height=36;
        const copy=element('div','','teams-member-copy');
        copy.append(element('span',`@${member.username}`,'teams-member-name'),element('span',member.id_jogador===team.id_capitao?'Capitão':member.status==='pendente'?'Convite pendente':'Membro','teams-member-role'));
        info.append(avatar,copy);row.append(info);
        const actions=element('div','','teams-member-actions');
        if (captain && member.id_jogador !== user) {
          const remove = memberButton(member.status === 'pendente' ? 'Cancelar convite' : 'Remover', team.id_time, { acao: 'remover', id_jogador: member.id_jogador }, 'Encerrar este vínculo com o time?');
          remove.disabled = team.bloqueado;
          remove.className='teams-secondary';actions.append(remove);
          if (member.status === 'ativo') {
            const transfer = memberButton('Tornar capitão', team.id_time, { acao: 'transferir', id_jogador: member.id_jogador }, 'Transferir a capitania? Você deixará de gerenciar este time.');
            transfer.disabled = team.bloqueado;
            transfer.className='teams-secondary';actions.append(transfer);
          }
        }
        if(actions.childElementCount)row.append(actions);list.append(row);
      }
      card.append(list);
      if (captain) {
        const form = element('form', '', 'teams-form');
        const label = element('label', 'Convidar pelo nome de usuário');
        const input = element('input');
        input.name = 'username'; input.required = true; input.pattern = '[A-Za-z0-9_]{3,50}'; input.placeholder = 'username sem @';
        label.append(input);
        const submit = element('button', 'Convidar'); submit.type = 'submit';
        input.disabled=team.bloqueado;submit.disabled=team.bloqueado;
        form.append(label, submit);
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (form.reportValidity()) action(submit, () => request(`/api/times/${team.id_time}/membros`, 'POST', { acao: 'convidar', username: input.value.trim() }));
        });
        card.append(form);
        const deactivate = element('button', 'Desativar time');
        deactivate.className='teams-danger';
        deactivate.type = 'button'; deactivate.disabled = team.bloqueado;
        deactivate.addEventListener('click', () => {
          if (window.confirm('Desativar o time e encerrar os vínculos de todos os membros?')) action(deactivate, () => request(`/api/times/${team.id_time}`, 'PATCH', { status: 'inativo' }));
        });
        card.append(deactivate);
      } else {
        const leave = memberButton('Sair do time', team.id_time, { acao: 'sair' }, 'Deseja sair deste time?');
        leave.className='teams-danger';
        leave.disabled = team.bloqueado; card.append(leave);
      }
      rosters.append(card);
    }
    createForm.hidden = result.times.length > 0;
    message.textContent = '';
  }
  createForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!createForm.reportValidity()) return;
    action(createForm.querySelector('button'), () => request('/api/times', 'POST', { nome: createForm.elements.nome.value.trim() }));
  });
  try { await render(); } catch (error) { message.textContent = error.message; }
});

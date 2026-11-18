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
  async function render() {
    const result = await request('/api/meus-times');
    const invites = document.getElementById('team-invites');
    const rosters = document.getElementById('team-rosters');
    invites.replaceChildren(); rosters.replaceChildren();
    if (!result.convites.length) invites.append(element('p', 'Você não tem convites pendentes.'));
    if (!result.times.length) rosters.append(element('p', 'Crie um time ou aceite um convite para começar.'));
    for (const invite of result.convites) {
      const card = element('article', '', 'teams-card');
      card.append(element('h3', invite.nome), memberButton('Aceitar', invite.id_time, { acao: 'aceitar' }), memberButton('Recusar', invite.id_time, { acao: 'recusar' }));
      invites.append(card);
    }
    for (const team of result.times) {
      const captain = team.id_capitao === user;
      const card = element('article', '', 'teams-card');
      card.append(element('h3', team.nome));
      if (team.bloqueado) card.append(element('p', 'Elenco bloqueado durante campeonato em andamento.'));
      const list = element('ul', '', 'teams-members');
      for (const member of team.membros) {
        const row = element('li');
        row.append(element('span', `@${member.username} · ${member.id_jogador === team.id_capitao ? 'Capitão' : member.status === 'pendente' ? 'Convite pendente' : 'Membro'}`));
        if (captain && member.id_jogador !== user) {
          const remove = memberButton(member.status === 'pendente' ? 'Cancelar convite' : 'Remover', team.id_time, { acao: 'remover', id_jogador: member.id_jogador }, 'Encerrar este vínculo com o time?');
          remove.disabled = team.bloqueado;
          row.append(remove);
          if (member.status === 'ativo') {
            const transfer = memberButton('Tornar capitão', team.id_time, { acao: 'transferir', id_jogador: member.id_jogador }, 'Transferir a capitania? Você deixará de gerenciar este time.');
            transfer.disabled = team.bloqueado;
            row.append(transfer);
          }
        }
        list.append(row);
      }
      card.append(list);
      if (captain) {
        const form = element('form', '', 'teams-form');
        const label = element('label', 'Convidar pelo nome de usuário');
        const input = element('input');
        input.name = 'username'; input.required = true; input.pattern = '[A-Za-z0-9_]{3,50}'; input.placeholder = 'username sem @';
        label.append(input);
        const submit = element('button', 'Convidar'); submit.type = 'submit';
        form.append(label, submit);
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (form.reportValidity()) action(submit, () => request(`/api/times/${team.id_time}/membros`, 'POST', { acao: 'convidar', username: input.value.trim() }));
        });
        card.append(form);
        const deactivate = element('button', 'Desativar time');
        deactivate.type = 'button'; deactivate.disabled = team.bloqueado;
        deactivate.addEventListener('click', () => {
          if (window.confirm('Desativar o time e encerrar os vínculos de todos os membros?')) action(deactivate, () => request(`/api/times/${team.id_time}`, 'PATCH', { status: 'inativo' }));
        });
        card.append(deactivate);
      } else {
        const leave = memberButton('Sair do time', team.id_time, { acao: 'sair' }, 'Deseja sair deste time?');
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

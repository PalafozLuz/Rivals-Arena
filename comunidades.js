document.addEventListener('DOMContentLoaded', async () => {
  const client = window.rivalsAuth?.client;
  if (!client) return;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  const user = session.user.id;
  const $ = id => document.getElementById(id);
  const form = $('community-form');
  let page = 1, postPage = 1, category = 'Todos', search = '', selected = null, memberships = new Set(), listVersion = 0, detailVersion = 0;
  const node = (tag, text = '', className = '') => {
    const result = document.createElement(tag); result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  function message(text) { $('community-message').textContent = text; }
  async function request(url, method = 'GET', body) {
    return window.rivalsAuth.request(url,{method,body});
  }
  async function run(button, work) {
    button.disabled = true;
    try { await work(); message('Alteração salva.'); }
    catch (error) { message(error.message); }
    finally { button.disabled = false; }
  }
  function button(label, work) {
    const result = node('button', label); result.type = 'button';
    result.addEventListener('click', () => run(result, work));
    return result;
  }
  function card(community) {
    const result = node('article', '', 'my-community-card social-community-card');
    const cover = node('div', '', 'my-community-cover');
    const image = document.createElement('img'); image.alt = '';
    image.src = /^https?:\/\//i.test(community.imagem_url || '') ? community.imagem_url : 'imagens/valorant.png';
    image.addEventListener('error', () => { image.src = 'imagens/valorant.png'; }, { once: true });
    cover.appendChild(image);
    const body = node('div', '', 'social-card-body');
    body.append(node('h3', community.nome), node('p', `${community.categoria || 'Geral'} · ${community.jogo || 'Vários jogos'}`),
      node('p', `${community.membros_comunidade?.[0]?.count || 0} membros`),
      button(`Abrir ${community.nome}`, () => openCommunity(community.id_comunidade, true, true)));
    result.append(cover, body); return result;
  }
  function renderCards(id, communities, empty) {
    $(id).replaceChildren(...communities.map(card));
    if (!communities.length) $(id).appendChild(node('p', empty));
  }
  async function load() {
    const version = ++listVersion;
    message('Carregando comunidades...');
    const params = new URLSearchParams({ page, q: search, categoria: category });
    const [communities, mine, membership, recent] = await Promise.all([
      request(`/api/comunidades?${params}`), request('/api/comunidades?minhas=1'), request('/api/minhas-comunidades'), request('/api/comunidades')
    ]);
    if (version !== listVersion) return;
    memberships = new Set(membership.map(item => String(item.id_comunidade)));
    renderCards('communities-grid', communities, 'Nenhuma comunidade encontrada. Experimente outra busca ou crie a sua.');
    renderCards('my-communities-grid', mine, 'Você ainda não participa de comunidades.');
    renderCards('recent-communities-grid', recent.slice(0, 3), 'As novas comunidades aparecerão aqui.');
    $('community-page').textContent = `Página ${page}`;
    $('community-prev').disabled = page === 1; $('community-next').disabled = communities.length < 24;
    message('');
  }
  function resetEditor() {
    form.reset(); delete form.dataset.editing; delete form.dataset.customSlug;
    $('community-editor-title').textContent = 'Criar comunidade';
  }
  function editCommunity(community) {
    form.dataset.editing = community.id_comunidade;
    for (const field of ['nome','slug','jogo','categoria','descricao','imagem_url']) form.elements[field].value = community[field] || (field === 'categoria' ? 'Geral' : '');
    $('community-editor-title').textContent = 'Editar comunidade';
    $('community-editor').open = true;
    $('community-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.nome.focus({ preventScroll: true });
  }
  async function openCommunity(id, scroll = false, resetPage = false) {
    if (resetPage) postPage = 1;
    const version = ++detailVersion;
    const [community, members, posts, mine] = await Promise.all([
      request(`/api/comunidades/${id}`), request(`/api/comunidades/${id}/membros`),
      request(`/api/publicacoes?id_comunidade=${id}&page=${postPage}`), request('/api/minhas-comunidades')
    ]);
    if (version !== detailVersion) return;
    memberships = new Set(mine.map(item => String(item.id_comunidade)));
    selected = community;
    const member = memberships.has(String(id));
    const owner = community.id_criador === user;
    $('community-detail').hidden = false;
    $('community-detail-title').textContent = community.nome;
    $('community-detail-description').textContent = community.descricao || 'Participe e compartilhe suas experiências.';
    $('community-detail-count').textContent = `${community.membros_comunidade?.[0]?.count || 0} membros · ${community.categoria}`;
    const actions = $('community-actions'); actions.replaceChildren();
    if (owner) actions.append(node('span', 'Você é o dono desta comunidade.'), button('Editar comunidade', async () => editCommunity(community)));
    else actions.append(button(member ? 'Sair da comunidade' : 'Entrar na comunidade', async () => {
      if (member && !window.confirm('Sair desta comunidade? Suas publicações serão preservadas.')) return;
      await request(`/api/comunidades/${id}/membros`, member ? 'DELETE' : 'POST');
      await load(); await openCommunity(id);
    }));
    $('community-members').replaceChildren(...members.map(item => node('li', `@${item.jogadores?.username || 'jogador'} · ${item.papel}`)));
    $('community-post-form').hidden = !member;
    $('community-posts').replaceChildren();
    if (!posts.length) $('community-posts').appendChild(node('p', 'Nenhuma publicação nesta página.'));
    for (const post of posts) {
      const article = node('article', '', 'social-post');
      const author = node('h4', `@${post.jogadores?.username || 'jogador'}`);
      const time = node('time', new Date(post.criada_em).toLocaleString('pt-BR')); time.dateTime = post.criada_em;
      const content = node('p', post.conteudo, 'social-post-text');
      const actions = node('div', '', 'social-actions');
      const liked = Boolean(post.minhas_reacoes?.length);
      const reaction = button(`${liked ? 'Descurtir' : 'Curtir'} · ${post.reacoes_publicacao?.[0]?.count || 0}`, async () => {
        await request(`/api/publicacoes/${post.id_publicacao}/reacao`, liked ? 'DELETE' : 'POST', liked ? undefined : { tipo: 'curtida' });
        await openCommunity(id);
      });
      reaction.disabled = !member; reaction.setAttribute('aria-pressed', String(liked));
      actions.appendChild(reaction);
      article.append(author, time, content, actions);
      if (post.id_autor === user) {
        const editForm = node('form', '', 'social-form'); editForm.hidden = true;
        const label = node('label', 'Editar publicação', 'social-full');
        const input = node('textarea'); input.value = post.conteudo; input.required = true; input.maxLength = 5000; input.rows = 3;
        label.appendChild(input);
        const save = node('button', 'Salvar publicação'); save.type = 'submit';
        editForm.append(label, save);
        editForm.addEventListener('submit', event => {
          event.preventDefault();
          if (editForm.reportValidity()) run(save, async () => {
            await request(`/api/publicacoes/${post.id_publicacao}`, 'PATCH', { conteudo: input.value.trim() });
            await openCommunity(id);
          });
        });
        actions.append(button('Editar publicação', async () => { editForm.hidden = !editForm.hidden; if (!editForm.hidden) input.focus(); }),
          button('Excluir publicação', async () => {
            if (!window.confirm('Excluir esta publicação e suas reações?')) return;
            await request(`/api/publicacoes/${post.id_publicacao}`, 'DELETE'); await openCommunity(id);
          }));
        article.appendChild(editForm);
      }
      $('community-posts').appendChild(article);
    }
    $('posts-page').textContent = `Página ${postPage}`;
    $('posts-prev').disabled = postPage === 1; $('posts-next').disabled = posts.length < 24;
    history.replaceState(null, '', `#comunidade-${id}`);
    if (scroll) $('community-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  form.elements.nome.addEventListener('input', () => {
    if (!form.dataset.editing && !form.dataset.customSlug) form.elements.slug.value = form.elements.nome.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  });
  form.elements.slug.addEventListener('input', () => form.dataset.customSlug = '1');
  $('community-cancel-edit').addEventListener('click', resetEditor);
  document.querySelector('.community-primary-action').addEventListener('click', () => { resetEditor(); $('community-editor').open = true; });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    run(form.querySelector('[type="submit"]'), async () => {
      const payload = Object.fromEntries(new FormData(form));
      const id = form.dataset.editing;
      const saved = await request(id ? `/api/comunidades/${id}` : '/api/comunidades', id ? 'PATCH' : 'POST', payload);
      resetEditor(); $('community-editor').open = false;
      await load(); await openCommunity(saved.id_comunidade || saved[0]?.id_comunidade, true, true);
    });
  });
  $('community-post-form').addEventListener('submit', event => {
    event.preventDefault(); const postForm = event.currentTarget;
    if (!selected || !postForm.reportValidity()) return;
    run(postForm.querySelector('button'), async () => {
      await request('/api/publicacoes', 'POST', { id_comunidade: Number(selected.id_comunidade), conteudo: postForm.elements.conteudo.value.trim() });
      postForm.reset(); postPage = 1; await openCommunity(selected.id_comunidade);
    });
  });
  document.querySelector('.community-search').addEventListener('submit', async event => {
    event.preventDefault(); search = $('community-search-input').value.trim(); page = 1;
    try { await load(); } catch (error) { message(error.message); }
  });
  document.querySelectorAll('.community-filters button').forEach(filter => filter.addEventListener('click', async () => {
    category = filter.textContent; page = 1;
    document.querySelector('.community-filters .is-active')?.classList.remove('is-active'); filter.classList.add('is-active');
    try { await load(); } catch (error) { message(error.message); }
  }));
  $('community-prev').addEventListener('click', () => { page = Math.max(1,page-1); load().catch(error=>message(error.message)); });
  $('community-next').addEventListener('click', () => { page++; load().catch(error=>message(error.message)); });
  $('posts-prev').addEventListener('click', () => { postPage = Math.max(1,postPage-1); openCommunity(selected.id_comunidade).catch(error=>message(error.message)); });
  $('posts-next').addEventListener('click', () => { postPage++; openCommunity(selected.id_comunidade).catch(error=>message(error.message)); });
  try {
    await load();
    const match = location.hash.match(/^#comunidade-(\d+)$/);
    if (match) await openCommunity(Number(match[1]), true);
  } catch (error) { message(error.message); }
});

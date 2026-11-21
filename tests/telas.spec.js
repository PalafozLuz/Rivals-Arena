const { test, expect } = require('@playwright/test');
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'qa@example.test' };
// Sessão/API simuladas para verificar a interface sem usar senhas reais.
// As permissões e transações reais são verificadas separadamente no banco.
async function setup(page, loggedIn = true) {
  await page.addInitScript(({ user, loggedIn }) => {
    if (!sessionStorage.getItem('qa-initialized')) {
      sessionStorage.setItem('qa-initialized','1');
      if (loggedIn) localStorage.setItem('qa-session',JSON.stringify(user));
    }
  }, { user, loggedIn });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('@supabase/supabase-js')) return route.fulfill({ contentType: 'text/javascript', body: `
      window.supabase = { createClient: () => ({ auth: {
        getSession: async () => ({data:{session:localStorage.getItem('qa-session') ? {user:JSON.parse(localStorage.getItem('qa-session')),access_token:'qa-test'} : null}}),
        getUser: async () => ({data:{user:JSON.parse(localStorage.getItem('qa-session')||'null')}}),
        signOut: async () => {localStorage.removeItem('qa-session');return {error:null}},
        signInWithPassword: async ({email,password}) => {if(email!=='qa@example.test'||password!=='TesteSenha#123')return {error:{message:'Credenciais inválidas'}};localStorage.setItem('qa-session',JSON.stringify(${JSON.stringify(user)}));return {error:null}},
        signUp: async () => ({error:null}),
        resetPasswordForEmail: async (email,options) => {window.qaRecovery={email,...options};return {error:null}},
        updateUser: async body => {window.qaPasswordUpdated=Boolean(body.password);return {error:null}},
        onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}})
      }, rpc: async (name) => {if(name!=='username_disponivel')throw Error('RPC inesperada');return {data:true,error:null}}, from: () => {throw Error('A tela deve usar a API Express para dados.')} })};
    ` });
    if (!url.startsWith('http://127.0.0.1:3417/')) return route.abort();
    if(new URL(url).pathname.startsWith('/api/')) {
      const path=new URL(url).pathname;
      const data=path==='/api/inicio'?{comunidades:[],campeonatos:[],partidas:[],jogos:[]}:path==='/api/meu-historico'?{resultados:[],vinculos:[]}:path==='/api/meus-times'?{times:[],convites:[]}:path.startsWith('/api/jogadores/')?{nome:'Jogador QA',username:'jogadorqa'}:[];
      return route.fulfill({json:{data,hasMore:false}});
    }
    return route.continue();
  });
}
test('sem sessão, página protegida leva ao login e erro de credenciais aparece', async ({ page }) => {
  await setup(page,false);
  await page.goto('/perfil.html'); await expect(page).toHaveURL(/login.html/);
  await page.getByLabel('E-mail').fill('erro@example.test');
  await page.getByLabel('Senha',{exact:true}).fill('senhaerrada');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.locator('[data-auth-message]')).toContainText('Credenciais inválidas');
});
test('login rejeita redirecionamento externo e mantém sessão ao navegar', async ({ page }) => {
  await setup(page,false); await page.goto('/login.html?redirect=https://example.org');
  await page.getByLabel('E-mail').fill('qa@example.test');
  await page.getByLabel('Senha',{exact:true}).fill('TesteSenha#123');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page).toHaveURL(/homepage.html$/);
  await page.goto('/times.html'); await expect(page).toHaveURL(/times.html$/);
});
async function preencherCadastro(page) {
  await page.getByLabel('Nome',{exact:true}).fill('Jogador QA');
  await page.getByLabel('Nome de usuário',{exact:true}).fill('jogador_qa');
  await page.getByLabel('E-mail',{exact:true}).fill('qa@example.test');
  await page.getByLabel('Senha',{exact:true}).fill('TesteSenha#123');
  await page.getByLabel('Confirmar senha',{exact:true}).fill('TesteSenha#123');
}

for (const query of ['', '?redirect=https://example.org']) test('cadastro com sessão entra na arena e mantém login '+(query?'com destino externo':'sem destino'),async({page})=>{
  await setup(page,false);await page.goto('/cadastro.html'+query);
  await page.evaluate(user=>{
    window.rivalsAuth.client.auth.signUp=async()=>{
      localStorage.setItem('qa-session',JSON.stringify(user));
      return {data:{user,session:{user,access_token:'qa-test'}},error:null};
    };
  },user);
  await preencherCadastro(page);
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await expect(page).toHaveURL(/\/homepage.html$/);
  await page.reload();await expect(page).toHaveURL(/\/homepage.html$/);
  await page.goto('/perfil.html');await expect(page.locator('[data-profile-name]')).toHaveText('Jogador QA');
});

test('cadastro sem sessão informa confirmação e permanece na página pública',async({page})=>{
  await setup(page,false);await page.goto('/cadastro.html');
  await page.evaluate(()=>window.rivalsAuth.client.auth.signUp=async()=>({data:{user:{id:'qa-pending'},session:null},error:null}));
  await preencherCadastro(page);
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await expect(page.locator('[data-auth-message]')).toHaveText('Cadastro concluído! Confirme seu e-mail para acessar sua conta.');
  await expect(page).toHaveURL(/\/cadastro.html$/);
  expect(await page.evaluate(()=>localStorage.getItem('qa-session'))).toBeNull();
  await expect(page.getByLabel('Nome',{exact:true})).toHaveValue('');
});

test('cadastro bloqueia username repetido antes de criar a conta',async({page})=>{
  await setup(page,false);await page.goto('/cadastro.html');
  await page.evaluate(()=>{
    window.qaSignupCalled=false;
    window.rivalsAuth.client.rpc=async(name,args)=>{window.qaCheckedUsername=args.p_username;return {data:false,error:null}};
    window.rivalsAuth.client.auth.signUp=async()=>{window.qaSignupCalled=true;return {error:null}};
  });
  await preencherCadastro(page);await page.getByLabel('Nome de usuário',{exact:true}).fill('JOGADOR_QA');
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await expect(page.locator('[data-auth-message]')).toHaveText('Este nome de usuário já está cadastrado. Escolha outro.');
  expect(await page.evaluate(()=>window.qaCheckedUsername)).toBe('jogador_qa');
  expect(await page.evaluate(()=>window.qaSignupCalled)).toBe(false);
  await expect(page.getByLabel('Nome de usuário',{exact:true})).toHaveValue('JOGADOR_QA');
  await expect(page.getByRole('button',{name:'Criar conta',exact:true})).toBeEnabled();
});

test('cadastro trata colisão de username entre verificação e criação',async({page})=>{
  await setup(page,false);await page.goto('/cadastro.html');
  await page.evaluate(()=>{
    let checks=0;
    window.rivalsAuth.client.rpc=async()=>({data:++checks===1,error:null});
    window.rivalsAuth.client.auth.signUp=async()=>({error:{code:'unexpected_failure',message:'Database error saving new user'}});
  });
  await preencherCadastro(page);await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await expect(page.locator('[data-auth-message]')).toHaveText('Este nome de usuário já está cadastrado. Escolha outro.');
  await expect(page).toHaveURL(/cadastro.html$/);
});

test('cadastro interrompe envio se verificação de username falha',async({page})=>{
  await setup(page,false);await page.goto('/cadastro.html');
  await page.evaluate(()=>{
    window.qaSignupCalled=false;
    window.rivalsAuth.client.rpc=async()=>({data:null,error:{message:'Indisponível'}});
    window.rivalsAuth.client.auth.signUp=async()=>{window.qaSignupCalled=true;return {error:null}};
  });
  await preencherCadastro(page);await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await expect(page.locator('[data-auth-message]')).toHaveText('Não foi possível verificar o nome de usuário. Tente novamente.');
  expect(await page.evaluate(()=>window.qaSignupCalled)).toBe(false);
});

test('cadastro recusado preserva campos e permite tentar novamente',async({page})=>{
  await setup(page,false);await page.goto('/cadastro.html');
  await page.evaluate(()=>window.rivalsAuth.client.auth.signUp=async()=>({data:{session:null},error:{message:'Não foi possível criar esta conta.'}}));
  await preencherCadastro(page);
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await expect(page.locator('[data-auth-message]')).toHaveText('Não foi possível criar esta conta.');
  await expect(page).toHaveURL(/\/cadastro.html$/);
  await expect(page.getByLabel('Nome',{exact:true})).toHaveValue('Jogador QA');
  await expect(page.getByRole('button',{name:'Criar conta',exact:true})).toBeEnabled();
});

test('perfil carrega, salva pela API e faz logout', async ({ page }) => {
  await setup(page);
  let profile = { nome:'Jogador QA',username:'jogadorqa',bio:'Minha bio',avatar_url:'',vitorias:3,pontuacao_ranking:30 };
  await page.route('**/api/jogadores/*',async route => {
    if(route.request().method()==='PATCH')profile={...profile,...route.request().postDataJSON()};
    await route.fulfill({json:{data:profile}});
  });
  await page.goto('/perfil.html'); await expect(page.locator('[data-profile-name]')).toHaveText('Jogador QA');
  await page.getByRole('button',{name:'Editar perfil'}).click();
  await page.getByLabel('Nome',{exact:true}).fill('Nome atualizado');
  await page.getByLabel('Bio',{exact:true}).fill('Bio atualizada');
  await page.getByRole('button',{name:'Salvar alterações'}).click();
  await expect(page.locator('[data-profile-name]')).toHaveText('Nome atualizado');
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  await expect(page).toHaveURL(/login.html$/);
});
test('logout responde mesmo com a consulta do perfil ainda carregando',async({page})=>{
 await setup(page);
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/jogadores/*',async route=>{await gate;await route.fulfill({json:{data:{nome:'QA',username:'qa'}}}).catch(()=>{});});
 const started=page.waitForRequest('**/api/jogadores/*');
 try{
  await page.goto('/perfil.html');await started;
  await page.getByRole('button',{name:'Sair',exact:true}).click();
  await expect(page).toHaveURL(/login.html$/);
 }finally{release();}
});
for (const width of [360,768,1440]) test(`menu e layout em ${width}px`,async({page})=>{
  await setup(page); await page.setViewportSize({width,height:900});
  for(const file of ['perfil.html','campeonatos.html','times.html','comunidade.html','homepage.html','partidas.html']) {
    await page.goto('/'+file);
    await expect(page.locator('.menu-toggle')).toBeVisible();
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.mobile-menu')).toHaveClass(/open/);
    await expect(page.locator('.mobile-menu a[href="times.html"]')).toBeVisible();
    const fits = await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    expect(fits,file).toBeTruthy();
  }
});
test('comunidades: entrar, publicar texto seguro, curtir, editar, excluir e sair',async({page})=>{
 await setup(page);
 let joined=false,liked=false,posts=[];
 let community={id_comunidade:1,nome:'Comunidade QA',slug:'comunidade-qa',categoria:'FPS',jogo:'Valorant',descricao:'Descrição QA',id_criador:'outro',imagem_url:''};
 const current=()=>({...community,membros_comunidade:[{count:joined?2:1}]});
 page.on('dialog',dialog=>dialog.accept());
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method(),p=url.pathname;
  let data;
  if(p==='/api/minhas-comunidades')data=joined?[{id_comunidade:community.id_comunidade,papel:'membro'}]:[];
  else if(/\/comunidades\/\d+\/membros$/.test(p)){
   if(method==='POST')joined=true;
   if(method==='DELETE')joined=false;
   data=joined?[{id_jogador:user.id,papel:'membro',jogadores:{username:'jogadorqa'}}]:[];
  }else if(p==='/api/comunidades' && method==='POST'){
   community={...community,...req.postDataJSON(),id_criador:user.id};joined=true;data=[current()];
  }else if(p==='/api/comunidades')data=url.searchParams.get('minhas')&&!joined?[]:[current()];
  else if(/\/comunidades\/\d+$/.test(p)){
   if(method==='PATCH')community={...community,...req.postDataJSON()};data=current();
  }else if(/\/publicacoes\/\d+\/reacao$/.test(p)){liked=method==='POST';data=[];}
  else if(p==='/api/publicacoes'){
   if(method==='POST')posts.push({id_publicacao:10,...req.postDataJSON(),id_autor:user.id,jogadores:{username:'jogadorqa'},criada_em:'2026-11-17T12:00:00Z'});
   data=posts.map(post=>({...post,reacoes_publicacao:[{count:liked?1:0}],minhas_reacoes:liked?[{id_jogador:user.id}]:[]}));
  }else if(/\/publicacoes\/\d+$/.test(p)){
   if(method==='PATCH')posts[0]={...posts[0],...req.postDataJSON()};
   if(method==='DELETE')posts=[]; data=posts[0]||{};
  }else return route.fulfill({status:404,json:{error:'Rota inesperada'}});
  return route.fulfill({json:{data}});
 });
 await page.goto('/comunidade.html');
 await page.getByRole('button',{name:'Abrir Comunidade QA',exact:true}).first().click();
 await page.getByRole('button',{name:'Entrar na comunidade',exact:true}).click();
 await expect(page.locator('#community-post-form')).toBeVisible();
 await page.getByLabel('Nova publicação',{exact:true}).fill('Texto <b>literal</b>');
 await page.getByRole('button',{name:'Publicar',exact:true}).click();
 await expect(page.locator('.social-post-text')).toHaveText('Texto <b>literal</b>');
 await expect(page.locator('.social-post-text b')).toHaveCount(0);
 await page.getByRole('button',{name:'Curtir · 0',exact:true}).click();
 await expect(page.getByRole('button',{name:'Descurtir · 1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Editar publicação',exact:true}).click();
 await page.getByLabel('Editar publicação',{exact:true}).fill('Publicação editada');
 await page.getByRole('button',{name:'Salvar publicação',exact:true}).click();
 await expect(page.locator('.social-post-text')).toHaveText('Publicação editada');
 await page.getByRole('button',{name:'Excluir publicação',exact:true}).click();
 await expect(page.locator('.social-post')).toHaveCount(0);
 await page.getByRole('button',{name:'Sair da comunidade',exact:true}).click();
 await expect(page.locator('#community-post-form')).toBeHidden();
 await page.getByRole('link',{name:'Criar comunidade',exact:true}).click();
 await page.locator('#community-form [name="nome"]').fill('Nova comunidade QA');
 await page.getByRole('button',{name:'Salvar comunidade',exact:true}).click();
 await expect(page.locator('#community-detail-title')).toHaveText('Nova comunidade QA');
 await page.getByRole('button',{name:'Editar comunidade',exact:true}).click();
 await page.locator('#community-form [name="nome"]').fill('Comunidade renomeada');
 await page.getByRole('button',{name:'Salvar comunidade',exact:true}).click();
 await expect(page.locator('#community-detail-title')).toHaveText('Comunidade renomeada');
 await page.screenshot({path:'test-results/comunidades-desktop.png',fullPage:true});
 await page.setViewportSize({width:360,height:800});
 await expect(page.locator('.community-search')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.screenshot({path:'test-results/comunidades-mobile.png',fullPage:true});
});
test('carrossel mostra os sete jogos, desliza e abre comunidade com três posts',async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:900});
 const community={id_comunidade:12,nome:'Minecraft',slug:'minecraft',jogo:'Minecraft',categoria:'Aventura',id_criador:'outro',membros_comunidade:[{count:1}]};
 await page.route('**/api/**',route=>{
  const p=new URL(route.request().url()).pathname;
  let data=[];
  if(p==='/api/inicio')data={comunidades:[],campeonatos:[],partidas:[],jogos:[]};
  else if(p==='/api/comunidades')data=[community];
  else if(p==='/api/comunidades/12')data=community;
  else if(p==='/api/publicacoes')data=[1,2,3].map(n=>({id_publicacao:n,id_autor:'outro',conteudo:'Publicação inicial '+n,criada_em:'2026-11-20T12:00:00Z',jogadores:{username:'editor'},minhas_reacoes:[],reacoes_publicacao:[{count:0}]}));
  return route.fulfill({json:{data}});
 });
 await page.goto('/homepage.html');
 const covers=page.locator('#home-game-carousel a');await expect(covers).toHaveCount(7);
 await expect(covers.nth(0)).toHaveAttribute('href','comunidade.html?comunidade=minecraft');
 await expect(covers.nth(1)).toHaveAttribute('href','comunidade.html?comunidade=hollow-knight');
 await expect(covers.nth(6)).toHaveAttribute('href','comunidade.html?comunidade=resident-evil');
 await page.getByRole('button',{name:'Próximos jogos',exact:true}).click();
 await expect.poll(()=>page.locator('#home-game-carousel').evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Jogos anteriores',exact:true}).click();
 await expect.poll(()=>page.locator('#home-game-carousel').evaluate(e=>e.scrollLeft)).toBeLessThan(2);
 await page.getByRole('link',{name:'Abrir comunidade de Minecraft',exact:true}).click();
 await expect(page.locator('#community-detail-title')).toHaveText('Minecraft');
 await expect(page.locator('#community-posts .social-post')).toHaveCount(3);
});

test('home busca dados persistidos e links levam ao confronto e comunidade',async({page})=>{
 await setup(page);
 const queries=[];
 await page.route('**/api/inicio?*',route=>{queries.push(new URL(route.request().url()).searchParams.get('q'));return route.fulfill({json:{data:{comunidades:[{id_comunidade:2,nome:'Comunidade real',membros_comunidade:[{count:3}]}],campeonatos:[{id_campeonato:3,nome:'Copa real',jogo:'Valorant',status:'aberto'}],jogos:['Valorant'],partidas:[{id_partida:9,time_a:{nome:'Alfa'},time_b:{nome:'Beta'},status:'agendada',rodada:1}]}}});});
 await page.goto('/homepage.html');await expect(page.locator('#home-message')).toHaveText('Arena atualizada.');
 await expect(page.getByRole('link',{name:'Abrir comunidade de Minecraft',exact:true})).toHaveAttribute('href','comunidade.html?comunidade=minecraft');
 await expect(page.getByRole('heading',{name:'Comunidades recentes',exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Ver confronto'})).toHaveAttribute('href','partidas.html?partida=9');
 await page.locator('#home-search-input').fill('Valorant');await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
 await expect(page.locator('#home-message')).toHaveText('Resultados da busca.');expect(queries).toEqual(['','Valorant']);
});
test('partidas aplica busca, status, times e paginação sem perder o detalhe',async({page})=>{
 await setup(page);const queries=[];
 const match={id_partida:9,id_campeonato:3,time_a:{nome:'Alfa'},time_b:{nome:'Beta'},status:'finalizada',placar_a:2,placar_b:1,rodada:1,campeonatos:{nome:'Copa real',jogo:'Valorant'}};
 await page.route(/\/api\/partidas(?:\?|\/|$)/,route=>{const u=new URL(route.request().url());queries.push(u.searchParams.toString());return route.fulfill({json:u.pathname.endsWith('/9')?{data:match}:{data:[match],hasMore:u.searchParams.get('page')==='1'}});});
 await page.goto('/partidas.html?partida=9&jogo=Valorant');
 await expect(page.locator('#match-detail')).toContainText('Alfa 2 × 1 Beta');
 await expect(page.locator('#match-detail a')).toHaveAttribute('href','campeonatos.html?campeonato=3#matches-list');
 await page.getByRole('button',{name:'Finalizadas',exact:true}).click();await expect.poll(()=>queries.at(-1)).toContain('status=finalizada');
 await page.getByRole('button',{name:'Meus times',exact:true}).click();await expect.poll(()=>queries.at(-1)).toContain('minhas=1');
 await page.getByLabel('Pesquisar time, campeonato ou jogo').fill('Alfa');await page.getByRole('button',{name:'Pesquisar',exact:true}).click();await expect.poll(()=>queries.at(-1)).toContain('q=Alfa');
 await expect(page.locator('#matches-next')).toBeEnabled();await page.locator('#matches-next').click();await expect(page.locator('#matches-page')).toHaveText('Página 2');
 await expect(page.locator('#matches-next')).toBeDisabled();
 await page.getByRole('button',{name:'Limpar filtros'}).click();await expect(page.locator('#matches-page')).toHaveText('Página 1');await expect(page.locator('#matches-context')).toBeEmpty();
});
test('perfil mantém pontuação histórica e vínculo encerrado, e conteúdo seguro',async({page})=>{
 await setup(page);
 await page.route('**/api/jogadores/*',route=>route.fulfill({json:{data:{nome:'Jogador',username:'jogador',bio:'',vitorias:1,pontuacao_ranking:3}}}));
 await page.route('**/api/meu-historico?*',route=>route.fulfill({json:{data:{resultados:[{pontos:3,motivo:'<img src=x onerror=alert(1)>',criado_em:'2026-11-17T12:00:00Z',campeonatos:{nome:'Copa antiga'},partidas:{id_partida:9,time_a:{nome:'Time antigo'},time_b:{nome:'Adversário'},placar_a:2,placar_b:1}}],vinculos:[{status:'inativo',data_entrada:'2026-11-01',data_saida:'2026-11-16',times:{nome:'Time antigo'}}]},hasMore:false}}));
 await page.goto('/perfil.html');await expect(page.locator('#history-results')).toContainText('+3 pontos');
 await expect(page.locator('#history-results')).toContainText('<img src=x onerror=alert(1)>');expect(await page.locator('#history-results img').count()).toBe(0);
 await expect(page.locator('#history-teams')).toContainText('Encerrado');await expect(page.locator('#history-teams')).toContainText('16/11/2026');
});
test('recuperação envia retorno para esta origem e permite definir nova senha',async({page})=>{
 await setup(page,false);
 await page.route('**/supabase-config.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+';window.RIVALS_SUPABASE_CONFIG.enablePasswordRecovery=true;'});});
 await page.goto('/recuperar-senha.html');
 await page.getByLabel('E-mail').fill('qa@example.test');await page.getByRole('button',{name:'Enviar link'}).click();
 await expect(page.locator('[data-auth-message]')).toContainText('Se este e-mail estiver cadastrado');
 expect(await page.evaluate(()=>window.qaRecovery.redirectTo)).toBe('http://127.0.0.1:3417/redefinir-senha.html');
 await page.evaluate(user=>localStorage.setItem('qa-session',JSON.stringify(user)),user);
 await page.goto('/redefinir-senha.html');await expect(page.locator('[data-password-form]')).toBeVisible();
 await page.getByLabel('Nova senha',{exact:true}).fill('NovaSenha#123');await page.getByLabel('Confirmar nova senha').fill('Diferente#123');
 await page.getByRole('button',{name:'Salvar nova senha'}).click();await expect(page.locator('[data-auth-message]')).toContainText('As senhas precisam ser iguais.');
 expect(await page.evaluate(()=>window.qaPasswordUpdated)).toBeUndefined();
 await page.getByLabel('Confirmar nova senha').fill('NovaSenha#123');await page.getByRole('button',{name:'Salvar nova senha'}).click();
 await expect(page.locator('[data-auth-message]')).toContainText('Senha atualizada');expect(await page.evaluate(()=>window.qaPasswordUpdated)).toBe(true);
 await expect(page.locator('[data-password-form]')).toBeHidden();
});
test('recuperação sem sessão mostra link inválido e não oferece troca de senha',async({page})=>{
 await setup(page,false);await page.goto('/redefinir-senha.html#error=access_denied&error_code=otp_expired');
 await expect(page.locator('[data-auth-message]')).toContainText('O link é inválido ou expirou');await expect(page.locator('[data-password-form]')).toBeHidden();
});
test('falha de rede no login libera nova tentativa',async({page})=>{
 await setup(page,false);await page.goto('/login.html');
 await page.evaluate(()=>window.rivalsAuth.client.auth.signInWithPassword=async()=>{throw Error('rede');});
 await page.getByLabel('E-mail').fill('qa@example.test');await page.getByLabel('Senha',{exact:true}).fill('TesteSenha#123');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.locator('[data-auth-message]')).toContainText('Verifique sua conexão');
 await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeEnabled();
});
test('API recusa sessão: login preserva destino e não entra em ciclo',async({page})=>{
 await setup(page);await page.route('**/api/jogadores/*',route=>route.fulfill({status:401,json:{error:'Sessão inválida ou expirada.'}}));
 await page.goto('/perfil.html?aba=historico#history-title');await expect(page).toHaveURL(/login.html\?sessao=expirada/);
 await expect(page.locator('[data-auth-message]')).toContainText('Sua sessão expirou');
 expect(new URL(page.url()).searchParams.get('redirect')).toBe('perfil.html?aba=historico#history-title');
});
test('campeonatos lê painel e cria/edita/cancela pela API sem cliente de banco',async({page})=>{
 await setup(page);page.on('dialog',dialog=>dialog.accept());const writes=[];
 let cup={id_campeonato:3,id_criador:user.id,nome:'Copa API',jogo:'Valorant',formato:'eliminatoria',status:'aberto',data_inicio:'2099-01-01',data_fim:'2099-12-31',max_times:2,taxa_inscricao:0,premio:0};
 await page.route('**/api/**',route=>{const req=route.request(),u=new URL(req.url());let data=[];
  if(req.method()==='PATCH'){const body=req.postDataJSON();writes.push({path:u.pathname,body});cup={...cup,...body};data=cup;}
  else if(u.pathname==='/api/campeonatos/3/painel')data={championship:cup,matches:[],teams:[],classification:[]};
  else if(u.pathname==='/api/campeonatos')data=[cup];
  return route.fulfill({json:{data}});
 });
 await page.goto('/campeonatos.html?campeonato=3');await expect(page.locator('#matches-message')).toContainText('Nenhum confronto gerado');
 await page.locator('[data-edit-championship="3"]').click();await page.locator('#championship-form [name="nome"]').fill('Copa editada');
 await page.locator('#championship-form button[type="submit"]').click();await expect(page.locator('#championship-message')).toHaveText('Alterações salvas.');
 await page.locator('[data-cancel-championship="3"]').click();await expect(page.locator('#championship-list')).toContainText('cancelado');
 expect(writes.map(w=>w.path)).toEqual(['/api/campeonatos/3','/api/campeonatos/3']);expect(writes[0].body.id_criador).toBeUndefined();expect(writes[1].body).toEqual({status:'cancelado'});
});
test('consulta recusada durante logout não altera o destino para sessão expirada',async({page})=>{
 await setup(page);let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/jogadores/*',async route=>{await gate;await route.fulfill({status:401,json:{error:'Sessão inválida.'}}).catch(()=>{});});
 const started=page.waitForRequest('**/api/jogadores/*');await page.goto('/perfil.html');await started;
 await page.evaluate(()=>{window.rivalsAuth.client.auth.signOut=async()=>{localStorage.removeItem('qa-session');await new Promise(resolve=>window.releaseQaLogout=resolve);return {error:null};};});
 const refused=page.waitForResponse('**/api/jogadores/*');
 try{
  await page.getByRole('button',{name:'Sair',exact:true}).click();release();await refused;
  await expect(page).toHaveURL(/perfil.html$/);
  await page.evaluate(()=>window.releaseQaLogout());await expect(page).toHaveURL(/login.html$/);
  await expect(page.locator('[data-auth-message]')).toBeHidden();
 }finally{release();}
});
test('recuperação adiada mantém espaço no login e não envia e-mail',async({page})=>{
 await setup(page,false);await page.goto('/login.html');
 await expect(page.locator('[data-recovery-link]')).toBeHidden();
 expect(await page.locator('[data-recovery-link]').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(0);
 await page.goto('/recuperar-senha.html');await expect(page.locator('[data-auth-message]')).toContainText('indisponível no momento');
 await expect(page.locator('[data-recovery-form]')).toBeHidden();expect(await page.evaluate(()=>window.qaRecovery)).toBeUndefined();
});

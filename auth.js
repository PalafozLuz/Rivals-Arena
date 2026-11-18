(function () {
  const config = window.RIVALS_SUPABASE_CONFIG || {};
  const hasConfig = Boolean(config.url && config.anonKey);
  const internalPages = new Set(['homepage.html', 'perfil.html', 'campeonatos.html', 'comunidade.html', 'partidas.html', 'times.html']);
  const client = hasConfig && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

  window.rivalsAuth = {
    client,
    isConfigured: hasConfig,
    async request(path, {method = 'GET', body, envelope = false} = {}) {
      const target = new URL(path, location.origin);
      if (target.origin !== location.origin || !target.pathname.startsWith('/api/')) throw Error('Destino da requisição inválido.');
      if (!client) throw Error('Não foi possível conectar. Recarregue a página.');
      const {data, error} = await client.auth.getSession();
      if (error || !data.session) { redirectToLogin(); throw Error('Sua sessão expirou. Entre novamente.'); }
      let response, result;
      try {
        response = await fetch(target.pathname + target.search, {
          method, headers: {Authorization:'Bearer ' + data.session.access_token,'Content-Type':'application/json'},
          body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(20000)
        });
        result = await response.json();
      } catch { throw Error('Não foi possível conectar. Verifique sua conexão e tente novamente.'); }
      if (response.status === 401) {
        try { await client.auth.signOut({scope:'local'}); } catch { /* O login seguinte substitui a sessão inválida. */ }
        redirectToLogin(true);
      }
      if (!response.ok) throw Error(result.error || 'Não foi possível concluir a operação.');
      return envelope ? result : result.data;
    },
    async signOut() {
      try {
        const {error} = client ? await client.auth.signOut() : {};
        if(error)throw error;
        window.location.href = 'login.html';
      } catch { showMessage('Não foi possível sair. Verifique sua conexão e tente novamente.'); }
    }
  };

  const safeDestination = value => {
    try {
      const target=new URL(value || 'homepage.html',location.href);
      return target.origin===location.origin && internalPages.has(target.pathname.slice(1)) ? target.pathname.slice(1)+target.search+target.hash : 'homepage.html';
    } catch { return 'homepage.html'; }
  };
  function redirectToLogin(expired = false) {
    const page=location.pathname.split('/').pop();
    if(internalPages.has(page))location.replace('login.html?'+(expired?'sessao=expirada&':'')+'redirect='+encodeURIComponent(page+location.search+location.hash));
  }
  client?.auth.onAuthStateChange?.(event => {
    if(event==='SIGNED_OUT' && document.body?.dataset.authPage==='protected')redirectToLogin();
  });

  const showMessage = (message, type = 'error') => {
    const target = document.querySelector('[data-auth-message]');
    if (!target) return;
    target.textContent = message;
    target.dataset.type = type;
    target.hidden = false;
  };

  const setLoading = (form, loading) => {
    form.querySelectorAll('button[type="submit"]').forEach((button) => {
      button.disabled = loading;
      button.dataset.originalText ||= button.textContent;
      button.textContent = loading ? 'Aguarde...' : button.dataset.originalText;
    });
  };

  const redirectIfAuthenticated = async () => {
    if (!client || document.body.dataset.authPage !== 'guest') return;
    if(new URLSearchParams(location.search).get('sessao')==='expirada') {showMessage('Sua sessão expirou. Entre novamente.');return;}
    const { data: { session } } = await client.auth.getSession();
    if (session) window.location.href = safeDestination(new URLSearchParams(location.search).get('redirect'));
  };

  const protectPage = async () => {
    if (document.body.dataset.authPage !== 'protected') return;
    if (!client) {
      window.location.replace('login.html');
      return;
    }
    const { data: { session } } = await client.auth.getSession();
    if (!session) redirectToLogin();
  };

  const bindLogin = () => {
    const form = document.querySelector('[data-login-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!client) return showMessage('Não foi possível conectar. Recarregue a página.');
      setLoading(form, true);
      try {
        const { error } = await client.auth.signInWithPassword({ email: form.email.value.trim(), password: form.senha.value });
        if (error) return showMessage(error.message);
        window.location.href = safeDestination(new URLSearchParams(window.location.search).get('redirect'));
      } catch { showMessage('Não foi possível entrar. Verifique sua conexão e tente novamente.'); }
      finally { setLoading(form, false); }
    });
  };

  const bindSignup = () => {
    const form = document.querySelector('[data-signup-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!client) return showMessage('Não foi possível conectar. Recarregue a página.');
      if (form.senha.value !== form.confirmarSenha.value) return showMessage('As senhas precisam ser iguais.');
      setLoading(form, true);
      try {
      const { error } = await client.auth.signUp({
        email: form.email.value.trim(),
        password: form.senha.value,
        options: { data: { nome: form.nome.value.trim(), username: form.username.value.trim() } }
      });
      if (error) return showMessage(error.message);

      showMessage('Cadastro enviado. Se a confirmação por e-mail estiver habilitada, confirme sua conta antes de entrar.', 'success');
      form.reset();
      } catch { showMessage('Não foi possível cadastrar. Verifique sua conexão e tente novamente.'); }
      finally { setLoading(form, false); }
    });
  };

  const bindProfile = async () => {
    const form = document.querySelector('[data-profile-form]');
    if (!form || !client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const profileRequest = async (method = 'GET', body) => {
      return window.rivalsAuth.request(`/api/jogadores/${user.id}`,{method,body});
    };
    let profile;
    try { profile = await profileRequest(); }
    catch (error) { showMessage(error.message); return; }
    if (profile) {
      form.nome.value = profile.nome || '';
      form.username.value = profile.username || '';
      form.bio.value = profile.bio || '';
      form.avatar_url.value = profile.avatar_url || '';
      const renderDetails = (data) => {
        document.querySelector('[data-profile-bio]').textContent = data.bio || 'Adicione uma bio ao seu perfil.';
        document.querySelector('[data-profile-wins]').textContent = data.vitorias || 0;
        document.querySelector('[data-profile-ranking]').textContent = data.pontuacao_ranking || 0;
        const avatar = document.querySelector('[data-profile-avatar]');
        avatar.src = /^https?:\/\//i.test(data.avatar_url || '') ? data.avatar_url : 'imagens/logo-menu.png';
      };
      renderDetails(profile);
      form.renderDetails = renderDetails;
      document.querySelector('[data-profile-name]')?.replaceChildren(document.createTextNode(profile.nome || profile.username));
      document.querySelector('[data-profile-username]')?.replaceChildren(document.createTextNode('@' + (profile.username || '')));
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setLoading(form, true);
      let updatedProfile;
      try {
        updatedProfile = await profileRequest('PATCH', {
          nome: form.nome.value.trim(),
          username: form.username.value.trim(),
          bio: form.bio.value.trim(),
          avatar_url: form.avatar_url.value.trim()
        });
      } catch (error) { showMessage(error.message); return; }
      finally { setLoading(form, false); }
      form.renderDetails(updatedProfile);
      showMessage('Perfil atualizado.', 'success');
      document.querySelector('[data-profile-name]')?.replaceChildren(document.createTextNode(updatedProfile.nome));
      document.querySelector('[data-profile-username]')?.replaceChildren(document.createTextNode('@' + updatedProfile.username));
    });
  };

  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', () => window.rivalsAuth.signOut()));
    bindLogin();
    bindSignup();
    bindRecovery();
    try {
    await redirectIfAuthenticated();
    await protectPage();
    await bindProfile();
    } catch { showMessage('Não foi possível verificar sua sessão. Recarregue a página.'); }
  });

  function bindRecovery() {
    const requestForm=document.querySelector('[data-recovery-form]');
    if(requestForm)requestForm.addEventListener('submit',async event=>{
      event.preventDefault();if(!client)return showMessage('Não foi possível conectar. Recarregue a página.');
      setLoading(requestForm,true);
      try {
        const {error}=await client.auth.resetPasswordForEmail(requestForm.email.value.trim(),{redirectTo:new URL('redefinir-senha.html',location.origin).href});
        if(error)throw error;
        showMessage('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Confira também o spam.','success');
        requestForm.reset();
      } catch { showMessage('Não foi possível enviar o link. Aguarde um pouco e tente novamente.'); }
      finally { setLoading(requestForm,false); }
    });
    const updateForm=document.querySelector('[data-password-form]');
    if(!updateForm)return;
    const check=async()=>{
      try {
        if(!client)throw Error();
        if(new URLSearchParams(location.hash.slice(1)).has('error'))throw Error();
        const {data,error}=await client.auth.getUser();
        if(error||!data.user)throw Error();
        updateForm.hidden=false;
        showMessage('Escolha sua nova senha.','success');
      } catch { updateForm.hidden=true;showMessage('O link é inválido ou expirou. Solicite um novo link de recuperação.'); }
    };check();
    updateForm.addEventListener('submit',async event=>{
      event.preventDefault();
      if(updateForm.senha.value!==updateForm.confirmarSenha.value)return showMessage('As senhas precisam ser iguais.');
      setLoading(updateForm,true);
      try {
        const {error}=await client.auth.updateUser({password:updateForm.senha.value});
        if(error)throw error;
        updateForm.reset();updateForm.hidden=true;
        showMessage('Senha atualizada. Entre com sua nova senha.','success');
        const {error:logoutError}=await client.auth.signOut();
        if(logoutError)showMessage('Senha atualizada. Não foi possível encerrar a sessão; use Sair no perfil.','success');
      } catch { showMessage('Não foi possível atualizar a senha. Confira o link e os requisitos da senha.'); }
      finally { setLoading(updateForm,false); }
    });
  }
}());

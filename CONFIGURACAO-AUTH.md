# Configuração e verificação da autenticação

O cadastro, login e redefinição de senha usam Supabase Auth. A API Express valida
a identidade no Supabase e encaminha o token do jogador, preservando as políticas
RLS. O navegador não recebe chave administrativa.

## Recuperação por e-mail

No [painel de URLs do projeto](https://supabase.com/dashboard/project/xxtbvkcnvrjwzhhsuyok/auth/url-configuration),
adicione à lista **Redirect URLs** os endereços usados:

- Local: `http://localhost:3000/redefinir-senha.html`.
- Se usar o endereço IP local: `http://127.0.0.1:3000/redefinir-senha.html`.
- Produção: a URL real do site, terminando em `/redefinir-senha.html`.

Preserve as entradas existentes. Na implantação, ajuste **Site URL** para o domínio
público definitivo. Não use a porta dos testes automatizados como URL de produção.
Essa configuração não foi alterada pela integração: ela não oferece acesso às
configurações do Auth. Sem autorizar o retorno, o Supabase pode usar o Site URL
em vez da página de redefinição esperada.

Confira os limites de envio e o provedor de e-mail no painel do Auth. Se houver
template personalizado, ele precisa usar o link de confirmação fornecido pelo
Supabase; não deve apontar diretamente para o formulário sem validar o token.

## Conferência com o próprio e-mail

1. Execute `npm start` e abra o site pelo mesmo endereço autorizado acima.
2. No login, clique em **Esqueci minha senha** e informe o e-mail da sua conta.
3. Abra o link recebido uma única vez e confira se chega a `redefinir-senha.html`.
4. Digite e confirme a nova senha. O formulário exige no mínimo oito caracteres;
   regras adicionais configuradas no Auth também continuam valendo.
5. Após a mensagem de sucesso, volte ao login e entre com a nova senha.
6. Confira um link expirado: o formulário deve ficar oculto e oferecer a
   solicitação de outro link. Não compartilhe tokens ou links de recuperação.

## Verificação automatizada

- Solicitação com retorno na mesma origem, sem envio real de e-mail.
- Senhas diferentes, link sem sessão e erro de link.
- Atualização real da senha da própria conta QA e novo login com ela.
- Sessão recusada pela API redireciona ao login sem ciclo de redirecionamentos.
- Falha de conexão libera o botão para tentar novamente.
- Destino após login restrito às páginas internas, preservando busca e fragmento.

O recebimento do e-mail e a abertura do link em produção ainda precisam da
configuração e da conferência acima. Não foram enviados e-mails de recuperação
para usuários durante os testes.

Referências oficiais: [recuperação de senha](https://supabase.com/docs/guides/auth/passwords#resetting-a-password)
e [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

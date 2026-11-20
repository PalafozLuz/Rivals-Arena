-- Não renomeia usuários existentes. Rejeita colisões, inclusive de maiúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS jogadores_username_lower_key
ON public.jogadores (lower(username));

-- Consulta pública somente booleana, com as permissões e RLS do chamador.
CREATE OR REPLACE FUNCTION public.username_disponivel(p_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE(
    btrim(p_username) ~ '^[A-Za-z0-9_]{3,50}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.jogadores
      WHERE lower(username) = lower(btrim(p_username))
    ), false
  );
$$;
REVOKE ALL ON FUNCTION public.username_disponivel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.username_disponivel(text) TO anon, authenticated;

-- O trigger continua restrito à criação de perfil pelo Auth.
-- A restrição UNIQUE é a garantia final em cadastros concorrentes.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  novo_username text;
BEGIN
  novo_username := lower(COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'username'), ''),
    'jogador_' || replace(NEW.id::text, '-', '')
  ));
  IF novo_username !~ '^[a-z0-9_]{3,50}$' THEN
    RAISE EXCEPTION 'Nome de usuário inválido.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.jogadores (id_jogador, nome, username)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'nome'), ''), novo_username),
    novo_username
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';

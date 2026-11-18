-- Após 001 e 002. Preserva contratos como histórico; saída não exclui registros.
BEGIN;
CREATE OR REPLACE FUNCTION public.gerenciar_membro(
    p_time BIGINT, p_acao TEXT, p_username TEXT DEFAULT NULL, p_jogador UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE equipe public.times%ROWTYPE; ator UUID := auth.uid(); alvo UUID; contrato BIGINT;
BEGIN
    IF ator IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
    IF p_acao NOT IN ('convidar','aceitar','recusar','sair','remover','transferir') OR p_acao IS NULL THEN
        RAISE EXCEPTION 'Ação inválida';
    END IF;
    -- Serializa mudanças de elenco com geração/resultados dos campeonatos.
    PERFORM c.id_campeonato FROM public.campeonatos c JOIN public.inscricoes i USING(id_campeonato)
      WHERE i.id_time=p_time AND i.status='aprovada' ORDER BY c.id_campeonato FOR UPDATE OF c;
    SELECT * INTO equipe FROM public.times WHERE id_time=p_time FOR UPDATE;
    IF NOT FOUND OR equipe.status <> 'ativo' THEN RAISE EXCEPTION 'Time inexistente ou inativo'; END IF;
    IF p_acao IN ('convidar','remover','transferir') AND equipe.id_capitao <> ator THEN
        RAISE EXCEPTION 'Somente o capitão pode executar esta ação';
    END IF;
    IF p_acao IN ('aceitar','sair','remover','transferir') AND EXISTS (
        SELECT 1 FROM public.campeonatos c JOIN public.inscricoes i USING(id_campeonato)
        WHERE i.id_time=p_time AND i.status='aprovada' AND c.status='em_andamento'
    ) THEN RAISE EXCEPTION 'Elenco bloqueado durante campeonato em andamento'; END IF;
    IF p_acao = 'convidar' THEN
        SELECT id_jogador INTO alvo FROM public.jogadores WHERE username=trim(p_username);
        IF NOT FOUND THEN RAISE EXCEPTION 'Jogador não encontrado. Informe o nome de usuário exato'; END IF;
    ELSIF p_acao IN ('aceitar','recusar','sair') THEN alvo := ator;
    ELSE alvo := p_jogador;
    END IF;
    IF alvo IS NULL THEN RAISE EXCEPTION 'Jogador inválido'; END IF;
    PERFORM id_jogador FROM public.jogadores WHERE id_jogador=alvo FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente'; END IF;
    IF p_acao = 'convidar' THEN
        IF EXISTS (SELECT 1 FROM public.contratos WHERE id_jogador=alvo AND status='ativo') THEN
            RAISE EXCEPTION 'Jogador já participa de um time';
        END IF;
        IF EXISTS (SELECT 1 FROM public.contratos WHERE id_jogador=alvo AND id_time=p_time AND status='pendente') THEN
            RAISE EXCEPTION 'Já existe convite pendente para este jogador';
        END IF;
        INSERT INTO public.contratos(id_time,id_jogador,status) VALUES(p_time,alvo,'pendente');
    ELSIF p_acao IN ('aceitar','recusar') THEN
        SELECT id_contrato INTO contrato FROM public.contratos
          WHERE id_time=p_time AND id_jogador=ator AND status='pendente' ORDER BY id_contrato LIMIT 1 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Convite pendente não encontrado'; END IF;
        IF p_acao = 'aceitar' THEN
            IF EXISTS (SELECT 1 FROM public.contratos WHERE id_jogador=ator AND status='ativo') THEN
                RAISE EXCEPTION 'Saia do seu time atual antes de aceitar outro convite';
            END IF;
            UPDATE public.contratos SET status='ativo',data_entrada=CURRENT_DATE,data_saida=NULL WHERE id_contrato=contrato;
            -- Outros convites continuam no histórico, mas deixam de ficar pendentes.
            UPDATE public.contratos SET status='inativo',data_saida=greatest(CURRENT_DATE,data_entrada)
              WHERE id_jogador=ator AND status='pendente';
        ELSE
            UPDATE public.contratos SET status='inativo',data_saida=greatest(CURRENT_DATE,data_entrada)
              WHERE id_time=p_time AND id_jogador=ator AND status='pendente';
        END IF;
    ELSIF p_acao = 'transferir' THEN
        IF alvo=ator OR NOT EXISTS (SELECT 1 FROM public.contratos WHERE id_time=p_time AND id_jogador=alvo AND status='ativo') THEN
            RAISE EXCEPTION 'Escolha outro membro ativo para ser capitão';
        END IF;
        UPDATE public.times SET id_capitao=alvo WHERE id_time=p_time;
    ELSE
        IF alvo=equipe.id_capitao THEN RAISE EXCEPTION 'Transfira a capitania ou desative o time antes de sair'; END IF;
        UPDATE public.contratos SET status='inativo',data_saida=greatest(CURRENT_DATE,data_entrada)
          WHERE id_time=p_time AND id_jogador=alvo AND status IN ('ativo','pendente');
        IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado'; END IF;
    END IF;
    RETURN jsonb_build_object('sucesso',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.meus_times()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ator UUID := auth.uid(); equipes JSONB; convites JSONB;
BEGIN
    IF ator IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
    SELECT coalesce(jsonb_agg(info ORDER BY info->>'nome'),'[]'::jsonb) INTO equipes FROM (
        SELECT jsonb_build_object('id_time',t.id_time,'nome',t.nome,'status',t.status,'id_capitao',t.id_capitao,
          'bloqueado',EXISTS(SELECT 1 FROM public.inscricoes i JOIN public.campeonatos c USING(id_campeonato)
              WHERE i.id_time=t.id_time AND i.status='aprovada' AND c.status='em_andamento'),
          'membros',coalesce((SELECT jsonb_agg(jsonb_build_object('id_jogador',j.id_jogador,
             'username',j.username,'nome',j.nome,'status',v.status) ORDER BY j.username)
           FROM public.contratos v JOIN public.jogadores j USING(id_jogador)
           WHERE v.id_time=t.id_time AND (v.status='ativo' OR (t.id_capitao=ator AND v.status='pendente'))),'[]'::jsonb)) AS info
        FROM public.times t WHERE t.status='ativo' AND (t.id_capitao=ator OR EXISTS (
          SELECT 1 FROM public.contratos v WHERE v.id_time=t.id_time AND v.id_jogador=ator AND v.status='ativo'))
    ) consulta;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id_time',t.id_time,'nome',t.nome)),'[]'::jsonb)
      INTO convites FROM public.contratos v JOIN public.times t USING(id_time)
      WHERE v.id_jogador=ator AND v.status='pendente' AND t.status='ativo';
    RETURN jsonb_build_object('times',equipes,'convites',convites);
END;
$$;

CREATE OR REPLACE FUNCTION public.desativar_elenco()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.status='inativo' AND OLD.status <> 'inativo' THEN
        PERFORM c.id_campeonato FROM public.campeonatos c JOIN public.inscricoes i USING(id_campeonato)
          WHERE i.id_time=NEW.id_time AND i.status='aprovada' ORDER BY c.id_campeonato FOR UPDATE OF c;
        IF EXISTS (SELECT 1 FROM public.inscricoes i JOIN public.campeonatos c USING(id_campeonato)
          WHERE i.id_time=NEW.id_time AND i.status='aprovada' AND c.status='em_andamento') THEN
            RAISE EXCEPTION 'Time em campeonato em andamento não pode ser desativado';
        END IF;
        UPDATE public.contratos SET status='inativo',data_saida=greatest(CURRENT_DATE,data_entrada)
          WHERE id_time=NEW.id_time AND status IN ('ativo','pendente');
        UPDATE public.inscricoes i SET status='cancelada' FROM public.campeonatos c
          WHERE i.id_campeonato=c.id_campeonato AND i.id_time=NEW.id_time
          AND i.status IN ('pendente','aprovada') AND c.status IN ('rascunho','aberto');
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS desativar_elenco ON public.times;
CREATE TRIGGER desativar_elenco BEFORE UPDATE ON public.times FOR EACH ROW EXECUTE FUNCTION public.desativar_elenco();
-- Somente RPCs podem alterar vínculos; evita inclusão sem consentimento.
REVOKE INSERT,UPDATE,DELETE ON public.contratos FROM authenticated;
REVOKE INSERT(id_jogador,id_time,data_entrada,data_saida,status), UPDATE(data_saida,status) ON public.contratos FROM authenticated;
REVOKE DELETE ON public.times FROM authenticated;
REVOKE ALL ON FUNCTION public.gerenciar_membro(BIGINT,TEXT,TEXT,UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.meus_times() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.desativar_elenco() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gerenciar_membro(BIGINT,TEXT,TEXT,UUID),public.meus_times() TO authenticated;
COMMIT;

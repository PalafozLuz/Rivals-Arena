-- 001: permissões e integridade competitiva. Executar após schema.sql.
-- Não apaga tabelas nem recalcula resultados históricos.
BEGIN;
ALTER TABLE public.times ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'inativo'));
GRANT INSERT (status), UPDATE (status) ON public.times TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_inscricao_campeonato()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    campeonato public.campeonatos%ROWTYPE;
    capitao UUID;
    quantidade INTEGER;
    ator UUID := auth.uid();
BEGIN
    IF TG_OP = 'UPDATE' AND
       (NEW.id_time, NEW.id_campeonato, NEW.data_inscricao) IS DISTINCT FROM
       (OLD.id_time, OLD.id_campeonato, OLD.data_inscricao) THEN
        RAISE EXCEPTION 'Não é permitido transferir uma inscrição';
    END IF;
    SELECT * INTO campeonato FROM public.campeonatos
      WHERE id_campeonato = NEW.id_campeonato FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campeonato inexistente'; END IF;
    SELECT id_capitao INTO capitao FROM public.times
      WHERE id_time = NEW.id_time AND status = 'ativo';
    IF NOT FOUND THEN RAISE EXCEPTION 'Time inexistente ou inativo'; END IF;
    IF TG_OP = 'INSERT' THEN
        IF ator IS NOT NULL AND (ator <> capitao OR NEW.status <> 'pendente') THEN
            RAISE EXCEPTION 'A inscrição deve ser solicitada pelo capitão e ficar pendente';
        END IF;
    ELSIF ator IS NOT NULL AND ator IS DISTINCT FROM campeonato.id_criador THEN
        IF ator IS DISTINCT FROM capitao OR NEW.status <> 'cancelada' THEN
            RAISE EXCEPTION 'Somente o organizador aprova ou recusa inscrições';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF campeonato.status NOT IN ('rascunho', 'aberto') OR campeonato.data_inicio < CURRENT_DATE THEN
        RAISE EXCEPTION 'O campeonato não está aceitando alterações de inscrição';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'aprovada' AND NEW.status <> 'aprovada' AND EXISTS (
        SELECT 1 FROM public.partidas p WHERE p.id_campeonato = NEW.id_campeonato
          AND NEW.id_time IN (p.id_time_a, p.id_time_b)
    ) THEN RAISE EXCEPTION 'O time já possui confrontos neste campeonato'; END IF;
    IF NEW.status IN ('pendente', 'aprovada') THEN
        SELECT count(*) INTO quantidade FROM public.inscricoes
        WHERE id_campeonato = NEW.id_campeonato AND status IN ('pendente', 'aprovada')
          AND id_inscricao <> NEW.id_inscricao;
        IF quantidade >= campeonato.max_times THEN
            RAISE EXCEPTION 'O campeonato já atingiu o limite de times';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validar_inscricao_antes ON public.inscricoes;
CREATE TRIGGER validar_inscricao_antes BEFORE INSERT OR UPDATE ON public.inscricoes
FOR EACH ROW EXECUTE FUNCTION public.validar_inscricao_campeonato();

DROP POLICY IF EXISTS inscricoes_insert ON public.inscricoes;
CREATE POLICY inscricoes_insert ON public.inscricoes FOR INSERT TO authenticated
WITH CHECK (status = 'pendente' AND EXISTS (
    SELECT 1 FROM public.times t WHERE t.id_time = inscricoes.id_time AND t.id_capitao = auth.uid()
));
DROP POLICY IF EXISTS inscricoes_update ON public.inscricoes;
CREATE POLICY inscricoes_update ON public.inscricoes FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.times t WHERE t.id_time = inscricoes.id_time AND t.id_capitao = auth.uid())
    OR EXISTS (SELECT 1 FROM public.campeonatos c WHERE c.id_campeonato = inscricoes.id_campeonato AND c.id_criador = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.times t WHERE t.id_time = inscricoes.id_time AND t.id_capitao = auth.uid())
    OR EXISTS (SELECT 1 FROM public.campeonatos c WHERE c.id_campeonato = inscricoes.id_campeonato AND c.id_criador = auth.uid()));

CREATE OR REPLACE FUNCTION public.validar_limite_campeonato()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.max_times < (SELECT count(*) FROM public.inscricoes
        WHERE id_campeonato = NEW.id_campeonato AND status IN ('pendente','aprovada')) THEN
        RAISE EXCEPTION 'O limite não pode ser menor que as inscrições reservadas';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validar_limite_campeonato ON public.campeonatos;
CREATE TRIGGER validar_limite_campeonato BEFORE UPDATE ON public.campeonatos
FOR EACH ROW EXECUTE FUNCTION public.validar_limite_campeonato();

CREATE OR REPLACE FUNCTION public.validar_partida_campeonato()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE campeonato public.campeonatos%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.resultado_processado THEN
        IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Resultado finalizado não pode ser alterado'; END IF;
        RETURN NEW;
    END IF;
    IF NEW.resultado_processado THEN RAISE EXCEPTION 'Pontuação só pode ser processada pelo sistema'; END IF;
    IF TG_OP = 'INSERT' AND NEW.status = 'finalizada' THEN
        RAISE EXCEPTION 'Crie a partida agendada antes de finalizar';
    END IF;
    SELECT * INTO campeonato FROM public.campeonatos WHERE id_campeonato = NEW.id_campeonato;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campeonato inexistente'; END IF;
    IF NEW.data_hora IS NOT NULL AND
       ((NEW.data_hora AT TIME ZONE 'UTC')::DATE < campeonato.data_inicio OR
        (NEW.data_hora AT TIME ZONE 'UTC')::DATE > campeonato.data_fim) THEN
        RAISE EXCEPTION 'A data da partida deve estar no período do campeonato (UTC)';
    END IF;
    IF NEW.id_time_a IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.inscricoes WHERE id_campeonato = NEW.id_campeonato
        AND id_time = NEW.id_time_a AND status = 'aprovada'
    ) THEN RAISE EXCEPTION 'Time A não aprovado no campeonato'; END IF;
    IF NEW.id_time_b IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.inscricoes WHERE id_campeonato = NEW.id_campeonato
        AND id_time = NEW.id_time_b AND status = 'aprovada'
    ) THEN RAISE EXCEPTION 'Time B não aprovado no campeonato'; END IF;
    IF NEW.status = 'finalizada' THEN
        IF campeonato.status <> 'em_andamento' OR NEW.id_time_a IS NULL OR NEW.id_time_b IS NULL THEN
            RAISE EXCEPTION 'Finalização exige campeonato em andamento e dois times';
        END IF;
        IF campeonato.formato = 'eliminatoria' AND NEW.placar_a = NEW.placar_b THEN
            RAISE EXCEPTION 'Eliminatória exige desempate no placar';
        END IF;
        NEW.vencedor := CASE WHEN NEW.placar_a > NEW.placar_b THEN NEW.id_time_a
            WHEN NEW.placar_b > NEW.placar_a THEN NEW.id_time_b ELSE NULL END;
    ELSE
        NEW.vencedor := NULL;
    END IF;
    RETURN NEW;
END;
$$;
-- Mantém o trigger zz_processar_resultado existente, executado após a validação.
CREATE OR REPLACE FUNCTION public.proteger_resultado_exclusao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF OLD.resultado_processado THEN RAISE EXCEPTION 'Partida pontuada não pode ser excluída'; END IF;
    RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS proteger_resultado_exclusao ON public.partidas;
CREATE TRIGGER proteger_resultado_exclusao BEFORE DELETE ON public.partidas
FOR EACH ROW EXECUTE FUNCTION public.proteger_resultado_exclusao();

REVOKE ALL ON FUNCTION public.validar_inscricao_campeonato() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_limite_campeonato() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_partida_campeonato() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.proteger_resultado_exclusao() FROM PUBLIC, anon, authenticated;
COMMIT;

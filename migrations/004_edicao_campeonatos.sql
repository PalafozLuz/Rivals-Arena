-- Após 001, 002 e 003. Edição estrutural somente antes de gerar confrontos.
BEGIN;
CREATE OR REPLACE FUNCTION public.proteger_edicao_campeonato()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF (NEW.nome,NEW.jogo,NEW.descricao,NEW.formato,NEW.max_times,NEW.data_inicio,NEW.data_fim,NEW.taxa_inscricao,NEW.premio)
       IS DISTINCT FROM
       (OLD.nome,OLD.jogo,OLD.descricao,OLD.formato,OLD.max_times,OLD.data_inicio,OLD.data_fim,OLD.taxa_inscricao,OLD.premio) THEN
        IF OLD.status NOT IN ('rascunho','aberto') OR EXISTS (
            SELECT 1 FROM public.partidas WHERE id_campeonato=OLD.id_campeonato
        ) THEN RAISE EXCEPTION 'Edição permitida somente antes de gerar confrontos'; END IF;
        IF NEW.formato NOT IN ('eliminatoria','pontos_corridos') THEN
            RAISE EXCEPTION 'Escolha eliminatória ou pontos corridos';
        END IF;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF OLD.status IN ('encerrado','cancelado') OR
           (OLD.status='em_andamento' AND NEW.status IN ('rascunho','aberto')) THEN
            RAISE EXCEPTION 'O campeonato não pode ser reaberto';
        END IF;
        IF NEW.status='encerrado' AND (OLD.status <> 'em_andamento' OR NOT EXISTS (
            SELECT 1 FROM public.partidas WHERE id_campeonato=OLD.id_campeonato
        ) OR EXISTS (SELECT 1 FROM public.partidas WHERE id_campeonato=OLD.id_campeonato AND status <> 'finalizada')) THEN
            RAISE EXCEPTION 'Conclua todas as partidas antes de encerrar';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proteger_edicao_campeonato ON public.campeonatos;
CREATE TRIGGER proteger_edicao_campeonato BEFORE UPDATE ON public.campeonatos
FOR EACH ROW EXECUTE FUNCTION public.proteger_edicao_campeonato();
REVOKE ALL ON FUNCTION public.proteger_edicao_campeonato() FROM PUBLIC,anon,authenticated;
-- Função de timestamp não depende de objetos do schema public.
ALTER FUNCTION public.atualizar_atualizado_em() SET search_path = '';
COMMIT;

BEGIN;
ALTER TABLE public.comunidades ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Geral'
 CHECK (categoria IN ('Geral','Brasileiros','Simuladores','RPG','Battle Royale','FPS','Aventura'));
CREATE INDEX IF NOT EXISTS membros_comunidade_jogador_idx ON public.membros_comunidade(id_jogador,id_comunidade);
CREATE INDEX IF NOT EXISTS publicacoes_comunidade_data_idx ON public.publicacoes(id_comunidade,criada_em DESC);
CREATE INDEX IF NOT EXISTS reacoes_jogador_idx ON public.reacoes_publicacao(id_jogador,id_publicacao);
CREATE INDEX IF NOT EXISTS comunidades_categoria_idx ON public.comunidades(categoria);

CREATE OR REPLACE FUNCTION public.adicionar_dono_comunidade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.membros_comunidade(id_comunidade,id_jogador,papel)
 VALUES(NEW.id_comunidade,NEW.id_criador,'dono');
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS adicionar_dono_comunidade ON public.comunidades;
CREATE TRIGGER adicionar_dono_comunidade AFTER INSERT ON public.comunidades
FOR EACH ROW EXECUTE FUNCTION public.adicionar_dono_comunidade();
INSERT INTO public.membros_comunidade(id_comunidade,id_jogador,papel)
 SELECT id_comunidade,id_criador,'dono' FROM public.comunidades
 ON CONFLICT(id_comunidade,id_jogador) DO UPDATE SET papel='dono';
REVOKE ALL ON FUNCTION public.adicionar_dono_comunidade() FROM PUBLIC,anon,authenticated;

DROP POLICY IF EXISTS comunidades_update ON public.comunidades;
CREATE POLICY comunidades_update ON public.comunidades FOR UPDATE TO authenticated
 USING(id_criador=(SELECT auth.uid())) WITH CHECK(id_criador=(SELECT auth.uid()));
GRANT INSERT(categoria), UPDATE(nome,slug,descricao,jogo,imagem_url,categoria) ON public.comunidades TO authenticated;

REVOKE INSERT ON public.membros_comunidade FROM authenticated;
REVOKE INSERT(papel) ON public.membros_comunidade FROM authenticated;
GRANT INSERT(id_comunidade,id_jogador), DELETE ON public.membros_comunidade TO authenticated;
DROP POLICY IF EXISTS membros_insert ON public.membros_comunidade;
CREATE POLICY membros_insert ON public.membros_comunidade FOR INSERT TO authenticated
 WITH CHECK(id_jogador=(SELECT auth.uid()) AND papel='membro');
DROP POLICY IF EXISTS membros_delete ON public.membros_comunidade;
CREATE POLICY membros_delete ON public.membros_comunidade FOR DELETE TO authenticated
 USING(id_jogador=(SELECT auth.uid()) AND NOT EXISTS (
   SELECT 1 FROM public.comunidades c WHERE c.id_comunidade=membros_comunidade.id_comunidade AND c.id_criador=(SELECT auth.uid())
 ));

CREATE OR REPLACE FUNCTION public.timestamp_publicacao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.atualizada_em:=now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS timestamp_publicacao ON public.publicacoes;
CREATE TRIGGER timestamp_publicacao BEFORE UPDATE ON public.publicacoes FOR EACH ROW EXECUTE FUNCTION public.timestamp_publicacao();
REVOKE ALL ON FUNCTION public.timestamp_publicacao() FROM PUBLIC,anon,authenticated;

DROP POLICY IF EXISTS reacoes_insert ON public.reacoes_publicacao;
CREATE POLICY reacoes_insert ON public.reacoes_publicacao FOR INSERT TO authenticated
 WITH CHECK(id_jogador=(SELECT auth.uid()) AND EXISTS(
   SELECT 1 FROM public.publicacoes p JOIN public.membros_comunidade m USING(id_comunidade)
   WHERE p.id_publicacao=reacoes_publicacao.id_publicacao AND m.id_jogador=(SELECT auth.uid())
 ));
DROP POLICY IF EXISTS reacoes_update ON public.reacoes_publicacao;
CREATE POLICY reacoes_update ON public.reacoes_publicacao FOR UPDATE TO authenticated
 USING(id_jogador=(SELECT auth.uid()))
 WITH CHECK(id_jogador=(SELECT auth.uid()) AND EXISTS(
   SELECT 1 FROM public.publicacoes p JOIN public.membros_comunidade m USING(id_comunidade)
   WHERE p.id_publicacao=reacoes_publicacao.id_publicacao AND m.id_jogador=(SELECT auth.uid())
 ));
GRANT UPDATE(tipo) ON public.reacoes_publicacao TO authenticated;
COMMIT;

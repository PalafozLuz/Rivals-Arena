-- Substituição solicitada do Brawl por três campeonatos dos jogos da página inicial.
-- Mantém o organizador original (@maycon), sem criar times, inscrições ou resultados.
-- Só remove Brawl se ainda não existir nenhuma partida ou pontuação.
BEGIN;
DO $championships$
DECLARE
  owner_id uuid;
  old_cup record;
  game record;
BEGIN
  SELECT id_jogador INTO STRICT owner_id FROM public.jogadores WHERE username='maycon';
  FOR old_cup IN
    SELECT id_campeonato,status FROM public.campeonatos
    WHERE id_criador=owner_id AND nome='Brawl' AND jogo='Brawl Stars'
    FOR UPDATE
  LOOP
    IF old_cup.status NOT IN ('rascunho','aberto')
       OR EXISTS(SELECT 1 FROM public.partidas WHERE id_campeonato=old_cup.id_campeonato)
       OR EXISTS(SELECT 1 FROM public.historico_ranking WHERE id_campeonato=old_cup.id_campeonato)
    THEN
      RAISE EXCEPTION 'Brawl já tem atividade competitiva; nenhuma alteração foi aplicada.';
    END IF;
    -- Inscrições desse campeonato são removidas pela FK; os times são preservados.
    DELETE FROM public.campeonatos WHERE id_campeonato=old_cup.id_campeonato;
  END LOOP;
  FOR game IN SELECT * FROM (VALUES
    ('Copa Valorant da Arena','Valorant'),
    ('Copa League of Legends','League of Legends'),
    ('Copa Fortnite da Arena','Fortnite')
  ) AS games(nome,jogo)
  LOOP
    INSERT INTO public.campeonatos
      (nome,jogo,descricao,formato,max_times,taxa_inscricao,premio,id_criador,data_inicio,data_fim,status)
    SELECT game.nome,game.jogo,
      'Campeonato de ' || game.jogo || ' no Rivals Arena. Até oito times, formato eliminatório e inscrição gratuita. Sem premiação em dinheiro.',
      'eliminatoria',8,0,0,owner_id,DATE '2026-11-25',DATE '2026-11-27','aberto'
    WHERE NOT EXISTS(
      SELECT 1 FROM public.campeonatos
      WHERE id_criador=owner_id AND nome=game.nome AND jogo=game.jogo
    );
  END LOOP;
END;
$championships$;
COMMIT;

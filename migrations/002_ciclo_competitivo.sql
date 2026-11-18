-- Executar após 001_integridade_competitiva.sql. Não apaga dados existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.gerar_confrontos(p_campeonato BIGINT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.campeonatos%ROWTYPE; equipes BIGINT[]; lista BIGINT[];
    n INTEGER; r INTEGER; i INTEGER; a BIGINT; b BIGINT; ultimo BIGINT; total INTEGER := 0;
BEGIN
    SELECT * INTO c FROM public.campeonatos WHERE id_campeonato = p_campeonato FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campeonato inexistente'; END IF;
    IF auth.uid() IS NULL OR auth.uid() <> c.id_criador THEN RAISE EXCEPTION 'Somente o organizador pode gerar confrontos'; END IF;
    IF c.status NOT IN ('rascunho','aberto') THEN RAISE EXCEPTION 'Campeonato já iniciado ou encerrado'; END IF;
    IF c.formato NOT IN ('eliminatoria','pontos_corridos') THEN RAISE EXCEPTION 'Formato de grupos ainda não disponível'; END IF;
    IF EXISTS (SELECT 1 FROM public.partidas WHERE id_campeonato = p_campeonato) THEN RAISE EXCEPTION 'Confrontos já gerados'; END IF;
    SELECT array_agg(id_time ORDER BY id_time) INTO equipes FROM public.inscricoes
      WHERE id_campeonato = p_campeonato AND status = 'aprovada';
    n := coalesce(array_length(equipes,1),0);
    IF n < 2 OR n > c.max_times THEN RAISE EXCEPTION 'É necessário ter ao menos dois times aprovados, dentro do limite'; END IF;
    IF c.formato = 'eliminatoria' AND (n & (n - 1)) <> 0 THEN
        RAISE EXCEPTION 'Eliminatória exige 2, 4, 8, 16, 32 ou outra potência de dois times aprovados';
    END IF;
    UPDATE public.campeonatos SET status = 'em_andamento' WHERE id_campeonato = p_campeonato;
    IF c.formato = 'eliminatoria' THEN
        FOR i IN 1..(n / 2) LOOP
            INSERT INTO public.partidas(id_campeonato,rodada,numero_partida,id_time_a,id_time_b)
              VALUES (p_campeonato,1,i,equipes[2*i-1],equipes[2*i]);
            total := total + 1;
        END LOOP;
    ELSE
        lista := equipes;
        IF n % 2 = 1 THEN lista := array_append(lista,NULL::BIGINT); n := n + 1; END IF;
        FOR r IN 1..(n - 1) LOOP
            FOR i IN 1..(n / 2) LOOP
                a := lista[i]; b := lista[n+1-i];
                IF a IS NOT NULL AND b IS NOT NULL THEN
                    INSERT INTO public.partidas(id_campeonato,rodada,numero_partida,id_time_a,id_time_b)
                      VALUES(p_campeonato,r,i,a,b);
                    total := total + 1;
                END IF;
            END LOOP;
            ultimo := lista[n];
            FOR i IN REVERSE n..3 LOOP lista[i] := lista[i-1]; END LOOP;
            lista[2] := ultimo;
        END LOOP;
    END IF;
    RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_resultado(p_partida BIGINT, p_placar_a INTEGER, p_placar_b INTEGER)
RETURNS public.partidas LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE jogo public.partidas%ROWTYPE; c public.campeonatos%ROWTYPE;
    campeonato_id BIGINT; quantidade INTEGER; rodada_final INTEGER := 0; destino INTEGER;
BEGIN
    SELECT id_campeonato INTO campeonato_id FROM public.partidas WHERE id_partida = p_partida;
    IF NOT FOUND THEN RAISE EXCEPTION 'Partida inexistente'; END IF;
    -- Mesma ordem de locks da geração: campeonato, depois partida.
    SELECT * INTO c FROM public.campeonatos WHERE id_campeonato = campeonato_id FOR UPDATE;
    IF auth.uid() IS NULL OR auth.uid() <> c.id_criador THEN RAISE EXCEPTION 'Somente o organizador pode registrar resultados'; END IF;
    SELECT * INTO jogo FROM public.partidas WHERE id_partida = p_partida FOR UPDATE;
    IF p_placar_a IS NULL OR p_placar_b IS NULL OR p_placar_a NOT BETWEEN 0 AND 1000000 OR p_placar_b NOT BETWEEN 0 AND 1000000 THEN
        RAISE EXCEPTION 'Informe placares inteiros entre 0 e 1000000';
    END IF;
    IF jogo.resultado_processado THEN
        IF jogo.placar_a = p_placar_a AND jogo.placar_b = p_placar_b THEN RETURN jogo; END IF;
        RAISE EXCEPTION 'Resultado já registrado e não pode ser alterado';
    END IF;
    IF c.status <> 'em_andamento' OR jogo.status = 'cancelada' OR jogo.id_time_a IS NULL OR jogo.id_time_b IS NULL THEN
        RAISE EXCEPTION 'Partida não está disponível para registrar resultado';
    END IF;
    IF c.formato NOT IN ('eliminatoria','pontos_corridos') THEN RAISE EXCEPTION 'Formato ainda não disponível'; END IF;
    UPDATE public.partidas SET placar_a=p_placar_a, placar_b=p_placar_b, status='finalizada'
      WHERE id_partida=p_partida RETURNING * INTO jogo;
    IF c.formato = 'eliminatoria' THEN
        SELECT count(*) INTO quantidade FROM public.inscricoes WHERE id_campeonato=campeonato_id AND status='aprovada';
        WHILE quantidade > 1 LOOP quantidade := quantidade / 2; rodada_final := rodada_final + 1; END LOOP;
        IF jogo.rodada < rodada_final THEN
            destino := (jogo.numero_partida + 1) / 2;
            IF jogo.numero_partida % 2 = 1 THEN
                INSERT INTO public.partidas(id_campeonato,rodada,numero_partida,id_time_a)
                  VALUES(campeonato_id,jogo.rodada+1,destino,jogo.vencedor)
                ON CONFLICT(id_campeonato,rodada,numero_partida) DO UPDATE SET id_time_a=excluded.id_time_a;
            ELSE
                INSERT INTO public.partidas(id_campeonato,rodada,numero_partida,id_time_b)
                  VALUES(campeonato_id,jogo.rodada+1,destino,jogo.vencedor)
                ON CONFLICT(id_campeonato,rodada,numero_partida) DO UPDATE SET id_time_b=excluded.id_time_b;
            END IF;
        ELSE
            UPDATE public.campeonatos SET status='encerrado' WHERE id_campeonato=campeonato_id;
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.partidas WHERE id_campeonato=campeonato_id AND status <> 'finalizada') THEN
        UPDATE public.campeonatos SET status='encerrado' WHERE id_campeonato=campeonato_id;
    END IF;
    RETURN jogo;
END;
$$;

-- Resultado e geração passam pelas funções transacionais acima.
REVOKE INSERT ON public.partidas FROM authenticated;
REVOKE INSERT (id_campeonato,rodada,numero_partida,id_time_a,id_time_b,data_hora,status) ON public.partidas FROM authenticated;
REVOKE UPDATE ON public.partidas FROM authenticated;
REVOKE UPDATE (placar_a,placar_b,vencedor,status) ON public.partidas FROM authenticated;
REVOKE ALL ON FUNCTION public.gerar_confrontos(BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_resultado(BIGINT,INTEGER,INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_confrontos(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado(BIGINT,INTEGER,INTEGER) TO authenticated;
COMMIT;

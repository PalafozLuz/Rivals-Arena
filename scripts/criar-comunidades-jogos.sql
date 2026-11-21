-- Conteúdo inicial solicitado para o carrossel da página inicial.
-- Usa o perfil existente @palafozluz. Não cria autores, reações ou membros fictícios.
-- Reexecutar não duplica comunidades ou publicações e não altera conteúdos existentes.
BEGIN;
DO $seed$
DECLARE
  owner_id uuid;
  game jsonb;
  community_id bigint;
  community_owner uuid;
  post_text text;
BEGIN
  SELECT id_jogador INTO STRICT owner_id FROM public.jogadores WHERE username = 'palafozluz';
  FOR game IN SELECT value FROM jsonb_array_elements($games$[{"slug":"minecraft","name":"Minecraft","asset":"minecraft","category":"Aventura","posts":["Bem-vindo à comunidade de Minecraft! Use este espaço para compartilhar construções, tirar dúvidas e encontrar companhia para jogar. Respeite os outros jogadores e dê crédito às criações que compartilhar.","Qual vai ser a sua próxima construção? Conte a ideia, o estilo e o modo de jogo. Se já começou, compartilhe uma imagem ou explique o que ainda falta terminar.","Procurando companhia para um mundo novo? Apresente seu objetivo, a versão que usa e os horários em que costuma jogar. Combine os detalhes antes de compartilhar o acesso ao mundo."]},{"slug":"hollow-knight","name":"Hollow Knight","asset":"hollowknight","category":"Aventura","posts":["Bem-vindo à comunidade de Hollow Knight! Este é o espaço para conversar sobre exploração, compartilhar descobertas e trocar ajuda. Avise quando a publicação tiver spoilers.","Em que parte da sua jornada você está? Compartilhe uma conquista ou conte qual desafio está tentando superar. Marque spoilers para quem ainda está explorando.","Precisa de uma dica? Conte o que já tentou e quais recursos tem disponíveis. Quem responder pode começar com uma pista e deixar a solução completa para quem pedir."]},{"slug":"valorant","name":"Valorant","asset":"valorant","category":"FPS","posts":["Bem-vindo à comunidade de Valorant! Encontre jogadores, converse sobre suas partidas e compartilhe aprendizados. Respeite sua equipe e mantenha a conversa amigável.","Qual agente combina com o seu jeito de jogar? Conte o que gosta na escolha e que tipo de função prefere assumir com a equipe.","Procurando um duo ou um time? Diga seus horários, seu objetivo e o modo em que quer jogar. Combinem a comunicação e as expectativas antes da partida."]},{"slug":"mobile-legends","name":"Mobile Legends","asset":"mobilelegends","category":"Geral","posts":["Bem-vindo à comunidade de Mobile Legends! Compartilhe suas experiências, encontre uma equipe e troque ideias sobre o jogo. Dicas e dúvidas são bem-vindas.","Qual herói você mais gosta de jogar? Conte o que funciona para você e em quais situações costuma escolher esse personagem.","Vamos montar uma equipe? Apresente sua função preferida, seus horários e o que espera das partidas. Combine com o grupo se a ideia é aprender, competir ou jogar por diversão."]},{"slug":"league-of-legends","name":"League of Legends","asset":"lol","category":"Geral","posts":["Bem-vindo à comunidade de League of Legends! Um espaço para encontrar companhia, compartilhar partidas e conversar sobre o jogo sem deixar o respeito de lado.","Qual campeão você está aprendendo? Conte sua posição preferida e o que quer melhorar. Compartilhe sugestões levando em conta o objetivo de quem pediu ajuda.","Buscando um duo ou uma equipe? Diga seus horários, sua posição e o tipo de partida que procura. Alinhem as expectativas e mantenham a comunicação durante o jogo."]},{"slug":"fortnite","name":"Fortnite","asset":"fortnite","category":"Battle Royale","posts":["Bem-vindo à comunidade de Fortnite! Encontre companhia para jogar, compartilhe seus momentos e troque ideias com outros jogadores. Respeite o ritmo e o estilo de cada pessoa.","Qual modo de jogo você está curtindo mais? Conte o que torna a experiência divertida para você e compartilhe ideias para a próxima sessão.","Procurando um duo ou um esquadrão? Diga quando costuma jogar, o modo que prefere e se busca partidas competitivas ou uma sessão para se divertir."]},{"slug":"resident-evil","name":"Resident Evil","asset":"residentevil","category":"Aventura","posts":["Bem-vindo à comunidade de Resident Evil! Converse sobre a série, compartilhe conquistas e encontre ajuda. Identifique spoilers no começo da publicação para preservar a experiência de quem ainda está jogando.","Qual jogo da série marcou você? Conte o motivo sem revelar momentos importantes da história, ou avise antes se houver spoilers.","Travou em um trecho e precisa de ajuda? Diga qual jogo está jogando e explique a dificuldade. Quem responder pode começar com uma dica e evitar entregar a solução sem ser solicitado."]}]$games$::jsonb)
  LOOP
    INSERT INTO public.comunidades(nome,slug,jogo,categoria,descricao,imagem_url,id_criador)
    VALUES(game->>'name',game->>'slug',game->>'name',game->>'category',
      'Comunidade de ' || (game->>'name') || ' no Rivals Arena. Compartilhe suas experiências, tire dúvidas e encontre outros jogadores.',
      'https://rivals-arena-beta.vercel.app/imagens/' || (game->>'asset') || '.png',owner_id)
    ON CONFLICT DO NOTHING;
    SELECT id_comunidade,id_criador INTO STRICT community_id,community_owner
    FROM public.comunidades WHERE slug=game->>'slug';
    IF community_owner <> owner_id THEN
      RAISE EXCEPTION 'A comunidade % pertence a outro perfil; nenhum conteúdo foi alterado.',game->>'slug';
    END IF;
    FOR post_text IN SELECT jsonb_array_elements_text(game->'posts') LOOP
      INSERT INTO public.publicacoes(id_comunidade,id_autor,conteudo)
      SELECT community_id,owner_id,post_text
      WHERE NOT EXISTS(SELECT 1 FROM public.publicacoes WHERE id_comunidade=community_id AND conteudo=post_text);
    END LOOP;
  END LOOP;
END;
$seed$;
COMMIT;

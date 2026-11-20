const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('cadastro: username único sem sufixo, sem diferença de caixa e rollback do Auth', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id UUID PRIMARY KEY,raw_user_meta_data JSONB DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`);
    await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
    const migration=fs.readFileSync(path.join(__dirname,'supabase/migrations/20261120220301_username_unico_sem_renomear.sql'),'utf8');
    await db.exec(migration);await db.exec(migration);
    const addUser=(id,username)=>db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)',[id,JSON.stringify({nome:'Jogador QA',username})]);
    const first='00000000-0000-0000-0000-000000000091';
    const second='00000000-0000-0000-0000-000000000092';
    await addUser(first,'JogadorQA');
    assert.equal((await db.query('SELECT username FROM public.jogadores WHERE id_jogador=$1',[first])).rows[0].username,'jogadorqa');
    for(const username of ['jogadorqa','JOGADORQA']) {
      await assert.rejects(addUser(second,username),error=>error.code==='23505');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.users WHERE id=$1',[second])).rows[0].n,0);
    }
    await db.exec('SET ROLE anon');
    for(const username of ['jogadorqa','JOGADORQA'])assert.equal((await db.query('SELECT public.username_disponivel($1) AS available',[username])).rows[0].available,false);
    assert.equal((await db.query("SELECT public.username_disponivel('outro_jogador') AS available")).rows[0].available,true);
    assert.equal((await db.query("SELECT public.username_disponivel('x') AS available")).rows[0].available,false);
    await db.exec('RESET ROLE');
    await addUser(second,'outro_jogador');
    await assert.rejects(db.query("UPDATE public.jogadores SET username='JOGADORQA' WHERE id_jogador=$1",[second]),error=>error.code==='23505');
    const longName='a'.repeat(50);
    await addUser('00000000-0000-0000-0000-000000000093',longName);
    assert.equal((await db.query('SELECT username FROM public.jogadores WHERE username=$1',[longName])).rows[0].username,longName);
    assert.equal((await db.query("SELECT has_function_privilege('anon','public.handle_new_user()','EXECUTE') AS allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});


test('migration: permissões de inscrição, limite, vencedor e pontuação única', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id UUID PRIMARY KEY, raw_user_meta_data JSONB DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS
        'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
    await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    const migration = fs.readFileSync(path.join(__dirname, 'migrations/001_integridade_competitiva.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Pode ser reaplicada sem apagar dados.
    const users = [1, 2, 3, 4].map(i => `00000000-0000-0000-0000-00000000000${i}`);
    for (const user of users) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [user]);
    await db.query('INSERT INTO public.times(nome,id_capitao) VALUES ($1,$2),($3,$4),($5,$6)', ['Time A', users[0], 'Time B', users[1], 'Time C', users[3]]);
    await db.query(`INSERT INTO public.campeonatos(nome,jogo,max_times,id_criador,data_inicio,data_fim,status)
      VALUES ('Copa teste','Valorant',2,$1,'2099-01-01','2099-12-31','aberto')`, [users[2]]);
    const asUser = async user => {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec('SET ROLE authenticated');
    };
    await asUser(users[0]);
    await assert.rejects(db.exec("INSERT INTO public.inscricoes(id_time,id_campeonato,status) VALUES (1,1,'aprovada')"));
    await db.exec('INSERT INTO public.inscricoes(id_time,id_campeonato) VALUES (1,1)');
    await assert.rejects(db.exec("UPDATE public.inscricoes SET status='aprovada' WHERE id_time=1"), /organizador/);
    await asUser(users[1]);
    await db.exec('INSERT INTO public.inscricoes(id_time,id_campeonato) VALUES (2,1)');
    await asUser(users[3]);
    await assert.rejects(db.exec('INSERT INTO public.inscricoes(id_time,id_campeonato) VALUES (3,1)'), /limite/);
    await asUser(users[2]);
    await db.exec("UPDATE public.inscricoes SET status='aprovada' WHERE id_campeonato=1");
    await db.exec("UPDATE public.campeonatos SET status='em_andamento' WHERE id_campeonato=1");
    await db.exec('INSERT INTO public.partidas(id_campeonato,rodada,numero_partida,id_time_a,id_time_b) VALUES (1,1,1,1,2)');
    await assert.rejects(db.exec("UPDATE public.partidas SET status='finalizada' WHERE id_partida=1"), /desempate/);
    // Vencedor enviado incorretamente é recalculado pelo placar.
    await db.exec("UPDATE public.partidas SET status='finalizada',placar_a=2,placar_b=1,vencedor=2 WHERE id_partida=1");
    assert.equal((await db.query('SELECT vencedor FROM public.partidas WHERE id_partida=1')).rows[0].vencedor, 1);
    const before = (await db.query('SELECT pontos,jogos FROM public.classificacao_campeonatos WHERE id_time=1')).rows[0];
    assert.equal(before.pontos, 3);
    assert.equal(before.jogos, 1);
    await db.exec("UPDATE public.partidas SET status='finalizada' WHERE id_partida=1");
    assert.deepEqual((await db.query('SELECT pontos,jogos FROM public.classificacao_campeonatos WHERE id_time=1')).rows[0], before);
    await assert.rejects(db.exec('UPDATE public.partidas SET placar_a=8 WHERE id_partida=1'), /finalizado/);
    await db.exec('RESET ROLE');
    await assert.rejects(db.exec('DELETE FROM public.partidas WHERE id_partida=1'), /pontuada/);
    const ranking = (await db.query('SELECT pontos FROM public.historico_ranking ORDER BY pontos DESC')).rows;
    assert.deepEqual(ranking.map(row => row.pontos), [10, 2]);
    assert.equal((await db.query('SELECT count(*)::integer AS total FROM public.inscricoes')).rows[0].total, 2);
  } finally { await db.close(); }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');

async function fixture(formato, count) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;`);
  for (const file of ['schema.sql', 'migrations/001_integridade_competitiva.sql', 'migrations/002_ciclo_competitivo.sql', 'migrations/004_edicao_campeonatos.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  }
  await db.exec(fs.readFileSync(path.join(__dirname, 'migrations/002_ciclo_competitivo.sql'), 'utf8'));
  const user = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  for (let n = 1; n <= count + 1; n++) await db.query('INSERT INTO auth.users(id) VALUES($1)', [user(n)]);
  for (let n = 1; n <= count; n++) await db.query('INSERT INTO public.times(nome,id_capitao) VALUES($1,$2)', [`Time ${n}`, user(n)]);
  await db.query(`INSERT INTO public.campeonatos(nome,jogo,formato,max_times,id_criador,data_inicio,data_fim,status)
    VALUES('Copa','Valorant',$1,$2,$3,'2099-01-01','2099-12-31','aberto')`, [formato, count, user(count + 1)]);
  for (let n = 1; n <= count; n++) await db.query("INSERT INTO public.inscricoes(id_time,id_campeonato,status) VALUES($1,1,'aprovada')", [n]);
  const login = async n => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user(n)]);
    await db.exec('SET ROLE authenticated');
  };
  await login(count + 1);
  return { db, login };
}

test('eliminatória: resultados autorizados, avanço por rodada, retry e encerramento', async () => {
  const { db, login } = await fixture('eliminatoria', 4);
  try {
    await login(1);
    await assert.rejects(db.exec('SELECT public.gerar_confrontos(1)'), /organizador/);
    await login(5);
    await db.exec('SELECT public.gerar_confrontos(1)');
    await assert.rejects(db.exec('SELECT public.gerar_confrontos(1)'), /iniciado/);
    const matches = (await db.query('SELECT * FROM public.partidas ORDER BY numero_partida')).rows;
    assert.equal(matches.length, 2);
    await assert.rejects(db.query('UPDATE public.partidas SET placar_a=9 WHERE id_partida=$1', [matches[0].id_partida]), /permission denied/);
    await assert.rejects(db.query('SELECT public.registrar_resultado($1,1,1)', [matches[0].id_partida]), /desempate/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.historico_ranking')).rows[0].n, 0);
    await db.query('SELECT public.registrar_resultado($1,2,0)', [matches[0].id_partida]);
    const finalId = (await db.query('SELECT id_partida FROM public.partidas WHERE rodada=2')).rows[0].id_partida;
    await assert.rejects(db.query('SELECT public.registrar_resultado($1,2,0)', [finalId]), /disponível/);
    await db.query('SELECT public.registrar_resultado($1,0,2)', [matches[1].id_partida]);
    const final = (await db.query('SELECT * FROM public.partidas WHERE id_partida=$1', [finalId])).rows[0];
    assert.equal(final.id_time_a, matches[0].id_time_a);
    assert.equal(final.id_time_b, matches[1].id_time_b);
    await login(1);
    await assert.rejects(db.query('SELECT public.registrar_resultado($1,3,0)', [finalId]), /organizador/);
    await login(5);
    await db.query('SELECT public.registrar_resultado($1,3,0)', [finalId]);
    await db.query('SELECT public.registrar_resultado($1,3,0)', [finalId]);
    await assert.rejects(db.query('SELECT public.registrar_resultado($1,0,3)', [finalId]), /já registrado/);
    assert.equal((await db.query('SELECT status FROM public.campeonatos')).rows[0].status, 'encerrado');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.historico_ranking')).rows[0].n, 6);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.partidas')).rows[0].n, 3);
  } finally { await db.close(); }
});

test('pontos corridos ímpar: pares únicos, empate e encerramento somente ao concluir todos', async () => {
  const { db } = await fixture('pontos_corridos', 3);
  try {
    await db.exec('SELECT public.gerar_confrontos(1)');
    const matches = (await db.query('SELECT * FROM public.partidas ORDER BY rodada')).rows;
    assert.equal(matches.length, 3);
    assert.equal(new Set(matches.map(m => [m.id_time_a,m.id_time_b].sort().join('-'))).size, 3);
    for (let i = 0; i < matches.length; i++) {
      await db.query('SELECT public.registrar_resultado($1,1,1)', [matches[i].id_partida]);
      assert.equal((await db.query('SELECT status FROM public.campeonatos')).rows[0].status, i === 2 ? 'encerrado' : 'em_andamento');
    }
    assert.deepEqual((await db.query('SELECT pontos FROM public.classificacao_campeonatos')).rows.map(r => r.pontos), [2,2,2]);
  } finally { await db.close(); }
});

test('eliminatória incompleta não gera chave parcial nem inicia campeonato', async () => {
  const { db } = await fixture('eliminatoria', 3);
  try {
    await assert.rejects(db.exec('SELECT public.gerar_confrontos(1)'), /potência/);
    assert.equal((await db.query('SELECT status FROM public.campeonatos')).rows[0].status, 'aberto');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.partidas')).rows[0].n, 0);
  } finally { await db.close(); }
});
test('edição antes dos confrontos, limite de reservas, cancelamento pelo capitão e bloqueio após início', async () => {
  const { db, login } = await fixture('pontos_corridos', 3);
  try {
    await db.exec('RESET ROLE');
    await db.exec(fs.readFileSync(path.join(__dirname, 'migrations/004_edicao_campeonatos.sql'), 'utf8'));
    await login(4);
    await db.exec("UPDATE public.campeonatos SET nome='Copa revisada',premio=100.50 WHERE id_campeonato=1");
    await assert.rejects(db.exec('UPDATE public.campeonatos SET max_times=2 WHERE id_campeonato=1'), /limite/);
    await assert.rejects(db.exec("UPDATE public.campeonatos SET formato='grupos' WHERE id_campeonato=1"), /Escolha/);
    await login(1);
    await db.exec("UPDATE public.inscricoes SET status='cancelada' WHERE id_time=1");
    await login(2);
    // RLS não permite que outro capitão altere a inscrição cancelada.
    await db.exec("UPDATE public.inscricoes SET status='aprovada' WHERE id_time=1");
    assert.equal((await db.query('SELECT status FROM public.inscricoes WHERE id_time=1')).rows[0].status,'cancelada');
    await login(4);
    await db.exec('SELECT public.gerar_confrontos(1)');
    await assert.rejects(db.exec("UPDATE public.campeonatos SET nome='Alteração tardia'"), /Edição permitida/);
    await assert.rejects(db.exec("UPDATE public.campeonatos SET status='aberto'"), /reaberto/);
    await login(2);
    await assert.rejects(db.exec("UPDATE public.inscricoes SET status='cancelada' WHERE id_time=2"), /alterações/);
    await login(4);
    const id = (await db.query('SELECT id_partida FROM public.partidas')).rows[0].id_partida;
    await db.query('SELECT public.registrar_resultado($1,2,0)',[id]);
    assert.equal((await db.query('SELECT status FROM public.campeonatos')).rows[0].status,'encerrado');
    await assert.rejects(db.exec("UPDATE public.campeonatos SET status='em_andamento'"), /reaberto/);
  } finally { await db.close(); }
});

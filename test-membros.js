const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
test('membros: consentimento, papéis, vínculo único, histórico e bloqueio competitivo', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id UUID PRIMARY KEY,raw_user_meta_data JSONB DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::UUID';
      GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;`);
    for (const file of ['schema.sql', 'migrations/001_integridade_competitiva.sql', 'migrations/002_ciclo_competitivo.sql', 'migrations/003_membros_times.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    }
    await db.exec(fs.readFileSync(path.join(__dirname, 'migrations/003_membros_times.sql'), 'utf8'));
    const user = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
    for (let n=1;n<=5;n++) await db.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)',[user(n),JSON.stringify({username:`jogador${n}`})]);
    await db.query("INSERT INTO public.times(nome,id_capitao) VALUES('Time A',$1),('Time B',$2)",[user(1),user(2)]);
    const login = async n => {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user(n)]);
      await db.exec('SET ROLE authenticated');
    };
    const action = (team, name, username = null, target = null) => db.query('SELECT public.gerenciar_membro($1,$2,$3,$4)',[team,name,username,target]);
    await login(3);
    await assert.rejects(action(1,'convidar','jogador4'),/capitão/);
    await assert.rejects(action(1,'aceitar'),/Convite/);
    await assert.rejects(db.query("INSERT INTO public.contratos(id_time,id_jogador,status) VALUES(1,$1,'ativo')",[user(3)]),/permission denied/);
    await login(1);
    await action(1,'convidar','jogador3');
    await assert.rejects(action(1,'convidar','jogador3'),/pendente/);
    await assert.rejects(action(1,'sair'),/capitania/);
    await login(3);
    let info = (await db.query('SELECT public.meus_times() AS info')).rows[0].info;
    assert.equal(info.convites.length,1); assert.equal(info.times.length,0);
    await action(1,'aceitar');
    await assert.rejects(action(1,'aceitar'),/Convite/);
    await login(2);
    await assert.rejects(action(2,'convidar','jogador3'),/já participa/);
    await action(2,'convidar','jogador4');
    await login(4); await action(2,'recusar');
    await login(1); await action(1,'transferir',null,user(3));
    await assert.rejects(action(1,'convidar','jogador4'),/capitão/);
    await login(3);
    await action(1,'remover',null,user(1));
    assert.equal((await db.query('SELECT status FROM public.contratos WHERE id_time=1 AND id_jogador=$1',[user(1)])).rows[0].status,'inativo');
    await action(1,'convidar','jogador4');
    await login(4); await action(1,'aceitar');
    await login(5);
    await db.exec("INSERT INTO public.campeonatos(nome,jogo,max_times,id_criador,data_inicio,data_fim,status) VALUES('Copa teste','Jogo',2,auth.uid(),'2099-01-01','2099-12-31','aberto')");
    await login(3); await db.exec('INSERT INTO public.inscricoes(id_time,id_campeonato) VALUES(1,1)');
    await login(5); await db.exec("UPDATE public.inscricoes SET status='aprovada'; UPDATE public.campeonatos SET status='em_andamento'");
    await login(4); await assert.rejects(action(1,'sair'),/bloqueado/);
    await login(3);
    await assert.rejects(action(1,'remover',null,user(4)),/bloqueado/);
    await assert.rejects(db.exec("UPDATE public.times SET status='inativo' WHERE id_time=1"),/andamento/);
    await login(5); await db.exec("UPDATE public.campeonatos SET status='aberto'");
    await login(3);
    await db.exec("UPDATE public.times SET status='inativo' WHERE id_time=1");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.contratos WHERE id_time=1 AND status='ativo'")).rows[0].n,0);
    assert.equal((await db.query('SELECT status FROM public.inscricoes WHERE id_time=1')).rows[0].status,'cancelada');
    assert.ok((await db.query('SELECT count(*)::int AS n FROM public.contratos WHERE id_time=1')).rows[0].n>=3);
  } finally { await db.close(); }
});

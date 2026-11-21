const express = require('express');
const fs = require('node:fs');
const vm = require('node:vm');
const { readRoutes } = require('./dados-publicos');

// Compatibilidade com a configuração pública já usada no navegador.
// Nenhuma chave privilegiada é usada: as permissões RLS continuam ativas.
function configuration() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, 'supabase-config.js'), 'utf8'), context, { timeout: 100 });
  const config = context.window.RIVALS_SUPABASE_CONFIG || {};
  return { url: process.env.SUPABASE_URL || config.url, key: process.env.SUPABASE_ANON_KEY || config.anonKey };
}

const resources = {
  jogadores: { id: 'id_jogador', fields: ['nome', 'username', 'avatar_url', 'banner_url', 'bio'], methods: ['GET', 'PATCH'] },
  times: { id: 'id_time', fields: ['nome', 'logo_url', 'status'], owner: 'id_capitao', methods: ['GET', 'POST', 'PATCH'] },
  campeonatos: { id: 'id_campeonato', fields: ['nome', 'jogo', 'descricao', 'formato', 'max_times', 'data_inicio', 'data_fim', 'taxa_inscricao', 'premio', 'status'], owner: 'id_criador', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  classificacao: { id: 'id_campeonato', fields: [], methods: ['GET'], listOnly: true },
  inscricoes: { id: 'id_inscricao', fields: ['id_time', 'id_campeonato', 'status'], methods: ['GET', 'POST', 'PATCH'] },
  partidas: { id: 'id_partida', fields: [], methods: ['GET'] },
  comunidades: { id: 'id_comunidade', fields: ['nome', 'slug', 'descricao', 'jogo', 'imagem_url', 'categoria'], owner: 'id_criador', methods: ['GET', 'POST', 'PATCH'] },
  publicacoes: { id: 'id_publicacao', fields: ['conteudo', 'id_comunidade'], owner: 'id_autor', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
};

function validate(body, config, creating) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) throw Error('Envie um objeto com os dados.');
  if (Object.keys(body).some(key => !config.fields.includes(key))) throw Error('Campo não permitido.');
  for (const [key, value] of Object.entries(body)) {
    if (['taxa_inscricao','premio'].includes(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99999999.99 || Math.abs(value*100-Math.round(value*100)) > 0.00001) throw Error('Valores monetários devem ser positivos, com até duas casas decimais.');
      continue;
    }
    if (key.startsWith('id_') || key === 'max_times') {
      if (!Number.isSafeInteger(value) || value < 1) throw Error(`${key} deve ser um inteiro positivo.`);
    } else if (typeof value !== 'string' || value.length > 10000) throw Error(`${key} inválido.`);
  }
  if ('nome' in body && (body.nome.trim().length < 2 || body.nome.length > 100)) throw Error('Nome deve ter entre 2 e 100 caracteres.');
  if (config.id === 'id_comunidade') {
    if ('slug' in body && !/^[a-z0-9][a-z0-9-]{2,139}$/.test(body.slug)) throw Error('Identificador deve usar 3 a 140 letras minúsculas, números ou hífens.');
    if ('categoria' in body && !['Geral','Brasileiros','Simuladores','RPG','Battle Royale','FPS','Aventura'].includes(body.categoria)) throw Error('Categoria inválida.');
    if ('imagem_url' in body && body.imagem_url && !/^https?:\/\//i.test(body.imagem_url)) throw Error('Use um link HTTP ou HTTPS para a imagem.');
    if ('descricao' in body && body.descricao.length > 2000) throw Error('Descrição deve ter até 2000 caracteres.');
    if (creating && (!body.nome || !body.slug)) throw Error('Informe nome e identificador da comunidade.');
  }
  if (config.id === 'id_publicacao' && 'conteudo' in body && (!body.conteudo.trim() || body.conteudo.length > 5000)) throw Error('Publicação deve ter entre 1 e 5000 caracteres.');
  if (config.id === 'id_publicacao' && creating && (!body.conteudo || !body.id_comunidade)) throw Error('Informe a comunidade e o conteúdo.');
  if ('username' in body && !/^[A-Za-z0-9_]{3,50}$/.test(body.username)) throw Error('Nome de usuário inválido.');
  if ('banner_url' in body && body.banner_url) {
    let banner;
    try { banner = new URL(body.banner_url); } catch { throw Error('Use um link HTTP ou HTTPS válido para o banner.'); }
    if (!['http:','https:'].includes(banner.protocol) || body.banner_url.length > 2048 || /\s/.test(body.banner_url))
      throw Error('Use um link HTTP ou HTTPS de até 2048 caracteres para o banner.');
  }
  if (config.id === 'id_time' && 'status' in body && !['ativo', 'inativo'].includes(body.status)) throw Error('Status do time inválido.');
  if (config.id === 'id_campeonato' && 'status' in body && (creating || body.status !== 'cancelado' || Object.keys(body).length !== 1)) throw Error('Para cancelar, envie somente status cancelado. O início e encerramento são automáticos.');
  for (const field of ['avatar_url','logo_url']) if (field in body && body[field] && !/^https?:\/\//i.test(body[field])) throw Error('Use um link HTTP ou HTTPS para a imagem.');
  if ('max_times' in body && (body.max_times < 2 || body.max_times > 1024)) throw Error('Limite de times inválido.');
  if ('formato' in body && !['eliminatoria', 'pontos_corridos'].includes(body.formato)) throw Error('Escolha eliminatória ou pontos corridos.');
  for (const field of ['data_inicio', 'data_fim']) {
    if (field in body && (!/^\d{4}-\d{2}-\d{2}$/.test(body[field]) || !Number.isFinite(Date.parse(body[field])) || new Date(body[field]).toISOString().slice(0, 10) !== body[field])) throw Error('Data inválida.');
  }
  if (body.data_inicio && body.data_fim && body.data_fim < body.data_inicio) throw Error('Data final anterior à inicial.');
  if (creating && config.id === 'id_campeonato' && !['nome', 'jogo', 'max_times', 'data_inicio', 'data_fim'].every(field => field in body)) throw Error('Preencha os dados obrigatórios do campeonato.');
  return { ...body };
}

function openapi() {
  const paths = {};
  for(const [path,summary] of [['/api/inicio','Resumo da arena: comunidades, campeonatos e confrontos'],['/api/meu-historico','Partidas pontuadas e vínculos do jogador autenticado']]) {
    paths[path]={get:{summary,security:[{bearerAuth:[]}],parameters:[{name:path.endsWith('inicio')?'q':'page',in:'query',schema:{type:path.endsWith('inicio')?'string':'integer'}}],responses:{200:{description:'Dados reais da arena'},401:{description:'Sessão inválida'}}}};
  }
  paths['/api/meus-times'] = { get: { summary: 'Meus times, membros e convites recebidos', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Times e convites' }, 401: { description: 'Sessão inválida' } } } };
  for (const [path, methods, summary] of [
    ['/api/minhas-comunidades',['get'],'Comunidades de que participo'],
    ['/api/comunidades/{id}/membros',['get','post','delete'],'Listar membros, entrar ou sair da comunidade'],
    ['/api/publicacoes/{id}/reacao',['post','delete'],'Curtir ou remover minha reação']
  ]) {
    paths[path] = Object.fromEntries(methods.map(method => [method, { summary, security:[{bearerAuth:[]}],
      ...(path.includes('{id}') ? {parameters:[{name:'id',in:'path',required:true,schema:{type:'integer',minimum:1}}]} : {}),
      responses:{200:{description:'Sucesso'},401:{description:'Sessão inválida'},403:{description:'Sem permissão'}} }]));
  }
  paths['/api/times/{id}/membros'] = { post: {
    summary: 'Convidar, aceitar, recusar, sair, remover ou transferir capitania', security: [{ bearerAuth: [] }],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['acao'], additionalProperties: false, properties: {
      acao: { type: 'string', enum: ['convidar','aceitar','recusar','sair','remover','transferir'] },
      username: { type: 'string', description: 'Nome exato do jogador a convidar' },
      id_jogador: { type: 'string', format: 'uuid', description: 'Membro para remover ou promover' }
    } } } } }, responses: { 200: { description: 'Ação concluída' }, 400: { description: 'Ação ou estado inválido' }, 403: { description: 'Sem permissão' } }
  } };
  for (const [route, summary, properties] of [
    ['/api/campeonatos/{id}/confrontos', 'Gerar confrontos e iniciar campeonato', null],
    ['/api/partidas/{id}/resultado', 'Registrar placar, pontuar e avançar vencedor', { placar_a: { type: 'integer', minimum: 0, maximum: 1000000 }, placar_b: { type: 'integer', minimum: 0, maximum: 1000000 } }]
  ]) {
    const action = { summary, security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }], responses: { 200: { description: 'Operação concluída' }, 400: { description: 'Dados ou estado inválidos' }, 401: { description: 'Sessão inválida' }, 403: { description: 'Operação não autorizada' }, 503: { description: 'Operação indisponível no banco' } } };
    if (properties) action.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['placar_a', 'placar_b'], properties } } } };
    paths[route] = { post: action };
  }
  for (const [name, config] of Object.entries(resources)) {
    for (const method of config.methods) {
      const routes = method === 'GET' ? [`/api/${name}`, `/api/${name}/{id}`] : [`/api/${name}${method === 'POST' ? '' : '/{id}'}`];
      for (const route of routes) {
        if(config.listOnly && route.includes('{id}'))continue;
        const operation = { summary: `${method} ${name}`, security: [{ bearerAuth: [] }], responses: { 200: { description: 'Sucesso' }, 201: { description: 'Registro criado' }, 400: { description: 'Dados inválidos' }, 401: { description: 'Sessão inválida' }, 403: { description: 'Sem permissão' }, 404: { description: 'Registro indisponível' } } };
        if (route.includes('{id}')) operation.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];
        if (['POST', 'PATCH'].includes(method)) operation.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: Object.fromEntries(config.fields.map(field => [field, { type: field.startsWith('id_') || field === 'max_times' ? 'integer' : ['taxa_inscricao','premio'].includes(field) ? 'number' : 'string' }])) } } } };
        (paths[route] ||= {})[method.toLowerCase()] = operation;
      }
    }
  }
  paths['/api/partidas'].get.parameters = [
    {name:'q',in:'query',description:'Busca por time, campeonato ou jogo',schema:{type:'string',maxLength:80}},
    {name:'status',in:'query',schema:{type:'string',enum:['todos','agendada','em_andamento','finalizada','cancelada']}},
    {name:'jogo',in:'query',schema:{type:'string'}},
    {name:'campeonato',in:'query',schema:{type:'integer',minimum:1}},
    {name:'minhas',in:'query',description:'1 filtra os times ativos do jogador autenticado',schema:{type:'string',enum:['0','1']}},
    {name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:1000,default:1}}
  ];
  paths['/api/partidas'].get.responses[200].description='data: até 24 partidas, page e hasMore';
  paths['/api/campeonatos/{id}/painel']={get:{summary:'Campeonato, todas as rodadas, times e classificação',security:[{bearerAuth:[]}],parameters:[{name:'id',in:'path',required:true,schema:{type:'integer',minimum:1}}],responses:{200:{description:'data: championship, matches, teams, classification'},404:{description:'Campeonato indisponível'},401:{description:'Sessão inválida'}}}};
  for(const [resource,filters] of [['campeonatos',['minhas','disponiveis']],['times',['capitao']],['inscricoes',[]],['classificacao',['minhas']]]) {
    paths['/api/'+resource].get.parameters=[{name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:1000,default:1}},...filters.map(name=>({name,in:'query',schema:{type:'string',enum:['0','1']}}))];
    paths['/api/'+resource].get.responses[200].description='data: até 100 registros; filtros de propriedade usam o jogador autenticado';
  }
  paths['/api/campeonatos/{id}'].patch.description='Dados estruturais só antes dos confrontos. Para cancelar, envie exclusivamente {"status":"cancelado"}. Início e encerramento são automáticos.';
  return { openapi: '3.0.3', info: { title: 'Arena Rivals API', version: '0.1.0' }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }, paths };
}

function createApi({ fetchImpl = global.fetch, configProvider = configuration } = {}) {
  const api = express.Router();
  api.get('/health', (req, res) => res.json({ status: 'ok' }));
  api.get('/openapi.json', (req, res) => res.json(openapi()));
  api.get('/docs', (req, res) => res.type('html').send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Arena Rivals API</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:"/api/openapi.json",dom_id:"#swagger-ui"})</script></body></html>'));
  api.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!/^Bearer \S+$/.test(req.headers.authorization || '')) return res.status(401).json({ error: 'Autenticação necessária.' });
    try {
      const config = configProvider();
      if (!config.url || !config.key) return res.status(503).json({ error: 'Configuração do banco indisponível.' });
      req.remote = { url: config.url.replace(/\/$/, ''), headers: { apikey: config.key, Authorization: req.headers.authorization, 'Content-Type': 'application/json', Prefer: 'return=representation' } };
      const response = await fetchImpl(`${req.remote.url}/auth/v1/user`, { headers: req.remote.headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return res.status([400,401,403].includes(response.status)?401:502).json({ error: [400,401,403].includes(response.status)?'Sessão inválida ou expirada.':'Serviço de autenticação indisponível.' });
      req.user = await response.json();
      if(!req.user?.id)return res.status(502).json({error:'Serviço de autenticação indisponível.'});
      next();
    } catch { res.status(502).json({ error: 'Serviço de autenticação indisponível.' }); }
  });
  api.use(readRoutes(fetchImpl));
  async function rpc(req, res, name, body) {
    try {
      const response = await fetchImpl(`${req.remote.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: req.remote.headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) {
        const status = data.code === 'PGRST202' ? 503 : data.code === 'P0001'
          ? (/^Somente o (organizador|capitão)/.test(data.message || '') ? 403 : 400)
          : response.status >= 500 ? 502 : response.status;
        return res.status(status).json({ error: data.code === 'P0001' ? data.message : 'Operação indisponível. Confira a configuração e as permissões do banco.' });
      }
      return res.json({ data });
    } catch { return res.status(502).json({ error: 'Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.' }); }
  }
  api.post('/campeonatos/:id/confrontos', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Campeonato inválido.' });
    return rpc(req, res, 'gerar_confrontos', { p_campeonato: id });
  });
  api.get('/meus-times', (req, res) => rpc(req, res, 'meus_times', {}));
  async function socialRest(req, res, table, query, method = 'GET', body, extraHeaders = {}) {
    try {
      const response = await fetchImpl(`${req.remote.url}/rest/v1/${table}?${query}`, {
        method, headers:{...req.remote.headers,...extraHeaders}, body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(10000)
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status>=500?502:response.status).json({error:'Operação recusada. Confira sua participação e suas permissões.'});
      return res.json({data});
    } catch { return res.status(502).json({error:'Não foi possível acessar a comunidade.'}); }
  }
  api.get('/minhas-comunidades', (req,res) => socialRest(req,res,'membros_comunidade',new URLSearchParams({select:'id_comunidade,papel',id_jogador:`eq.${req.user.id}`,limit:'1000'})));
  api.route('/comunidades/:id/membros').all(async(req,res,next)=>{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Comunidade inválida.'});
    if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Operação indisponível.'});
    if(req.method!=='GET' && req.body && Object.keys(req.body).length)return res.status(400).json({error:'A participação utiliza sua própria sessão.'});
    const query=new URLSearchParams({id_comunidade:`eq.${id}`,select:'id_jogador,papel,jogadores!membros_comunidade_id_jogador_fkey(nome,username)'});
    if(req.method==='GET')query.set('limit','100');
    if(req.method==='DELETE') {
      try {
        const check=await fetchImpl(`${req.remote.url}/rest/v1/comunidades?select=id_criador&id_comunidade=eq.${id}`,{headers:req.remote.headers,signal:AbortSignal.timeout(10000)});
        if(!check.ok)return res.status(502).json({error:'Não foi possível verificar o dono.'});
        if((await check.json())[0]?.id_criador===req.user.id)return res.status(403).json({error:'O criador deve permanecer como dono da comunidade.'});
      }catch{return res.status(502).json({error:'Não foi possível verificar a comunidade.'});}
      query.set('id_jogador',`eq.${req.user.id}`);
    }
    return socialRest(req,res,'membros_comunidade',query,req.method,req.method==='POST'?{id_comunidade:id,id_jogador:req.user.id}:undefined,
      req.method==='POST'?{Prefer:'resolution=ignore-duplicates,return=representation'}:{});
  });
  api.route('/publicacoes/:id/reacao').all((req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Publicação inválida.'});
    if(!['POST','DELETE'].includes(req.method))return res.status(405).json({error:'Operação indisponível.'});
    if(req.body && Object.keys(req.body).some(key=>key!=='tipo'))return res.status(400).json({error:'Reação utiliza sua própria sessão.'});
    const tipo=req.body?.tipo||'curtida';
    if(!['curtida','apoio','risada'].includes(tipo))return res.status(400).json({error:'Reação inválida.'});
    const query=new URLSearchParams({id_publicacao:`eq.${id}`,id_jogador:`eq.${req.user.id}`,select:'tipo'});
    return socialRest(req,res,'reacoes_publicacao',query,req.method,req.method==='POST'?{id_publicacao:id,id_jogador:req.user.id,tipo}:undefined,
      req.method==='POST'?{Prefer:'resolution=ignore-duplicates,return=representation'}:{});
  });
  api.post('/times/:id/membros', (req, res) => {
    const id = Number(req.params.id);
    const body = req.body;
    const actions = ['convidar','aceitar','recusar','sair','remover','transferir'];
    if (!Number.isSafeInteger(id) || id < 1 || !body || Array.isArray(body) || !actions.includes(body.acao) ||
        Object.keys(body).some(key => !['acao','username','id_jogador'].includes(key))) return res.status(400).json({ error: 'Ação de membro inválida.' });
    if (body.acao === 'convidar' && (typeof body.username !== 'string' || !/^[A-Za-z0-9_]{3,50}$/.test(body.username))) return res.status(400).json({ error: 'Informe o nome de usuário exato.' });
    if (['remover','transferir'].includes(body.acao) && (typeof body.id_jogador !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id_jogador))) return res.status(400).json({ error: 'Jogador inválido.' });
    return rpc(req, res, 'gerenciar_membro', { p_time: id, p_acao: body.acao,
      p_username: body.acao === 'convidar' ? body.username : null,
      p_jogador: ['remover','transferir'].includes(body.acao) ? body.id_jogador : null });
  });
  api.post('/partidas/:id/resultado', (req, res) => {
    const id = Number(req.params.id);
    const body = req.body;
    if (!Number.isSafeInteger(id) || id < 1 || !body || Object.keys(body).length !== 2 ||
        !['placar_a', 'placar_b'].every(key => Number.isInteger(body[key]) && body[key] >= 0 && body[key] <= 1000000)) {
      return res.status(400).json({ error: 'Informe os dois placares inteiros entre 0 e 1000000.' });
    }
    return rpc(req, res, 'registrar_resultado', { p_partida: id, p_placar_a: body.placar_a, p_placar_b: body.placar_b });
  });
  async function execute(req, res) {
    const config = resources[req.params.resource];
    if (!config) return res.status(404).json({ error: 'Recurso não encontrado.' });
    if(config.listOnly && req.params.id)return res.status(404).json({error:'Use o painel do campeonato para consultar sua classificação.'});
    if (!config.methods.includes(req.method)) return res.status(405).json({ error: 'Operação indisponível.' });
    if (req.params.id && !/^(?:[1-9]\d*|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    if (req.method === 'PATCH' && req.params.resource === 'jogadores' && req.params.id !== req.user.id) return res.status(403).json({ error: 'Você só pode editar seu perfil.' });
    const query = new URLSearchParams({ select: '*' });
    if (req.params.id) query.set(config.id, `eq.${req.params.id}`);
    else {
      const page = Number(req.query.page || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return res.status(400).json({error:'Página inválida.'});
      query.set('limit', '100'); query.set('offset', String((page - 1) * 100)); query.set('order', `${config.id}.asc`);
    }
    if(req.method==='GET') {
      if(req.params.resource==='campeonatos') {
        query.set('select','*,times_confirmados:inscricoes!inscricoes_id_campeonato_fkey(count),times_pendentes:inscricoes!inscricoes_id_campeonato_fkey(count)');
        query.set('times_confirmados.status','eq.aprovada');
        query.set('times_pendentes.status','eq.pendente');
        query.set('order','criado_em.desc,id_campeonato.desc');
        if(req.query.minhas==='1')query.set('id_criador',`eq.${req.user.id}`);
        if(req.query.disponiveis==='1')query.set('status','in.(rascunho,aberto)');
      }
      if(req.params.resource==='times' && req.query.capitao==='1')query.set('id_capitao',`eq.${req.user.id}`);
      if(req.params.resource==='classificacao') {
        query.set('order','id_campeonato.asc,id_time.asc');
        query.set('select','*,times!classificacao_campeonatos_id_time_fkey(id_time,nome),campeonatos!inner(id_criador,nome)');
        if(req.query.minhas==='1')query.set('campeonatos.id_criador',`eq.${req.user.id}`);
      }
      if(req.params.resource==='inscricoes')query.set('select','*,times!inscricoes_id_time_fkey(nome,id_capitao),campeonatos!inscricoes_id_campeonato_fkey(nome,jogo,status,id_criador)');
    }
    if(req.method==='GET' && ['comunidades','publicacoes'].includes(req.params.resource)) {
      const page=Number(req.query.page||1);
      if(!Number.isSafeInteger(page)||page<1||page>1000)return res.status(400).json({error:'Página inválida.'});
      if(!req.params.id) {query.set('limit','24');query.set('offset',String((page-1)*24));}
      if(req.params.resource==='comunidades') {
        query.set('select','*,membros_comunidade(count)');query.set('order','criada_em.desc');
        if(req.query.slug!==undefined){
          if(typeof req.query.slug!=='string'||!/^[a-z0-9][a-z0-9-]{2,139}$/.test(req.query.slug))return res.status(400).json({error:'Identificador de comunidade inválido.'});
          query.set('slug', 'eq.'+req.query.slug);
        }
        if(req.query.minhas==='1') {
          try {
            const response=await fetchImpl(`${req.remote.url}/rest/v1/membros_comunidade?select=id_comunidade&id_jogador=eq.${req.user.id}&limit=1000`,{headers:req.remote.headers,signal:AbortSignal.timeout(10000)});
            if(!response.ok)return res.status(502).json({error:'Não foi possível carregar suas comunidades.'});
            const ids=(await response.json()).map(row=>Number(row.id_comunidade)).filter(Number.isSafeInteger);
            if(!ids.length)return res.json({data:[]});
            query.set('id_comunidade',`in.(${ids.join(',')})`);
          }catch{return res.status(502).json({error:'Não foi possível carregar suas comunidades.'});}
        }
        if(req.query.q)query.set('nome',`ilike.*${String(req.query.q).slice(0,80).replace(/[%_*\\]/g,'')}*`);
        if(req.query.categoria && req.query.categoria!=='Todos')query.set('categoria',`eq.${String(req.query.categoria).slice(0,40)}`);
      } else {
        query.set('select','*,jogadores!publicacoes_id_autor_fkey(nome,username,avatar_url),reacoes_publicacao!reacoes_publicacao_id_publicacao_fkey(count),minhas_reacoes:reacoes_publicacao!reacoes_publicacao_id_publicacao_fkey(id_jogador)');
        query.set('minhas_reacoes.id_jogador',`eq.${req.user.id}`);query.set('order','criada_em.desc');
        if(req.query.id_comunidade) {
          const id=Number(req.query.id_comunidade);
          if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Comunidade inválida.'});
          query.set('id_comunidade',`eq.${id}`);
        }
      }
    }
    let body;
    if (['POST', 'PATCH'].includes(req.method)) {
      try { body = validate(req.body, config, req.method === 'POST'); }
      catch (error) { return res.status(400).json({ error: error.message }); }
      if(req.method==='PATCH' && req.params.resource==='publicacoes' && Object.keys(body).some(key=>key!=='conteudo'))return res.status(400).json({error:'Somente o conteúdo pode ser editado.'});
      if (req.params.resource === 'inscricoes') {
        if (req.method === 'POST') {
          if ('status' in body || !body.id_time || !body.id_campeonato) return res.status(400).json({ error: 'Envie apenas o time e o campeonato. A inscrição ficará pendente.' });
        } else if (Object.keys(body).length !== 1 || !['aprovada', 'recusada', 'cancelada'].includes(body.status)) {
          return res.status(400).json({ error: 'Informe somente status aprovada, recusada ou cancelada.' });
        }
      }
      if (req.method === 'POST' && config.owner) body[config.owner] = req.user.id;
    }
    try {
      if (req.method === 'PATCH' && req.params.resource === 'inscricoes') {
        const lookup = await fetchImpl(`${req.remote.url}/rest/v1/inscricoes?id_inscricao=eq.${req.params.id}&select=campeonatos(id_criador),times(id_capitao)`, { headers: req.remote.headers, signal: AbortSignal.timeout(10000) });
        if (!lookup.ok) return res.status(502).json({ error: 'Não foi possível verificar o organizador.' });
        const records = await lookup.json();
        const organizer = records[0]?.campeonatos?.id_criador === req.user.id;
        const captain = records[0]?.times?.id_capitao === req.user.id;
        if (!organizer && !(captain && body.status === 'cancelada')) return res.status(403).json({ error: 'Somente o organizador aprova/recusa; o capitão pode cancelar sua inscrição.' });
      }
      const table = req.params.resource === 'classificacao' ? 'classificacao_campeonatos' : req.params.resource;
      const response = await fetchImpl(`${req.remote.url}/rest/v1/${table}?${query}`, { method: req.method, headers: req.remote.headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        return res.status(failure.code === 'P0001' ? 400 : response.status >= 500 ? 502 : response.status)
          .json({ error: failure.code === 'P0001' ? failure.message : 'Operação recusada. Confira os dados e suas permissões.' });
      }
      const data = await response.json();
      if (req.params.id && !data.length) return res.status(404).json({ error: 'Registro não encontrado ou sem permissão.' });
      res.status(req.method === 'POST' ? 201 : 200).json({ data: req.params.id ? data[0] : data });
    } catch { res.status(502).json({ error: 'Banco indisponível.' }); }
  }
  api.route('/:resource').get(execute).post(execute);
  api.route('/:resource/:id').get(execute).patch(execute).delete(execute);
  return api;
}
module.exports = { createApi, validate, resources };

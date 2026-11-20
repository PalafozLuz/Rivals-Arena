const express = require('express');
const path = require('node:path');
const { createApi } = require('./api');
require('dotenv').config({ quiet: true });

const app = express();
const port = Number(process.env.PORT) || 3000;

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/apresentacao.html`);
});

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use('/api', createApi());
const publicFiles = new Set(require('./arquivos-publicos'));
app.get('/index.html', (req, res) => res.redirect('/'));
app.use('/imagens', express.static(path.join(__dirname, 'imagens'), { index: false, dotfiles: 'deny' }));
app.get('/:file', (req, res, next) => {
  if (!publicFiles.has(req.params.file)) return next();
  res.sendFile(path.join(__dirname, req.params.file));
});
app.use((req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
app.use((error, req, res, next) => res.status(error.status === 400 ? 400 : 500)
  .json({ error: error.status === 400 ? 'JSON inválido.' : 'Erro interno.' }));

if (require.main === module) app.listen(port, '127.0.0.1', () => {
  console.log(`ArenaRivals disponível em http://localhost:${port}`);
});
module.exports = app;

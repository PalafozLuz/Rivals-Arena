const fs = require('node:fs');
const path = require('node:path');
const files = require('../arquivos-publicos');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
fs.mkdirSync(output, {recursive:true});
for (const file of files) fs.copyFileSync(path.join(root,file), path.join(output,file));
fs.cpSync(path.join(root,'imagens'), path.join(output,'imagens'), {
  recursive:true,
  filter(source) {
    const info=fs.lstatSync(source);
    if(info.isSymbolicLink())throw Error('Link simbólico não permitido nas imagens.');
    return info.isDirectory() || /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(source);
  }
});
const allowed = new Set([...files,'imagens']);
for (const file of fs.readdirSync(output)) if(!allowed.has(file)) throw Error('Arquivo público inesperado: '+file);
console.log('Pacote Vercel preparado sem modificar HTML, CSS, scripts da interface ou imagens.');

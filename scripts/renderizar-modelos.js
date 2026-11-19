// Exportação de diagramas; não altera banco ou páginas do produto.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'docs','modelagem');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  await page.setContent('<html><head><meta charset="utf-8"></head><body style="margin:24px;background:white"></body></html>');
  await page.evaluate(async()=>{const m=await import('https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs');window.modelMermaid=m.default;window.modelMermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',fontFamily:'Arial',er:{useMaxWidth:false},maxTextSize:100000});});
  const conceptual=fs.readFileSync(path.join(dir,'modelo-conceitual.md'),'utf8').split('```mermaid')[1].split('```')[0].trim();
  const models=[['modelo-conceitual',conceptual],['modelo-logico',fs.readFileSync(path.join(dir,'modelo-logico.mmd'),'utf8')]];
  for(const [name,source] of models){
   const result=await page.evaluate(async source=>{await window.modelMermaid.parse(source);return (await window.modelMermaid.render('modelo',source)).svg;},source);
   fs.writeFileSync(path.join(dir,name+'.svg'),result);
   await page.setContent('<html><head><meta charset="utf-8"></head><body style="margin:24px;background:white">'+result+'</body></html>');
   await page.addStyleTag({content:'svg{width:1500px;height:auto;display:block}'});
   const scratch=path.join(root,'test-results','documentacao');fs.mkdirSync(scratch,{recursive:true});
   await page.locator('svg').screenshot({path:path.join(scratch,name+'.png')});
   // Recria o módulo depois de setContent, que substitui o documento visualizado.
   await page.evaluate(async()=>{const m=await import('https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs');window.modelMermaid=m.default;window.modelMermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral',fontFamily:'Arial',er:{useMaxWidth:false},maxTextSize:100000});});
   console.log(name+': sintaxe validada e SVG exportado.');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});

import {mkdirSync,readFileSync,writeFileSync,cpSync} from 'node:fs';
writeFileSync('ui.mjs','export const html = '+JSON.stringify(readFileSync('app.html','utf8'))+';\n');
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
const ui=readFileSync('ui.mjs','utf8');const worker=readFileSync('worker.mjs','utf8').replace("import { html } from './ui.mjs';",'');
writeFileSync('dist/server/index.js',ui+'\n'+worker);cpSync('.openai/hosting.json','dist/.openai/hosting.json');cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built Worker with database migrations.');

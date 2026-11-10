import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import worker from './worker.mjs';
export function database(path=':memory:'){
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='people'").get())db.exec(readFileSync(new URL('./drizzle/0000_initial.sql',import.meta.url),'utf8'));
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='write_guards'").get())db.exec(readFileSync(new URL('./drizzle/0001_sheet_writes.sql',import.meta.url),'utf8'));
 const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}});
 return {prepare:wrap,async batch(items){db.exec('BEGIN IMMEDIATE');try{const results=[];for(const item of items)results.push(item.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}},close(){db.close()}};
}
if(process.argv[1]===new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/,'$1').replaceAll('/',process.platform==='win32'?'\\':'/')){
 mkdirSync('data',{recursive:true});const env={DB:database(process.env.DATABASE_PATH||'data/team-hours.sqlite'),SETUP_TOKEN:process.env.SETUP_TOKEN||randomBytes(24).toString('hex')};
 const empty=await env.DB.prepare('SELECT id FROM people LIMIT 1').first();if(!empty)console.log('One-time setup key: '+env.SETUP_TOKEN);
 const server=createServer(async(req,res)=>{try{const origin=process.env.APP_ORIGIN||'http://localhost:'+(process.env.PORT||3000);let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>256000){res.writeHead(413);res.end();return}chunks.push(chunk)}const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);headers.delete('cf-connecting-ip');headers.set('cf-connecting-ip',req.socket.remoteAddress||'local');const r=await worker.fetch(new Request(new URL(req.url,origin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch{res.writeHead(500);res.end('Server error')}});
 server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Team Hours: '+(process.env.APP_ORIGIN||'http://localhost:'+(process.env.PORT||3000))));
}

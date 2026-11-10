import { html } from './ui.mjs';
const enc = new TextEncoder();
const hex = b => Array.from(new Uint8Array(b), v=>v.toString(16).padStart(2,'0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function digest(s){return hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));}
export async function hashPin(pin,salt=random()) {const key=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
const validPin=p=>typeof p==='string' && /^\d{6,12}$/.test(p);
const name=n=>{if(typeof n!=='string'||!n.trim()||n.trim().length>100)fail(400,'Enter a name (1–100 characters).');return n.trim();};
const day=d=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)fail(400,'Choose a valid date.');return d;};
export default {async fetch(req,env){
 let res;try{res=await route(req,env);}catch(e){res=json({error:e.status?e.message:/Daily total/.test(e.message)?'Daily total cannot exceed 24 hours.':'The request could not be completed.'},e.status||(/Daily total/.test(e.message)?400:500));}
 const headers=new Headers(res.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','DENY');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return new Response(res.body,{status:res.status,headers});
}};
async function route(req,env){
 const url=new URL(req.url),p=url.pathname,db=env.DB;
 if(p==='/'&&req.method==='GET')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
 if(!p.startsWith('/api/'))fail(404,'Not found');
 const q=(sql,...args)=>db.prepare(sql).bind(...args);
 const all=async(sql,...args)=>(await q(sql,...args).all()).results;
 if(!['GET','HEAD'].includes(req.method)){
  if(req.headers.get('origin')!==url.origin)fail(403,'Invalid request origin.');
  if(req.headers.get('content-type')?.split(';')[0]!=='application/json')fail(415,'JSON required.');
 }
 let body={};if(!['GET','HEAD'].includes(req.method)){const raw=await req.text();if(raw.length>256000)fail(413,'Request too large');try{body=JSON.parse(raw);}catch{fail(400,'Invalid JSON');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid request');}
 const now=Date.now();
 const throttle=async key=>{const a=await q('INSERT INTO attempts(key,count,until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until<? THEN 1 ELSE count+1 END, until=CASE WHEN until<? THEN excluded.until ELSE until END RETURNING count',key,now+900000,now,now).first();if(a.count>10)fail(429,'Too many attempts. Try again in 15 minutes.');};
 if(p==='/api/public'&&req.method==='GET')return json({setup:!(await q('SELECT id FROM people LIMIT 1').first()),people:await all('SELECT id,name FROM people WHERE active=1 ORDER BY name')});
 if(p==='/api/setup'&&req.method==='POST'){
  await throttle('setup:'+(req.headers.get('cf-connecting-ip')||'local'));
  if(!env.SETUP_TOKEN||body.token!==env.SETUP_TOKEN)fail(403,'Invalid setup key.');
  if(!validPin(body.pin))fail(400,'Use a PIN of 6–12 digits.');
  const r=await q("INSERT INTO people(id,name,role,pin) SELECT ?,?,'admin',? WHERE NOT EXISTS(SELECT 1 FROM people)",crypto.randomUUID(),name(body.name),await hashPin(body.pin)).run();
  if(!r.meta.changes)fail(409,'Setup has already been completed.');return json({ok:true});
 }
 if(p==='/api/login'&&req.method==='POST'){
  await throttle('ip:'+(req.headers.get('cf-connecting-ip')||'local'));await throttle('person:'+String(body.id));
  const person=typeof body.id==='string'?await q('SELECT * FROM people WHERE id=? AND active=1',body.id).first():null;
  const stored=person?.pin||'dummy:invalid',computed=await hashPin(String(body.pin||''),stored.split(':')[0]);
  if(!person||computed!==stored)fail(401,'Name or PIN is incorrect.');
  const token=random();await db.batch([q('DELETE FROM sessions WHERE expires<?',now),q('DELETE FROM attempts WHERE until<?',now),q('INSERT INTO sessions VALUES (?,?,?)',await digest(token),person.id,now+43200000)]);
  return json({ok:true},200,{'Set-Cookie':`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${url.protocol==='https:'?'; Secure':''}`});
 }
 const token=req.headers.get('cookie')?.match(/(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const me=token?await q('SELECT p.id,p.name,p.role FROM sessions s JOIN people p ON p.id=s.person WHERE s.token=? AND s.expires>? AND p.active=1',await digest(token),now).first():null;
 if(!me)fail(401,'Please sign in.');
 const admin=()=>{if(me.role!=='admin')fail(403,'Administrator access required.');};
 if(p==='/api/logout'&&req.method==='POST'){await q('DELETE FROM sessions WHERE token=?',await digest(token)).run();return json({ok:true},200,{'Set-Cookie':'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
 if(p==='/api/me'&&req.method==='GET')return json(me);
 if(p==='/api/pin'&&req.method==='POST'){
  await throttle('pin:'+me.id);const person=await q('SELECT pin FROM people WHERE id=?',me.id).first();if(await hashPin(String(body.current||''),person.pin.split(':')[0])!==person.pin)fail(403,'Current PIN is incorrect.');if(!validPin(body.pin))fail(400,'Use a PIN of 6–12 digits.');
  await db.batch([q('UPDATE people SET pin=? WHERE id=?',await hashPin(body.pin),me.id),q('DELETE FROM sessions WHERE person=?',me.id)]);return json({ok:true});
 }
 if(p==='/api/people'&&req.method==='GET')return json(me.role==='member'?[me]:await all('SELECT id,name,role,active FROM people ORDER BY name'));
 if(p==='/api/people'&&req.method==='POST'){
  admin();const n=name(body.name);if(!['member','manager','admin'].includes(body.role))fail(400,'Invalid role.');
  if(body.id===me.id){if(body.role!==me.role||body.active===false||body.pin)fail(400,'Ask another administrator to change your access.');await q('UPDATE people SET name=? WHERE id=?',n,me.id).run();return json({ok:true});}
  if(body.pin&&!validPin(body.pin))fail(400,'Use a PIN of 6–12 digits.');
  if(body.id){const existing=await q('SELECT id FROM people WHERE id=?',body.id).first();if(!existing)fail(404,'Person not found');
   const tasks=[q('UPDATE people SET name=?,role=?,active=? WHERE id=?',n,body.role,body.active===false?0:1,body.id),q('DELETE FROM sessions WHERE person=?',body.id)];if(body.pin)tasks.push(q('UPDATE people SET pin=? WHERE id=?',await hashPin(body.pin),body.id));await db.batch(tasks);
  }else{if(!validPin(body.pin))fail(400,'Use a PIN of 6–12 digits.');await q('INSERT INTO people(id,name,role,pin) VALUES (?,?,?,?)',crypto.randomUUID(),n,body.role,await hashPin(body.pin)).run();}return json({ok:true});
 }
 if(p==='/api/projects'&&req.method==='GET')return json(await all('SELECT * FROM projects ORDER BY name'));
 if(p==='/api/projects'&&req.method==='DELETE'){
  admin();if(typeof body.id!=='string')fail(400,'Choose a project.');
  const found=await q('SELECT id FROM projects WHERE id=?',body.id).first();if(!found)fail(404,'Project not found');
  const result=await db.batch([q('DELETE FROM projects WHERE id=? AND NOT EXISTS(SELECT 1 FROM entries WHERE project=?)',body.id,body.id),q('UPDATE projects SET active=0 WHERE id=?',body.id)]);
  return json({ok:true,archived:!result[0].meta.changes});
 }
 if(p==='/api/sheet'&&req.method==='POST'){
  if(body.person&&body.person!==me.id)fail(403,'You can only save your own hours.');
  if(!Array.isArray(body.cells)||body.cells.length<1||body.cells.length>500)fail(400,'Save between 1 and 500 changed cells.');
  const checks=[],deletes=[],inserts=[],cleanup=[],seen=new Set();
  for(const cell of body.cells){
   const d=day(cell.day);if(typeof cell.project!=='string'||!Number.isInteger(cell.minutes)||cell.minutes<0||cell.minutes>1440||typeof cell.stamp!=='string'||cell.stamp.length>20000)fail(400,'Invalid hours.');
   const k=cell.project+':'+d;if(seen.has(k))fail(400,'Duplicate cell.');seen.add(k);
   const old=await all('SELECT id,updated,note FROM entries WHERE person=? AND project=? AND day=? ORDER BY id',me.id,cell.project,d);
   const stamp=old.map(e=>e.id+':'+e.updated).join('|');if(stamp!==cell.stamp)fail(409,'These hours changed on another device. Reload before saving.');
   if(!await q('SELECT id FROM projects WHERE id=? AND active=1',cell.project).first())fail(400,'This project is archived or unavailable.');
   const guard=crypto.randomUUID();
   checks.push(q("INSERT INTO write_guards VALUES (?, CASE WHEN COALESCE((SELECT group_concat(id || ':' || updated, '|') FROM (SELECT id,updated FROM entries WHERE person=? AND project=? AND day=? ORDER BY id)),'')=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND active=1) THEN 1 ELSE 0 END)",guard,me.id,cell.project,d,cell.stamp,cell.project));
   deletes.push(q('DELETE FROM entries WHERE person=? AND project=? AND day=?',me.id,cell.project,d));
   if(cell.minutes)inserts.push(q('INSERT INTO entries VALUES (?,?,?,?,?,?,?)',crypto.randomUUID(),me.id,cell.project,d,cell.minutes,old.map(e=>e.note).filter(Boolean).join('\n'),new Date().toISOString()));
   cleanup.push(q('DELETE FROM write_guards WHERE id=?',guard));
  }
  try{await db.batch([...checks,...deletes,...inserts,...cleanup]);}catch(e){if(/valid=1|CHECK constraint/.test(e.message))fail(409,'These hours changed on another device. Reload before saving.');throw e;}
  return json({ok:true});
 }
 if(p==='/api/projects'&&req.method==='POST'){
  admin();const n=name(body.name);if(await q('SELECT id FROM projects WHERE name=? AND id!=?',n,body.id||'').first())fail(409,'A project with that name exists.');
  if(body.id){const r=await q('UPDATE projects SET name=?,active=? WHERE id=?',n,body.active===false?0:1,body.id).run();if(!r.meta.changes)fail(404,'Project not found');}else await q('INSERT INTO projects(id,name) VALUES (?,?)',crypto.randomUUID(),n).run();return json({ok:true});
 }
 if(p==='/api/entries'&&req.method==='GET'){
  const from=day(url.searchParams.get('from')),to=day(url.searchParams.get('to'));if(to<from||Date.parse(to)-Date.parse(from)>366*86400000)fail(400,'Choose a range of up to one year.');
  return json(await all('SELECT e.*,p.name employee,j.name project_name,j.active project_active FROM entries e JOIN people p ON p.id=e.person JOIN projects j ON j.id=e.project WHERE day BETWEEN ? AND ?'+(me.role==='member'?' AND person=?':'')+' ORDER BY day DESC,p.name,j.name',from,to,...(me.role==='member'?[me.id]:[])));
 }
 if(p==='/api/entries'&&req.method==='POST'){
  const d=day(body.day),minutes=Math.round(Number(body.hours)*60);if(!Number.isFinite(Number(body.hours))||minutes<1||minutes>1440)fail(400,'Enter hours between 0.02 and 24.');if(typeof body.note!=='string'||body.note.length>500)fail(400,'Notes must be at most 500 characters.');
  if(body.person&&body.person!==me.id)fail(403,'You can only record your own hours.');
  if(!await q('SELECT id FROM projects WHERE id=? AND active=1',body.project).first())fail(400,'Choose an active project.');
  if(body.id){const existing=await q('SELECT person FROM entries WHERE id=?',body.id).first();if(!existing)fail(404,'Entry not found');if(existing.person!==me.id)fail(403,'You can only edit your own hours.');await q('UPDATE entries SET project=?,day=?,minutes=?,note=?,updated=? WHERE id=? AND person=?',body.project,d,minutes,body.note,new Date().toISOString(),body.id,me.id).run();}
  else await q('INSERT INTO entries VALUES (?,?,?,?,?,?,?)',crypto.randomUUID(),me.id,body.project,d,minutes,body.note,new Date().toISOString()).run();return json({ok:true});
 }
 if(p==='/api/entries'&&req.method==='DELETE'){const r=await q('DELETE FROM entries WHERE id=? AND person=?',body.id,me.id).run();if(!r.meta.changes)fail(403,'Entry not found or belongs to someone else.');return json({ok:true});}
 fail(404,'Not found');
}

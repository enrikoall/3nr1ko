let sheetMode='week',sheetAnchor=today(),sheetEmployee='',sheetDirty=false,sheetBusy=false;
window.addEventListener('beforeunload',e=>{if(sheetDirty){e.preventDefault();e.returnValue=''}});
function leaveSheet(){return !sheetBusy&&(!sheetDirty||confirm('Discard unsaved hours?'));}
async function weekly(){
 const root=document.getElementById('main');root.innerHTML=SHEET_MARKUP;
 const $=selector=>root.querySelector(selector),key=d=>d.toISOString().slice(0,10),fmt=n=>Number(n.toFixed(2)).toString();
 const selected=people.find(p=>p.id===sheetEmployee)||me;sheetEmployee=selected.id;const writable=selected.id===me.id;
 let records=[],dates=[],dirty=new Map(),visible=[],hidden=new Set(),added=new Set(),values={},stamps={};
 const prefKey='team-hours-rows:'+me.id+':'+selected.id;
 try{const pref=JSON.parse(localStorage.getItem(prefKey)||'{}');hidden=new Set(pref.hidden||[]);added=new Set(pref.added||[])}catch{}
 const status=s=>$('#week-status').textContent=s;
 const prefs=()=>{try{localStorage.setItem(prefKey,JSON.stringify({hidden:[...hidden],added:[...added]}))}catch{}};
 const cellKey=(id,date)=>id+':'+date;
 function hourValue(id,d){return (values[cellKey(id,key(d))]||0)/60}
 function makeDates(){const d=new Date(sheetAnchor+'T12:00:00Z');if(sheetMode==='month')d.setUTCDate(1);else d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const length=sheetMode==='month'?new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate():7;dates=Array.from({length},(_,i)=>new Date(+d+i*86400000))}
 async function load(){
  makeDates();records=(await api('entries?from='+key(dates[0])+'&to='+key(dates.at(-1)))).filter(e=>e.person===selected.id);values={};stamps={};
  for(const e of records){const k=cellKey(e.project,e.day);values[k]=(values[k]||0)+e.minutes;(stamps[k]||(stamps[k]=[])).push(e)}
  for(const k in stamps)stamps[k]=stamps[k].sort((a,b)=>a.id.localeCompare(b.id)).map(e=>e.id+':'+e.updated).join('|');
  dirty.clear();sheetDirty=false;renderTable();status(writable?'All changes saved.':'Viewing '+selected.name+' · Read only');
 }
 function totals(){const sums=dates.map(()=>0);visible.forEach((p,r)=>{let sum=0;dates.forEach((d,c)=>{const n=values[cellKey(p.id,key(d))]||0;sums[c]+=n;sum+=n});$('#total-'+r).textContent=fmt(sum/60)});$('#week-foot').innerHTML='<tr><td>Daily total</td>'+sums.map(n=>'<td>'+fmt(n/60)+'</td>').join('')+'<td>'+fmt(sums.reduce((a,b)=>a+b,0)/60)+'</td></tr>';$('#grand-total').textContent=fmt(sums.reduce((a,b)=>a+b,0)/60)+' h';return dates.every(d=>Object.entries(values).filter(([k])=>k.endsWith(':'+key(d))).reduce((sum,[,v])=>sum+v,0)<=1440)}
 function renderTable(){
  const format=(d,o)=>d.toLocaleDateString('en-GB',{...o,timeZone:'UTC'}),monthly=sheetMode==='month';
  $('#week-label').textContent=monthly?format(dates[0],{month:'long',year:'numeric'}):format(dates[0],{day:'numeric',month:'short'})+' – '+format(dates.at(-1),{day:'numeric',month:'short',year:'numeric'});
  $('#date-now').textContent='Today · '+format(new Date(today()+'T12:00:00Z'),{day:'numeric',month:'long',year:'numeric'});$('#view-mode').value=sheetMode;
  root.querySelector('h2').textContent=monthly?'Your month, at a glance.':'A whole week, at a glance.';$('#period-total').textContent=monthly?'Month total':'Week total';$('#save-week').textContent=monthly?'Save month':'Save week';$('#save-week').hidden=!writable;$('#add-project').hidden=!writable;
  $('#week-prev').setAttribute('aria-label','Previous '+sheetMode);$('#week-next').setAttribute('aria-label','Next '+sheetMode);
  const table=root.querySelector('table');table.style.minWidth=monthly?(272+dates.length*72)+'px':'790px';
  $('#week-head').innerHTML='<tr><th>Project</th>'+dates.map(d=>'<th class="'+([0,6].includes(d.getUTCDay())?'weekend ':'')+(key(d)===today()?'today':'')+'">'+format(d,{weekday:'short'})+'<span>'+d.getUTCDate()+'</span>'+(key(d)===today()?'<small>Today</small>':'')+'</th>').join('')+'<th>Total<br>hours</th></tr>';
  const used=new Set(records.map(e=>e.project));for(const c of dirty.values())used.add(c.project);
  visible=projects.filter(p=>(used.has(p.id)||added.has(p.id))&&!hidden.has(p.id));$('#week-rows').replaceChildren();
  visible.forEach((p,r)=>{const tr=document.createElement('tr'),th=document.createElement('th'),box=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');box.className='project-cell';th.scope='row';name.textContent=p.name+(p.active?'':' (archived)');remove.className='remove-row';remove.textContent='×';remove.setAttribute('aria-label','Remove '+p.name+' from table');remove.onclick=()=>{if(sheetBusy)return;if(confirm('Remove '+p.name+' from this table? Saved hours will be kept.')){hidden.add(p.id);prefs();renderTable();status('Row hidden. Add it back from the project list to show its hours.')}};box.append(remove,name);th.append(box);tr.append(th);
   dates.forEach(d=>{const td=document.createElement('td'),input=document.createElement('input'),day=key(d),k=cellKey(p.id,day);if([0,6].includes(d.getUTCDay()))td.className='weekend';input.type='number';input.min='0';input.max='24';input.step='any';input.inputMode='decimal';input.placeholder='—';input.value=values[k]?fmt(values[k]/60):'';input.disabled=!writable||!p.active;input.setAttribute('aria-label',p.name+' '+day+' hours');input.oninput=()=>{const n=Number(input.value);if(!Number.isFinite(n)||n<0||n>24){input.setCustomValidity('Enter 0 to 24 hours.');status('Enter 0 to 24 hours.');return}input.setCustomValidity('');values[k]=Math.round(n*60);dirty.set(k,{project:p.id,day,minutes:values[k],stamp:stamps[k]||''});sheetDirty=true;status(totals()?'Unsaved changes':'Daily hours exceed 24, including hidden rows.');};input.onblur=()=>{if(input.validity.valid&&input.value!=='')input.value=fmt((values[k]||0)/60)};td.append(input);tr.append(td)});
   const total=document.createElement('td');total.id='total-'+r;tr.append(total);$('#week-rows').append(tr);
  });
  if(!visible.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=dates.length+2;td.textContent='Choose a project below to begin.';tr.append(td);$('#week-rows').append(tr)}
  totals();const select=$('#new-project');select.replaceChildren();select.add(new Option('Select a project…',''));projects.filter(p=>(p.active||used.has(p.id))&&!visible.some(v=>v.id===p.id)).forEach(p=>select.add(new Option(p.name+(p.active?'':' (archived)'),p.id)));$('#add-project button').textContent='＋ Add';$('#add-project button').disabled=select.options.length===1;select.disabled=select.options.length===1;
  const hiddenHours=records.filter(e=>hidden.has(e.project)).reduce((s,e)=>s+e.minutes,0);$('#hidden-info').textContent=hiddenHours?'Visible-row totals shown. Hidden projects contain '+fmt(hiddenHours/60)+' saved hours in this period.':'';
 }
 async function navigate(delta){if(!leaveSheet())return;sheetDirty=false;const d=new Date(sheetAnchor+'T12:00:00Z');if(sheetMode==='month'){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+delta)}else d.setUTCDate(d.getUTCDate()+delta*7);sheetAnchor=key(d);await load()}
 $('#week-prev').onclick=()=>action(()=>navigate(-1));$('#week-next').onclick=()=>action(()=>navigate(1));$('#view-mode').onchange=e=>{if(!leaveSheet()){e.target.value=sheetMode;return}sheetDirty=false;sheetMode=e.target.value;action(load)};
 $('#add-project').onsubmit=e=>{e.preventDefault();const id=$('#new-project').value;if(!id)return;added.add(id);hidden.delete(id);prefs();renderTable()};
 $('#save-week').onclick=()=>action(async()=>{if(!dirty.size){status('All changes saved.');return}if(root.querySelector('input:invalid')||!totals())throw Error('Fix invalid hours before saving.');sheetBusy=true;root.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);try{await api('sheet','POST',{person:me.id,cells:[...dirty.values()]});await load();notice('Hours saved.')}finally{sheetBusy=false;if(root.isConnected){root.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);renderTable()}}});
 const chooser=$('#employee-select');const publicPeople=(await api('public')).people;
 const choices=me.role==='member'?publicPeople:people;choices.forEach(p=>chooser.add(new Option(p.name+(p.active===0?' (inactive)':''),p.id)));chooser.value=selected.id;
 chooser.onchange=()=>action(async()=>{if(!leaveSheet()){chooser.value=selected.id;return}sheetDirty=false;if(me.role==='member'){const chosen=chooser.value;await api('logout','POST',{});me=null;await loginScreen();document.getElementById('id').value=chosen;notice('Enter your PIN to switch accounts.')}else{sheetEmployee=chooser.value;await weekly()}});
 $('#employee-hint').textContent=writable?'Your hours · '+me.role:'Viewing '+selected.name+' · Read only';
 $('#employee-management').hidden=me.role!=='admin';$('#project-library').hidden=me.role!=='admin';
 function icon(symbol,label,handler){const b=document.createElement('button');b.type='button';b.textContent=symbol;b.className='management-icon'+(symbol==='×'?' delete-project':'');b.setAttribute('aria-label',label);b.title=label;if(symbol==='✎')b.style.fontSize='10px';b.onclick=()=>action(handler);return b}
 async function refresh(){[people,projects]=await Promise.all([api('people'),api('projects')]);await weekly()}
 function editName(li,initial,save){const form=document.createElement('form'),input=document.createElement('input'),ok=document.createElement('button'),cancel=document.createElement('button');form.className='project-edit';input.value=initial;input.maxLength=100;input.required=true;input.setAttribute('aria-label','Name');ok.type='submit';ok.textContent='Save';cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>action(weekly);form.append(input,ok,cancel);li.replaceChildren(form);input.focus();form.onsubmit=e=>{e.preventDefault();action(async()=>{await save(input.value.trim());await refresh()})}}
 if(me.role==='admin'){
  people.forEach(p=>{const li=document.createElement('li'),label=document.createElement('span'),buttons=document.createElement('div');label.textContent=p.name+(p.active?'':' (inactive)');buttons.className='project-actions';if(p.id!==me.id){buttons.append(icon('✎','Edit '+p.name,async()=>{if(!leaveSheet())return;sheetDirty=false;editName(li,p.name,name=>api('people','POST',{...p,name,active:!!p.active}))}),icon(p.active?'×':'↶',p.active?'Remove '+p.name:'Restore '+p.name,async()=>{if(!leaveSheet())return;if(p.active&&!confirm('Remove '+p.name+'? Their access will be disabled and recorded hours kept.'))return;sheetDirty=false;await api('people','POST',{...p,active:!p.active});await refresh()}))}else{const badge=document.createElement('small');badge.textContent='You';buttons.append(badge)}li.append(label,buttons);$('#employee-list').append(li)});
  const employeeForm=$('#add-employee');employeeForm.insertAdjacentHTML('beforeend','<div class="employee-fields"><label>Role<select name="role"><option value="member">Member</option><option value="manager">Project manager</option><option value="admin">Administrator</option></select></label><label>PIN (6–12 digits)<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" required autocomplete="new-password"></label></div>');
  employeeForm.onsubmit=e=>{e.preventDefault();if(!leaveSheet())return;const data=Object.fromEntries(new FormData(employeeForm));action(async()=>{await api('people','POST',{name:$('#employee-name').value,role:data.role,pin:data.pin});sheetDirty=false;await refresh();notice('Employee added.')})};
  projects.forEach(p=>{const li=document.createElement('li'),label=document.createElement('span'),buttons=document.createElement('div');label.textContent=p.name+(p.active?'':' (archived)');buttons.className='project-actions';buttons.append(icon('✎','Edit '+p.name,async()=>{if(!leaveSheet())return;sheetDirty=false;editName(li,p.name,name=>api('projects','POST',{id:p.id,name,active:!!p.active}))}),icon(p.active?'×':'↶',p.active?'Delete '+p.name:'Restore '+p.name,async()=>{if(!leaveSheet())return;if(p.active&&!confirm('Delete '+p.name+'? If anyone has recorded hours, it will be archived instead.'))return;sheetDirty=false;if(p.active)await api('projects','DELETE',{id:p.id});else await api('projects','POST',{id:p.id,name:p.name,active:true});await refresh()}));li.append(label,buttons);$('#project-list').append(li)});
  $('#create-project').onsubmit=e=>{e.preventDefault();if(!leaveSheet())return;action(async()=>{await api('projects','POST',{name:$('#project-name').value});sheetDirty=false;await refresh()})};
 }
 // Export is installed below; all values come from the current employee's table.
 $('#export-sheet').onclick=()=>{
 const exportRows=exportRows.map(p=>({name:p.name,r:p.id}));
 const sums=dates.map(d=>exportRows.reduce((sum,p)=>sum+hourValue(p.r,d),0));
 const probe=document.createElement('span');root.querySelector('#weekly-timesheet').append(probe);
 const color=token=>{probe.style.color='var('+token+')';return getComputedStyle(probe).color};
 const colors={bg:color('--bg'),panel:color('--panel'),text:color('--text'),sub:color('--sub'),line:color('--line'),soft:color('--soft'),green:color('--green')};probe.remove();
 const pad=30,projectWidth=260,dayWidth=72,totalWidth=100,rowHeight=60,tableY=135,headerHeight=76;
 const width=pad*2+projectWidth+dates.length*dayWidth+totalWidth,height=tableY+headerHeight+(exportRows.length+1)*rowHeight+60;
 if(width*height>16000000){$('#week-status').textContent='Too many project rows for one image. Remove some rows from this view and try again.';return}
 const scale=Math.min(3,Math.sqrt(32000000/(width*height)),16000/width,16000/height);const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');
 if(!ctx){$('#week-status').textContent='Image export is unavailable in this browser.';return}ctx.scale(scale,scale);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 const rect=(x,y,w,h,fill)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h)};
 const text=(value,x,y,size=15,fill=colors.text,align='left',weight=400)=>{ctx.font=weight+' '+size+'px system-ui, sans-serif';ctx.fillStyle=fill;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(String(value),x,y)};
 const label=(name,x,y)=>{ctx.font='500 15px system-ui, sans-serif';const words=name.split(/\s+/);let line='',lines=[];for(const word of words){if(line&&ctx.measureText(line+' '+word).width>projectWidth-30){lines.push(line);line=word}else line+=(line?' ':'')+word}if(line)lines.push(line);lines=lines.slice(0,2);lines.forEach((v,i)=>{while(ctx.measureText(v).width>projectWidth-30)v=v.slice(0,-1);text(v,x,y+(i-(lines.length-1)/2)*18,15,colors.text,'left',500)})};
 rect(0,0,width,height,colors.bg);text('Team Hours',pad,35,24,colors.green,'left',600);text(sheetMode==='month'?'Monthly timesheet':'Weekly timesheet',pad,75,20,colors.text,'left',600);text(selected.name+' · '+$('#week-label').textContent,pad,104,14,colors.sub);
 const tableWidth=width-pad*2,totalX=pad+projectWidth+dates.length*dayWidth;
 rect(pad,tableY,tableWidth,headerHeight,colors.panel);text('Project',pad+15,tableY+38,15,colors.text,'left',600);
 dates.forEach((d,c)=>{const x=pad+projectWidth+c*dayWidth;if([0,6].includes(d.getUTCDay()))rect(x,tableY,dayWidth,headerHeight,colors.soft);if(key(d)===today())rect(x,tableY,dayWidth,3,colors.green);text(d.toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'}),x+dayWidth/2,tableY+25,13,colors.sub,'center');text(d.getUTCDate(),x+dayWidth/2,tableY+51,20,colors.text,'center')});text('Total hours',totalX+totalWidth/2,tableY+38,14,colors.text,'center',600);
 exportRows.forEach((p,r)=>{const y=tableY+headerHeight+r*rowHeight;rect(pad,y,tableWidth,rowHeight,colors.panel);label(p.name,pad+15,y+rowHeight/2);dates.forEach((d,c)=>{const x=pad+projectWidth+c*dayWidth;if([0,6].includes(d.getUTCDay()))rect(x,y,dayWidth,rowHeight,colors.soft);text(hourValue(p.r,d)?fmt(hourValue(p.r,d)):'—',x+dayWidth/2,y+rowHeight/2,16,colors.text,'center')});text(fmt(dates.reduce((sum,d)=>sum+hourValue(p.r,d),0)),totalX+totalWidth/2,y+rowHeight/2,16,colors.text,'center',600);rect(pad,y,tableWidth,1,colors.line)});
 const y=tableY+headerHeight+exportRows.length*rowHeight;rect(pad,y,tableWidth,rowHeight,colors.soft);text('Daily total',pad+15,y+rowHeight/2,16,colors.text,'left',600);sums.forEach((v,c)=>text(fmt(v),pad+projectWidth+c*dayWidth+dayWidth/2,y+rowHeight/2,16,colors.text,'center',600));text(fmt(sums.reduce((a,b)=>a+b,0)),totalX+totalWidth/2,y+rowHeight/2,17,colors.green,'center',600);
 text('Hours · '+key(dates[0])+' to '+key(dates.at(-1)),pad,height-25,12,colors.sub);
 canvas.toBlob(blob=>{if(!blob){$('#week-status').textContent='Could not create image. Please try again.';return}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='team-hours-'+selected.name.replace(/[^a-z0-9_-]/gi,'-')+'-'+sheetMode+'-'+key(dates[0])+'-to-'+key(dates.at(-1))+'.png';root.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('#week-status').textContent='High-resolution PNG requested · '+canvas.width+' × '+canvas.height+' pixels.'},'image/png');
};

 await load();
}


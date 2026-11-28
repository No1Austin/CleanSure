import AdminPassword from './AdminPassword.jsx';
import FinancePortal from './FinancePortal.jsx';
import {Bell, LayoutDashboard, CalendarDays, Users, Contact, RadioTower, ChartNoAxesCombined, Menu, X, RefreshCw} from 'lucide-react';
import {useCallback,useEffect,useRef,useState} from 'react';
import './crm.css';
const statuses=['requested','pending','confirmed','assigned','in_progress','completed','cancelled','expired'];
const payments=['unpaid','pending','paid','failed','refunded','disputed'];
const fmt=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n||0));
const EMPTY_RECORDS = {bookings:[],cleaners:[],customers:[]};
const SNAPSHOT_KEY = 'cleansureCrmLastGoodOverviewV1';
function readSnapshot(){
 try {
  const raw=sessionStorage.getItem(SNAPSHOT_KEY);
  if(!raw)return null;
  const parsed=JSON.parse(raw);
  if(!parsed || !validOverview(parsed.records) || typeof parsed.savedAt!=='number')return null;
  return parsed;
 }catch{return null;}
}
function validOverview(data){
 return !!data && ['bookings','cleaners','customers'].every(k=>Array.isArray(data[k]));
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default function CrmDashboard(){
 const [passwordMode,setPasswordMode]=useState(()=>new URLSearchParams(location.search).has('adminResetPassword')?'reset':'');
 const [token,setToken]=useState(()=>sessionStorage.getItem('cleansureAdminAccessToken')||'');
 const [snapshot,setSnapshot]=useState(()=>sessionStorage.getItem('cleansureAdminAccessToken')?readSnapshot():null);
 const [records,setRecords]=useState(()=>sessionStorage.getItem('cleansureAdminAccessToken')?readSnapshot()?.records||EMPTY_RECORDS:EMPTY_RECORDS);
 const [hasLoaded,setHasLoaded]=useState(()=>!!(sessionStorage.getItem('cleansureAdminAccessToken')&&readSnapshot()));
 const [lastUpdated,setLastUpdated]=useState(()=>sessionStorage.getItem('cleansureAdminAccessToken')?readSnapshot()?.savedAt||null:null);
 const [connection,setConnection]=useState('idle');
 const [tab,setTab]=useState('overview'),[search,setSearch]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[draft,setDraft]=useState(null),[selectedCleaner,setSelectedCleaner]=useState(null),[cleanerPhoto,setCleanerPhoto]=useState('');
 const [filter,setFilter]=useState('all'),[page,setPage]=useState(1),[dialog,setDialog]=useState(null),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[mobile,setMobile]=useState(false);
 const requestSequence=useRef(0);
 const currentToken=useRef(token);
 currentToken.current=token;
 const api=useCallback(async(path,body,method,authToken=currentToken.current)=>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);
  try {
   const r=await fetch('/api/'+path,{
    method:method||(body?'POST':'GET'),
    headers:{...(body?{'Content-Type':'application/json'}:{}),Authorization:'Bearer '+authToken},
    ...(body?{body:JSON.stringify(body)}:{}),
    cache:'no-store',signal:controller.signal
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){const err=new Error(d.error||`Server returned HTTP ${r.status}`);err.status=r.status;throw err;}
   return d;
  }catch(error){if(error.name==='AbortError'){const e=new Error('Server request timed out.');e.status=504;throw e;}throw error;}
  finally{clearTimeout(timeout);}
 },[]);
 const load=useCallback(async(allowEmpty=false)=>{
  const authToken=currentToken.current;
  if(!authToken)return;
  const sequence=++requestSequence.current;
  setLoading(true);
  setConnection('loading');
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const d=await api('crm/overview',undefined,undefined,authToken);
    if(!validOverview(d))throw new Error('The server returned incomplete CRM data. Existing records were preserved.');
    // An unexpected all-empty response is not trusted if a prior nonempty snapshot exists.
    // Genuine deletion/empty data should be verified in Supabase before replacing the snapshot.
    const previous=readSnapshot();
    const previousCount=previous?previous.records.bookings.length+previous.records.cleaners.length:0;
    const nextCount=d.bookings.length+d.cleaners.length;
    if(allowEmpty!==true&&previousCount>0&&nextCount===0)throw new Error('CRM returned an unexpectedly empty overview. Previous data is preserved; verify records in Supabase.');
    if(sequence!==requestSequence.current||authToken!==currentToken.current)return;
    const savedAt=Date.now();
    try{sessionStorage.setItem(SNAPSHOT_KEY,JSON.stringify({records:d,savedAt}));}catch{/* Storage quota or private mode: in-memory data still works. */}
    setRecords(d);setSnapshot({records:d,savedAt});setHasLoaded(true);setLastUpdated(savedAt);
    setConnection('online');setMessage('');setLoading(false);
    return;
   }catch(e){
    lastError=e;
    if(sequence!==requestSequence.current||authToken!==currentToken.current)return;
    if(e.status===401||e.status===403)break;
    if(attempt<2 && (e.status===502||e.status===503||e.status===504||e.status===429||e.name==='TypeError'))await sleep(800*(attempt+1));
    else break;
   }
  }
  if(sequence!==requestSequence.current||authToken!==currentToken.current)return;
  if(lastError?.status===401){
   sessionStorage.removeItem('cleansureAdminAccessToken');
   sessionStorage.removeItem(SNAPSHOT_KEY);
   currentToken.current='';setToken('');setRecords(EMPTY_RECORDS);setHasLoaded(false);
   setConnection('idle');setMessage('Your session expired. Please sign in again.');
  }else{
   setConnection('offline');
   setMessage((lastError?.message||'Unable to load CRM data')+(readSnapshot()?' — showing last successfully loaded data.':' — no data has been loaded yet.'));
  }
  setLoading(false);
 },[api]);
 useEffect(()=>{if(token&&passwordMode!=='reset')load();},[token,load,passwordMode]);
 async function login(e){e.preventDefault();const f=new FormData(e.currentTarget);setLoading(true);try{const r=await fetch('/api/cleaner-account/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});const d=await r.json();if(!r.ok)throw Error(d.error||'Login failed');sessionStorage.removeItem(SNAPSHOT_KEY);sessionStorage.setItem('cleansureAdminAccessToken',d.accessToken);currentToken.current=d.accessToken;setRecords(EMPTY_RECORDS);setHasLoaded(false);setLastUpdated(null);setToken(d.accessToken)}catch(e){setMessage(e.message)}finally{setLoading(false)}}
 async function change(path,body){try{await api('crm/'+path,body,'PATCH');await load()}catch(e){setMessage(e.message)}}
 function tags(kind,item){setValue((item.crm_tags||[]).join(', '));setDialog({kind:'tags',entity:kind,item});}
 async function openCleaner(c){setSelectedCleaner(c);setCleanerPhoto('');if(c.profile_photo_path){try{const d=await api(`crm/cleaners/${c.id}/photo`);setCleanerPhoto(d.url)}catch(e){setMessage(e.message)}}}
 async function deleteTest(kind,item){if(busy)return;if(!item.crm_tags?.includes('test')){setMessage('Add the exact label test first using Edit labels.');return;}if(window.prompt('Permanently delete this test record? Type DELETE TEST to confirm.')!=='DELETE TEST')return;setBusy(true);try{const result=await api(`crm/${kind}/${item.id}/test-record`,{confirmation:'DELETE TEST'},'DELETE');close();await load(true);setMessage(result.warning||'Test record deleted.');}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 async function reviewCleaner(decision){if(!selectedCleaner)return;if(!window.confirm(`Change ${selectedCleaner.first_name}'s application status to ${decision}?`))return;try{await api(`crm/cleaners/${selectedCleaner.id}/review`,{decision},'PATCH');setSelectedCleaner(null);setCleanerPhoto('');await load()}catch(e){setMessage(e.message)}}
 async function inviteCleaner(){if(!selectedCleaner)return;try{const d=await api(`cleaner-account/admin/applications/${selectedCleaner.id}/invitation`,{});setDraft({recipient:d.recipient,subject:d.subject,message:d.body});setSelectedCleaner(null);setTab('cleaners');setMessage('Invitation email draft created. Review and send manually; opening it does not mark it sent.')}catch(e){setMessage(e.message)}}
 function assign(b){setValue('');setDialog({kind:'assign',item:b});}
 async function offer(b){try{const d=await api(`crm/bookings/${b.id}/offer`,{});setDraft(d);setMessage('New job link generated. Share only with your approved cleaner group.')}catch(e){setMessage(e.message)}}
 const q=search.trim().toLowerCase();const matches=o=>Object.values(o).some(v=>typeof v==='string'&&v.toLowerCase().includes(q));
 const bookings=records.bookings.filter(matches),cleaners=records.cleaners.filter(matches),customers=records.customers.filter(matches);
 const count=s=>records.bookings.filter(b=>b.status===s).length;
 const stats=[['Bookings',records.bookings.length],['Pending',count('pending')],['Unassigned',records.bookings.filter(b=>!b.crm_assigned_cleaner_id&&!['cancelled','expired','completed'].includes(b.status)).length],['Completed',count('completed')],['Customers',records.customers.length],['Cleaners',records.cleaners.length]];

 const nav=[['overview',LayoutDashboard,'Overview'],['bookings',CalendarDays,'Bookings'],['customers',Users,'Customers'],['cleaners',Contact,'Cleaners'],['dispatch',RadioTower,'Dispatch'],['accounting',ChartNoAxesCombined,'Accounting'],['insights',ChartNoAxesCombined,'Insights']];
 const title={overview:'Operations overview',bookings:'Bookings',customers:'Customers',cleaners:'Cleaner management',dispatch:'Dispatch queue',accounting:'Accounting & finance',insights:'Business insights'};
 const eligible=records.cleaners.filter(c=>c.verification_status==='approved'&&c.auth_user_id);
 const [noticeOpen,setNoticeOpen]=useState(false),[noticeSeen,setNoticeSeen]=useState([]);
 const assignmentEvents=records.bookings.filter(b=>b.assigned_at&&b.crm_assigned_cleaner_id);
 const unreadAssignments=assignmentEvents.filter(b=>!noticeSeen.includes(b.id+':'+b.assigned_at));
 useEffect(()=>{if(!token)return;const i=setInterval(load,60000);return()=>clearInterval(i)},[token,load]);
 const active=b=>b.stripe_paid&&!b.crm_assigned_cleaner_id&&!['completed','cancelled','expired'].includes(b.status);
 const rows=(tab==='customers'?customers:tab==='cleaners'?cleaners:bookings.filter(b=>tab!=='dispatch'||active(b))).filter(b=>filter==='all'||(tab==='cleaners'?b.verification_status:tab==='customers'?(b.bookings>1?'repeat':'single'):b.status)===filter);
 const pages=Math.max(1,Math.ceil(rows.length/10)), currentPage=Math.min(page,pages), visible=rows.slice((currentPage-1)*10,currentPage*10);
 const label=v=>String(v||'unknown').replaceAll('_',' ');
 const badge=v=><span className={'crm-badge tone-'+(v||'unknown')}>{label(v)}</span>;
 const avatar=n=><span className="crm-avatar">{String(n||'?').split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</span>;
 const go=t=>{setTab(t);setFilter('all');setSearch('');setPage(1);setMobile(false);setDraft(null);setSelectedCleaner(null);setDialog(null)};
 const close=()=>{setDialog(null);setSelectedCleaner(null);setCleanerPhoto('');setDraft(null)};
 useEffect(()=>{const fn=e=>{if(e.key==='Escape'){close();setMobile(false);setNoticeOpen(false)}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[]);
 async function submitDialog(e){e.preventDefault();setBusy(true);try{if(dialog.kind==='tags'){const tags=[...new Set(value.split(',').map(x=>x.trim()).filter(Boolean))];if(tags.length>15||tags.some(x=>x.length>32))throw Error('Maximum 15 labels, 32 characters each.');await api(`crm/${dialog.entity}/${dialog.item.id}`,{tags},'PATCH')}else if(dialog.kind==='assign'){if(!eligible.some(c=>c.id===value))throw Error('Select an eligible cleaner.');await api(`crm/bookings/${dialog.item.id}/assign`,{cleanerId:value})}setDialog(null);await load()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 async function assignmentEmail(b){try{const d=await api(`lifecycle/invite/${b.id}`,{});setDialog(null);setDraft(d)}catch(e){setMessage(e.message)}}
 const email=b=>setDraft({recipient:b.customer_email,subject:'CleanSure — Booking '+b.booking_code,message:`Hello ${b.customer_name},\n\nRegarding booking ${b.booking_code} for ${b.service} on ${b.service_date} at ${b.service_time}.\n\nCleanSure`});
 if(passwordMode)return <AdminPassword mode={passwordMode} token={token} onClose={()=>{if(passwordMode==='reset')location.replace('/?adminPortal=1');else setPasswordMode('');}}/>;
 if(!token)return <main className="crm-login"><form onSubmit={login} className="crm-login-card"><a className="crm-brand" href="/">Clean<span>Sure</span></a><small>OPERATIONS WORKSPACE</small><h1>Welcome back</h1><p>Sign in to manage your business.</p><label>Email<input type="email" name="email" autoComplete="username" required/></label><label>Password<input type="password" name="password" autoComplete="current-password" required/></label><button className="crm-primary" disabled={loading}>{loading?'Signing in…':'Sign in'}</button><button type="button" className="crm-button" onClick={()=>setPasswordMode('forgot')}>Forgot password?</button><p role="status">{message}</p><a href="/">← Back to website</a></form></main>;
 return <div className="crm-shell"><button className="crm-nav-scrim" hidden={!mobile} aria-label="Close navigation" onClick={()=>setMobile(false)}/><aside id="crm-navigation" className={'crm-side '+(mobile?'is-open':'')}><a className="crm-brand" href="/">Clean<span>Sure</span><small>WORKSPACE</small></a><div className="crm-nav-label">WORKSPACE</div>{nav.map(([t,Icon,n])=><button key={t} className={tab===t?'selected':''} aria-current={tab===t?'page':undefined} onClick={()=>go(t)}><Icon className="crm-nav-icon" size={20} aria-hidden="true"/>{n}{t==='dispatch'&&hasLoaded&&<em>{records.bookings.filter(active).length}</em>}</button>)}<div className="crm-side-bottom"><button onClick={()=>setPasswordMode('send')}>Send password setup email</button><a href="/">↗ View website</a><button onClick={()=>{requestSequence.current++;sessionStorage.removeItem('cleansureAdminAccessToken');sessionStorage.removeItem(SNAPSHOT_KEY);currentToken.current='';setToken('');setRecords(EMPTY_RECORDS);setHasLoaded(false);setLastUpdated(null);setConnection('idle');close()}}>↪ Sign out</button><div className="crm-user">{avatar('Admin')}<div><strong>Administrator</strong><small>Operations team</small></div></div></div></aside><main className="crm-main"><div className="crm-top"><button className="crm-mobile" onClick={()=>setMobile(!mobile)} aria-label="Toggle navigation" aria-expanded={mobile} aria-controls="crm-navigation">{mobile?<X/>:<Menu/>}</button><span>Workspace / <b>{title[tab]}</b></span><button className="crm-button crm-bell" aria-expanded={noticeOpen} aria-label={`Assignment notifications, ${unreadAssignments.length} unread`} onClick={()=>setNoticeOpen(!noticeOpen)}><Bell size={21}/>{!!unreadAssignments.length&&<span>{unreadAssignments.length}</span>}</button><span className={'crm-connection '+connection}><i/>{connection==='offline'?'Offline':connection==='loading'?'Syncing':hasLoaded?'Connected':'Waiting'}</span></div>{noticeOpen&&<section className="crm-panel crm-notifications"><h2>Assignment notifications</h2><button onClick={()=>setNoticeSeen(assignmentEvents.map(b=>b.id+':'+b.assigned_at))}>Mark all read</button>{assignmentEvents.length?assignmentEvents.map(b=><p key={b.id}>{b.booking_code} · {records.cleaners.find(c=>c.id===b.crm_assigned_cleaner_id)?.first_name||'Assigned cleaner'} · {new Date(b.assigned_at).toLocaleString()} <button onClick={()=>assignmentEmail(b)}>Assignment email</button></p>):<p>No assignments yet.</p>}</section>}{tab!=='accounting'&&<header className="crm-heading"><div><div className="crm-eyebrow">CLEANSURE / MANAGEMENT</div><h1>{title[tab]}</h1><p>Manage your cleaning operations in one place.</p></div><button className="crm-button" onClick={load} disabled={loading}>↻ {loading?'Refreshing…':'Refresh data'}</button></header>}{tab==='overview'&&<div className="crm-panel crm-recent"><h2>Recent assignments</h2>{records.bookings.filter(b=>b.assigned_at).sort((a,b)=>b.assigned_at.localeCompare(a.assigned_at)).slice(0,5).map(b=><p key={b.id}>{b.booking_code} · {records.cleaners.find(c=>c.id===b.crm_assigned_cleaner_id)?.first_name||'Assigned cleaner'} · {new Date(b.assigned_at).toLocaleString()} <button onClick={()=>assignmentEmail(b)}>Assignment email</button></p>)}</div>}{tab!=='accounting'&&<div className="crm-update" role="status">{lastUpdated?'Last synced '+new Date(lastUpdated).toLocaleString():'No successful sync yet'}</div>}{message&&<div className="crm-message" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Dismiss message">×</button></div>}
 {(tab==='overview'||tab==='insights')&&<><div className="crm-stats">{stats.map(([k,v],i)=><button key={k} onClick={()=>{go(['bookings','bookings','dispatch','bookings','customers','cleaners'][i]);if(i===1)setFilter('pending');if(i===3)setFilter('completed')}}><span className="crm-stat-icon">{['▤','◷','↗','✓','◎','♙'][i]}</span><small>{k}</small><strong>{hasLoaded?v:'—'}</strong><span className="crm-stat-link">View records ↗</span></button>)}</div><div className="crm-analytics"><section className="crm-panel"><h2>Booking breakdown</h2><p>Distribution across all loaded bookings</p>{statuses.map(st=><div className="crm-bar-row" key={st}><span>{label(st)}</span><div className="crm-track"><i style={{width:(records.bookings.length?count(st)/records.bookings.length*100:0)+'%'}}/></div><b>{hasLoaded?count(st):'—'}</b></div>)}</section><section className="crm-panel"><h2>Customer & payment insights</h2><p>Based on recorded activity</p>{[['Repeat customers',records.customers.filter(c=>c.bookings>1).length],['Single booking customers',records.customers.filter(c=>c.bookings===1).length],['Unpaid / pending payments',records.bookings.filter(b=>['unpaid','pending'].includes(b.crm_payment_status||'unpaid')).length]].map(([k,v])=><div className="crm-insight" key={k}><span>{k}</span><strong>{hasLoaded?v:'—'}</strong></div>)}<p className="crm-note">Confirm marketing consent before promotional contact. Payment statuses are administrative records.</p></section></div></>}
 {tab==='accounting'&&<FinancePortal token={token} bookings={records.bookings} cleaners={records.cleaners}/>}
 {tab!=='insights'&&tab!=='accounting'&&<section className="crm-panel crm-table-panel"><div className="crm-table-heading"><div><h2>{tab==='overview'?'Booking activity':title[tab]} <span className="crm-count">{hasLoaded?rows.length:'—'}</span></h2><p>Search and manage your records.</p></div></div><div className="crm-toolbar"><input aria-label="Search records" placeholder="Search records…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/><select aria-label="Filter records" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="all">All statuses</option>{(tab==='cleaners'?['pending','approved','rejected']:tab==='customers'?['repeat','single']:statuses).map(x=><option key={x} value={x}>{label(x)}</option>)}</select></div><div className="crm-table-scroll"><table className={"crm-records crm-records-"+tab}><thead><tr>{(tab==='customers'?['Customer','Contact','Bookings','Estimated total','Last booking']:tab==='cleaners'?['Cleaner','Location / specialty','Verification','Account','Actions']:['Booking / customer','Service / schedule','Status','Payment','Estimated','Actions']).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{visible.map(b=>tab==='customers'?<tr key={b.email}><td data-label="Customer"><div className="crm-person">{avatar(b.name)}<b>{b.name}</b></div></td><td data-label="Contact">{b.email}<small>{b.phone}</small></td><td data-label="Bookings">{b.bookings}</td><td data-label="Estimated total">{fmt(b.totalEstimated)}</td><td data-label="Last booking">{b.lastBooking?new Date(b.lastBooking).toLocaleDateString():'—'}</td></tr>:tab==='cleaners'?<tr key={b.id}><td data-label="Cleaner"><div className="crm-person">{avatar(b.first_name+' '+b.last_name)}<div><b>{b.first_name} {b.last_name}</b><small>{b.cleaner_code}</small></div></div></td><td data-label="Location / specialty">{b.city}<small>{b.specialty}</small></td><td data-label="Verification">{badge(b.verification_status)}</td><td data-label="Account">{b.auth_user_id?'Registered':'Not registered'}</td><td data-label="Actions"><button className="crm-button" onClick={()=>openCleaner(b)}>View profile</button></td></tr>:<tr key={b.id}><td data-label="Booking / customer"><b>{b.customer_name}</b><small>{b.booking_code||b.id.slice(0,8)}</small></td><td data-label="Service / schedule">{b.service}<small>{b.service_date} · {b.service_time}</small></td><td data-label="Status">{badge(b.status||'pending')}</td><td data-label="Payment">{badge(b.crm_payment_status||'unpaid')}</td><td data-label="Estimated"><b>{fmt(b.estimated_total)}</b></td><td data-label="Actions"><button className="crm-button" onClick={()=>setDialog({kind:'booking',item:b})}>Manage ↗</button></td></tr>)}</tbody></table></div>{!visible.length&&<div className="crm-empty"><strong>{loading&&!hasLoaded?'Loading records…':!hasLoaded?'No data available':'No matching records'}</strong><p>{hasLoaded?'Try changing your search or filters.':'Refresh to retrieve your CRM records.'}</p></div>}<div className="crm-pagination" aria-label="Record pages"><span>{rows.length?(currentPage-1)*10+1:0}–{Math.min(currentPage*10,rows.length)} of {rows.length} records</span><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</button><button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Next</button></div></section>}
 {(dialog||selectedCleaner||draft)&&<div className="crm-overlay" onClick={close}><section className="crm-drawer" role="dialog" aria-modal="true" aria-label="Record details" onClick={e=>e.stopPropagation()}><button className="crm-close" onClick={close} aria-label="Close">×</button>{dialog?.kind==='booking'&&(()=>{const b=records.bookings.find(x=>x.id===dialog.item.id)||dialog.item;return <><small>BOOKING DETAILS</small><h2>{b.customer_name}</h2><p>{b.booking_code} · {fmt(b.estimated_total)}</p><p>{b.service} · {b.service_date} {b.service_time} · {b.hours}h</p><p>{b.address}</p><p>{b.customer_email} · {b.customer_phone}</p><label>Booking status<select disabled value={b.status||'pending'} onChange={e=>change(`bookings/${b.id}`,{status:e.target.value})}>{statuses.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><label>Payment status<select disabled value={b.crm_payment_status||'unpaid'} onChange={e=>change(`bookings/${b.id}`,{paymentStatus:e.target.value})}>{payments.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><p>Labels: {(b.crm_tags||[]).join(', ')||'None'}</p><div className="crm-actions"><button onClick={()=>tags('bookings',b)}>Edit labels</button>{b.crm_tags?.includes('test')&&<button disabled={busy} onClick={()=>deleteTest('bookings',b)}>Delete test record</button>}<button disabled={!b.stripe_paid} onClick={()=>assign(b)}>Assign cleaner</button>{b.crm_assigned_cleaner_id&&<button onClick={()=>assignmentEmail(b)}>Assignment email</button>}<button onClick={()=>{setDialog(null);offer(b)}}>Create WhatsApp offer</button><button onClick={()=>{setDialog(null);email(b)}}>Booking email</button></div></>})()}{dialog&&dialog.kind!=='booking'&&<form onSubmit={submitDialog}><h2>{dialog.kind==='tags'?'Edit labels':'Assign cleaner'}</h2>{dialog.kind==='tags'?<label>Comma-separated labels<input value={value} onChange={e=>setValue(e.target.value)}/></label>:<label>Eligible cleaner<select required value={value} onChange={e=>setValue(e.target.value)}><option value="">Select cleaner</option>{eligible.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.cleaner_code}</option>)}</select></label>}<button className="crm-primary" disabled={busy}>{busy?'Saving…':'Save changes'}</button></form>}{selectedCleaner&&!dialog&&<><small>APPLICANT PROFILE</small><h2>{selectedCleaner.first_name} {selectedCleaner.last_name}</h2>{cleanerPhoto?<img className="crm-profile-photo" src={cleanerPhoto} alt="Applicant profile"/>:<p>{selectedCleaner.profile_photo_path?'Private photo unavailable or loading…':'No photo submitted'}</p>}{badge(selectedCleaner.verification_status)}{[['Cleaner ID',selectedCleaner.cleaner_code],['Email',selectedCleaner.email],['Phone',selectedCleaner.phone],['Location',selectedCleaner.city],['Specialty',selectedCleaner.specialty],['Experience',selectedCleaner.years_experience+' years'],['Applied',selectedCleaner.created_at],['Account',selectedCleaner.auth_user_id?'Registered':'Not registered'],['Labels',(selectedCleaner.crm_tags||[]).join(', ')||'None']].map(([k,v])=><div className="crm-insight" key={k}><span>{k}</span><b>{v||'—'}</b></div>)}<h3>Cleaning equipment &amp; supplies</h3><p>{Array.isArray(selectedCleaner.equipment)?(selectedCleaner.equipment.join(', ')||'No equipment selected'):'Not collected on this application'}</p>{selectedCleaner.equipment_other&&<p>Other: {selectedCleaner.equipment_other}</p>}<p className="crm-note">A photograph alone does not verify identity. Complete appropriate verification before approving.</p><div className="crm-actions"><button onClick={()=>tags('cleaners',selectedCleaner)}>Edit labels</button>{selectedCleaner.crm_tags?.includes('test')&&<button disabled={busy} onClick={()=>deleteTest('cleaners',selectedCleaner)}>Delete test record</button>}<button disabled={!selectedCleaner.profile_photo_path} onClick={()=>reviewCleaner('approved')}>Approve</button><button onClick={()=>reviewCleaner('rejected')}>Reject</button><button onClick={()=>reviewCleaner('pending')}>Return to pending</button>{selectedCleaner.verification_status==='approved'&&<button onClick={inviteCleaner}>Create account invitation</button>}</div></>}{draft&&<><h2>{draft.link?'Share job offer':'Prepare email'}</h2><p>{draft.link?'Expires: '+new Date(draft.expiresAt).toLocaleString():'To: '+draft.recipient}</p>{!draft.link&&<p>Subject: {draft.subject}</p>}{draft.photo&&<img src={draft.photo} alt="Assigned cleaner" width="100"/>}<textarea readOnly rows={10} value={draft.message}/><div className="crm-actions">{draft.link?<><button onClick={async()=>{try{await navigator.clipboard.writeText(draft.message);setMessage('Message copied.')}catch{setMessage('Unable to copy; select the message manually.')}}}>Copy message</button><a href={'https://wa.me/?text='+encodeURIComponent(draft.message)} target="_blank" rel="noreferrer">Open WhatsApp</a></>:<a href={`mailto:${encodeURIComponent(draft.recipient)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.message)}`}>Open email app</a>}</div><p>Review and send manually.</p></>}{message&&<p role="status">{message}</p>}</section></div>}
 <footer className="crm-footnote">CleanSure CRM · Showing up to 500 recent bookings and cleaners. Payment statuses are not verified Stripe transactions.</footer></main></div>;
}

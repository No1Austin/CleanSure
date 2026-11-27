import {useCallback,useEffect,useState} from 'react';
import './work-accounting.css';
const cad=n=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(n||0));
const today=()=>new Date().toLocaleDateString('en-CA');
const firstOfMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`};
export default function CleanerWorkDashboard({token,onExpired,requestToken}){
 const [from,setFrom]=useState(firstOfMonth);const [to,setTo]=useState(today);
 const [info,setInfo]=useState(null);const [error,setError]=useState('');const [loading,setLoading]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   let t=token;
   let response=await fetch(`/api/accounting/cleaner/me?from=${from}&to=${to}`,{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});
   if(response.status===401&&requestToken){t=await requestToken();if(t)response=await fetch(`/api/accounting/cleaner/me?from=${from}&to=${to}`,{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});}
   if(response.status===401){onExpired?.();return;}
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(json.error||`HTTP ${response.status}`);
   setInfo(json);
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[token,from,to,onExpired,requestToken]);
 useEffect(()=>{if(token)load()},[token,load]);
 const totals=info?.totals;
 return <section className="work-section" aria-label="My work and earnings">
  <div className="work-heading"><div><h2>Pay summary</h2></div><button className="work-button" onClick={load} disabled={loading}>{loading?'Loading…':'Refresh'}</button></div>
  <div className="work-filters"><label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To <input type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
  {error&&<p className="work-error" role="alert">{error}</p>}
  <div className="work-metrics"><article className="cs-pay-hero"><small>Unpaid earnings · selected period</small><strong>{totals?cad(totals.cleanerUnpaid):'—'}</strong><span>Recorded compensation awaiting payout</span></article><article><small>Completed work earnings</small><strong>{totals?cad(totals.cleanerEarned):'—'}</strong></article><article><small>Paid to me</small><strong>{totals?cad(totals.cleanerPaid):'—'}</strong></article><article><small>Approved hours</small><strong>{totals?`${totals.hoursWorked} h`:'—'}</strong></article><article><small>Completed jobs</small><strong>{totals?.completedJobs??'—'}</strong></article></div>
  <h3>Work & payout history</h3>
  {Boolean(info?.records?.length)&&<div className="work-table-wrap"><table className="work-table"><thead><tr><th>Date</th><th>Booking</th><th>Status</th><th>Hours</th><th>Compensation</th><th>Earned</th><th>Payout</th></tr></thead><tbody>{info?.records?.map(r=><tr key={r.id}><td data-label="Date">{r.work_date}</td><td data-label="Booking">{r.booking?.booking_code||'Booking'}<small>{r.booking?.service||''}</small></td><td data-label="Status">{r.work_status}</td><td data-label="Hours">{r.approved_hours} / {r.scheduled_hours}</td><td data-label="Compensation">{r.compensation_mode==='hourly'?`${cad(r.hourly_rate_cents/100)}/hr`:'Agreed compensation'}</td><td data-label="Earned">{cad(r.cleaner_earned)}</td><td data-label="Payout">{r.cleaner_payout_status}</td></tr>)}</tbody></table></div>}
  {info&&!info.records.length&&<p className="work-empty">No work or payout records for these dates.</p>}
  <p className="work-note">Recorded earnings and payouts are not bank confirmations. Contact support for discrepancies.</p>
 </section>;
}

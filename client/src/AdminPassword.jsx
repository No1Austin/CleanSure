import {useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
const portal='/?adminPortal=1';
let recoveryPromise;
export default function AdminPassword({mode,onClose,token}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[client,setClient]=useState(null),[show,setShow]=useState(false);
 useEffect(()=>{
  if(mode!=='reset')return;
  let active=true;
  setBusy(true);
  if(!recoveryPromise) recoveryPromise=(async()=>{
   const auth=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'cleansure-admin-recovery'}});
   const hash=new URLSearchParams(location.hash.slice(1));
   history.replaceState(null,'',portal+'&adminResetPassword=1');
   if(hash.get('type')!=='recovery'||!hash.get('access_token')||!hash.get('refresh_token'))throw Error('Invalid link');
   const {data,error}=await auth.auth.setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')});if(error)throw error;
   const r=await fetch('/api/cleaner-account/admin/recovery-check',{headers:{Authorization:'Bearer '+data.session.access_token}});if(!r.ok)throw Error('Administrator access could not be verified.');return auth;
  })();
  recoveryPromise.then(auth=>{if(active)setClient(auth);}).catch(()=>{if(active)setMessage('Invalid or expired administrator link. Request a new email.');}).finally(()=>{if(active)setBusy(false);});
  return ()=>{active=false;};
 },[mode]);
 async function submit(e){e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);try{
  if(mode==='reset'){
   const password=f.get('password');if(!client||password.length<12||password!==f.get('confirm'))throw Error('Use matching passwords of at least 12 characters.');
   const {error}=await client.auth.updateUser({password});if(error)throw error;
   await client.auth.signOut({scope:'global'});sessionStorage.removeItem('cleansureAdminAccessToken');sessionStorage.removeItem('cleansureCrmLastGoodOverviewV1');setClient(null);setMessage('Password updated. Return to sign in.');
  }else{
   const r=await fetch('/api/cleaner-account/admin/'+(mode==='send'?'send-setup':'forgot-password'),{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({email:f.get('email')})});
   if(!r.ok)throw Error('Unable to request email. Try again later or contact support.');setMessage('If the eligible account exists, a password email has been requested. Check inbox and spam.');
  }
 }catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <div className="crm-login" style={{position:'fixed',inset:0,zIndex:9999,overflow:'auto'}}><form className="crm-login-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="admin-password-title"><h1 id="admin-password-title">{mode==='reset'?'Create your password':mode==='send'?'Send administrator password email':'Forgot password?'}</h1>{mode==='reset'?<><label>New password<input name="password" type={show?'text':'password'} minLength={12} maxLength={128} autoComplete="new-password" required disabled={!client}/></label><label>Confirm password<input name="confirm" type={show?'text':'password'} minLength={12} maxLength={128} autoComplete="new-password" required disabled={!client}/></label><button type="button" onClick={()=>setShow(!show)}>{show?'Hide':'Show'} passwords</button></>:<label>Administrator email<input name="email" type="email" required autoComplete="email"/></label>}<button className="crm-primary" disabled={busy||(mode==='reset'&&!client)}>{busy?'Please wait…':mode==='reset'?'Save password':'Send secure link'}</button><p role="status">{message}</p><button type="button" onClick={onClose}>{mode==='send'?'Close':'Back to sign in'}</button></form></div>;
}

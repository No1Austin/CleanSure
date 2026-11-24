import CleanerWorkDashboard from './CleanerWorkDashboard.jsx';
import CrmDashboard from './CrmDashboard.jsx';
import { createClient } from '@supabase/supabase-js';
import JobOfferPage from './JobOfferPage.jsx';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Menu, X, ShieldCheck, Sparkles, Clock3, House, Building2, KeyRound, Star, CheckCircle2, Phone } from 'lucide-react';
import './index.css';
import './cleaner-onboarding.css';
const recoveryClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    storageKey: 'cleansure-cleaner-recovery' } }
);
const services = [
  { icon: House, title: 'Residential Cleaning', text: 'Reliable, detailed cleaning that keeps your home feeling fresh.' },
  { icon: Sparkles, title: 'Deep Cleaning', text: 'Extra attention to the spaces that need a thorough refresh.' },
  { icon: KeyRound, title: 'Move-In & Move-Out', text: 'A fresh start for your next home or the next occupant.' },
  { icon: Building2, title: 'Commercial Cleaning', text: 'Professional cleaning solutions for workplaces and offices.' },
];
export default function App() {
 const [menuOpen, setMenuOpen] = useState(false);
 const [step,setStep] = useState(0);
 const [booking,setBooking] = useState({service:'residential',property:'house',address:'',bedrooms:'2',bathrooms:'1',date:'',time:'09:00',hours:'3',cleaners:'1',pets:'no',supplies:'customer',notes:'',name:'',email:'',phone:''});
 const [bookingResult,setBookingResult] = useState('');
 const [bookingBusy,setBookingBusy] = useState(false);
 const [bookingSuccess,setBookingSuccess] = useState(null);
 const [priceModalOpen,setPriceModalOpen] = useState(false);
 const [priceAccepted,setPriceAccepted] = useState(false);
 const [acceptedQuoteKey,setAcceptedQuoteKey] = useState('');
 const quoteKey = `${booking.supplies}:${booking.hours}:${booking.cleaners}`;
 const rate = booking.supplies === 'company' ? 35 : 30;
 const subtotal = rate * Number(booking.hours) * Number(booking.cleaners);
 const hst = Math.round(subtotal * 13) / 100;
 const total = subtotal + hst;
 const cad = n => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
 const priceIsAccepted = priceAccepted && acceptedQuoteKey === quoteKey;
 const [photos,setPhotos] = useState([]);
 const [photoError,setPhotoError] = useState('');
 const choosePhotos=(e)=>{const incoming=Array.from(e.target.files||[]);e.target.value='';const combined=[...photos,...incoming];if(combined.length>5){setPhotoError('Choose up to 5 photos.');return;}if(combined.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024)){setPhotoError('Only JPG, PNG or WebP files up to 5 MB each are accepted.');return;}setPhotoError('');setPhotos(combined);};
 const [joinOpen,setJoinOpen] = useState(false);
 const [joinResult,setJoinResult] = useState('');
 const [joinBusy,setJoinBusy] = useState(false);
 const update=(e)=>{const {name,value}=e.target;setBooking(p=>({...p,[name]:value}));if(['supplies','hours','cleaners'].includes(name)){setPriceAccepted(false);setAcceptedQuoteKey('');}};
 const field=(label,name,type='text',opts=null)=> <label className="form-field">{label}{opts?<select name={name} value={booking[name]} onChange={update} required>{opts.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>:<input name={name} type={type} value={booking[name]} onChange={update} required min={type==='date'?new Date().toLocaleDateString('en-CA'):undefined}/>}</label>;
 const sendBooking=async(e)=>{
  e.preventDefault();
  if(bookingBusy || bookingSuccess) return;
  if(!priceIsAccepted){setBookingResult('Please accept the estimated price before submitting.');setPriceModalOpen(true);return;}
  setBookingBusy(true);
  setBookingResult('');
  try {
   const form=new FormData();
   Object.entries(booking).forEach(([key,value])=>form.append(key,value));
   form.append('quoteAccepted','true');
   photos.forEach(file=>form.append('photos',file));
   const response=await fetch('/api/bookings',{method:'POST',body:form});
   const data=await response.json();
   if(!response.ok) throw new Error(data.error||'Unable to submit booking');
   setBookingSuccess({
    code:data.bookingCode||'Pending',
    photoCount:data.photoCount??photos.length,
    total:data.estimate?.total??total
   });
   // Keep selected files until the confirmation is displayed; they are no longer editable.
  } catch(err) {
   setBookingResult(`Booking not submitted: ${err.message}`);
  } finally {
   setBookingBusy(false);
  }
 };
 const startNewBooking=()=>{
  setBookingSuccess(null);
  setBookingResult('');
  setPhotos([]);
  setPhotoError('');
  setStep(0);
  setPriceAccepted(false);
  setAcceptedQuoteKey('');
  setBooking({service:'residential',property:'house',address:'',bedrooms:'2',bathrooms:'1',date:'',time:'09:00',hours:'3',cleaners:'1',pets:'no',supplies:'customer',notes:'',name:'',email:'',phone:''});
 };
 const sendJoin=async(e)=>{
  e.preventDefault();
  if(joinBusy)return;
  const formElement=e.currentTarget;
  setJoinBusy(true);setJoinResult('');
  try{
   const form=new FormData(formElement);
   form.set('consent',formElement.elements.namedItem('consent').checked?'true':'false');
   form.set('termsAccepted',formElement.elements.namedItem('termsAccepted').checked?'true':'false');
   const response=await fetch('/api/cleaner-applications',{method:'POST',body:form});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Unable to submit application');
   setJoinResult('Application received! CleanSure will review your application. Please check your email for registration details when our team contacts you. If we are hiring, an admin may call you.');formElement.reset();
  }catch(error){setJoinResult(`Application not submitted: ${error.message}`);}
  finally{setJoinBusy(false);}
 };
 if (new URLSearchParams(window.location.search).has('adminPortal')) return <CrmDashboard/>;
 if (new URLSearchParams(window.location.search).has('jobOffer')) return <JobOfferPage/>;
 if (new URLSearchParams(window.location.search).has('cleanerInvite') || new URLSearchParams(window.location.search).has('cleanerPortal')) return <CleanerPortal/>;
 return <>
  <header className="site-header"><div className="container nav">
    <a href="#home" className="brand" aria-label="CleanSure home">Clean<span>Sure</span></a>
    <button className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X/>:<Menu/>}</button>
    <nav className={menuOpen?'nav-links open':'nav-links'} aria-label="Main navigation" onClick={()=>setMenuOpen(false)}><a href="#services">Our Services</a><a href="#why-us">Why CleanSure</a><a href="#team">Join Our Team</a><a href="/?cleanerPortal=1">Cleaner Login</a><a href="mailto:hello@cleansure.example" className="nav-contact" onClick={e=>e.preventDefault()}>Contact Coming Soon</a><a className="button button-small" href="#booking">Book Cleaning <ArrowRight size={17}/></a></nav>
  </div></header>
  <main id="home">
    <section className="hero" aria-labelledby="hero-title"><div className="hero-photo" role="img" aria-label="Two smiling CleanSure cleaning professionals wearing protective equipment"/><div className="hero-shade"/><div className="container hero-content"><span className="eyebrow light">A CLEANER SPACE. A BETTER DAY.</span><h1 id="hero-title">Professional cleaning.<br/><em>Peace of mind.</em></h1><p>Enjoy a fresher home or workspace with dependable cleaning professionals and a simple booking experience.</p><div className="hero-actions"><a className="button button-light" href="#booking">Book a Cleaning <ArrowRight size={19}/></a><a className="button button-outline" href="#services">Explore Services</a></div><div className="hero-trust"><span><ShieldCheck size={19}/> Safety-minded service</span><span><Clock3 size={19}/> Convenient scheduling</span></div></div></section>
    <section className="intro"><div className="container intro-inner"><span><Star size={18} fill="currentColor"/> Thoughtful service</span><span><ShieldCheck size={19}/> Cleaner identity verification planned</span><span><CheckCircle2 size={19}/> Easy online booking</span></div></section>
    <section className="section" id="services"><div className="container"><div className="section-head"><div><span className="eyebrow">WHAT WE DO</span><h2>Cleaning for every kind of space.</h2></div><p>From routine upkeep to a complete refresh, choose the service that fits your space and schedule.</p></div><div className="service-grid">{services.map(({icon:Icon,title,text})=><article className="service-card" key={title}><span className="service-icon"><Icon size={27}/></span><h3>{title}</h3><p>{text}</p><a href="#booking" onClick={()=>setBooking(p=>({...p,service:title.includes("Deep")?"deep":title.includes("Move")?"move":title.includes("Commercial")?"commercial":"residential"}))}>Book this service <ArrowRight size={17}/></a></article>)}</div></div></section>
    <section className="section why" id="why-us"><div className="container why-layout"><div><span className="eyebrow">THE CLEANSURE DIFFERENCE</span><h2>More than clean.<br/>Confidence in every visit.</h2><p>We’re designing a straightforward cleaning experience with clear service details, reliable communication, and customer-focused support.</p><a className="button" href="#booking">Get Started <ArrowRight size={18}/></a></div><div className="why-list"><div><ShieldCheck/><div><h3>Trust comes first</h3><p>Our planned cleaner verification process helps customers know who is arriving.</p></div></div><div><Clock3/><div><h3>Designed around your schedule</h3><p>Choose a preferred date, time, and service duration.</p></div></div><div><Sparkles/><div><h3>Attention to the details</h3><p>Share your cleaning needs, pets, product preferences, and special instructions.</p></div></div></div></div></section>
    <section className="section booking-section" id="booking"><div className="container booking-layout"><div className="booking-aside"><span className="eyebrow">BOOK WITH CONFIDENCE</span><h2>Let's make your space shine.</h2><p>Tell us what you need in four simple steps. We'll confirm availability and pricing before any payment.</p><div className="booking-aside-image" aria-label="CleanSure cleaning team"/></div><div className="booking-card"><div className="booking-progress-label">Step {step+1} of 4 · {['Your space','Schedule','Contact','Review'][step]}</div><div className="booking-track"><div style={{width:`${(step+1)*25}%`}}/></div>{bookingSuccess ? <div className="booking-success" role="status" aria-live="polite"><CheckCircle2 size={46} aria-hidden="true"/><h3>Booking request received!</h3><p>Your cleaning request has been submitted successfully.</p><p><strong>Reference: {bookingSuccess.code}</strong></p><p><strong>Estimated total: {cad(bookingSuccess.total)}</strong> including HST</p><p>{bookingSuccess.photoCount} {bookingSuccess.photoCount===1?'photo':'photos'} attached</p><p>We’ll contact you to confirm availability and your appointment. No payment has been collected.</p><button className="button" type="button" onClick={startNewBooking}>Start another booking</button></div> : <><h3>{['Tell us about your space','Choose your schedule','How can we reach you?','Review your request'][step]}</h3><form onSubmit={sendBooking}>
    <div className="booking-fields" hidden={step!==0}>{field('Cleaning service','service','text',[['residential','Residential cleaning'],['deep','Deep cleaning'],['move','Move-in / move-out'],['commercial','Commercial cleaning'],['other','Other']])}{field('Property type','property','text',[['house','House'],['apartment','Apartment / condo'],['office','Office / business'],['other','Other']])}{field('Service address','address')}{field('Bedrooms','bedrooms','text',[['0','Studio / none'],['1','1'],['2','2'],['3','3'],['4','4'],['5','5+']])}{field('Bathrooms','bathrooms','text',[['1','1'],['2','2'],['3','3'],['4','4+']])}</div>
    <div className="booking-photo-panel" hidden={step!==0}><label className="form-field full" htmlFor="property-photos">Upload a few pictures of the rooms or places to be cleaned</label><p className="form-note">Add up to 5 photos (JPG, PNG or WebP, maximum 5 MB each). Please avoid people, documents and sensitive details.</p><input id="property-photos" className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choosePhotos} aria-describedby="photo-help"/><p id="photo-help" className="form-note">Photos are shared only with authorized CleanSure staff for booking coordination.</p>{photoError&&<p className="form-status" role="alert">{photoError}</p>}<p className="form-note" aria-live="polite">{photos.length} {photos.length===1?'photo':'photos'} selected</p><div className="photo-preview-grid">{photos.map((file,i)=><PhotoPreview key={`${file.name}-${file.lastModified}-${i}`} file={file} onRemove={()=>setPhotos(prev=>prev.filter((_,j)=>j!==i))}/>)}</div></div>
     <div className="booking-fields" hidden={step!==1}>{field('Preferred date','date','date')}{field('Preferred time','time','time')}{field('Estimated hours','hours','text',[['2','2 hours'],['3','3 hours'],['4','4 hours'],['5','5 hours'],['6','6 hours'],['8','8 hours']])}{field('Number of cleaners','cleaners','text',[['1','1'],['2','2'],['3','3'],['4','4']])}{field('Pets present?','pets','text',[['no','No'],['yes','Yes']])}{field('Cleaning materials','supplies','text',[['customer','I will provide'],['company','CleanSure should bring supplies']])}<label className="form-field full">Allergies, sensitivities or special instructions<textarea name="notes" rows="3" value={booking.notes} onChange={update}/></label></div>
    <div className="booking-fields" hidden={step!==2}>{field('Full name','name')}{field('Email address','email','email')}{field('Phone number','phone','tel')}<p className="form-note full">Your contact details will be used only to coordinate your request.</p></div>
    {step===3&&<div className="booking-review">{[['Service',booking.service],['Address',booking.address],['Date and time',`${booking.date} at ${booking.time}`],['Duration',`${booking.hours} hours · ${booking.cleaners} cleaner(s)`],['Supplies',booking.supplies==='company'?'CleanSure provides':'Customer provides'],['Customer',booking.name],['Email',booking.email],['Phone',booking.phone],['Property photos',`${photos.length} ${photos.length===1?'photo':'photos'} attached`]].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}<div className="review-price"><div><span>Hourly rate per cleaner</span><strong>{cad(rate)}</strong></div><div><span>Subtotal ({booking.cleaners} cleaner(s) × {booking.hours} hours)</span><strong>{cad(subtotal)}</strong></div><div><span>HST (13%)</span><strong>{cad(hst)}</strong></div><div className="review-total"><span>Estimated total</span><strong>{cad(total)}</strong></div><p className="form-note">Estimate accepted. No payment is collected now. Availability and any changes to the scope or price require confirmation.</p></div></div>}
    <div className="booking-actions">{step>0&&<button className="button button-secondary" type="button" onClick={()=>setStep(step-1)}>Back</button>}{step<3?<button className="button" type="button" onClick={()=>{const required=step===0?['address']:step===1?['date','time']:['name','email','phone'];if(required.some(k=>!booking[k].trim())){setBookingResult('Please complete the required fields before continuing.');return}if(step===2&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)){setBookingResult('Enter a valid email address.');return}setBookingResult('');if(step===1&&!priceIsAccepted){setPriceModalOpen(true);return;}setStep(step+1)}}>Continue <ArrowRight size={18}/></button>:<button className="button" type="submit" disabled={bookingBusy}>{bookingBusy?'Sending…':'Send booking request'} <ArrowRight size={18}/></button>}</div>{bookingResult&&<p className="form-status" role="alert">{bookingResult}</p>}</form></>}</div></div></section>

    {priceModalOpen&&<div className="price-modal-backdrop" role="presentation"><section className="price-modal" role="dialog" aria-modal="true" aria-labelledby="price-title"><h2 id="price-title">Your estimated cleaning price</h2><p>Based on {booking.cleaners} cleaner(s), {booking.hours} hours, and {booking.supplies==='company'?'CleanSure-provided':'customer-provided'} cleaning supplies.</p><div className="price-line"><span>Rate per cleaner per hour</span><strong>{cad(rate)}</strong></div><div className="price-line"><span>Subtotal</span><strong>{cad(subtotal)}</strong></div><div className="price-line"><span>Ontario HST (13%)</span><strong>{cad(hst)}</strong></div><div className="price-line price-total"><span>Estimated total</span><strong>{cad(total)}</strong></div><p className="form-note">This is an estimate, not a payment request. We will confirm availability and any price changes with you before proceeding.</p><label className="price-accept"><input type="checkbox" checked={priceAccepted&&acceptedQuoteKey===quoteKey} onChange={e=>{setPriceAccepted(e.target.checked);setAcceptedQuoteKey(e.target.checked?quoteKey:'');}}/> I understand and accept this estimated price including HST.</label><div className="price-modal-actions"><button type="button" className="button button-secondary" onClick={()=>setPriceModalOpen(false)}>Go back</button><button type="button" className="button" disabled={!priceIsAccepted} onClick={()=>{setPriceModalOpen(false);setStep(p=>Math.max(p,2));}}>Accept and continue</button></div></section></div>}
    <section className="section team" id="team"><div className="container team-inner"><div><span className="eyebrow">WORK WITH US</span><h2>Great cleaners make great experiences.</h2><p>Join a team focused on quality, reliability, and care.</p></div><button className="button" onClick={()=>setJoinOpen(true)}>Apply to join <ArrowRight size={18}/></button></div></section>
    {joinOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setJoinOpen(false)}}><section className="join-modal" role="dialog" aria-modal="true" aria-labelledby="join-title"><button className="modal-x" onClick={()=>setJoinOpen(false)} aria-label="Close application"><X/></button><h2 id="join-title">Join CleanSure</h2><p>Tell us about your cleaning experience.</p><form className="join-form" onSubmit={sendJoin}><label>Full name<input name="name" autoComplete="name" maxLength="160" required/></label><label>Email<input type="email" name="email" autoComplete="email" required/></label><label>Phone number<input type="tel" name="phone" autoComplete="tel" minLength="7" required/></label><label>City / location<input name="location" autoComplete="address-level2" required/></label><label>Years of cleaning experience<input type="number" min="0" max="60" name="experience" required/></label><label>Preferred service<select name="specialty"><option>Residential cleaning</option><option>Deep cleaning</option><option>Move-in / move-out</option><option>Commercial cleaning</option></select></label><label>Profile photo (optional)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"/><span className="form-note">JPG, PNG or WebP, up to 3 MB. Your photo is private and reviewed by CleanSure staff.</span></label><div className="join-disclosures"><strong>Application terms</strong><p>Submitting an application does not guarantee approval, employment, or cleaning assignments. CleanSure reviews applications before permitting job acceptance. Applicants must provide accurate information and complete any required identity verification through an approved secure process before receiving assignments.</p><strong>Applicant privacy notice</strong><p>CleanSure collects your name, contact details, city, cleaning experience, service preference, and optional profile photo to assess your application and contact you about onboarding. Access should be limited to authorized staff. Do not submit government ID documents in this form. For privacy questions or requests, contact CleanSure through its published support channel.</p></div><label className="join-consent"><input type="checkbox" name="consent" required/> I consent to the collection and use of my application information as described in the applicant privacy notice.</label><label className="join-consent"><input type="checkbox" name="termsAccepted" required/> I have read and accept the application terms above.</label><p className="form-note">Identity verification and secure cleaner login will be introduced during onboarding. Do not upload government identity documents here.</p><button className="button" type="submit" disabled={joinBusy}>{joinBusy?'Submitting…':'Submit application'}</button>{joinResult&&<p role="status" className="form-status">{joinResult}</p>}</form></section></div>}
  </main>
  <footer><div className="container footer-inner"><a href="#home" className="brand">Clean<span>Sure</span></a><p>Clean Homes. Trusted Hands.</p><small>© {new Date().getFullYear()} CleanSure. All rights reserved.</small></div></footer>
 </>;
}

function PhotoPreview({file,onRemove}) {
 const [url,setUrl]=useState('');
 ReactUsePhotoURL(file,setUrl);
 return <div className="photo-preview"><img src={url||undefined} alt={`Selected property photo: ${file.name}`}/><button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>Remove</button></div>;
}
function ReactUsePhotoURL(file,setUrl){
 // Hook is called consistently for each preview.
 useEffect(()=>{const url=URL.createObjectURL(file);setUrl(url);return ()=>URL.revokeObjectURL(url);},[file,setUrl]);
}

function CleanerPortal(){
 const params=new URLSearchParams(window.location.search);
 const invitation=params.get('cleanerInvite');
 const admin=false; // Admin CRM has its own portal and independent session.
 const [token,setToken]=useState(()=>localStorage.getItem('cleansureCleanerAccessToken')||sessionStorage.getItem('cleansureCleanerAccessToken')||'');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [data,setData]=useState(null);
 const [tab,setTab]=useState('applications');
 const [draft,setDraft]=useState(null);
 const [recoveryMode,setRecoveryMode]=useState('login');
 const [recoveryReady,setRecoveryReady]=useState(false);
 useEffect(()=>{
  const query=new URLSearchParams(window.location.search);
  const recoveryLink=query.has('cleanerResetPassword') ||
    window.location.hash.includes('type=recovery');
  if(!recoveryLink)return;
  setRecoveryMode('change');
  const {data:{subscription}}=recoveryClient.auth.onAuthStateChange((event,session)=>{
   if(event==='PASSWORD_RECOVERY' && session)setRecoveryReady(true);
  });
  recoveryClient.auth.getSession().then(({data:{session}})=>{
   if(session)setRecoveryReady(true);
  });
  return ()=>subscription.unsubscribe();
 },[]);
 async function sendPasswordReset(e){
  e.preventDefault();setBusy(true);setMessage('');
  try{
   const email=new FormData(e.currentTarget).get('email');
   const redirectTo=window.location.origin+'/?cleanerPortal=1&cleanerResetPassword=1';
   const {error}=await recoveryClient.auth.resetPasswordForEmail(email,{redirectTo});
   if(error)throw error;
   setMessage('If this email has an account, a password reset link will be sent. Check your inbox and spam folder.');
  }catch(err){setMessage(err.message)}finally{setBusy(false)}
 }
 async function changePassword(e){
  e.preventDefault();setBusy(true);setMessage('');
  const form=new FormData(e.currentTarget);
  const password=String(form.get('password')||'');
  if(password.length<12||password!==form.get('confirmPassword')){
   setMessage('Passwords must match and contain at least 12 characters.');setBusy(false);return;
  }
  try{
   if(!recoveryReady)throw new Error('Open the valid password reset link from your email first.');
   const {error}=await recoveryClient.auth.updateUser({password});
   if(error)throw error;
   await recoveryClient.auth.signOut();
   setRecoveryReady(false);setRecoveryMode('login');
   window.history.replaceState({},'', '/?cleanerPortal=1');
   setMessage('Password changed successfully. Sign in using your new password.');
  }catch(err){setMessage(err.message)}finally{setBusy(false)}
 }
 async function request(path,body,accessToken){
  const r=await fetch('/api/cleaner-account/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(accessToken?{Authorization:'Bearer '+accessToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const contentType=r.headers.get('content-type')||'';
  if(!contentType.includes('application/json'))throw new Error('Server returned a non-JSON response. Check API routes.');
  const result=await r.json();if(!r.ok)throw new Error(result.error||'Request failed');return result;
 }
 const clearCleanerSession=useCallback(()=>{localStorage.removeItem('cleansureCleanerAccessToken');localStorage.removeItem('cleansureCleanerRefreshToken');sessionStorage.removeItem('cleansureCleanerAccessToken');setToken('');setData(null);},[]);
 const refreshCleanerToken=useCallback(async()=>{
  const refreshToken=localStorage.getItem('cleansureCleanerRefreshToken');
  if(!refreshToken)return null;
  try{
   const r=await fetch('/api/cleaner-account/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Session expired');
   localStorage.setItem('cleansureCleanerAccessToken',d.accessToken);
   localStorage.setItem('cleansureCleanerRefreshToken',d.refreshToken);
   setToken(d.accessToken);return d.accessToken;
  }catch{clearCleanerSession();return null;}
 },[clearCleanerSession]);
 useEffect(()=>{
  if(!token||invitation)return;
  let cancelled=false;
  (async()=>{
   try{
    let t=token;
    let response=await fetch('/api/cleaner-account/me',{headers:{Authorization:'Bearer '+t},cache:'no-store'});
    if(response.status===401){t=await refreshCleanerToken();if(!t)return;response=await fetch('/api/cleaner-account/me',{headers:{Authorization:'Bearer '+t},cache:'no-store'});}
    const result=await response.json().catch(()=>({}));
    if(!response.ok){if(response.status===401||response.status===403)clearCleanerSession();else if(!cancelled)setMessage(result.error||'Unable to restore session');return;}
    if(!cancelled)setData(result);
   }catch(e){if(!cancelled)setMessage(e.message)}
  })();
  return ()=>{cancelled=true};
 },[token,invitation,refreshCleanerToken,clearCleanerSession]);
 async function loadAdmin(accessToken){
  const [a,b]=await Promise.all([request('admin/applications',null,accessToken),request('admin/bookings',null,accessToken)]);
  setData({...a,...b});
 }
 async function submit(e){e.preventDefault();setBusy(true);setMessage('');const form=new FormData(e.currentTarget);try{
  if(invitation){await request('register',{token:invitation,cleanerId:String(form.get('cleanerId')).toUpperCase().trim(),password:form.get('password')});setMessage('Account created. Select Cleaner Login to sign in.');}
  else {const r=await request('login',{email:form.get('email'),password:form.get('password')});localStorage.setItem('cleansureCleanerAccessToken',r.accessToken);if(r.refreshToken)localStorage.setItem('cleansureCleanerRefreshToken',r.refreshToken);sessionStorage.removeItem('cleansureCleanerAccessToken');setToken(r.accessToken);if(admin)await loadAdmin(r.accessToken);else setData(await request('me',null,r.accessToken));}
 }catch(err){setMessage(err.message)}finally{setBusy(false)}}
 async function refresh(){try{if(admin)await loadAdmin(token);else setData(await request('me',null,token));setMessage('')}catch(err){setMessage(err.message)}}
 async function makeInvite(a){setBusy(true);setMessage('');try{const d=await request(`admin/applications/${a.id}/invitation`,{},token);setDraft({kind:'application',id:a.id,...d});setMessage('New secure invitation created. Previous unused invitation links are now invalid.');}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 function makeBookingDraft(b){
  const date=b.service_date||'To be confirmed';const time=b.service_time||'To be confirmed';
  setDraft({kind:'booking',id:b.id,recipient:b.customer_email,subject:'CleanSure — Your Booking Request',body:`Hello ${b.customer_name},\n\nThank you for booking with CleanSure!\n\nBooking reference: ${b.booking_code}\nService: ${b.service}\nRequested date: ${date}\nRequested time: ${time}\nEstimated duration: ${b.hours} hour(s), ${b.cleaners} cleaner(s)\n\nWe have received your request. Availability and final pricing will be confirmed separately. No payment has been collected.\n`});
  setMessage('Booking email draft prepared. Review before sending.');
 }
 function mailto(d){return `mailto:${encodeURIComponent(d.recipient)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;}
 async function markSent(){if(!draft)return;setBusy(true);try{await request(`admin/${draft.kind==='application'?'applications':'bookings'}/${draft.id}/email-sent`,{},token);setMessage('Marked as sent based on your confirmation.');setDraft(null);await loadAdmin(token);}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <main className="cleaner-portal"><section className="cleaner-portal-card"><a className="brand" href="/">Clean<span>Sure</span></a>
 <h1>{invitation?'Create Cleaner Account':admin?'CleanSure Admin Dashboard':'Cleaner Dashboard'}</h1>
 {recoveryMode==='request' && !invitation && !admin ? <form className="join-form" onSubmit={sendPasswordReset}>
  <p>Enter the email address used for your CleanSure cleaner account. We will send a password reset link if the account exists.</p>
  <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
  <button className="button" disabled={busy}>{busy?'Please wait…':'Send reset link'}</button>
  <button type="button" className="button button-secondary" onClick={()=>{setRecoveryMode('login');setMessage('')}}>Back to login</button>
 </form> : recoveryMode==='change' && !invitation && !admin ? <form className="join-form" onSubmit={changePassword}>
  <p>{recoveryReady?'Create a new password for your cleaner account.':'Checking your password reset link…'}</p>
  <label>New password<input type="password" name="password" minLength="12" autoComplete="new-password" required /></label>
  <label>Confirm new password<input type="password" name="confirmPassword" minLength="12" autoComplete="new-password" required /></label>
  <button className="button" disabled={busy||!recoveryReady}>{busy?'Saving…':'Change password'}</button>
  {!recoveryReady&&<button type="button" className="button button-secondary" onClick={()=>setRecoveryMode('request')}>Request another link</button>}
 </form> : data ? admin ? <>
 <div className="booking-actions"><button type="button" className="button button-secondary" onClick={()=>{setTab('applications');setDraft(null)}}>Cleaner applications ({data.applications?.length||0})</button><button type="button" className="button button-secondary" onClick={()=>{setTab('bookings');setDraft(null)}}>Customer bookings ({data.bookings?.length||0})</button><button type="button" className="button button-secondary" onClick={refresh}>Refresh</button></div>
 <div className="cleaner-admin-list">{tab==='applications' ? data.applications?.map(a=><article key={a.id}><strong>{a.first_name} {a.last_name}</strong><p>{a.cleaner_code} · {a.verification_status} · {a.city}</p><p>{a.email} · {a.phone}</p><p>{a.years_experience} years · {a.specialty}</p><p>Applied: {new Date(a.created_at).toLocaleString()}</p><p>Account: {a.registered_at?'Created':'Not created'} · Account email: {a.account_email_sent_at?'Marked sent':'Not marked sent'}</p><button className="button button-secondary" type="button" disabled={busy||!!a.registered_at} onClick={()=>makeInvite(a)}>Create Account Email</button></article>) : data.bookings?.map(b=><article key={b.id}><strong>{b.customer_name} · {b.booking_code}</strong><p>{b.customer_email}</p><p>{b.service} · {b.service_date} {b.service_time}</p><p>Status: {b.status||'Requested'} · Email: {b.confirmation_email_sent_at?'Marked sent':'Not marked sent'}</p><button type="button" className="button button-secondary" onClick={()=>makeBookingDraft(b)}>Create Booking Email</button></article>)}</div>
 {draft&&<section className="cleaner-email-draft" aria-label="Email draft"><h2>Review email draft</h2><p><strong>To:</strong> {draft.recipient}</p><p><strong>Subject:</strong> {draft.subject}</p><textarea readOnly value={draft.body} rows={12} style={{width:'100%',padding:'12px'}} aria-label="Email body"/><p className="form-note">Opening the email app does not send the message. After you send it, return here and mark it as sent.</p><div className="booking-actions"><a className="button" href={mailto(draft)}>Open email app</a><button className="button button-secondary" type="button" onClick={()=>navigator.clipboard?.writeText(draft.body)}>Copy body</button><button className="button button-secondary" type="button" disabled={busy} onClick={markSent}>Mark Email Sent</button><button className="button button-secondary" type="button" onClick={()=>setDraft(null)}>Close draft</button></div></section>}
 </> : <><p>Welcome, {data.profile.first_name}.</p><p>Cleaner ID: <strong>{data.profile.cleaner_code}</strong></p><p>Application status: <strong>{data.profile.verification_status}</strong></p><p>{data.canAcceptJobs?'Your account is approved. Job matching will be available in a later phase.':'Your application is awaiting review. Job access is not available yet.'}</p><CleanerWorkDashboard token={token} requestToken={refreshCleanerToken} onExpired={clearCleanerSession}/></> : <form onSubmit={submit} className="join-form">
 {invitation?<><p>Enter the Cleaner ID from your email and create a secure password.</p><label>Cleaner ID<input name="cleanerId" placeholder="AUS567893" required pattern="[A-Za-z]{3}[0-9]{6}"/></label><label>Password (at least 12 characters)<input type="password" name="password" minLength="12" autoComplete="new-password" required/></label></>:<><label>Email<input type="email" name="email" autoComplete="username" required/></label><label>Password<input type="password" name="password" autoComplete="current-password" required/></label></>}
 <button className="button" disabled={busy}>{busy?'Please wait…':invitation?'Create account':'Sign in'}</button>
 {!invitation&&!admin&&<button type="button" className="button button-secondary" onClick={()=>{setRecoveryMode('request');setMessage('')}}>Forgot password?</button>}
 </form>}
 {message&&<p className="form-status" role="status">{message}</p>}
 {token&&!invitation&&<button className="button button-secondary" onClick={()=>{clearCleanerSession();setDraft(null)}}>Sign out</button>}
 <p><a href="/?cleanerPortal=1">Cleaner Login</a> · <a href="/">Home</a></p></section></main>
}

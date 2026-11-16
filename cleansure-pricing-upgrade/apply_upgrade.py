from pathlib import Path
import re, shutil, sys
root=Path.cwd(); app=root/'client/src/App.jsx'; css=root/'client/src/index.css'; backend=root/'server/src/routes/bookingRoutes.js'
for p in (app,css,backend):
    if not p.exists(): sys.exit(f'Missing {p}; run from cleansure-merged root')
s=app.read_text(); b=backend.read_text()
if 'const [priceModalOpen,setPriceModalOpen]' in s: sys.exit('Pricing upgrade already applied; no changes made')
if 'const [photos,setPhotos]' not in s or 'const sendBooking=async(e)=>' not in s or 'const sendJoin=async(e)=>' not in s: sys.exit('Photo upgrade not found in App.jsx. No changes made; send your current files.')
if "from 'sharp'" not in b and 'from "sharp"' not in b: sys.exit('Photo-enabled booking route not found. No changes made.')

def replace_once(src,old,new,label):
    if src.count(old)!=1: sys.exit(f'Expected one {label}; found {src.count(old)}. No changes made.')
    return src.replace(old,new,1)

s=replace_once(s," const [bookingBusy,setBookingBusy] = useState(false);",''' const [bookingBusy,setBookingBusy] = useState(false);
 const [priceModalOpen,setPriceModalOpen] = useState(false);
 const [priceAccepted,setPriceAccepted] = useState(false);
 const [acceptedQuoteKey,setAcceptedQuoteKey] = useState('');
 const quoteKey = `${booking.supplies}:${booking.hours}:${booking.cleaners}`;
 const rate = booking.supplies === 'company' ? 35 : 30;
 const subtotal = rate * Number(booking.hours) * Number(booking.cleaners);
 const hst = Math.round(subtotal * 13) / 100;
 const total = subtotal + hst;
 const cad = n => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(n);
 const priceIsAccepted = priceAccepted && acceptedQuoteKey === quoteKey;''','bookingBusy state')
s=replace_once(s," const update=(e)=>setBooking(p=>({...p,[e.target.name]:e.target.value}));",''' const update=(e)=>{const {name,value}=e.target;setBooking(p=>({...p,[name]:value}));if(['supplies','hours','cleaners'].includes(name)){setPriceAccepted(false);setAcceptedQuoteKey('');}};''','update handler')
start=s.index(' const sendBooking=async(e)=>');end=s.index('\n const sendJoin=',start)
s=s[:start]+''' const sendBooking=async(e)=>{e.preventDefault();if(!priceIsAccepted){setBookingResult('Please accept the estimated price before submitting.');setPriceModalOpen(true);return;}setBookingBusy(true);setBookingResult('');try{const form=new FormData();Object.entries(booking).forEach(([key,value])=>form.append(key,value));form.append('quoteAccepted','true');photos.forEach(file=>form.append('photos',file));const r=await fetch('/api/bookings',{method:'POST',body:form});const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to submit booking');setBookingResult(`Request received. Reference: ${data.bookingCode||'pending'}. ${data.photoCount??photos.length} photo(s) attached. Estimated total: ${cad(data.estimate?.total??total)}. We will contact you to confirm availability.`);setPhotos([]);}catch(err){setBookingResult(`Booking not submitted: ${err.message}`)}finally{setBookingBusy(false)}};'''+s[end:]
# Remove brand symbol; keep decorative icons elsewhere.
s=replace_once(s,'<span className="brand-mark"><Sparkles size={22}/></span>Clean<span>Sure</span>','Clean<span>Sure</span>','header wordmark')
# Keep photo picker visible only on step 0; fix photo count in review (no picker there).
s=replace_once(s,'<div className="booking-photo-panel">','<div className="booking-photo-panel" hidden={step!==0}>','photo panel')
s=s.replace('Property photos (optional)','Upload a few pictures of the rooms or places to be cleaned',1)
s=s.replace('Upload up to five JPG, PNG or WebP images, 5 MB each. Avoid including people, documents or other sensitive details.','Add up to 5 photos (JPG, PNG or WebP, maximum 5 MB each). Please avoid people, documents and sensitive details.',1)
# Put the actual count next to file input, not a stale browser label.
s=replace_once(s,'<div className="photo-preview-grid">','<p className="form-note" aria-live="polite">{photos.length} {photos.length===1?\'photo\':\'photos\'} selected</p><div className="photo-preview-grid">','photo count')
s=s.replace("['Property photos',`${photos.length} selected`]","['Property photos',`${photos.length} ${photos.length===1?'photo':'photos'} attached`]",1)
# Show full price breakdown on review.
review_marker='<p className="form-note">Request only. Price and availability are confirmed separately; no payment is collected here.</p>'
review_price='''<div className="review-price"><div><span>Hourly rate per cleaner</span><strong>{cad(rate)}</strong></div><div><span>Subtotal ({booking.cleaners} cleaner(s) × {booking.hours} hours)</span><strong>{cad(subtotal)}</strong></div><div><span>HST (13%)</span><strong>{cad(hst)}</strong></div><div className="review-total"><span>Estimated total</span><strong>{cad(total)}</strong></div><p className="form-note">Estimate accepted. No payment is collected now. Availability and any changes to the scope or price require confirmation.</p></div>'''
s=replace_once(s,review_marker,review_price,'review price')
# Intercept step 1 -> 2 with modal and require acceptance.
old="setBookingResult('');setStep(step+1)"
new="setBookingResult('');if(step===1&&!priceIsAccepted){setPriceModalOpen(true);return;}setStep(step+1)"
s=replace_once(s,old,new,'continue button')
# Insert modal outside form but inside component.
modal='''
    {priceModalOpen&&<div className="price-modal-backdrop" role="presentation"><section className="price-modal" role="dialog" aria-modal="true" aria-labelledby="price-title"><h2 id="price-title">Your estimated cleaning price</h2><p>Based on {booking.cleaners} cleaner(s), {booking.hours} hours, and {booking.supplies==='company'?'CleanSure-provided':'customer-provided'} cleaning supplies.</p><div className="price-line"><span>Rate per cleaner per hour</span><strong>{cad(rate)}</strong></div><div className="price-line"><span>Subtotal</span><strong>{cad(subtotal)}</strong></div><div className="price-line"><span>Ontario HST (13%)</span><strong>{cad(hst)}</strong></div><div className="price-line price-total"><span>Estimated total</span><strong>{cad(total)}</strong></div><p className="form-note">This is an estimate, not a payment request. We will confirm availability and any price changes with you before proceeding.</p><label className="price-accept"><input type="checkbox" checked={priceAccepted&&acceptedQuoteKey===quoteKey} onChange={e=>{setPriceAccepted(e.target.checked);setAcceptedQuoteKey(e.target.checked?quoteKey:'');}}/> I understand and accept this estimated price including HST.</label><div className="price-modal-actions"><button type="button" className="button button-secondary" onClick={()=>setPriceModalOpen(false)}>Go back</button><button type="button" className="button" disabled={!priceIsAccepted} onClick={()=>{setPriceModalOpen(false);setStep(p=>Math.max(p,2));}}>Accept and continue</button></div></section></div>}
'''
s=replace_once(s,'    <section className="section team"',modal+'    <section className="section team"','modal insertion')
# Ensure price modal can reopen from review only when necessary and submitting stays safe.
css_extra='''
/* CleanSure estimate confirmation and photo layout */
.booking-photo-panel[hidden]{display:none!important}
.price-modal-backdrop{position:fixed;inset:0;background:rgba(12,29,26,.7);display:flex;align-items:center;justify-content:center;padding:1rem;z-index:1000;overflow-y:auto}
.price-modal{background:#fff;color:#172a25;width:min(100%,510px);max-height:calc(100dvh - 2rem);overflow-y:auto;border-radius:18px;padding:clamp(1.1rem,4vw,2rem);box-shadow:0 18px 70px #0004}
.price-modal h2{margin:0 0 .6rem;font-size:1.45rem}
.price-modal p{line-height:1.55}
.price-line{display:flex;justify-content:space-between;gap:1rem;padding:.65rem 0;border-bottom:1px solid #e6eeeb}
.price-total{font-size:1.2rem;font-weight:750;border-top:2px solid #b8cfc5}
.price-accept{display:flex;gap:.7rem;align-items:flex-start;margin:1.2rem 0;font-size:.95rem;line-height:1.45}
.price-accept input{margin-top:.25rem;min-width:18px;min-height:18px}
.price-modal-actions{display:flex;gap:.75rem;flex-wrap:wrap}
.price-modal-actions .button{flex:1;min-width:130px}
.price-modal-actions .button:disabled{opacity:.45;cursor:not-allowed}
.review-price{grid-column:1/-1;width:100%;margin-top:1rem}
.review-price>div{display:flex;justify-content:space-between;gap:1rem;padding:.6rem 0}
.review-price .review-total{border-top:2px solid #d4e4dd;font-size:1.15rem}
@media(max-width:520px){.price-modal-actions{flex-direction:column}.price-modal-actions .button{width:100%}}
'''
# Backend: mandatory quote acceptance and server-side price calculation, persisted in DB.
b=replace_once(b,"  phone: z.string().trim().min(7),","  phone: z.string().trim().min(7),\n  quoteAccepted: z.union([z.literal('true'),z.literal(true)]),",'server acceptance schema')
b=replace_once(b,'  const b = parsed.data;','''  const b = parsed.data;
  const hourlyRate = b.supplies === 'company' ? 35 : 30;
  const subtotalCents = hourlyRate * b.hours * b.cleaners * 100;
  const hstCents = Math.round(subtotalCents * 13 / 100);
  const totalCents = subtotalCents + hstCents;
  const estimate = {currency:'CAD',hourlyRate,subtotal:subtotalCents/100,hst:hstCents/100,total:totalCents/100};''','server price calculation')
b=replace_once(b,'      notes: b.notes, customer_name: b.name, customer_email: b.email, customer_phone: b.phone,','''      notes: b.notes, customer_name: b.name, customer_email: b.email, customer_phone: b.phone,
      hourly_rate: hourlyRate, estimated_subtotal: estimate.subtotal,
      estimated_hst: estimate.hst, estimated_total: estimate.total,
      estimate_accepted_at: new Date().toISOString(),''','database pricing columns')
b=replace_once(b,"photoCount: processed.length, message: 'Booking saved successfully'","photoCount: processed.length, estimate, message: 'Booking saved successfully'",'server response')
# Do not write anything until all validations pass.
for p in (app,css,backend): shutil.copy2(p,p.with_name(p.name+'.before-pricing'))
app.write_text(s);css.write_text(css.read_text()+css_extra);backend.write_text(b)
print('SUCCESS: pricing, text-only branding, photo count, and review corrections installed.')
print('Backups: .before-pricing files beside each modified file.')

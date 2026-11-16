from pathlib import Path
import shutil, sys
root=Path.cwd()
app=root/'client/src/App.jsx'
css=root/'client/src/index.css'
backend=root/'server/src/routes/bookingRoutes.js'
if not all(x.exists() for x in (app,css,backend)):
    sys.exit('Run this script from the cleansure-merged project root.')
s=app.read_text()
if 'const [photos,setPhotos]' in s:
    sys.exit('Photo UI already installed; no changes made.')
needle=" const [bookingBusy,setBookingBusy] = useState(false);"
assert needle in s
s=s.replace(needle,needle+"\n const [photos,setPhotos] = useState([]);\n const [photoError,setPhotoError] = useState('');\n const choosePhotos=(e)=>{const incoming=Array.from(e.target.files||[]);e.target.value='';const combined=[...photos,...incoming];if(combined.length>5){setPhotoError('Choose up to 5 photos.');return;}if(combined.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024)){setPhotoError('Only JPG, PNG or WebP files up to 5 MB each are accepted.');return;}setPhotoError('');setPhotos(combined);};")
start=s.index(' const sendBooking=async(e)=>')
end=s.index('\n const sendJoin=',start)
s=s[:start]+''' const sendBooking=async(e)=>{e.preventDefault();setBookingBusy(true);setBookingResult('');try{const form=new FormData();Object.entries(booking).forEach(([key,value])=>form.append(key,value));photos.forEach(file=>form.append('photos',file));const r=await fetch('/api/bookings',{method:'POST',body:form});const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to submit booking');setBookingResult(`Request received. Reference: ${data.bookingCode||'pending'}. ${data.photoCount||0} photo(s) attached. We will contact you to confirm availability and pricing.`);setPhotos([]);}catch(err){setBookingResult(`Booking not submitted: ${err.message}`)}finally{setBookingBusy(false)}};'''+s[end:]
needle='<div className="booking-fields" hidden={step!==1}>'
assert s.count(needle)==1, 'Expected exactly one schedule section insertion point'
photo_ui='''<div className="booking-photo-panel"><label className="form-field full" htmlFor="property-photos">Property photos (optional)</label><p className="form-note">Upload up to five JPG, PNG or WebP images, 5 MB each. Avoid including people, documents or other sensitive details.</p><input id="property-photos" className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choosePhotos} aria-describedby="photo-help"/><p id="photo-help" className="form-note">Photos are shared only with authorized CleanSure staff for booking coordination.</p>{photoError&&<p className="form-status" role="alert">{photoError}</p>}<div className="photo-preview-grid">{photos.map((file,i)=><PhotoPreview key={`${file.name}-${file.lastModified}-${i}`} file={file} onRemove={()=>setPhotos(prev=>prev.filter((_,j)=>j!==i))}/>)}</div></div>'''
s=s.replace(needle,photo_ui+'\n     '+needle,1)
needle="['Phone',booking.phone]].map"
assert needle in s
s=s.replace(needle,"['Phone',booking.phone],['Property photos',`${photos.length} selected`]].map",1)
s += '''\nfunction PhotoPreview({file,onRemove}) {\n const [url,setUrl]=useState('');\n ReactUsePhotoURL(file,setUrl);\n return <div className="photo-preview"><img src={url||undefined} alt={`Selected property photo: ${file.name}`}/><button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>Remove</button></div>;\n}\nfunction ReactUsePhotoURL(file,setUrl){\n // Hook is called consistently for each preview.\n useEffect(()=>{const url=URL.createObjectURL(file);setUrl(url);return ()=>URL.revokeObjectURL(url);},[file,setUrl]);\n}\n'''
s=s.replace("import { useState } from 'react';","import { useEffect, useState } from 'react';",1)
style='''\n/* CleanSure private property photo picker */\n.booking-photo-panel{grid-column:1/-1;margin-top:1rem;padding:1rem;border:1px solid #dbe5e2;border-radius:12px;background:#f8fbfa}\n.photo-input{display:block;width:100%;max-width:100%;padding:.8rem;border:1px dashed #8ea9a1;border-radius:8px;background:white}\n.photo-preview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:.75rem;margin-top:1rem}\n.photo-preview{min-width:0;overflow:hidden;border-radius:10px;background:white;border:1px solid #dbe5e2}\n.photo-preview img{width:100%;aspect-ratio:1;object-fit:cover;display:block}\n.photo-preview button{width:100%;padding:.5rem;background:white;border:0;color:#9a2736;cursor:pointer}\n@media(max-width:520px){.booking-photo-panel{padding:.75rem}.photo-preview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}\n'''
for p in (app,css,backend): shutil.copy2(p,p.with_suffix(p.suffix+'.before-photos'))
app.write_text(s)
css.write_text(css.read_text()+style)
shutil.copy2(Path(__file__).with_name('bookingRoutes.js'),backend)
print('Photo upload changes applied. Original files saved with .before-photos suffix.')

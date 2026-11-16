import {Router} from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import {supabase} from '../lib/supabase.js';

const router=Router();
const sha=v=>createHash('sha256').update(v).digest('hex');
const allowedStatuses=['requested','pending','confirmed','assigned','in_progress','completed','cancelled','expired'];
const allowedPayments=['unpaid','pending','paid','failed','refunded','disputed'];
const uuid=z.string().uuid();
async function authenticate(req,res,next){
 const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
 if(!token)return res.status(401).json({error:'Admin sign-in required'});
 const {data,error}=await supabase.auth.getUser(token);
 if(error||!data.user?.email_confirmed_at)return res.status(401).json({error:'Invalid or expired session'});
 const admins=(process.env.CLEANSURE_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!admins.includes((data.user.email||'').toLowerCase()))return res.status(403).json({error:'Administrator access required'});
 req.adminId=data.user.id;next();
}
router.use(authenticate);
function fail(res,error,context){console.error('CRM '+context,error?.message||error);return res.status(500).json({error:'Unable to '+context+'. Check server logs and CRM migration.'});}
router.get('/overview',async(_req,res)=>{
 const [bookings,cleaners]=await Promise.all([
  supabase.from('bookings').select('id,booking_code,customer_name,customer_email,customer_phone,address,service,service_date,service_time,hours,cleaners,notes,estimated_total,status,crm_payment_status,crm_tags,crm_assigned_cleaner_id,created_at').order('created_at',{ascending:false}).limit(500),
  supabase.from('cleaner_profiles').select('id,cleaner_code,first_name,last_name,email,phone,city,specialty,years_experience,verification_status,auth_user_id,crm_tags,created_at').order('created_at',{ascending:false}).limit(500)
 ]);
 if(bookings.error)return fail(res,bookings.error,'load bookings');if(cleaners.error)return fail(res,cleaners.error,'load cleaners');
 const customerMap=new Map();
 for(const b of bookings.data){const key=(b.customer_email||'').trim().toLowerCase();if(!key)continue;const old=customerMap.get(key)||{email:key,name:b.customer_name,phone:b.customer_phone,bookings:0,totalEstimated:0,lastBooking:null};old.bookings++;old.totalEstimated+=Number(b.estimated_total||0);if(!old.lastBooking||b.created_at>old.lastBooking)old.lastBooking=b.created_at;customerMap.set(key,old);}
 return res.json({bookings:bookings.data,cleaners:cleaners.data,customers:[...customerMap.values()],limitedTo:500});
});
router.patch('/bookings/:id',async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid booking ID'});
 const schema=z.object({status:z.enum(allowedStatuses).optional(),paymentStatus:z.enum(allowedPayments).optional(),tags:z.array(z.string().trim().min(1).max(32)).max(15).optional()}).strict();
 const p=schema.safeParse(req.body);if(!p.success||!Object.keys(p.data||{}).length)return res.status(400).json({error:'Invalid booking update'});
 const patch={};if(p.data.status)patch.status=p.data.status;if(p.data.paymentStatus)patch.crm_payment_status=p.data.paymentStatus;if(p.data.tags)patch.crm_tags=[...new Set(p.data.tags)];
 const {data,error}=await supabase.from('bookings').update(patch).eq('id',req.params.id).select('id').maybeSingle();
 if(error)return fail(res,error,'update booking');if(!data)return res.status(404).json({error:'Booking not found'});res.json({success:true});
});
router.patch('/cleaners/:id',async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid cleaner ID'});
 const p=z.object({tags:z.array(z.string().trim().min(1).max(32)).max(15)}).strict().safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'Invalid tags'});
 const {data,error}=await supabase.from('cleaner_profiles').update({crm_tags:[...new Set(p.data.tags)]}).eq('id',req.params.id).select('id').maybeSingle();
 if(error)return fail(res,error,'update cleaner');if(!data)return res.status(404).json({error:'Cleaner not found'});res.json({success:true});
});
router.post('/bookings/:id/assign',async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid booking ID'});
 const p=z.object({cleanerId:uuid}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Choose a cleaner'});
 const {data:cleaner,error:ce}=await supabase.from('cleaner_profiles').select('id,verification_status,auth_user_id').eq('id',p.data.cleanerId).maybeSingle();
 if(ce)return fail(res,ce,'check cleaner');if(!cleaner||cleaner.verification_status!=='approved'||!cleaner.auth_user_id)return res.status(409).json({error:'Cleaner must be approved and registered'});
 const {data,error}=await supabase.from('bookings').update({crm_assigned_cleaner_id:cleaner.id,status:'assigned'}).eq('id',req.params.id).in('status',['requested','pending','confirmed','assigned']).select('id').maybeSingle();
 if(error)return fail(res,error,'assign booking');if(!data)return res.status(409).json({error:'Booking unavailable for assignment'});res.json({success:true});
});
router.post('/bookings/:id/offer',async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid booking ID'});
 const {data:booking,error:be}=await supabase.from('bookings').select('id,booking_code,service,service_date,service_time,hours,cleaners,address,status').eq('id',req.params.id).maybeSingle();
 if(be)return fail(res,be,'load booking');if(!booking)return res.status(404).json({error:'Booking not found'});
 if(!['requested','pending','confirmed'].includes(booking.status))return res.status(409).json({error:'Only pending or confirmed bookings can be offered'});
 const token=randomBytes(32).toString('hex');
 const expiresAt=new Date(Date.now()+48*3600000).toISOString();
 const {error}=await supabase.from('crm_job_offers').insert({booking_id:booking.id,token_hash:sha(token),expires_at:expiresAt,created_by:req.adminId});
 if(error)return fail(res,error,'create job offer');
 const base=(process.env.PUBLIC_SITE_URL||'http://localhost:5173').replace(/\/$/,'');
 const link=base+'/?jobOffer='+encodeURIComponent(token);
 // No full street address or customer contact information in the share text.
 const area='Exact location disclosed after assignment';
 res.status(201).json({link,expiresAt,message:`CleanSure job opportunity\nRef: ${booking.booking_code}\nService: ${booking.service}\nArea: ${area}\nDate: ${booking.service_date} ${booking.service_time}\nDuration: ${booking.hours} hours\nApproved cleaners: review and respond here: ${link}`});
});
export default router;

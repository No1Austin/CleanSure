import {Router} from 'express';
import {createHash} from 'node:crypto';
import {supabase} from '../lib/supabase.js';
const router=Router();
const sha=v=>createHash('sha256').update(v).digest('hex');
async function cleanerAuth(req,res,next){
 const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
 if(!token)return res.status(401).json({error:'Sign in as an approved cleaner to view this offer'});
 const {data,error}=await supabase.auth.getUser(token);
 if(error||!data.user)return res.status(401).json({error:'Session expired'});
 const result=await supabase.from('cleaner_profiles').select('id,verification_status').eq('auth_user_id',data.user.id).maybeSingle();
 if(result.error)return res.status(500).json({error:'Unable to verify cleaner'});
 if(result.data?.verification_status!=='approved')return res.status(403).json({error:'Only approved cleaners can view job offers'});
 req.cleanerId=result.data.id;next();
}
router.use(cleanerAuth);
async function findOffer(req,res){
 const token=req.params.token;
 if(!/^[0-9a-f]{64}$/.test(token)){res.status(400).json({error:'Invalid job link'});return null;}
 const {data,error}=await supabase.from('crm_job_offers').select('booking_id,expires_at,accepted_by').eq('token_hash',sha(token)).maybeSingle();
 if(error){res.status(500).json({error:'Unable to load offer'});return null;}
 if(!data||new Date(data.expires_at)<=new Date()){res.status(410).json({error:'Job offer expired or unavailable'});return null;}
 return data;
}
const fields='stripe_paid,booking_code,service,service_date,service_time,hours,cleaners,supplies,pets,last_cleaned,service_city,cleaner_hourly_rate,status,crm_assigned_cleaner_id';
router.get('/assigned',async(req,res)=>{
 const {data,error}=await supabase.from('bookings').select(fields+',address,customer_nickname,notes').eq('crm_assigned_cleaner_id',req.cleanerId).in('status',['assigned','in_progress','completed']).order('service_date');
 if(error)return res.status(500).json({error:'Unable to load assignments'});
 res.json({jobs:data.map(b=>({...b,crm_assigned_cleaner_id:undefined})),supportPhone:process.env.CLEANSURE_SUPPORT_PHONE||null});
});
router.get('/available',async(req,res)=>{
 const {data,error}=await supabase.from('bookings').select('id,'+fields).eq('stripe_paid',true).eq('cleaners',1).is('crm_assigned_cleaner_id',null).in('status',['requested','pending','confirmed']).not('cleaner_hourly_rate','is',null).order('service_date').limit(100);
 if(error)return res.status(500).json({error:'Unable to load available jobs'});
 res.json({jobs:data});
});
router.post('/available/:id/accept',async(req,res)=>{
 const {data,error}=await supabase.from('bookings').update({crm_assigned_cleaner_id:req.cleanerId,status:'assigned'}).eq('id',req.params.id).eq('stripe_paid',true).eq('cleaners',1).is('crm_assigned_cleaner_id',null).in('status',['requested','pending','confirmed']).not('cleaner_hourly_rate','is',null).select('id').maybeSingle();
 if(error||!data)return res.status(409).json({error:'Job no longer available'});res.json({success:true});
});
router.get('/:token',async(req,res)=>{
 const offer=await findOffer(req,res);if(!offer)return;
 const {data,error}=await supabase.from('bookings').select(fields).eq('id',offer.booking_id).maybeSingle();
 if(error||!data)return res.status(404).json({error:'Booking unavailable'});
 const assigned=data.crm_assigned_cleaner_id===req.cleanerId && ['assigned','in_progress','confirmed'].includes(data.status);
 const available=data.stripe_paid&&!offer.accepted_by&&!data.crm_assigned_cleaner_id&&['requested','pending','confirmed'].includes(data.status)&&Number(data.cleaners)===1&&data.cleaner_hourly_rate!=null;
 let details={};
 if(assigned){const r=await supabase.from('bookings').select('address,customer_nickname,notes').eq('id',offer.booking_id).eq('crm_assigned_cleaner_id',req.cleanerId).in('status',['assigned','in_progress','confirmed']).maybeSingle();if(r.error||!r.data)return res.status(409).json({error:'Assignment changed'});details=r.data;}
 delete data.crm_assigned_cleaner_id;
 res.json({booking:{...data,...details},available,assigned,supportPhone:assigned?process.env.CLEANSURE_SUPPORT_PHONE||null:null});
});
router.post('/:token/accept',async(req,res)=>{
 const offer=await findOffer(req,res);if(!offer)return;
 const check=await supabase.from('bookings').select('stripe_paid,cleaners,cleaner_hourly_rate').eq('id',offer.booking_id).maybeSingle();
 if(check.error||!check.data||!check.data.stripe_paid||Number(check.data.cleaners)!==1||check.data.cleaner_hourly_rate==null)return res.status(409).json({error:'This booking requires manual dispatch or a confirmed pay rate'});
 const {data,error}=await supabase.rpc('crm_accept_offer',{p_hash:sha(req.params.token),p_cleaner:req.cleanerId});
 if(error){console.error('Accept offer:',error.message);return res.status(500).json({error:'Unable to accept offer'});}
 if(!data)return res.status(409).json({error:'Job already taken or no longer available'});
 res.json({success:true,message:'Job accepted. Your assignment details are available.'});
});
router.post('/:token/decline',async(req,res)=>{
 const offer=await findOffer(req,res);if(!offer)return;
 // Decline does not invalidate the shared link for other cleaners.
 res.json({success:true,message:'You declined this job. No assignment was made.'});
});
export default router;

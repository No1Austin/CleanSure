import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
const router=Router();
const hash=v=>createHash('sha256').update(v).digest('hex');
const limiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:'draft-8',legacyHeaders:false});
const registerSchema=z.object({token:z.string().regex(/^[0-9a-f]{64}$/),cleanerId:z.string().regex(/^[A-Z]{3}[0-9]{6}$/),password:z.string().min(12).max(128)});
router.post('/register',limiter,async(req,res)=>{
 const parsed=registerSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Invalid registration details. Password must have at least 12 characters.'});
 const {token,cleanerId,password}=parsed.data;
 const {data:profile,error}=await supabase.from('cleaner_profiles').select('id,email,auth_user_id,invite_expires_at').eq('cleaner_code',cleanerId).eq('invite_token_hash',hash(token)).maybeSingle();
 if(error)return res.status(500).json({error:'Registration temporarily unavailable.'});
 if(!profile||profile.auth_user_id||!profile.invite_expires_at||new Date(profile.invite_expires_at)<=new Date())return res.status(400).json({error:'Invitation invalid, expired, or already used.'});
 // Email possession was demonstrated through the secret invitation link.
 const created=await supabase.auth.admin.createUser({email:profile.email,password,email_confirm:true,app_metadata:{account_type:'cleaner'}});
 if(created.error){console.error('Cleaner auth creation:',created.error.message);return res.status(409).json({error:'Unable to create account. Contact CleanSure support if you already have an account.'});}
 const linked=await supabase.from('cleaner_profiles').update({auth_user_id:created.data.user.id,invite_token_hash:null,invite_expires_at:null,registered_at:new Date().toISOString()}).eq('id',profile.id).is('auth_user_id',null).eq('invite_token_hash',hash(token)).select('id').maybeSingle();
 if(linked.error||!linked.data){await supabase.auth.admin.deleteUser(created.data.user.id);return res.status(409).json({error:'Invitation was already used. Please contact support.'});}
 return res.status(201).json({success:true,message:'Account created. You can now sign in.'});
});
router.post('/login',limiter,async(req,res)=>{
 const parsed=z.object({email:z.email(),password:z.string().min(1)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Enter your email and password.'});
 const result=await supabase.auth.signInWithPassword(parsed.data);
 if(result.error)return res.status(401).json({error:'Invalid email or password.'});
 const user=result.data.user;
 if(!user.email_confirmed_at)return res.status(403).json({error:'Email verification required.'});
 return res.json({accessToken:result.data.session.access_token,expiresIn:result.data.session.expires_in});
});
async function auth(req,res,next){
 const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
 if(!token)return res.status(401).json({error:'Sign in required.'});
 const result=await supabase.auth.getUser(token);
 if(result.error||!result.data.user?.email_confirmed_at)return res.status(401).json({error:'Session expired or invalid.'});
 req.authUser=result.data.user;next();
}
router.get('/me',auth,async(req,res)=>{
 const {data,error}=await supabase.from('cleaner_profiles').select('cleaner_code,first_name,last_name,city,specialty,verification_status,registered_at').eq('auth_user_id',req.authUser.id).maybeSingle();
 if(error)return res.status(500).json({error:'Unable to load dashboard.'});
 if(!data)return res.status(403).json({error:'No linked cleaner application.'});
 return res.json({profile:data,canAcceptJobs:data.verification_status==='approved'});
});
function requireAdmin(req,res,next){
 const admins=(process.env.CLEANSURE_ADMIN_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 if(!admins.includes(req.authUser.email?.toLowerCase()))return res.status(403).json({error:'Administrator access required.'});
 next();
}
const adminLimiter=rateLimit({windowMs:15*60*1000,limit:25,standardHeaders:'draft-8',legacyHeaders:false});
router.get('/admin/applications',auth,requireAdmin,async(req,res)=>{
 const {data,error}=await supabase.from('cleaner_profiles').select('id,cleaner_code,first_name,last_name,email,phone,city,years_experience,specialty,verification_status,created_at,registered_at,invite_sent_at,invite_expires_at,account_email_sent_at').order('created_at',{ascending:false}).limit(100);
 if(error)return res.status(500).json({error:'Unable to load applications.'});
 return res.json({applications:data});
});
router.get('/admin/bookings',auth,requireAdmin,async(req,res)=>{
 const {data,error}=await supabase.from('bookings').select('id,booking_code,service,service_date,service_time,hours,cleaners,supplies,customer_name,customer_email,status,created_at').order('created_at',{ascending:false}).limit(100);
 if(error)return res.status(500).json({error:'Unable to load bookings.'});
 return res.json({bookings:data});
});
router.post('/admin/applications/:id/invitation',auth,requireAdmin,adminLimiter,async(req,res)=>{
 const id=z.string().uuid().safeParse(req.params.id);
 if(!id.success)return res.status(400).json({error:'Invalid applicant ID.'});
 const {data:profile,error}=await supabase.from('cleaner_profiles').select('id,email,first_name,cleaner_code,auth_user_id').eq('id',id.data).maybeSingle();
 if(error)return res.status(500).json({error:'Unable to load applicant.'});
 if(!profile)return res.status(404).json({error:'Applicant not found.'});
 if(profile.auth_user_id)return res.status(409).json({error:'This cleaner already has an account.'});
 const {randomBytes,createHash}=await import('node:crypto');
 const token=randomBytes(32).toString('hex');
 const tokenHash=createHash('sha256').update(token).digest('hex');
 const expiresAt=new Date(Date.now()+7*86400000).toISOString();
 const updated=await supabase.from('cleaner_profiles').update({invite_token_hash:tokenHash,invite_expires_at:expiresAt}).eq('id',id.data).is('auth_user_id',null).select('id').maybeSingle();
 if(updated.error||!updated.data)return res.status(409).json({error:'Unable to issue invitation. Refresh the application.'});
 const base=(process.env.PUBLIC_SITE_URL||'http://localhost:5173').replace(/\/$/,'');
 const url=base+'/?cleanerInvite='+encodeURIComponent(token);
 return res.json({recipient:profile.email,subject:'CleanSure — Your Cleaner Registration Details',body:`Hello ${profile.first_name},\n\nThank you for applying to join CleanSure!\n\nWe have received your application.\n\nYour Cleaner ID: ${profile.cleaner_code}\n\nCreate your account using this secure link (valid for 7 days):\n${url}\n`,expiresAt});
});
router.post('/admin/applications/:id/email-sent',auth,requireAdmin,async(req,res)=>{
 const id=z.string().uuid().safeParse(req.params.id);
 if(!id.success)return res.status(400).json({error:'Invalid applicant ID.'});
 const result=await supabase.from('cleaner_profiles').update({account_email_sent_at:new Date().toISOString()}).eq('id',id.data).select('id').maybeSingle();
 if(result.error)return res.status(500).json({error:'Unable to update email status.'});
 if(!result.data)return res.status(404).json({error:'Applicant not found.'});
 return res.json({success:true});
});
router.post('/admin/bookings/:id/email-sent',auth,requireAdmin,async(req,res)=>{
 const id=z.string().uuid().safeParse(req.params.id);
 if(!id.success)return res.status(400).json({error:'Invalid booking ID.'});
 const result=await supabase.from('bookings').update({confirmation_email_sent_at:new Date().toISOString()}).eq('id',id.data).select('id').maybeSingle();
 if(result.error)return res.status(500).json({error:'Unable to update email status.'});
 if(!result.data)return res.status(404).json({error:'Booking not found.'});
 return res.json({success:true});
});
export default router;

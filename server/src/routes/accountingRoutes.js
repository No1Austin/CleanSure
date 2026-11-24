import {Router} from 'express';
import {z} from 'zod';
import {supabase} from '../lib/supabase.js';

const router=Router();
const admins=()=>new Set((process.env.CLEANSURE_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
const money=(cents)=>Number((Number(cents||0)/100).toFixed(2));
const cents=(amount)=>Math.round(Number(amount)*100);
const yyyyMmDd=z.iso.date();
const periodSchema=z.object({from:yyyyMmDd.optional(),to:yyyyMmDd.optional()}).refine(x=>!x.from||!x.to||x.from<=x.to);
const isAdmin=user=>admins().has((user.email||'').toLowerCase());
async function authenticate(req,res,next){
 const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
 if(!token)return res.status(401).json({error:'Sign in required'});
 const {data,error}=await supabase.auth.getUser(token);
 if(error||!data.user?.email_confirmed_at)return res.status(401).json({error:'Session expired or invalid'});
 req.user=data.user;next();
}
router.use(authenticate);
const adminOnly=(req,res,next)=>isAdmin(req.user)?next():res.status(403).json({error:'Administrator access required'});
const select='id,booking_id,cleaner_id,work_date,work_status,scheduled_hours,approved_hours,compensation_mode,hourly_rate_cents,percentage_rate,customer_subtotal_cents,hst_collected_cents,customer_payment_status,customer_paid_at,refund_cents,cleaner_payout_status,cleaner_paid_at,notes,created_at,updated_at';
const fail=(res,err)=>{console.error('Accounting:',err?.message||err);return res.status(500).json({error:'Unable to load or save accounting data. Check the accounting SQL migration and server logs.'});};
function decorate(r){
 const earned=r.work_status==='completed'?(r.compensation_mode==='hourly'?Math.round(Number(r.approved_hours)*r.hourly_rate_cents):Math.round(Number(r.customer_subtotal_cents)*Number(r.percentage_rate)/100)):0;
 const received=r.customer_payment_status==='paid'?Math.max(0,r.customer_subtotal_cents+r.hst_collected_cents-r.refund_cents):0;
 const taxReceived=r.customer_payment_status==='paid'?Math.max(0,r.hst_collected_cents-Math.min(r.refund_cents,r.hst_collected_cents)):0;
 return {...r,cleaner_earned:money(earned),customer_received:money(received),hst_received:money(taxReceived),cleaner_paid:money(r.cleaner_payout_status==='paid'?earned:0),company_revenue:money(Math.max(0,received-taxReceived)),company_margin_before_expenses:money(received-taxReceived-earned)};
}
function totals(rows){
 const sum=k=>Number(rows.reduce((n,r)=>n+Number(r[k]||0),0).toFixed(2));
 const completed=rows.filter(r=>r.work_status==='completed');
 return {jobs:rows.length,completedJobs:completed.length,hoursWorked:Number(completed.reduce((n,r)=>n+Number(r.approved_hours||0),0).toFixed(2)),customerReceived:sum('customer_received'),hstCollected:sum('hst_received'),cleanerEarned:sum('cleaner_earned'),cleanerPaid:sum('cleaner_paid'),cleanerUnpaid:Number(rows.filter(r=>r.cleaner_payout_status!=='paid').reduce((n,r)=>n+r.cleaner_earned,0).toFixed(2)),companyRevenue:sum('company_revenue'),marginBeforeOtherExpenses:sum('company_margin_before_expenses')};
}
async function getRecords(req,res,{cleanerId}={}){
 const parsed=periodSchema.safeParse(req.query);
 if(!parsed.success)return res.status(400).json({error:'Invalid date range. Use YYYY-MM-DD.'});
 const {from,to}=parsed.data;
 let query=supabase.from('cleaner_work_records').select(select).order('work_date',{ascending:false}).limit(2000);
 if(cleanerId)query=query.eq('cleaner_id',cleanerId);
 if(from)query=query.gte('work_date',from);
 if(to)query=query.lte('work_date',to);
 const {data,error}=await query;
 if(error)return fail(res,error);
 const rows=(data||[]).map(decorate);
 const bookingIds=[...new Set(rows.map(r=>r.booking_id))];
 const cleanerIds=[...new Set(rows.map(r=>r.cleaner_id))];
 const [b,c]=await Promise.all([
  bookingIds.length?supabase.from('bookings').select('id,booking_code,service,service_date,service_time,status').in('id',bookingIds):{data:[],error:null},
  cleanerIds.length?supabase.from('cleaner_profiles').select('id,first_name,last_name,cleaner_code').in('id',cleanerIds):{data:[],error:null}
 ]);
 if(b.error||c.error)return fail(res,b.error||c.error);
 const bm=new Map(b.data.map(v=>[v.id,v]));const cm=new Map(c.data.map(v=>[v.id,v]));
 return res.json({records:rows.map(r=>({...r,booking:bm.get(r.booking_id)||null,cleaner:cm.get(r.cleaner_id)||null})),totals:totals(rows),period:{from:from||null,to:to||null},limitedTo:2000,source:'admin-recorded; not verified against payment processor'});
}
router.get('/admin/overview',adminOnly,(req,res)=>getRecords(req,res));
router.get('/cleaner/me',async(req,res)=>{
 const {data,error}=await supabase.from('cleaner_profiles').select('id,verification_status,first_name,cleaner_code').eq('auth_user_id',req.user.id).maybeSingle();
 if(error)return fail(res,error);
 if(!data||data.verification_status!=='approved')return res.status(403).json({error:'Approved cleaner account required'});
 return getRecords(req,res,{cleanerId:data.id});
});
const recordSchema=z.object({
 bookingId:z.uuid(),cleanerId:z.uuid(),workDate:yyyyMmDd,
 workStatus:z.enum(['scheduled','in_progress','completed','cancelled']),
 scheduledHours:z.number().min(0).max(168),approvedHours:z.number().min(0).max(168),
 compensationMode:z.enum(['hourly','percentage']),
 hourlyRate:z.number().min(0).max(10000).optional(),percentageRate:z.number().min(0).max(100).optional(),
 customerSubtotal:z.number().min(0).max(10000000),hstCollected:z.number().min(0).max(1300000),
 customerPaymentStatus:z.enum(['unpaid','paid','refunded']),
 refundAmount:z.number().min(0).max(11300000),cleanerPayoutStatus:z.enum(['unpaid','paid']),
 notes:z.string().max(1000).default('')
}).superRefine((v,ctx)=>{
 if(v.compensationMode==='hourly'&&v.hourlyRate===undefined)ctx.addIssue({code:'custom',message:'Hourly rate required',path:['hourlyRate']});
 if(v.compensationMode==='percentage'&&v.percentageRate===undefined)ctx.addIssue({code:'custom',message:'Percentage required',path:['percentageRate']});
 if(v.cleanerPayoutStatus==='paid'&&v.workStatus!=='completed')ctx.addIssue({code:'custom',message:'Only completed jobs can be marked paid',path:['cleanerPayoutStatus']});
 if(v.customerPaymentStatus==='paid'&&v.customerSubtotal===0)ctx.addIssue({code:'custom',message:'Enter a verified customer payment before marking paid',path:['customerSubtotal']});
 if(v.refundAmount>v.customerSubtotal+v.hstCollected)ctx.addIssue({code:'custom',message:'Refund cannot exceed the recorded charge',path:['refundAmount']});
});
router.post('/admin/records',adminOnly,async(req,res)=>{
 const parsed=recordSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Invalid work or accounting details',issues:parsed.error.issues.map(x=>x.message)});
 const v=parsed.data;
 const [booking,cleaner]=await Promise.all([
  supabase.from('bookings').select('id,crm_assigned_cleaner_id').eq('id',v.bookingId).maybeSingle(),
  supabase.from('cleaner_profiles').select('id,verification_status,auth_user_id').eq('id',v.cleanerId).maybeSingle()
 ]);
 if(booking.error||cleaner.error)return fail(res,booking.error||cleaner.error);
 if(!booking.data||!cleaner.data)return res.status(404).json({error:'Booking or cleaner not found'});
 if(cleaner.data.verification_status!=='approved'||!cleaner.data.auth_user_id)return res.status(409).json({error:'Cleaner must be approved and registered'});
 if(booking.data.crm_assigned_cleaner_id!==v.cleanerId)return res.status(409).json({error:'Assign this cleaner to the booking in CRM first'});
 const {data:existing,error:existingError}=await supabase.from('cleaner_work_records').select(select).eq('booking_id',v.bookingId).maybeSingle();
 if(existingError)return fail(res,existingError);
 if(existing&&existing.cleaner_id!==v.cleanerId)return res.status(409).json({error:'This booking already has a work record for another cleaner. Reassignment requires an audited correction.'});
 if(existing?.customer_payment_status==='paid'&&v.customerPaymentStatus==='unpaid')return res.status(409).json({error:'Recorded payments cannot be reset to unpaid. Reconcile with a refund.'});
 if(existing?.cleaner_payout_status==='paid'&&v.cleanerPayoutStatus==='unpaid')return res.status(409).json({error:'Recorded cleaner payouts cannot be reset to unpaid.'});
 if(existing?.customer_payment_status==='paid'&&(cents(v.customerSubtotal)!==Number(existing.customer_subtotal_cents)||cents(v.hstCollected)!==Number(existing.hst_collected_cents)))return res.status(409).json({error:'Received payment amounts are locked. Record refunds separately.'});
 if(existing?.cleaner_payout_status==='paid'&&(v.compensationMode!==existing.compensation_mode||v.approvedHours!==Number(existing.approved_hours)||cents(v.hourlyRate||0)!==Number(existing.hourly_rate_cents||0)||Number(v.percentageRate||0)!==Number(existing.percentage_rate||0)))return res.status(409).json({error:'Paid compensation is locked. Contact accounting for adjustments.'});
 const row={booking_id:v.bookingId,cleaner_id:v.cleanerId,work_date:v.workDate,work_status:v.workStatus,scheduled_hours:v.scheduledHours,approved_hours:v.approvedHours,compensation_mode:v.compensationMode,hourly_rate_cents:v.compensationMode==='hourly'?cents(v.hourlyRate):null,percentage_rate:v.compensationMode==='percentage'?v.percentageRate:null,customer_subtotal_cents:cents(v.customerSubtotal),hst_collected_cents:cents(v.hstCollected),customer_payment_status:v.customerPaymentStatus,customer_paid_at:v.customerPaymentStatus==='paid'?(existing?.customer_paid_at||new Date().toISOString()):null,refund_cents:cents(v.refundAmount),cleaner_payout_status:v.cleanerPayoutStatus,cleaner_paid_at:v.cleanerPayoutStatus==='paid'?(existing?.cleaner_paid_at||new Date().toISOString()):null,notes:v.notes,updated_at:new Date().toISOString()};
 const result=await supabase.from('cleaner_work_records').upsert(row,{onConflict:'booking_id'}).select(select).single();
 if(result.error)return fail(res,result.error);
 return res.json({record:decorate(result.data)});
});
export default router;

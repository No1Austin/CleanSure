import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';

const router = Router();
const sha = value => createHash('sha256').update(value).digest('hex');
const allowedStatuses = ['requested', 'pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'expired'];
const allowedPayments = ['unpaid', 'pending', 'paid', 'failed', 'refunded', 'disputed'];
const uuid = z.string().uuid();

async function authenticate(req, res, next) {
  try {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ error: 'Admin sign-in required' });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email_confirmed_at) return res.status(401).json({ error: 'Invalid or expired session' });
    const admins = (process.env.CLEANSURE_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes((data.user.email || '').toLowerCase())) return res.status(403).json({ error: 'Administrator access required' });
    req.adminId = data.user.id;
    next();
  } catch (error) {
    console.error('CRM authenticate', error);
    return res.status(500).json({ error: 'Unable to authenticate administrator' });
  }
}
router.use(authenticate);
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});

function fail(res, error, context) {
  console.error('CRM ' + context, error?.message || error);
  return res.status(500).json({ error: 'Unable to ' + context + '. Check server logs and CRM migration.' });
}

router.get('/overview', async (_req, res) => {
  try {
    const [bookings, cleaners] = await Promise.all([
      supabase.from('bookings').select('id,booking_code,customer_name,customer_email,customer_phone,address,service,service_date,service_time,hours,cleaners,notes,estimated_total,status,crm_payment_status,crm_tags,crm_assigned_cleaner_id,stripe_paid,assigned_at,customer_started,cleaner_started,customer_completed,cleaner_completed,cleaner_rating,customer_rating,company_rating,created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('cleaner_profiles').select('id,cleaner_code,first_name,last_name,email,phone,city,specialty,years_experience,verification_status,auth_user_id,profile_photo_path,crm_tags,created_at').order('created_at', { ascending: false }).limit(500)
    ]);
    console.info('CRM overview result', {bookings:bookings.data?.length ?? null,cleaners:cleaners.data?.length ?? null,bookingError:bookings.error?.code||null,cleanerError:cleaners.error?.code||null});
    if (bookings.error) return fail(res, bookings.error, 'load bookings');
    if (cleaners.error) return fail(res, cleaners.error, 'load cleaners');
    const customerMap = new Map();
    for (const b of bookings.data) {
      const key = (b.customer_email || '').trim().toLowerCase();
      if (!key) continue;
      const old = customerMap.get(key) || { email: key, name: b.customer_name, phone: b.customer_phone, bookings: 0, totalEstimated: 0, lastBooking: null };
      old.bookings++;
      old.totalEstimated += Number(b.estimated_total || 0);
      if (!old.lastBooking || b.created_at > old.lastBooking) old.lastBooking = b.created_at;
      customerMap.set(key, old);
    }
    return res.json({ bookings: bookings.data, cleaners: cleaners.data, customers: [...customerMap.values()], limitedTo: 500 });
  } catch (error) { return fail(res, error, 'load overview'); }
});

router.get('/cleaners/:id/photo', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid cleaner ID' });
  try {
    const { data, error } = await supabase.from('cleaner_profiles').select('profile_photo_path').eq('id', req.params.id).maybeSingle();
    if (error) return fail(res, error, 'load cleaner photo');
    if (!data) return res.status(404).json({ error: 'Cleaner not found' });
    if (!data.profile_photo_path) return res.status(404).json({ error: 'No profile photograph on file' });
    const signed = await supabase.storage.from('cleaner-profile-photos').createSignedUrl(data.profile_photo_path, 60);
    if (signed.error) return fail(res, signed.error, 'access cleaner photo');
    res.set('Cache-Control', 'no-store');
    return res.json({ url: signed.data.signedUrl });
  } catch (error) { return fail(res, error, 'access cleaner photo'); }
});

router.patch('/cleaners/:id/review', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid cleaner ID' });
  const parsed = z.object({ decision: z.enum(['approved', 'rejected', 'pending']) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid review decision' });
  try {
    const { data: profile, error: lookupError } = await supabase.from('cleaner_profiles')
      .select('id,profile_photo_path,verification_status')
      .eq('id', req.params.id).maybeSingle();
    if (lookupError) return fail(res, lookupError, 'load cleaner');
    if (!profile) return res.status(404).json({ error: 'Cleaner not found' });
    if (parsed.data.decision === 'approved' && !profile.profile_photo_path) {
      return res.status(409).json({ error: 'A profile photo is required before approval. Request a photo from the applicant.' });
    }

    // The database check constraint cleaner_approved_requires_verified_at
    // requires this timestamp whenever verification_status is 'approved'.
    // Update both columns atomically in the same statement.
    const patch = {
      verification_status: parsed.data.decision,
      verified_at: parsed.data.decision === 'approved' ? new Date().toISOString() : null
    };
    const result = await supabase.from('cleaner_profiles')
      .update(patch)
      .eq('id', profile.id)
      .eq('verification_status', profile.verification_status)
      .select('id,verification_status,verified_at')
      .maybeSingle();
    if (result.error) return fail(res, result.error, 'review cleaner');
    if (!result.data) return res.status(409).json({ error: 'Application changed. Refresh and retry.' });
    return res.json({ success: true, verification_status: result.data.verification_status, verified_at: result.data.verified_at });
  } catch (error) { return fail(res, error, 'review cleaner'); }
});

router.patch('/bookings/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid booking ID' });
  const schema = z.object({ status: z.enum(allowedStatuses).optional(), paymentStatus: z.enum(allowedPayments).optional(), tags: z.array(z.string().trim().min(1).max(32)).max(15).optional() }).strict();
  const p = schema.safeParse(req.body);
  if (!p.success || !Object.keys(p.data || {}).length) return res.status(400).json({ error: 'Invalid booking update' });
  const patch = {};
  if (p.data.status || p.data.paymentStatus) return res.status(409).json({error:'Payment and lifecycle status are controlled by verified events'});
  if (p.data.paymentStatus) patch.crm_payment_status = p.data.paymentStatus;
  if (p.data.tags) patch.crm_tags = [...new Set(p.data.tags)];
  try {
    const { data, error } = await supabase.from('bookings').update(patch).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return fail(res, error, 'update booking');
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ success: true });
  } catch (error) { return fail(res, error, 'update booking'); }
});

router.patch('/cleaners/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid cleaner ID' });
  const p = z.object({ tags: z.array(z.string().trim().min(1).max(32)).max(15) }).strict().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Invalid tags' });
  try {
    const { data, error } = await supabase.from('cleaner_profiles').update({ crm_tags: [...new Set(p.data.tags)] }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return fail(res, error, 'update cleaner');
    if (!data) return res.status(404).json({ error: 'Cleaner not found' });
    return res.json({ success: true });
  } catch (error) { return fail(res, error, 'update cleaner'); }
});

router.post('/bookings/:id/assign', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid booking ID' });
  const p = z.object({ cleanerId: uuid }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Choose a cleaner' });
  try {
    const { data: cleaner, error: ce } = await supabase.from('cleaner_profiles').select('id,verification_status,auth_user_id').eq('id', p.data.cleanerId).maybeSingle();
    if (ce) return fail(res, ce, 'check cleaner');
    if (!cleaner || cleaner.verification_status !== 'approved' || !cleaner.auth_user_id) return res.status(409).json({ error: 'Cleaner must be approved and registered' });
    const { data, error } = await supabase.from('bookings').update({ crm_assigned_cleaner_id: cleaner.id, status: 'assigned' }).eq('id', req.params.id).eq('stripe_paid',true).in('status', ['requested', 'pending', 'confirmed', 'assigned']).select('id').maybeSingle();
    if (error) return fail(res, error, 'assign booking');
    if (!data) return res.status(409).json({ error: 'Booking unavailable for assignment' });
    return res.json({ success: true });
  } catch (error) { return fail(res, error, 'assign booking'); }
});

router.post('/bookings/:id/offer', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: 'Invalid booking ID' });
  try {
    const { data: booking, error: be } = await supabase.from('bookings').select('id,booking_code,service,service_date,service_time,hours,cleaners,service_city,pets,cleaner_hourly_rate,stripe_paid,status').eq('id', req.params.id).maybeSingle();
    if (be) return fail(res, be, 'load booking');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!booking.stripe_paid) return res.status(409).json({error:'Payment required'});
    if (!['requested', 'pending', 'confirmed'].includes(booking.status)) return res.status(409).json({ error: 'Only pending or confirmed bookings can be offered' });
    if(Number(booking.cleaners)!==1||booking.cleaner_hourly_rate==null)return res.status(409).json({error:'Confirm pay and use manual dispatch for multi-cleaner bookings'});
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
    const { error } = await supabase.from('crm_job_offers').insert({ booking_id: booking.id, token_hash: sha(token), expires_at: expiresAt, created_by: req.adminId });
    if (error) return fail(res, error, 'create job offer');
    const base = (process.env.PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
    const link = base + '/?jobOffer=' + encodeURIComponent(token);
    const area = booking.service_city || 'Area not recorded';
    return res.status(201).json({ link, expiresAt, message: `CleanSure job opportunity\nRef: ${booking.booking_code}\nService: ${booking.service}\nArea: ${area}\nDate: ${booking.service_date} ${booking.service_time}\nDuration: ${booking.hours} hours\nApproved cleaners: review and respond here: ${link}` });
  } catch (error) { return fail(res, error, 'create job offer'); }
});

export default router;

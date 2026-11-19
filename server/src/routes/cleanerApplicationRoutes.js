import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 12 },
  fileFilter(_req, file, cb) {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  }
});
const schema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  phone: z.string().trim().min(7).max(40),
  location: z.string().trim().min(2).max(120),
  experience: z.coerce.number().int().min(0).max(60),
  specialty: z.enum(['Residential cleaning', 'Deep cleaning', 'Move-in / move-out', 'Commercial cleaning']),
  consent: z.literal('true'),
  termsAccepted: z.literal('true')
});
function detectImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { ext: 'png', type: 'image/png' };
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}
router.post('/', rateLimit({windowMs:15*60*1000, limit:5, standardHeaders:'draft-8', legacyHeaders:false}), (req,res,next)=>{
  upload.single('photo')(req,res,(error)=>{
    if (error) return res.status(400).json({success:false,error:'Invalid or oversized photo (maximum 3 MB).'});
    next();
  });
}, async (req,res)=>{
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({success:false,error:'Please complete all required application fields and accept the privacy notice.'});
  const applicant = parsed.data;
  const parts = applicant.name.split(/\s+/);
  if (parts.length < 2) return res.status(400).json({success:false,error:'Please enter your first and last name.'});
  const first_name = parts.shift();
  const last_name = parts.join(' ');
  const email = applicant.email.toLowerCase().trim();
  const file = req.file;
  if (!file) return res.status(400).json({success:false,error:'A clear face photograph is required.'});
  const image = file ? detectImage(file.buffer) : null;
  if (file && (!image || file.mimetype !== image.type)) return res.status(400).json({success:false,error:'Photo must be a valid JPG, PNG, or WebP image.'});
  let path = null;
  let saved = false;
  try {
    // Do not create Supabase Auth accounts or approve applicants on public submission.
    if (file) {
      path = `applications/${randomUUID()}.${image.ext}`;
      const uploaded = await supabase.storage.from('cleaner-profile-photos').upload(path, file.buffer, {contentType:image.type,upsert:false});
      if (uploaded.error) {
        console.error('Cleaner photo upload:',uploaded.error.message);
        return res.status(503).json({success:false,error:'Unable to save profile photo. Please try again.'});
      }
    }
    // Public IDs are references, never authentication credentials.
    const cleanerId = `${first_name.slice(0,3).toUpperCase().padEnd(3,'X')}${String(randomBytes(4).readUInt32BE(0) % 900000 + 100000)}`;
    const inserted = await supabase.from('cleaner_profiles').insert({
      first_name,last_name,email,phone:applicant.phone,city:applicant.location,
      years_experience:applicant.experience,specialty:applicant.specialty,profile_photo_path:path,verification_status:'pending',cleaner_code:cleanerId
    }).select('id').single();
    if (inserted.error) {
      if (path) await supabase.storage.from('cleaner-profile-photos').remove([path]);
      if (inserted.error.code === '23505') return res.status(409).json({success:false,error:'An application with this email already exists. Please contact CleanSure for assistance.'});
      console.error('Cleaner application insert:',inserted.error.message);
      return res.status(500).json({success:false,error:'Unable to save your application. Please try again.'});
    }
    saved = true;
    // Invitations are generated manually by authenticated admins.
    return res.status(201).json({success:true,message:'Application received. CleanSure will review your application. Please check your email for registration details when our team contacts you. If we are hiring, an admin may call you.'});
  } catch (error) {
    if (path && !saved) {
      try { await supabase.storage.from('cleaner-profile-photos').remove([path]); } catch (cleanupError) { console.error('Photo cleanup failed:', cleanupError); }
    }
    console.error('Cleaner application:',error);
    return res.status(500).json({success:false,error:'Application service temporarily unavailable.'});
  }
});
export default router;

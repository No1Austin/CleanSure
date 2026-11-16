import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';

const router = Router();
const BUCKET = 'booking-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 5, fields: 25, fieldSize: 10000, parts: 30 },
}).array('photos', 5);

const bookingSchema = z.object({
  service: z.enum(['residential', 'deep', 'move', 'commercial', 'other']),
  property: z.string().trim().min(1),
  address: z.string().trim().min(5),
  bedrooms: z.string(), bathrooms: z.string(),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  hours: z.coerce.number().int().min(1).max(24),
  cleaners: z.coerce.number().int().min(1).max(20),
  pets: z.enum(['yes', 'no']),
  supplies: z.enum(['customer', 'company']),
  notes: z.string().max(2000).optional().default(''),
  name: z.string().trim().min(2),
  email: z.email(),
  phone: z.string().trim().min(7),
  quoteAccepted: z.union([z.literal('true'),z.literal(true)]),
});

function handleUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: 'Invalid photos: maximum 5 files, 5 MB each.' });
    next();
  });
}

router.post('/', handleUpload, async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid booking details', details: z.flattenError(parsed.error) });
  const b = parsed.data;
  const hourlyRate = b.supplies === 'company' ? 35 : 30;
  const subtotalCents = hourlyRate * b.hours * b.cleaners * 100;
  const hstCents = Math.round(subtotalCents * 13 / 100);
  const totalCents = subtotalCents + hstCents;
  const estimate = {currency:'CAD',hourlyRate,subtotal:subtotalCents/100,hst:hstCents/100,total:totalCents/100};
  const photos = req.files ?? [];
  if (photos.length > 5) return res.status(400).json({ success: false, error: 'Maximum 5 photos.' });

  // Decode and normalize on the server: strips EXIF/GPS and rejects invalid image data.
  const processed = [];
  try {
    for (const file of photos) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw new Error('Unsupported image format');
      const info = await sharp(file.buffer, { limitInputPixels: 24_000_000 }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(info.format)) throw new Error('Invalid image content');
      const buffer = await sharp(file.buffer, { limitInputPixels: 24_000_000 })
        .rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      if (buffer.length > MAX_BYTES) throw new Error('Processed image exceeds 5 MB');
      processed.push({ buffer, contentType: 'image/jpeg' });
    }
  } catch {
    return res.status(400).json({ success: false, error: 'One or more photos could not be processed. Use valid JPG, PNG or WebP images.' });
  }

  let bookingId = null;
  const uploadedPaths = [];
  try {
    const { data, error } = await supabase.from('bookings').insert({
      service: b.service, property: b.property, address: b.address,
      bedrooms: b.bedrooms, bathrooms: b.bathrooms,
      service_date: b.date, service_time: b.time,
      hours: b.hours, cleaners: b.cleaners, pets: b.pets, supplies: b.supplies,
      notes: b.notes, customer_name: b.name, customer_email: b.email, customer_phone: b.phone,
      hourly_rate: hourlyRate, estimated_subtotal: estimate.subtotal,
      estimated_hst: estimate.hst, estimated_total: estimate.total,
      estimate_accepted_at: new Date().toISOString(),
    }).select('id, booking_code, status').single();
    if (error) throw error;
    bookingId = data.id;

    for (const photo of processed) {
      const path = `${bookingId}/${randomUUID()}.jpg`;
      const result = await supabase.storage.from(BUCKET).upload(path, photo.buffer, {
        contentType: photo.contentType, upsert: false, cacheControl: '3600',
      });
      if (result.error) throw result.error;
      uploadedPaths.push(path);
      const { error: photoError } = await supabase.from('booking_photos').insert({
        booking_id: bookingId, storage_path: path,
        content_type: photo.contentType, file_size: photo.buffer.length,
      });
      if (photoError) throw photoError;
    }
    return res.status(201).json({ success: true, bookingCode: data.booking_code, status: data.status, photoCount: processed.length, estimate, message: 'Booking saved successfully' });
  } catch (error) {
    console.error('Booking/photo save failed:', error?.message ?? error);
    // Best-effort compensation; log failures for manual follow-up.
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage.from(BUCKET).remove(uploadedPaths);
      if (cleanupError) console.error('Photo cleanup failed:', cleanupError.message);
    }
    if (bookingId) {
      const { error: cleanupError } = await supabase.from('bookings').delete().eq('id', bookingId);
      if (cleanupError) console.error('Booking cleanup failed:', cleanupError.message);
    }
    return res.status(500).json({ success: false, error: 'Unable to save booking. Please try again.' });
  }
});
export default router;

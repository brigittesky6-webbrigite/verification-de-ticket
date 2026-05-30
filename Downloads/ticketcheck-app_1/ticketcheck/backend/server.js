require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const db = require('./db');
const { sendAdminNotification, sendClientApproved, sendClientRejected } = require('./mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Cloudinary config ────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Middlewares ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir le frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting — 10 demandes / 15 min par IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de demandes. Réessayez dans 15 minutes.' },
});

// ── Stockage des images ───────────────────────────────────────
const uploadsDir = path.resolve(process.env.UPLOADS_PATH || path.join(__dirname, 'uploads'));
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const useCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

const storage = useCloudinary
  ? new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'ticketcheck',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
    })
  : multer.diskStorage({
      destination: uploadsDir,
      filename: (req, file, cb) => {
        cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
      },
    });
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Format image non supporté (JPG, PNG, WEBP)'));
  },
});

app.use('/uploads', express.static(uploadsDir));

// ── Routes ───────────────────────────────────────────────────

// POST /api/verify — Nouvelle demande
app.post('/api/verify', limiter, upload.single('ticket_image'), async (req, res) => {
  try {
    const { ticket_type, ticket_code, client_email, client_name } = req.body;

    if (!ticket_type || !ticket_code || !client_email)
      return res.status(400).json({ error: 'Champs obligatoires manquants (type, code, email).' });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client_email))
      return res.status(400).json({ error: 'Adresse email invalide.' });

    const id         = uuidv4();
    const adminToken = uuidv4();

    const imageUrl = req.file
      ? useCloudinary
        ? req.file.path
        : `${process.env.APP_URL || `http://localhost:${PORT}`}/uploads/${req.file.filename}`
      : null;

    const verif = {
      id,
      ticket_type,
      ticket_code: ticket_code.replace(/\s/g, '').toUpperCase(),
      client_email,
      client_name: client_name || null,
      image_path: imageUrl,   // URL complète Cloudinary
      admin_token: adminToken,
    };

    db.prepare(`
      INSERT INTO verifications
        (id, ticket_type, ticket_code, client_email, client_name, image_path, admin_token)
      VALUES
        (@id, @ticket_type, @ticket_code, @client_email, @client_name, @image_path, @admin_token)
    `).run(verif);

    db.prepare(`INSERT INTO audit_log (verification_id, action, ip) VALUES (?, 'submitted', ?)`).run(id, req.ip);

    try { await sendAdminNotification(verif); }
    catch (e) { console.error('Email admin error:', e.message); }

    res.json({
      success: true,
      reference: id.slice(0, 8).toUpperCase(),
      message: 'Votre demande a été soumise. Vous recevrez une réponse par email sous peu.',
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur. Veuillez réessayer.' });
  }
});

// GET /api/status/:ref — Statut d'une demande
app.get('/api/status/:ref', (req, res) => {
  const ref = req.params.ref.toUpperCase();
  const verif = db.prepare(`
    SELECT id, ticket_type, status, amount, admin_note, created_at, updated_at
    FROM verifications WHERE UPPER(SUBSTR(id,1,8)) = ?
  `).get(ref);
  if (!verif) return res.status(404).json({ error: 'Référence introuvable.' });
  res.json(verif);
});

// GET /api/admin/confirm/:id — Lien email admin
app.get('/api/admin/confirm/:id', async (req, res) => {
  const { id } = req.params;
  const { token, action, amount, note } = req.query;

  if (!['approve', 'reject'].includes(action))
    return res.status(400).send(adminPage('Erreur', '⚠️ Action invalide.', '#A32D2D'));

  const verif = db.prepare('SELECT * FROM verifications WHERE id = ? AND admin_token = ?').get(id, token);
  if (!verif)
    return res.status(403).send(adminPage('Accès refusé', '🔒 Lien invalide ou expiré.', '#A32D2D'));

  if (verif.status !== 'pending')
    return res.send(adminPage('Déjà traité', `ℹ️ Cette demande a déjà été ${verif.status === 'approved' ? 'validée' : 'rejetée'}.`, '#185FA5'));

  if (action === 'approve' && !amount)
    return res.send(adminFormPage(verif, token));

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  db.prepare(`UPDATE verifications SET status=?, amount=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
    .run(newStatus, amount || null, note || null, id);
  db.prepare(`INSERT INTO audit_log (verification_id, action, ip) VALUES (?, ?, ?)`).run(id, newStatus, req.ip);

  const updated = db.prepare('SELECT * FROM verifications WHERE id=?').get(id);
  try {
    if (newStatus === 'approved') await sendClientApproved(updated);
    else await sendClientRejected(updated);
  } catch (e) { console.error('Email client error:', e.message); }

  const label = newStatus === 'approved' ? 'validé' : 'rejeté';
  res.send(adminPage(`Ticket ${label}`,
    `${newStatus === 'approved' ? '✅' : '❌'} Le ticket a été <strong>${label}</strong>. Le client a été notifié.`,
    newStatus === 'approved' ? '#3B6D11' : '#A32D2D'));
});

// POST /api/admin/confirm/:id — Formulaire admin
app.post('/api/admin/confirm/:id', async (req, res) => {
  const { id } = req.params;
  const { token, action, amount, note } = req.body;

  const verif = db.prepare('SELECT * FROM verifications WHERE id=? AND admin_token=?').get(id, token);
  if (!verif) return res.status(403).send(adminPage('Accès refusé', '🔒 Lien invalide.', '#A32D2D'));
  if (verif.status !== 'pending') return res.send(adminPage('Déjà traité', 'ℹ️ Déjà traité.', '#185FA5'));

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  db.prepare(`UPDATE verifications SET status=?, amount=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
    .run(newStatus, amount || null, note || null, id);
  db.prepare(`INSERT INTO audit_log (verification_id, action) VALUES (?, ?)`).run(id, newStatus);

  const updated = db.prepare('SELECT * FROM verifications WHERE id=?').get(id);
  try {
    if (newStatus === 'approved') await sendClientApproved(updated);
    else await sendClientRejected(updated);
  } catch (e) { console.error(e.message); }

  const label = newStatus === 'approved' ? 'validé' : 'rejeté';
  res.send(adminPage(`Ticket ${label}`, `✅ Ticket ${label}. Le client a été notifié.`, newStatus === 'approved' ? '#3B6D11' : '#A32D2D'));
});

function isAdminAuthorized(req) {
  const secret = req.headers['x-admin-secret'] || req.query.admin_secret;
  return secret && secret === process.env.ADMIN_SECRET;
}

app.get('/api/admin/requests', (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Non autorisé' });
  const rows = db.prepare(`
    SELECT id, ticket_type, ticket_code, client_email, client_name, image_path, status, amount, admin_note, created_at, updated_at
    FROM verifications ORDER BY created_at DESC LIMIT 200
  `).all();
  res.json(rows.map(row => ({
    ...row,
    short_ref: row.id.slice(0, 8).toUpperCase(),
  })));
});

app.post('/api/admin/action/:id', async (req, res) => {
  if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Non autorisé' });
  const { action, amount, note } = req.body;
  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ error: 'Action invalide.' });

  const id = req.params.id;
  const verif = db.prepare('SELECT * FROM verifications WHERE id = ?').get(id);
  if (!verif) return res.status(404).json({ error: 'Demande introuvable.' });
  if (verif.status !== 'pending')
    return res.status(400).json({ error: 'Cette demande a déjà été traitée.' });

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  db.prepare(`UPDATE verifications SET status=?, amount=?, admin_note=?, updated_at=datetime('now') WHERE id=?`)
    .run(newStatus, amount || null, note || null, id);
  db.prepare(`INSERT INTO audit_log (verification_id, action, details, ip) VALUES (?, ?, ?, ?)`)
    .run(id, newStatus, note || null, req.ip);

  const updated = db.prepare('SELECT * FROM verifications WHERE id = ?').get(id);
  try {
    if (newStatus === 'approved') await sendClientApproved(updated);
    else await sendClientRejected(updated);
  } catch (e) {
    console.error('Email client error:', e.message);
  }

  res.json({ success: true, status: newStatus, reference: updated.id.slice(0, 8).toUpperCase() });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

app.get('/api/admin/dashboard', (req, res) => {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET)
    return res.status(401).json({ error: 'Non autorisé' });
  const rows = db.prepare(`
    SELECT id, ticket_type, ticket_code, client_email, client_name, status, amount, created_at, updated_at
    FROM verifications ORDER BY created_at DESC LIMIT 200
  `).all();
  res.json(rows);
});

// ── Pages HTML admin ─────────────────────────────────────────
function adminPage(title, message, color) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;background:#f4f4f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;padding:40px 48px;border-radius:12px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.1);max-width:420px}
.title{font-size:22px;font-weight:700;color:${color};margin:0 0 12px}
p{color:#555;font-size:15px;line-height:1.6}a{color:${color};font-size:14px}</style></head>
<body><div class="box"><div class="title">${title}</div><p>${message}</p><a href="javascript:window.close()">Fermer</a></div></body></html>`;
}

function adminFormPage(verif, token) {
  const typeLabels = { transcash:'Transcash', pcs:'PCS', neosurf:'Neosurf', paysafecard:'Paysafecard', flexepin:'Flexepin' };
  // image_path est maintenant une URL Cloudinary complète
  const imgHtml = verif.image_path
    ? `<img src="${verif.image_path}" style="max-width:100%;border-radius:8px;border:1px solid #eee;margin:12px 0"/>`
    : '<p style="color:#bbb;font-size:13px;">Pas d\'image fournie</p>';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Vérifier ticket</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f4f4f4;padding:24px;margin:0}
.card{background:#fff;border-radius:12px;max-width:560px;margin:0 auto;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,.1)}
h2{margin:0 0 20px;color:#042C53;font-size:20px}
.info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
.lbl{color:#888}.val{font-weight:600}
.code{font-family:monospace;font-size:18px;letter-spacing:3px;background:#f0f4ff;padding:4px 12px;border-radius:6px;color:#042C53}
label{display:block;margin:16px 0 6px;font-size:13px;color:#555;font-weight:600}
input,textarea{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px}
textarea{height:80px;resize:vertical}.actions{display:flex;gap:12px;margin-top:24px}
.btn{flex:1;padding:14px;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}
.ok{background:#3B6D11;color:#fff}.ko{background:#A32D2D;color:#fff}</style></head>
<body><div class="card">
<h2>🎫 Demande de vérification</h2>
<div class="info-row"><span class="lbl">Référence</span><span class="val">#${verif.id.slice(0,8).toUpperCase()}</span></div>
<div class="info-row"><span class="lbl">Type</span><span class="val">${typeLabels[verif.ticket_type]||verif.ticket_type}</span></div>
<div class="info-row"><span class="lbl">Code</span><span class="code">${verif.ticket_code}</span></div>
<div class="info-row"><span class="lbl">Client</span><span class="val">${verif.client_name||'—'}</span></div>
<div class="info-row"><span class="lbl">Email</span><span class="val">${verif.client_email}</span></div>
<div style="margin:16px 0">${imgHtml}</div>
<form method="POST" action="/api/admin/confirm/${verif.id}">
<input type="hidden" name="token" value="${token}"/>
<input type="hidden" name="action" id="actionField" value="approve"/>
<label>Montant (si validé)</label>
<input type="text" name="amount" placeholder="ex: 20,00 €"/>
<label>Note / Motif (optionnel)</label>
<textarea name="note" placeholder="Informations supplémentaires..."></textarea>
<div class="actions">
<button type="submit" class="btn ok" onclick="document.getElementById('actionField').value='approve'">✅ Valider</button>
<button type="submit" class="btn ko" onclick="document.getElementById('actionField').value='reject'">❌ Rejeter</button>
</div></form></div></body></html>`;
}

// ── Démarrage ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎫  TicketCheck → http://localhost:${PORT}`);
  console.log(`☁️   Cloudinary  : ${process.env.CLOUDINARY_CLOUD_NAME || '⚠️ non configuré'}`);
  console.log(`📧  Admin email  : ${process.env.ADMIN_EMAIL}`);
  console.log(`💾  SQLite       : ${process.env.DB_PATH || './data/tickets.db'}\n`);
});

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `"${process.env.SMTP_FROM_NAME || 'TicketCheck'}" <${process.env.SMTP_FROM_EMAIL}>`;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ── Email vers l'ADMIN lors d'une nouvelle demande ──────────
async function sendAdminNotification(verif) {
  const confirmUrl = `${APP_URL}/api/admin/confirm/${verif.id}?token=${verif.admin_token}&action=approve`;
  const rejectUrl  = `${APP_URL}/api/admin/confirm/${verif.id}?token=${verif.admin_token}&action=reject`;

  const typeLabels = {
    transcash: 'Transcash', pcs: 'PCS', neosurf: 'Neosurf',
    paysafecard: 'Paysafecard', flexepin: 'Flexepin',
  };

  await transporter.sendMail({
    from: FROM,
    to: process.env.ADMIN_EMAIL,
    subject: `[TicketCheck] Nouvelle demande — ${typeLabels[verif.ticket_type] || verif.ticket_type}`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
  .card{background:#fff;border-radius:10px;max-width:600px;margin:0 auto;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:#042C53;color:#fff;padding:24px 32px}
  .header h1{margin:0;font-size:20px;font-weight:600}
  .header p{margin:4px 0 0;opacity:.8;font-size:14px}
  .body{padding:28px 32px}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px}
  .row:last-of-type{border-bottom:none}
  .label{color:#888;font-size:13px}
  .value{font-weight:600;color:#111}
  .code{font-family:monospace;font-size:18px;letter-spacing:3px;background:#f8f8f8;padding:6px 14px;border-radius:6px;color:#042C53}
  .img-section{margin:20px 0;text-align:center}
  .img-section img{max-width:100%;border-radius:8px;border:1px solid #eee}
  .actions{display:flex;gap:16px;margin-top:28px}
  .btn{flex:1;padding:14px;border-radius:8px;text-align:center;text-decoration:none;font-weight:700;font-size:15px}
  .btn-ok{background:#3B6D11;color:#fff}
  .btn-ko{background:#A32D2D;color:#fff}
  .footer{background:#f8f8f8;padding:14px 32px;font-size:12px;color:#aaa;text-align:center}
</style></head>
<body>
<div class="card">
  <div class="header">
    <h1>🎫 Nouvelle demande de vérification</h1>
    <p>Référence : #${verif.id.slice(0,8).toUpperCase()}</p>
  </div>
  <div class="body">
    <div class="row"><span class="label">Type de ticket</span><span class="value">${typeLabels[verif.ticket_type] || verif.ticket_type}</span></div>
    <div class="row"><span class="label">Code</span><span class="code">${verif.ticket_code}</span></div>
    <div class="row"><span class="label">Client</span><span class="value">${verif.client_name || 'Non renseigné'}</span></div>
    <div class="row"><span class="label">Email client</span><span class="value">${verif.client_email}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${new Date().toLocaleString('fr-FR')}</span></div>
    ${verif.image_path ? `<div class="img-section"><p style="color:#555;margin-bottom:8px;font-size:13px;">📎 Image du ticket joint</p><img src="${verif.image_path}" alt="Image du ticket"/></div>` : '<p style="color:#bbb;font-size:13px;margin-top:16px;">Aucune image fournie</p>'}
    <div class="actions">
      <a href="${confirmUrl}" class="btn btn-ok">✅ VALIDER le ticket</a>
      <a href="${rejectUrl}" class="btn btn-ko">❌ REJETER le ticket</a>
    </div>
  </div>
  <div class="footer">TicketCheck — Cliquez sur un bouton pour répondre au client automatiquement.</div>
</div>
</body></html>
    `,
  });
}

// ── Email vers le CLIENT : ticket VALIDÉ ────────────────────
async function sendClientApproved(verif) {
  await transporter.sendMail({
    from: FROM,
    to: verif.client_email,
    subject: `✅ Votre ticket a été validé — TicketCheck`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
  .card{background:#fff;border-radius:10px;max-width:560px;margin:0 auto;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:#3B6D11;color:#fff;padding:28px 32px;text-align:center}
  .header .icon{font-size:48px;margin-bottom:10px}
  .header h1{margin:0;font-size:22px}
  .body{padding:28px 32px}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px}
  .label{color:#888;font-size:13px}
  .value{font-weight:600;color:#111}
  .code{font-family:monospace;font-size:18px;letter-spacing:3px;background:#EAF3DE;padding:6px 14px;border-radius:6px;color:#3B6D11}
  .amount-box{background:#EAF3DE;border-radius:8px;padding:16px;text-align:center;margin:20px 0}
  .amount-box .amt{font-size:32px;font-weight:700;color:#3B6D11}
  .amount-box .lbl{font-size:13px;color:#639922}
  .note{background:#f8f8f8;border-left:3px solid #ccc;padding:10px 16px;border-radius:0 6px 6px 0;font-size:14px;color:#555;margin-top:16px}
  .footer{background:#f8f8f8;padding:14px 32px;font-size:12px;color:#aaa;text-align:center}
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="icon">✅</div>
    <h1>Ticket validé avec succès !</h1>
  </div>
  <div class="body">
    <p style="color:#555;margin-bottom:20px">Bonjour ${verif.client_name || 'Client'},<br>Votre ticket de recharge a été vérifié et validé par notre équipe.</p>
    <div class="row"><span class="label">Référence</span><span class="value">#${verif.id.slice(0,8).toUpperCase()}</span></div>
    <div class="row"><span class="label">Type</span><span class="value">${verif.ticket_type}</span></div>
    <div class="row"><span class="label">Code</span><span class="code">${verif.ticket_code}</span></div>
    ${verif.amount ? `<div class="amount-box"><div class="lbl">Montant validé</div><div class="amt">${verif.amount}</div></div>` : ''}
    ${verif.admin_note ? `<div class="note">📝 ${verif.admin_note}</div>` : ''}
  </div>
  <div class="footer">TicketCheck — Merci de votre confiance.</div>
</div>
</body></html>
    `,
  });
}

// ── Email vers le CLIENT : ticket REJETÉ ────────────────────
async function sendClientRejected(verif) {
  await transporter.sendMail({
    from: FROM,
    to: verif.client_email,
    subject: `❌ Ticket non valide — TicketCheck`,
    html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px}
  .card{background:#fff;border-radius:10px;max-width:560px;margin:0 auto;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:#A32D2D;color:#fff;padding:28px 32px;text-align:center}
  .header .icon{font-size:48px;margin-bottom:10px}
  .header h1{margin:0;font-size:22px}
  .body{padding:28px 32px}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:15px}
  .label{color:#888;font-size:13px}
  .value{font-weight:600;color:#111}
  .code{font-family:monospace;font-size:18px;letter-spacing:3px;background:#FCEBEB;padding:6px 14px;border-radius:6px;color:#A32D2D}
  .note{background:#FCEBEB;border-left:3px solid #F09595;padding:10px 16px;border-radius:0 6px 6px 0;font-size:14px;color:#791F1F;margin-top:16px}
  .footer{background:#f8f8f8;padding:14px 32px;font-size:12px;color:#aaa;text-align:center}
</style></head>
<body>
<div class="card">
  <div class="header">
    <div class="icon">❌</div>
    <h1>Ticket non valide</h1>
  </div>
  <div class="body">
    <p style="color:#555;margin-bottom:20px">Bonjour ${verif.client_name || 'Client'},<br>Après vérification, votre ticket de recharge n'a pas pu être validé.</p>
    <div class="row"><span class="label">Référence</span><span class="value">#${verif.id.slice(0,8).toUpperCase()}</span></div>
    <div class="row"><span class="label">Type</span><span class="value">${verif.ticket_type}</span></div>
    <div class="row"><span class="label">Code</span><span class="code">${verif.ticket_code}</span></div>
    ${verif.admin_note ? `<div class="note">📝 Motif : ${verif.admin_note}</div>` : '<div class="note">Ce ticket semble invalide, expiré ou déjà utilisé. Veuillez vérifier votre code et réessayer, ou contacter notre support.</div>'}
  </div>
  <div class="footer">TicketCheck — En cas de litige, répondez à cet email.</div>
</div>
</body></html>
    `,
  });
}

module.exports = { sendAdminNotification, sendClientApproved, sendClientRejected, transporter };

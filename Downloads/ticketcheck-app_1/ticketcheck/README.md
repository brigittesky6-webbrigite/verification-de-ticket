# 🎫 TicketCheck — Guide d'installation complet

Application complète de vérification de tickets de recharge (Transcash, PCS, Neosurf, Paysafecard, Flexepin).

## Architecture

```
ticketcheck/
├── backend/
│   ├── server.js        ← Serveur Express principal
│   ├── db.js            ← Base de données SQLite
│   ├── mailer.js        ← Envoi d'emails (Nodemailer)
│   ├── package.json
│   ├── .env.example     ← À copier en .env
│   └── data/            ← Créé automatiquement (tickets.db)
│   └── uploads/         ← Images des tickets
└── frontend/
    └── index.html       ← Interface client
```

## Flux de fonctionnement

```
Client soumet (code + image + email)
        ↓
Serveur enregistre en base SQLite
        ↓
Email envoyé à l'ADMIN avec boutons [Valider] / [Rejeter]
        ↓
Admin clique → formulaire (montant + note)
        ↓
Admin soumet → email automatique envoyé au CLIENT
        ↓
Client reçoit : ✅ Validé ou ❌ Rejeté
```

---

## 1. Prérequis

- **Node.js** v18 ou supérieur → https://nodejs.org
- Un compte email avec accès SMTP (Gmail, OVH, Brevo, etc.)

Vérifier Node.js :
```bash
node --version   # doit afficher v18+
npm --version
```

---

## 2. Installation

```bash
# Cloner / décompresser le projet, puis :
cd ticketcheck/backend

# Installer les dépendances
npm install

# Copier le fichier de configuration
cp .env.example .env
```

---

## 3. Configuration (fichier .env)

Ouvrez `backend/.env` et remplissez :

### Email Gmail (recommandé)

1. Allez sur https://myaccount.google.com/security
2. Activez **"Validation en deux étapes"**
3. Cherchez **"Mots de passe des applications"**
4. Créez un mot de passe pour "Mail" → copiez les 16 caractères

```env
ADMIN_EMAIL=votre-email@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre-email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   ← App Password Gmail (16 caractères)
SMTP_FROM_NAME=TicketCheck
SMTP_FROM_EMAIL=votre-email@gmail.com
ADMIN_SECRET=une-cle-secrete-aleatoire-longue
APP_URL=http://localhost:3000    ← En production : https://votre-domaine.com
```

### Email OVH

```env
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contact@votre-domaine.fr
SMTP_PASS=votre-mot-de-passe
```

### Email Brevo (ex-Sendinblue) — gratuit jusqu'à 300 emails/jour

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre-email@brevo.com
SMTP_PASS=votre-api-key-brevo
```

---

## 4. Démarrage

```bash
cd ticketcheck/backend

# Mode développement (avec rechargement automatique)
npm run dev

# Mode production
npm start
```

Le serveur démarre sur http://localhost:3000

Ouvrez votre navigateur → http://localhost:3000
---

## 7. Déploiement sur Render

Ce projet peut être déployé comme un service Node.js sur Render.

### 7.1. Préparer les variables d'environnement

Dans Render, définissez au minimum :

- `ADMIN_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_NAME`
- `SMTP_FROM_EMAIL`
- `ADMIN_SECRET`
- `APP_URL` : l'URL publique de votre service Render, par exemple `https://votre-app.onrender.com`
- `DB_PATH` : utilisez `/data/tickets.db` pour rendre la base de données persistante
- `UPLOADS_PATH` : utilisez `/data/uploads` pour rendre les images persistantes

Si vous voulez éviter toute configuration de stockage local sur Render, activez **Cloudinary** et remplissez :

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### 7.2. Utiliser le fichier `render.yaml`

Un fichier `render.yaml` est fourni à la racine du dépôt. Il configure un service web Node.js qui :

- installe les dépendances dans `backend`
- démarre le serveur avec `npm start`

### 7.3. Déploiement Render simple

1. Connectez votre dépôt GitHub à Render.
2. Créez un nouveau service web.
3. Choisissez la branche `main`.
4. Dans `Build Command` :

```bash
cd backend && npm install
```

5. Dans `Start Command` :

```bash
cd backend && npm start
```

6. Activez `Auto Deploy` si vous souhaitez déployer à chaque push.

7. Ajoutez les variables d'environnement ci-dessus dans la section `Environment`.

> Important : si vous utilisez le stockage local (`UPLOADS_PATH` et `DB_PATH`), Render nécessite un disque persistant pour conserver les fichiers après redémarrage. Sinon utilisez Cloudinary.
---

## 5. Utilisation

### Côté Client
1. Ouvre http://votre-domaine.com
2. Choisit le type de ticket (Transcash, PCS…)
3. Saisit le code
4. Entre son email
5. Upload la photo du ticket
6. Clique "Envoyer ma demande"
7. Reçoit une référence (ex: `A3F72B1C`)

### Côté Admin (vous)
1. Recevez un email avec toutes les infos + image du ticket
2. Cliquez **✅ VALIDER** ou **❌ REJETER**
3. Un formulaire s'ouvre → renseignez le montant et/ou une note
4. Le client reçoit automatiquement la réponse par email

### Tableau de bord Admin
Vous pouvez aussi gérer les demandes depuis l'interface admin :
- Ouvrez `http://localhost:3000/admin`
- Entrez votre clé secrète `ADMIN_SECRET`
- Validez ou rejetez les demandes depuis le tableau

### Suivi client
Le client peut suivre sa demande en bas de la page avec sa référence.

---

## 6. Mise en production (VPS / serveur)

### Option A — PM2 (recommandé)
```bash
npm install -g pm2
cd ticketcheck/backend
pm2 start server.js --name ticketcheck
pm2 save
pm2 startup   # Pour démarrer au reboot
```

### Option B — Nginx + PM2

Créez `/etc/nginx/sites-available/ticketcheck` :
```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    client_max_body_size 15M;  # Pour les uploads d'images

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/ticketcheck /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL gratuit avec Certbot
certbot --nginx -d votre-domaine.com
```

Mettez à jour `.env` :
```env
APP_URL=https://votre-domaine.com
```

---

## 7. Base de données SQLite

La base se trouve dans `backend/data/tickets.db`.

### Consulter les demandes manuellement
```bash
cd backend
sqlite3 data/tickets.db

# Voir toutes les demandes
SELECT id, ticket_type, ticket_code, client_email, status, created_at FROM verifications;

# Voir seulement les demandes en attente
SELECT * FROM verifications WHERE status = 'pending';

# Quitter
.quit
```

### API Dashboard (optionnel)
Pour voir les demandes via API :
```bash
curl -H "x-admin-secret: VOTRE_ADMIN_SECRET" http://localhost:3000/api/admin/dashboard
```

---

## 8. Types de tickets supportés

| Type        | Longueur | Format           |
|-------------|----------|------------------|
| Transcash   | 16 chiffres | XXXX XXXX XXXX XXXX |
| PCS         | 16 chiffres | XXXX XXXX XXXX XXXX |
| Neosurf     | 10 chiffres | XXXX XXXX XX        |
| Paysafecard | 16 chiffres | XXXX XXXX XXXX XXXX |
| Flexepin    | 16 chiffres | XXXX XXXX XXXX XXXX |

---

## 9. Ajouter un nouveau type de ticket

Dans `frontend/index.html`, ajoutez dans `.type-grid` :
```html
<div class="type-btn" data-type="montype" onclick="selectType(this)">
  <div class="type-emoji">🎟️</div>
  <div class="type-name">MonType</div>
  <div class="type-hint">12 chiffres</div>
</div>
```

Dans `frontend/index.html` → script, ajoutez dans `typeLens` :
```js
const typeLens = { ..., montype: 12 };
```

Dans `backend/mailer.js`, ajoutez dans `typeLabels` :
```js
const typeLabels = { ..., montype: 'MonType' };
```

---

## 10. Sécurité

- ✅ Rate limiting : 10 requêtes max / 15 min par IP
- ✅ Validation des types de fichiers (images uniquement)
- ✅ Taille max des fichiers configurable (10 Mo par défaut)
- ✅ Tokens admin uniques par demande (UUID v4)
- ✅ Codes masqués dans l'historique
- ✅ Audit log de toutes les actions

---

## Support

En cas de problème, vérifiez :
1. `node --version` ≥ 18
2. Le fichier `.env` est bien rempli (pas `.env.example`)
3. Les logs du serveur dans le terminal
4. Que votre SMTP est correct (testez avec un outil comme https://www.smtpter.com)

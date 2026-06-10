# Soluxa Chatbots

Plateforme multi-tenants de chatbots custom (interne + externe) pour Soluxa.

- **Backend** : Node.js + Express + SQLite (better-sqlite3)
- **LLM** : OpenAI ou Anthropic, clé API saisie depuis l'UI (chiffrée AES-256-GCM)
- **Widget** : un seul `<script>` à coller dans n'importe quel site (Shadow DOM, zéro collision CSS)
- **Dashboard admin** : HTML/JS vanilla, login email/mot de passe, gestion des bots, documents, leads et conversations.

---

## 1. Démarrage local

Prérequis : Node 20+.

```bash
cd soluxa-chatbot
npm install
cp .env.example .env

# Génère une MASTER_KEY (32 octets hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Colle le résultat dans MASTER_KEY=

# Choisis aussi un SESSION_SECRET long et change ADMIN_PASSWORD
```

Crée l'admin et les 2 bots de démo :
```bash
npm run seed
```

Démarre :
```bash
npm run dev   # node --watch (rechargement auto)
# ou
npm start
```

Ouvre `http://localhost:3001/admin/` → connecte-toi avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## 2. Utilisation (côté admin)

1. **Crée un chatbot** depuis la barre latérale (audience `Externe` ou `Interne`).
2. **Onglet IA / Clé API** : choisis le fournisseur (OpenAI / Anthropic), le modèle, colle la clé API, clique sur **Tester**. Enregistre.
3. **Onglet Documents** : glisse-dépose PDF / DOCX / TXT / images. Le texte est extrait et stocké. Surveille la barre "caractères utilisés".
4. **Onglet Général** : ajuste le périmètre (`scope_topics`), le message de refus hors-sujet, la persona.
5. **Onglet Contact** : email / tél / adresse / horaires / URL — fournis au bot pour qu'il puisse les communiquer.
6. **Onglet Branding** : couleurs, police, logo. Valeurs Soluxa pré-remplies. Aperçu live.
7. **Onglet Intégration** : copie le snippet `<script>` et colle-le sur le site cible. Configure les domaines autorisés (CORS).

### Intégration sur un site

```html
<script src="https://chatbot.soluxa.ch/widget.js" data-bot-id="xxxxxxxxxxxx" defer></script>
```

À coller dans `<body>` (juste avant `</body>`) ou dans `<head>` (avec `defer`).

---

## 3. Architecture des données

- `bots` : configuration de chaque chatbot (audience, persona, scope, branding, contact, provider/modèle, clé chiffrée).
- `documents` : fichiers uploadés + leur **texte extrait** (le binaire n'est pas conservé).
- `conversations` / `messages` : historique pour fenêtre glissante et audit.
- `leads` : prises de contact (formulaire intégré au widget, déclenché par intention détectée).

Stockage : `./data/soluxa.db` (SQLite WAL). **C'est le seul dossier à backuper.**

### Garde-fous du bot

Le system prompt force :
- Réponse uniquement dans le `scope_topics`.
- Hors-sujet → réponse exacte = `refusal_message`.
- Pas de réponses générales (météo, code, etc.) hors périmètre.
- Connaissance limitée aux documents fournis.

### Sécurité clé API
Les clés sont chiffrées **AES-256-GCM** avec `MASTER_KEY` (jamais en clair en base, jamais renvoyées au front).
**Conserve `MASTER_KEY` en sécurité** : sans elle les clés stockées sont irrécupérables.

---

## 4. Déploiement VPS (Hetzner/OVH/DigitalOcean)

### Prérequis serveur
- Ubuntu 22.04+ / Debian 12+
- Node 20+, build tools (`apt install build-essential` — better-sqlite3 compile en natif)
- Nginx, certbot

### Mise en place
```bash
# 1. Cloner ou rsync le dossier soluxa-chatbot/ vers /opt/soluxa-chatbot
sudo mkdir -p /opt/soluxa-chatbot
sudo chown $USER:$USER /opt/soluxa-chatbot
rsync -av --exclude node_modules --exclude data --exclude .env ./soluxa-chatbot/ user@vps:/opt/soluxa-chatbot/

# 2. Sur le VPS
cd /opt/soluxa-chatbot
npm ci --omit=dev
cp .env.example .env
nano .env     # génère MASTER_KEY, SESSION_SECRET, ADMIN_PASSWORD, PUBLIC_BASE_URL=https://chatbot.soluxa.ch
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run seed
```

### PM2 (gestionnaire de process)
```bash
sudo npm i -g pm2
pm2 start server.js --name soluxa-chatbot
pm2 save
pm2 startup   # suit l'instruction affichée
```

### Nginx (reverse proxy + SSE)
```nginx
server {
  listen 80;
  server_name chatbot.soluxa.ch;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE / streaming
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
  }
}
```

```bash
sudo certbot --nginx -d chatbot.soluxa.ch
```

### Backup
Sauvegarde `./data/` (DB SQLite + uploads). Exemple avec `restic` ou simple `rsync` quotidien vers stockage offsite.

---

## 5. Personnalisation

- **Limite de connaissance par bot** : `maxKnowledgeChars` dans `src/config.js` (par défaut 80 000 chars ≈ 150 pages). Si dépassé, le texte est tronqué (préfère un découpage manuel + résumés).
- **Fenêtre de contexte conversationnel** : `conversationWindow` (12 derniers messages).
- **OCR images** : `ENABLE_OCR=1` + `npm i tesseract.js`. Sinon le texte des images est ignoré.
- **Limite taille upload** : `25 MB` (voir `multer` dans `src/routes/admin.js`).
- **Modèles par défaut** : `gpt-4o-mini` (OpenAI) et `claude-haiku-4-5` (Anthropic). Modifiables par bot.

---

## 6. Test end-to-end

1. Crée un bot "Test", colle ta clé OpenAI → **Tester** doit renvoyer ✅.
2. Uploade un PDF d'environ 5 pages → vérifie le compteur "caractères utilisés".
3. Onglet Général : limite explicitement le scope ("Réponds uniquement sur le contenu de ce PDF.") avec un refus clair.
4. Onglet Intégration : copie le snippet, colle-le dans un fichier `test.html` local (`python3 -m http.server`).
5. Ouvre la page → la bulle s'affiche avec les couleurs Soluxa.
6. Pose une question dans le scope → réponse cohérente avec le PDF (streaming).
7. Pose une question hors scope → exactement le `refusal_message`.
8. Demande "Pouvez-vous me rappeler ?" → le bot doit déclencher le formulaire de prise de contact.
9. Soumets le formulaire → l'onglet **Leads** doit l'afficher.
10. Crée un 2e bot avec une autre clé/audience pour vérifier l'isolation des données.

---

## 7. Limites assumées (MVP)

- Pas de RAG vectorielle : tout est concaténé dans le system prompt → bon pour ~150 pages de doc / bot.
  → À l'usage si dépassement : ajouter `sqlite-vec` + embeddings (changement isolé dans `src/chat.js`).
- 1 seul admin par défaut (extensible : table `admins` déjà multi-comptes).
- Pas d'email automatique sur nouveau lead (export CSV disponible).
- FR uniquement côté widget.

# Déploiement — guide express

Le projet est prêt à déployer **tel quel** sur n'importe quelle plateforme qui sait faire tourner du Node.js avec un disque persistant. Le seed s'exécute automatiquement à chaque démarrage (idempotent : il ne recrée pas les bots/admins existants).

## Variables d'environnement à définir

| Nom | Valeur |
|---|---|
| `MASTER_KEY` | 64 caractères hex (générer : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `SESSION_SECRET` | longue chaîne aléatoire |
| `ADMIN_EMAIL` | email du compte admin initial |
| `ADMIN_PASSWORD` | mot de passe initial (à changer ensuite) |
| `PUBLIC_BASE_URL` | URL publique finale (ex: `https://chatbot.soluxa.ch`) |
| `PORT` | injecté par la plateforme (ne pas forcer en général) |

## Plateformes — étapes

### Railway (recommandé, le plus simple)
1. Push le dossier sur un repo GitHub.
2. railway.app → **New Project** → **Deploy from GitHub repo**.
3. **Variables** : ajouter les vars ci-dessus.
4. **Settings → Volumes** : Mount path `/app/data` (sinon SQLite et uploads sont perdus à chaque redéploiement).
5. **Settings → Networking** : Generate Domain ou ajoute ton domaine.

### Render
1. Push sur GitHub.
2. render.com → **New → Web Service** → connecte le repo.
3. Runtime : **Node**, Build : `npm install`, Start : `npm start`.
4. **Environment** : ajoute les variables.
5. **Disks** : ajoute un disque, Mount Path `/opt/render/project/src/data`, taille 1 Go (~$1/mois).

### Fly.io
```bash
fly launch          # détecte le Dockerfile, accepte les défauts
fly volumes create soluxa_data --size 1
# Dans fly.toml, ajouter sous [mounts]: source="soluxa_data", destination="/app/data"
fly secrets set MASTER_KEY=... SESSION_SECRET=... ADMIN_EMAIL=... ADMIN_PASSWORD=... PUBLIC_BASE_URL=https://...
fly deploy
```

### Docker simple (n'importe quel VPS avec Docker)
```bash
docker build -t soluxa-chatbot .
docker run -d --name soluxa-chatbot \
  -p 3001:3001 \
  -v /srv/soluxa-data:/app/data \
  -e MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_EMAIL=admin@soluxa.ch \
  -e ADMIN_PASSWORD=changeme \
  -e PUBLIC_BASE_URL=https://chatbot.soluxa.ch \
  soluxa-chatbot
```

Puis Nginx + Certbot devant pour le HTTPS (voir `README.md` section 4).

### VPS sans Docker
Voir `README.md` section 4 (PM2 + Nginx + Certbot).

## Vérifications post-déploiement
1. Ouvre `https://<ton-domaine>/admin/` → page de login Soluxa.
2. Login avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` → tu vois les 2 bots seedés.
3. Va dans **IA / Clé API** → colle ta clé OpenAI ou Anthropic → **Tester** → ✅.
4. Onglet **Intégration** → copie le snippet `<script>` et colle-le sur ton site.

## Important
- **Garde `MASTER_KEY` en sécurité** : si tu la perds, toutes les clés API stockées sont irrécupérables.
- **Backup `./data/`** : c'est le seul dossier à sauvegarder (SQLite + uploads).
- **Change `ADMIN_PASSWORD`** après le premier login (à faire via une nouvelle entrée DB ou en relançant `seed` après avoir manuellement modifié la table).

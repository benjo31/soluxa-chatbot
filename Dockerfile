FROM node:20-bookworm-slim

# Outils pour compiler better-sqlite3 (natif)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Dossier de données persistant (à monter en volume sur l'hôte)
VOLUME ["/app/data"]

ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]

# Dockerfile pour le service d'authentification SupervIA

# ==============================================================================
# ÉTAPE 1: BUILDER
# Installe les dépendances de production dans un environnement propre et isolé.
# ==============================================================================
FROM node:20-alpine AS builder

ENV NODE_ENV=production
WORKDIR /app

# Copie des fichiers de dépendances et installation propre
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copie du code source dans cette étape pour assurer la cohérence
COPY src ./src


# ==============================================================================
# ÉTAPE 2: PRODUCTION
# Construit l'image finale légère avec le code et les dépendances.
# ==============================================================================
FROM node:20-alpine

ENV NODE_ENV=production
ENV TZ=Europe/Paris

# Mise à jour et installation des paquets de base (tzdata pour les fuseaux horaires)
RUN apk add --no-cache tzdata curl

# Création d'un groupe et d'un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodeuser

WORKDIR /app

# Copie des dépendances et du code source depuis l'étape de build
# L'utilisation de --chown évite une commande CHOWN supplémentaire
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/src ./src
COPY --chown=nodeuser:nodejs package*.json ./

# Création des répertoires pour les volumes avec les bonnes permissions
# Le répertoire 'keys' est ajouté pour correspondre au docker-compose.yml
RUN mkdir -p logs keys && \
    chown -R nodeuser:nodejs logs keys

# Exposition du port
EXPOSE 3001

# Vérification de la santé du conteneur pour l'orchestration Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Passage à l'utilisateur non-root pour l'exécution
USER nodeuser

# Commande de démarrage du service
CMD ["node", "src/server.js"] 
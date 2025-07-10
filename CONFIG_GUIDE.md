# 🔧 Guide de Configuration SupervIA Auth Service

## 🚀 Configuration Rapide

### 1. Copier le fichier d'exemple
```bash
cp .env.example .env
```

### 2. Configurer les variables essentielles
```bash
# Variables OBLIGATOIRES à modifier
DB_SERVICE_URL=http://localhost:3002
JWT_SECRET=your_very_secure_secret_for_service_communication_min_32_chars
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
COOKIE_SECRET=your_cookie_secret_min_32_chars_change_in_production
```

### 3. Valider la configuration
```bash
npm run validate-config
```

### 4. Initialiser le service
Ce script génère les clés de signature RSA qui seront stockées en base de données (via le db-service).
```bash
npm run setup
```

---

## 📋 Variables d'Environnement Détaillées

### 🔐 **JWT & Sécurité (OBLIGATOIRES)**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `JWT_SECRET` | Secret partagé pour la communication inter-services (min 32 chars) | `your_secure_shared_secret_32_chars_min` | ✅ |
| `COOKIE_SECRET` | Secret pour les cookies (min 32 chars) | `your_cookie_secret_32_chars_min` | ✅ |

**Note sur les tokens**: Les tokens d'accès et d'identité (JWT) sont signés avec une paire de clés RS256. Ces clés sont générées via `npm run generate-keys` et stockées en base de données, pas dans des variables d'environnement.

### 🔗 **Services Externes (OBLIGATOIRE)**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `DB_SERVICE_URL` | URL du service de base de données | `http://localhost:3002` | ✅ |

### 🌐 **Serveur & URLs (OBLIGATOIRES)**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `API_URL` | URL publique de l'API | `http://localhost:3001` | ✅ |
| `FRONTEND_URL` | URL du frontend | `http://localhost:3000` | ✅ |
| `NODE_ENV` | Environnement d'exécution | `development` / `production` | ⭕ |
| `PORT` | Port d'écoute | `3001` | ⭕ |

### 🛡️ **CORS & Cookies**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `CORS_ORIGINS` | URLs autorisées (séparées par ,) | `http://localhost:3000,http://localhost:3001` | ⭕ |
| `SECURE_COOKIE` | Cookies sécurisés (HTTPS) | `false` / `true` | ⭕ |

### 🔗 **Auth0 (OPTIONNEL)**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `AUTH0_DOMAIN` | Domaine Auth0 | `your-domain.auth0.com` | ⭕ |
| `AUTH0_CLIENT_ID` | Client ID Auth0 | `your_auth0_client_id` | ⭕ |
| `AUTH0_CLIENT_SECRET` | Client Secret Auth0 | `your_auth0_client_secret` | ⭕ |
| `AUTH0_AUDIENCE` | Audience API Auth0 | `https://api.supervia.com` | ⭕ |

### 📦 **Redis Cache (OPTIONNEL)**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `REDIS_URL` | URL de connexion Redis | `redis://localhost:6379` | ⭕ |
| `REDIS_PASSWORD` | Mot de passe Redis | `your_redis_password` | ⭕ |
| `REDIS_DB` | Numéro de base Redis | `0` | ⭕ |

### 📊 **Monitoring & Métriques**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `METRICS_ENABLED` | Activer métriques Prometheus | `true` / `false` | ⭕ |
| `RATE_LIMIT_MAX_REQUESTS` | Limite de requêtes par IP | `100` | ⭕ |
| `RATE_LIMIT_WINDOW_MS` | Fenêtre rate limiting (ms) | `900000` | ⭕ |

### 🇪🇺 **RGPD & Conformité**

| Variable | Description | Exemple | Requis |
|----------|-------------|---------|--------|
| `DATA_RETENTION_DAYS` | Durée de rétention des données | `365` | ⭕ |
| `DPO_EMAIL` | Email du DPO | `dpo@supervia.com` | ⭕ |

---

## 🔧 **Commandes de Configuration**

### Validation de Configuration
```bash
# Valider la configuration actuelle
npm run validate-config

# Générer un fichier .env.example
npm run validate-config example

# Afficher l'aide
npm run validate-config help
```

### Setup Complet
```bash
# Configuration + migration DB + génération clés
npm run setup
```

### Tests de Santé
```bash
# Health check simple
curl http://localhost:3001/health

# Health check détaillé
curl http://localhost:3001/health/detailed

# Statistiques du service
curl http://localhost:3001/health/stats
```

---

## 🎯 **Configurations par Environnement**

### **Development** 
```env
NODE_ENV=development
DB_SERVICE_URL=http://localhost:3002
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
SECURE_COOKIE=false
```

### **Production**
```env
NODE_ENV=production
DB_SERVICE_URL=http://supervia-db-service:3002
API_URL=https://api.supervia.com
FRONTEND_URL=https://supervia.com
SECURE_COOKIE=true
RATE_LIMIT_MAX_REQUESTS=1000
```

### **Test**
```env
NODE_ENV=test
DB_SERVICE_URL=http://localhost:3002
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

---

## ⚡ **Optimisations Recommandées**

### **Performance**
- Configurez Redis pour le cache des sessions
- Utilisez un pool de connexions PostgreSQL
- Activez la compression gzip

### **Sécurité**
- Utilisez des secrets forts (32+ caractères)
- Activez HTTPS en production (`SECURE_COOKIE=true`)
- Configurez CSP et headers de sécurité

### **Monitoring**
- Activez les métriques Prometheus
- Configurez Grafana pour la visualisation
- Surveillez les endpoints `/health/detailed`

---

## 🆘 **Dépannage**

### Erreurs Communes

**❌ `JWT secret too short`**
```bash
# Solution: Générer un secret plus long pour JWT_SECRET ou COOKIE_SECRET
openssl rand -hex 32
```

**❌ `Database service connection failed`**
```bash
# Vérifier la connexion au service
curl $DB_SERVICE_URL/health
```

**❌ `No active key pairs found`**
```bash
# Générer des clés JWT
npm run setup
```

**❌ `CORS errors`**
```bash
# Vérifier CORS_ORIGINS
echo $CORS_ORIGINS
```

### Support

- 📖 **Documentation**: [README.md](./README.md)
- 🐛 **Issues**: GitHub Issues
- 📧 **Contact**: [équipe SupervIA]

---

## 🎉 **Prêt à Démarrer !**

Une fois configuré, votre service d'authentification SupervIA sera disponible avec :

- ✅ **OpenID Connect** complet
- ✅ **RGPD** conforme
- ✅ **Métriques** Prometheus
- ✅ **Health checks** avancés
- ✅ **Auth0** intégré (optionnel)

```bash
npm run dev  # Démarrage en mode développement
```

Rendez-vous sur `http://localhost:3001/health/detailed` pour vérifier que tout fonctionne ! 🚀 
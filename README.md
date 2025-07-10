# SupervIA - Service d'Authentification (OAuth2/OpenID Connect)

🔐 **Microservice d'authentification central pour l'écosystème SupervIA.** Ce service gère l'identité des utilisateurs, la connexion sécurisée, et fournit des tokens JWT (RS256) pour l'ensemble des autres services. Il est conçu pour être robuste, sécurisé, et observable, avec une conformité RGPD intégrée.

---

## 📋 Table des matières

1.  [**Fonctionnalités Clés**](#-fonctionnalités-clés)
2.  [**Architecture & Flux**](#-architecture--flux)
3.  [**Installation et Lancement**](#-installation-et-lancement)
    -   [Prérequis](#prérequis)
    -   [Configuration (.env)](#configuration-env)
    -   [Installation locale](#installation-locale-sans-docker)
    -   [Déploiement avec Docker](#déploiement-avec-docker)
4.  [**Documentation de l'API**](#-documentation-de-lapi)
    -   [Authentification Standard](#authentification-standard)
    -   [Authentification Sociale (OAuth2)](#authentification-sociale-oauth2)
    -   [Santé & Monitoring](#santé--monitoring)
    -   [Documentation Interactive](#documentation-interactive)
5.  [**Exemples d'Utilisation (curl)**](#-exemples-dutilisation-curl)
6.  [**Sécurité**](#-sécurité)
7.  [**Monitoring & Observabilité**](#-monitoring--observabilité)
8.  [**Tests**](#-tests)
9.  [**Licence**](#-licence)

---

## ✨ Fonctionnalités Clés

Ce service offre une solution d'authentification complète et moderne :

| Catégorie | Fonctionnalité | Description |
| :--- | :--- | :--- |
| **Authentification** | **Multi-fournisseurs** | Support de l'inscription/connexion par email/mot de passe, **Google**, **GitHub**, et **Auth0**. |
| | **Tokens JWT (RS256)** | Utilisation de l'algorithme asymétrique RS256 pour une sécurité accrue. Les tokens sont signés avec des paires de clés privées/publiques. |
| | **Rotation des clés (JWKS)** | Exposition d'un endpoint `/.well-known/jwks.json` pour permettre aux services clients de vérifier les tokens avec la clé publique correspondante. Les clés sont gérées et renouvelées via le `db-service`. |
| | **Flux OpenID Connect** | Fournit des informations utilisateur (`/userinfo`) et des `id_token` conformes au standard OIDC. |
| **Sécurité** | **Rate Limiting** | Protège contre les attaques par force brute et le déni de service. |
| | **Headers de sécurité** | Utilisation de `Helmet` pour configurer les en-têtes HTTP de sécurité (CSP, HSTS, etc.). |
| | **CORS** | Configuration stricte des origines autorisées pour les requêtes cross-domain. |
| | **Cookies sécurisés** | Signature des cookies et option `secure` pour une transmission via HTTPS uniquement en production. |
| **Développeur** | **Configuration centralisée** | Gestion de toutes les variables via un fichier `.env` avec un script de validation. |
| | **Scripts d'initialisation** | Scripts `npm` pour générer les secrets, valider la configuration et initialiser le service. |
| | **Déploiement conteneurisé** | `Dockerfile` et `docker-compose.yml` optimisés pour la production. |
| **Monitoring** | **Health Checks** | Endpoints `/health` et `/health/detailed` pour vérifier l'état du service et de ses dépendances (db-service, Redis...). |
| | **Métriques Prometheus** | Endpoint `/metrics` exposant des métriques détaillées (tentatives de connexion, utilisateurs inscrits, etc.). |
| **Conformité** | **RGPD** | Fonctions de base pour la journalisation des activités de traitement de données et la minimisation des données. |

---

## 🏗️ Architecture & Flux

Ce microservice ne possède pas de base de données propre. Il s'appuie exclusivement sur le `db-service` pour toute persistance de données (utilisateurs, clients OAuth, clés de signature, refresh tokens).

**Flux d'authentification standard :**
1.  Le client (frontend) envoie les identifiants (`email`/`password`) au `POST /api/v1/auth/login`.
2.  `auth-service` valide les identifiants en appelant le `db-service`.
3.  Si valides, `auth-service` récupère la clé de signature **privée** active depuis le `db-service`.
4.  Il génère un `accessToken` (courte durée) et un `refreshToken` (longue durée).
5.  Le `refreshToken` est stocké dans le `db-service` pour pouvoir être révoqué.
6.  Les tokens sont retournés au client.

**Flux d'authentification OAuth2 (ex: Google) :**
1.  Le frontend demande l'URL d'autorisation à `GET /api/v1/oauth/google/auth`.
2.  Le frontend redirige l'utilisateur vers l'URL de Google.
3.  Après consentement, Google redirige vers le frontend (`/auth/callback/google`) qui transmet le `code` d'autorisation au backend sur `GET /api/v1/oauth/google/callback`.
4.  `auth-service` échange ce `code` contre un token d'accès Google.
5.  Avec ce token, il récupère les informations de l'utilisateur depuis l'API Google.
6.  Il crée ou met à jour l'utilisateur dans le `db-service`.
7.  Il génère ses propres tokens (`accessToken`, `refreshToken`) et les retourne au client.

---

## 🚀 Installation et Lancement

### Prérequis
- **Node.js** >= 16
- **Docker** & **Docker Compose** (pour le déploiement conteneurisé)
- Un `db-service` SupervIA fonctionnel et accessible.
- Un réseau Docker partagé nommé `infra_supervia-network` si vous utilisez Docker.

### Configuration (`.env`)
Ce service est entièrement configurable via des variables d'environnement.

1.  **Génération automatique :**
    Le moyen le plus simple de commencer est de générer un fichier `.env` sécurisé :
    ```bash
    npm run generate-secrets
    ```
    Cela créera un fichier `.env` avec des secrets aléatoires.

2.  **Copie manuelle :**
    Vous pouvez aussi copier le fichier d'exemple fourni par la commande :
    ```bash
    cp .env.example .env
    ```

3.  **Validation :**
    Après avoir modifié votre `.env`, validez-le :
    ```bash
    npm run validate-config
    ```

#### Variables d'environnement détaillées

| Variable | Description | Requis | Défaut |
| :--- | :--- | :--- | :--- |
| **`NODE_ENV`** | Environnement d'exécution | ⭕ | `development` |
| **`PORT`** | Port d'écoute du serveur | ⭕ | `3001` |
| **`DB_SERVICE_URL`** | **URL complète du service de base de données** | ✅ | `http://localhost:3002` |
| **`JWT_SECRET`** | Secret (min 32 chars) pour la communication inter-services | ✅ | Doit être défini |
| **`COOKIE_SECRET`** | Secret (min 32 chars) pour la signature des cookies | ✅ | Doit être défini |
| `API_URL` | URL publique de ce service | ✅ | `http://localhost:3001` |
| `FRONTEND_URL` | URL du portail web SupervIA | ✅ | `http://localhost:3000` |
| `CORS_ORIGINS` | URLs autorisées pour le CORS (séparées par `,`) | ⭕ | `http://localhost:3000,http://localhost:4000`|
| `SECURE_COOKIE` | Mettre à `true` en production (HTTPS) | ⭕ | `false` |
| `ACCESS_TOKEN_EXPIRES_IN`| Durée de vie du token d'accès | ⭕ | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN`| Durée de vie du token de rafraîchissement | ⭕ | `7d` |
| `REDIS_URL` | URL de connexion Redis pour le cache | ⭕ | `redis://supervia-redis:6379/1` |
| `NOTIFICATION_SERVICE_URL`| URL du service de notifications (pour les emails) | ⭕ | `http://supervia-notification-service:3005` |
| **`GOOGLE_CLIENT_ID`** | Client ID Google pour OAuth2 | ⭕ | - |
| **`GOOGLE_CLIENT_SECRET`**| Client Secret Google pour OAuth2 | ⭕ | - |
| **`GITHUB_CLIENT_ID`** | Client ID GitHub pour OAuth2 | ⭕ | - |
| **`GITHUB_CLIENT_SECRET`**| Client Secret GitHub pour OAuth2 | ⭕ | - |
| **`AUTH0_DOMAIN`** | Domaine de votre tenant Auth0 | ⭕ | - |
| **`AUTH0_CLIENT_ID`** | Client ID Auth0 | ⭕ | - |
| **`AUTH0_CLIENT_SECRET`**| Client Secret Auth0 | ⭕ | - |


### Installation locale (sans Docker)

1.  **Cloner et installer les dépendances :**
    ```bash
    git clone <repository_url>
    cd autenthication-service-Tadayoshi123
    npm install
    ```

2.  **Configurer l'environnement :**
    Créez et configurez votre fichier `.env` comme expliqué ci-dessus. Assurez-vous que `DB_SERVICE_URL` pointe vers votre instance de `db-service`.

3.  **Initialiser le service :**
    Ce script crucial valide votre configuration et génère la première paire de clés de signature RSA en l'enregistrant dans le `db-service`.
    ```bash
    npm run setup
    ```

4.  **Démarrer le serveur de développement :**
    ```bash
    npm run dev
    ```
    Le service sera disponible sur `http://localhost:3001`.

### Déploiement avec Docker

1.  **Configurer le `.env` :**
    Assurez-vous que le fichier `.env` à la racine du projet est correctement configuré. Les variables seront injectées dans le conteneur. Notez que `DB_SERVICE_URL` doit pointer vers le nom du conteneur du `db-service` (ex: `http://supervia-db-service:3002`).

2.  **Lancer le service :**
    Utilisez `docker-compose` pour construire et démarrer le service.
    ```bash
    docker-compose up -d --build
    ```

---

## 📡 Documentation de l'API

Toutes les routes sont préfixées par `/api/v1`.

### Authentification Standard

| Méthode | Endpoint | Protection | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Publique | Crée un nouvel utilisateur. |
| `POST` | `/auth/login` | Publique | Connecte un utilisateur et retourne les tokens. |
| `POST` | `/auth/refresh` | Publique | Renouvelle l'access token avec un refresh token. |
| `POST` | `/auth/revoke` | Publique | Révoque un refresh token (déconnexion). |
| `POST` | `/auth/verify-email`| Publique | Vérifie l'email d'un utilisateur avec un token reçu. |
| `GET` | `/auth/userinfo` | **Protégée** | Récupère les informations de l'utilisateur authentifié. |
| `GET` | `/auth/jwks.json` | Publique | Fournit les clés publiques (JWKS) pour la vérification des tokens. |

### Authentification Sociale (OAuth2)

| Méthode | Endpoint | Protection | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/oauth/providers` | Publique | Liste les fournisseurs OAuth2 configurés (Google, GitHub). |
| `GET` | `/oauth/:provider/auth`| Publique | Génère et retourne l'URL d'autorisation pour le fournisseur. |
| `GET` | `/oauth/:provider/callback`| Publique | Gère le callback du fournisseur après authentification. |
| `GET` | `/auth0/login` | Publique | Initie le flux de connexion avec Auth0. |
| `GET` | `/auth0/callback` | Publique | Gère le callback d'Auth0. |

### Santé & Monitoring

| Méthode | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health check simple (statut `ok`). |
| `GET` | `/health/detailed` | Health check détaillé avec état des dépendances. |
| `GET` | `/health/stats` | Statistiques d'exécution du service (uptime, mémoire...). |
| `GET` | `/metrics` | Métriques au format Prometheus. |

### Documentation Interactive
Une documentation Swagger UI est disponible pour tester les endpoints de manière interactive :
- **`http://localhost:3001/api-docs`**

---

## 💻 Exemples d'Utilisation (curl)

#### Inscription
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

#### Connexion
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!"
  }'
```

#### Rafraîchir un token
```bash
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "votre_refresh_token"
  }'
```

#### Obtenir les informations utilisateur (protégé)
```bash
curl -X GET http://localhost:3001/api/v1/auth/userinfo \
  -H "Authorization: Bearer votre_access_token"
```

---

## 🛡️ Sécurité

- **Signature des Tokens** : Les `accessToken` et `id_token` sont signés avec l'algorithme `RS256`. La clé privée est stockée de manière sécurisée par le `db-service` et n'est jamais exposée. La clé publique est disponible via l'endpoint `jwks.json`.
- **Rotation des Clés** : Bien que non-automatisée dans cette version, l'architecture supporte la rotation des clés. Il suffit de générer une nouvelle paire via `npm run db:init` et de la marquer comme `ACTIVE` dans la base de données. L'ancienne clé peut être conservée pour valider les tokens encore en circulation.
- **Dépendances** : Utilisation de `npm audit` et `Snyk` recommandés pour surveiller les vulnérabilités des dépendances.
- **Secrets** : **NE JAMAIS** commiter de secrets ou de fichiers `.env` dans le dépôt Git.

---

## 📊 Monitoring & Observabilité

- **Logging** : Le service utilise `pino` pour un logging structuré et performant. En production, les logs sont au format JSON, idéal pour une ingestion par des plateformes comme ELK ou Grafana Loki.
- **Métriques** : Les métriques Prometheus exposées sur `/metrics` incluent :
    - `auth_attempts_total` : Tentatives de connexion (par type et statut).
    - `user_registrations_total` : Total des inscriptions.
    - `jwk_rotations_total` : Rotations de clés (si implémenté).
    - Métriques par défaut de `express-prom-bundle` (latence des requêtes, statuts HTTP...).

---

## ✅ Tests

Pour lancer la suite de tests unitaires et d'intégration, utilisez :
```bash
# Lancer tous les tests
npm test

# Lancer les tests en mode "watch"
npm run test:watch

# Générer un rapport de couverture de code
npm run test:coverage
```
Les tests sont écrits avec `Jest` et `Supertest`. Ils mockent les appels au `db-service` pour isoler la logique du service d'authentification.

---

## 📜 Licence

Ce projet est sous licence MIT. 
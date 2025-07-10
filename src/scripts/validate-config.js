/**
 * Script de validation de la configuration
 * Vérifie que toutes les variables d'environnement nécessaires sont définies
 * et génère un fichier .env.example si demandé
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration requise
const CONFIG = {
  // Serveur
  NODE_ENV: {
    required: false,
    default: 'development',
    description: 'Environnement d\'exécution',
    values: ['development', 'production', 'test'],
    category: 'CONFIGURATION SERVEUR'
  },
  PORT: {
    required: false,
    default: '3001',
    description: 'Port d\'écoute du serveur',
    category: 'CONFIGURATION SERVEUR'
  },
  API_URL: {
    required: true,
    default: 'http://localhost:3001',
    description: 'URL publique de l\'API',
    category: 'CONFIGURATION SERVEUR'
  },
  FRONTEND_URL: {
    required: true,
    default: 'http://localhost:3000',
    description: 'URL du frontend',
    category: 'CONFIGURATION SERVEUR'
  },

  // Connexion aux services
  DB_SERVICE_URL: {
    required: true,
    description: 'URL du service de base de données',
    example: 'http://localhost:3002',
    category: 'SERVICES'
  },

  // JWT & SÉCURITÉ
  JWT_SECRET: {
    required: true,
    minLength: 32,
    description: 'Secret pour la communication inter-services',
    sensitive: true,
    category: 'JWT & SÉCURITÉ'
  },
  ACCESS_TOKEN_EXPIRES_IN: {
    required: false,
    default: '15m',
    description: 'Durée de validité des access tokens',
    category: 'JWT & SÉCURITÉ'
  },
  REFRESH_TOKEN_EXPIRES_IN: {
    required: false,
    default: '7d',
    description: 'Durée de validité des refresh tokens',
    category: 'JWT & SÉCURITÉ'
  },
  ID_TOKEN_EXPIRES_IN: {
    required: false,
    default: '1h',
    description: 'Durée de validité des ID tokens',
    category: 'JWT & SÉCURITÉ'
  },

  // CORS
  CORS_ORIGINS: {
    required: false,
    default: 'http://localhost:3000,http://localhost:3001',
    description: 'Origines autorisées pour CORS (séparées par des virgules)',
    category: 'URLS & CORS'
  },

  // Cookies
  COOKIE_SECRET: {
    required: true,
    minLength: 32,
    description: 'Secret pour signer les cookies',
    sensitive: true,
    category: 'COOKIES & SESSIONS'
  },
  SECURE_COOKIE: {
    required: false,
    default: 'false',
    description: 'Cookies sécurisés (HTTPS uniquement)',
    values: ['true', 'false'],
    category: 'COOKIES & SESSIONS'
  },

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: {
    required: false,
    default: '900000',
    description: 'Fenêtre de rate limiting en ms (15 minutes par défaut)',
    category: 'RATE LIMITING'
  },
  RATE_LIMIT_MAX_REQUESTS: {
    required: false,
    default: '100',
    description: 'Nombre maximum de requêtes par fenêtre',
    category: 'RATE LIMITING'
  },

  // RGPD
  DATA_RETENTION_DAYS: {
    required: false,
    default: '365',
    description: 'Durée de conservation des données en jours',
    category: 'RGPD & CONFORMITÉ'
  },
  DPO_EMAIL: {
    required: false,
    default: 'dpo@supervia.com',
    description: 'Email du DPO',
    category: 'RGPD & CONFORMITÉ'
  },
  PRIVACY_POLICY_URL: {
    required: false,
    default: 'https://supervia.com/privacy',
    description: 'URL de la politique de confidentialité',
    category: 'RGPD & CONFORMITÉ'
  },

  // Email
  FROM_EMAIL: {
    required: false,
    default: 'noreply@supervia.com',
    description: 'Email d\'expéditeur',
    category: 'EMAIL'
  },
  SMTP_HOST: {
    required: false,
    description: 'Hôte SMTP',
    example: 'smtp.gmail.com',
    category: 'EMAIL'
  },
  SMTP_PORT: {
    required: false,
    description: 'Port SMTP',
    example: '587',
    category: 'EMAIL'
  },
  SMTP_SECURE: {
    required: false,
    description: 'SMTP sécurisé (SSL/TLS)',
    values: ['true', 'false'],
    example: 'false',
    category: 'EMAIL'
  },
  SMTP_USER: {
    required: false,
    description: 'Utilisateur SMTP',
    example: 'your_email@gmail.com',
    category: 'EMAIL'
  },
  SMTP_PASS: {
    required: false,
    description: 'Mot de passe SMTP',
    sensitive: true,
    example: 'your_app_password',
    category: 'EMAIL'
  },

  // Auth0
  AUTH0_DOMAIN: {
    required: false,
    description: 'Domaine Auth0',
    example: 'your-domain.auth0.com',
    category: 'AUTH0'
  },
  AUTH0_CLIENT_ID: {
    required: false,
    description: 'Client ID Auth0',
    example: 'your_auth0_client_id',
    category: 'AUTH0'
  },
  AUTH0_CLIENT_SECRET: {
    required: false,
    description: 'Client Secret Auth0',
    sensitive: true,
    example: 'your_auth0_client_secret',
    category: 'AUTH0'
  },
  AUTH0_AUDIENCE: {
    required: false,
    description: 'Audience API Auth0',
    example: 'https://api.supervia.com',
    category: 'AUTH0'
  },
  AUTH0_MANAGEMENT_AUDIENCE: {
    required: false,
    description: 'Audience Management API Auth0',
    example: 'https://your-domain.auth0.com/api/v2/',
    category: 'AUTH0'
  },

  // Redis
  REDIS_URL: {
    required: false,
    description: 'URL de connexion Redis',
    example: 'redis://localhost:6379',
    category: 'REDIS CACHE'
  },
  REDIS_PASSWORD: {
    required: false,
    description: 'Mot de passe Redis',
    sensitive: true,
    category: 'REDIS CACHE'
  },
  REDIS_DB: {
    required: false,
    default: '0',
    description: 'Base de données Redis',
    category: 'REDIS CACHE'
  },
  REDIS_TTL: {
    required: false,
    default: '3600',
    description: 'TTL par défaut (en secondes)',
    category: 'REDIS CACHE'
  },

  // Métriques
  METRICS_ENABLED: {
    required: false,
    default: 'true',
    description: 'Activer les métriques Prometheus',
    values: ['true', 'false'],
    category: 'MONITORING & MÉTRIQUES'
  },

  // OAuth2
  GOOGLE_CLIENT_ID: {
    required: false,
    description: 'Client ID Google OAuth',
    example: 'your_google_client_id.apps.googleusercontent.com',
    category: 'OAUTH2 PROVIDERS'
  },
  GOOGLE_CLIENT_SECRET: {
    required: false,
    description: 'Client Secret Google OAuth',
    sensitive: true,
    example: 'your_google_client_secret',
    category: 'OAUTH2 PROVIDERS'
  },
  GITHUB_CLIENT_ID: {
    required: false,
    description: 'Client ID GitHub OAuth',
    example: 'your_github_client_id',
    category: 'OAUTH2 PROVIDERS'
  },
  GITHUB_CLIENT_SECRET: {
    required: false,
    description: 'Client Secret GitHub OAuth',
    sensitive: true,
    example: 'your_github_client_secret',
    category: 'OAUTH2 PROVIDERS'
  }
};

/**
 * Affiche un message coloré dans la console
 * @param {string} message - Message à afficher
 * @param {string} color - Couleur (reset, red, green, yellow, blue, magenta, cyan)
 */
function colorLog(message, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Valide une variable d'environnement
 * @param {string} key - Nom de la variable
 * @param {Object} config - Configuration de la variable
 * @returns {boolean} Validité de la variable
 */
function validateEnvVar(key, config) {
  const value = process.env[key];
  let isValid = true;
  let message = '';

  // Vérifier si la variable est requise
  if (config.required && (!value || value.trim() === '')) {
    isValid = false;
    message = `${key} est requis mais n'est pas défini`;
  }
  // Vérifier la longueur minimale
  else if (value && config.minLength && value.length < config.minLength) {
    isValid = false;
    message = `${key} doit contenir au moins ${config.minLength} caractères`;
  }
  // Vérifier les valeurs autorisées
  else if (value && config.values && !config.values.includes(value)) {
    isValid = false;
    message = `${key} doit être l'une des valeurs suivantes: ${config.values.join(', ')}`;
  }
  // Vérifier si la valeur est la valeur par défaut
  else if (value && config.sensitive && config.default && value === config.default) {
    isValid = false;
    message = `${key} utilise la valeur par défaut, ce qui n'est pas recommandé en production`;
  }

  // Afficher le message d'erreur
  if (!isValid) {
    colorLog(message, 'red');
  } else if (value) {
    const displayValue = config.sensitive ? '********' : value;
    colorLog(`✓ ${key}=${displayValue}`, 'green');
  } else if (config.default) {
    colorLog(`ℹ ${key} non défini, utilisation de la valeur par défaut: ${config.default}`, 'yellow');
  }

  return isValid;
}

/**
 * Génère un fichier .env.example
 */
function generateEnvExample() {
  const now = new Date();
  const dateString = now.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let content = `# ==============================================\n`;
  content += `# 🔐 SERVICE D'AUTHENTIFICATION SUPERVIA - CONFIGURATION\n`;
  content += `# ==============================================\n`;
  content += `# Généré automatiquement le ${dateString}\n`;
  content += `# \n`;
  content += `# ⚠️  IMPORTANT: Changez ces valeurs selon votre environnement !\n`;
  content += `# 🔐 Les secrets sont générés automatiquement et sécurisés\n\n`;

  // Regrouper par catégorie
  const categories = {};
  Object.entries(CONFIG).forEach(([key, config]) => {
    const category = config.category || 'DIVERS';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({ key, config });
  });

  // Générer le contenu par catégorie
  Object.entries(categories).forEach(([category, vars]) => {
    content += `# ==============================================\n`;
    content += `# ${category}\n`;
    content += `# ==============================================\n`;

    vars.forEach(({ key, config }) => {
      if (config.description) {
        content += `# ${config.description}\n`;
      }

      if (config.sensitive && !config.example) {
        // Générer un secret aléatoire pour les variables sensibles
        const value = crypto.randomBytes(32).toString('hex');
        content += `${key}=${value}\n`;
      } else if (config.example) {
        // Utiliser l'exemple fourni
        content += `# ${key}=${config.example}\n`;
      } else if (config.default) {
        // Utiliser la valeur par défaut
        content += `${key}=${config.default}\n`;
      } else {
        content += `# ${key}=\n`;
      }

      content += '\n';
    });
  });

  // Ajouter des instructions pour les prochaines étapes
  content += `# ==============================================\n`;
  content += `# 🎯 PROCHAINES ÉTAPES:\n`;
  content += `# ==============================================\n`;
  content += `# 1. Modifiez DATABASE_URL avec vos paramètres de BDD\n`;
  content += `# 2. Ajustez API_URL et FRONTEND_URL selon votre environnement\n`;
  content += `# 3. Configurez Auth0 si vous l'utilisez (décommentez les lignes)\n`;
  content += `# 4. Configurez SMTP pour les emails RGPD si nécessaire\n`;
  content += `# 5. Lancez: npm run validate-config\n`;
  content += `# 6. Initialisez: npm run setup\n`;

  // Écrire le fichier
  fs.writeFileSync(path.join(process.cwd(), '.env.example'), content);
  colorLog('✓ Fichier .env.example généré avec succès', 'green');
}

/**
 * Valide la configuration
 * @returns {boolean} Validité de la configuration
 */
function validateConfiguration() {
  colorLog('🔍 Validation de la configuration...', 'blue');

  let isValid = true;
  let requiredMissing = 0;
  let warnings = 0;

  // Regrouper par catégorie
  const categories = {};
  Object.entries(CONFIG).forEach(([key, config]) => {
    const category = config.category || 'DIVERS';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({ key, config });
  });

  // Valider par catégorie
  Object.entries(categories).forEach(([category, vars]) => {
    colorLog(`\n📋 ${category}`, 'cyan');
    
    vars.forEach(({ key, config }) => {
      const varIsValid = validateEnvVar(key, config);
      
      if (!varIsValid) {
        if (config.required) {
          requiredMissing++;
          isValid = false;
        } else {
          warnings++;
        }
      }
    });
  });

  // Afficher le résultat
  console.log('\n');
  if (isValid) {
    colorLog('✅ Configuration valide!', 'green');
    if (warnings > 0) {
      colorLog(`⚠️  ${warnings} avertissement(s) non critique(s)`, 'yellow');
    }
  } else {
    colorLog(`❌ Configuration invalide: ${requiredMissing} variable(s) requise(s) manquante(s)`, 'red');
  }

  return isValid;
}

/**
 * Affiche l'aide
 */
function showHelp() {
  colorLog('🔧 Validation de la Configuration SupervIA', 'cyan');
  colorLog('\nCommandes disponibles:', 'yellow');
  colorLog('  npm run validate-config         Valider la configuration', 'reset');
  colorLog('  npm run validate-config example Générer un fichier .env.example', 'reset');
  colorLog('  npm run validate-config help    Afficher cette aide', 'reset');
  colorLog('\nExemples d\'utilisation:', 'yellow');
  colorLog('  npm run validate-config         # Vérifie la configuration actuelle', 'reset');
  colorLog('  npm run validate-config example # Génère un fichier .env.example', 'reset');
}

// Fonction principale
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('help')) {
    showHelp();
    return;
  }
  
  if (args.includes('example')) {
    generateEnvExample();
    return;
  }
  
  const isValid = validateConfiguration();
  process.exit(isValid ? 0 : 1);
}

// Exécution
if (require.main === module) {
  main();
}

module.exports = {
  validateConfiguration,
  generateEnvExample
}; 
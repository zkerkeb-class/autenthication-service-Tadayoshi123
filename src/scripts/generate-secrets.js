const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Script de génération de secrets sécurisés pour SupervIA
 */

// Couleurs pour l'affichage console
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function colorLog(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Génère un secret sécurisé
 */
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Génère une phrase secrète lisible
 */
function generatePassphrase() {
  const words = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
    'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
    'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
    'Xray', 'Yankee', 'Zulu'
  ];
  
  const selectedWords = [];
  for (let i = 0; i < 4; i++) {
    selectedWords.push(words[Math.floor(Math.random() * words.length)]);
  }
  
  const numbers = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `${selectedWords.join('')}${numbers}SupervIA`;
}

/**
 * Génère tous les secrets nécessaires
 */
function generateAllSecrets() {
  colorLog('\n🔐 Génération de secrets sécurisés pour SupervIA Auth Service\n', 'bold');

  const secrets = {
    // Secret pour la communication inter-services
    JWT_SECRET: generateSecret(32),
    COOKIE_SECRET: generateSecret(32),
    
    // URL par défaut
    API_URL: 'http://localhost:3001',
    FRONTEND_URL: 'http://localhost:3000',
    DB_SERVICE_URL: 'http://localhost:3002',
    
    // Configuration serveur
    NODE_ENV: 'development',
    PORT: '3001',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    SECURE_COOKIE: 'false',
    
    // Rate limiting
    RATE_LIMIT_WINDOW_MS: '900000',
    RATE_LIMIT_MAX_REQUESTS: '100',
    
    // Durées JWT
    ACCESS_TOKEN_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
    ID_TOKEN_EXPIRES_IN: '1h',
    
    // RGPD
    DATA_RETENTION_DAYS: '365',
    DPO_EMAIL: 'dpo@supervia.com',
    PRIVACY_POLICY_URL: 'https://supervia.com/privacy',
    
    // Monitoring
    METRICS_ENABLED: 'true',
    
    // Email (exemples)
    FROM_EMAIL: 'noreply@supervia.com'
  };

  // Afficher les secrets générés
  colorLog('🔑 SECRETS GÉNÉRÉS:', 'green');
  Object.entries(secrets).forEach(([key, value]) => {
    if (key.includes('SECRET')) {
      colorLog(`${key}=${value.substring(0, 16)}...`, 'yellow');
    } else {
      colorLog(`${key}=${value}`, 'cyan');
    }
  });

  return secrets;
}

/**
 * Crée un fichier .env avec les secrets générés
 */
function createEnvFile(secrets, filename = '.env') {
  let envContent = `# ==============================================
# 🔐 SERVICE D'AUTHENTIFICATION SUPERVIA - CONFIGURATION
# ==============================================
# Généré automatiquement le ${new Date().toLocaleString('fr-FR')}
# 
# ⚠️  IMPORTANT: Changez ces valeurs selon votre environnement !
# 🔐 Les secrets sont générés automatiquement et sécurisés

# ==============================================
# 📡 CONFIGURATION SERVEUR
# ==============================================
NODE_ENV=${secrets.NODE_ENV}
PORT=${secrets.PORT}

# ==============================================
# 🔗 SERVICES EXTERNES
# ==============================================
DB_SERVICE_URL=${secrets.DB_SERVICE_URL}

# ==============================================
# 🔑 JWT & SÉCURITÉ (GÉNÉRÉS AUTOMATIQUEMENT)
# ==============================================
# Secret pour la communication inter-services (HS256)
JWT_SECRET=${secrets.JWT_SECRET}

# Durées de validité des tokens (signés en RS256, clés en BDD)
ACCESS_TOKEN_EXPIRES_IN=${secrets.ACCESS_TOKEN_EXPIRES_IN}
REFRESH_TOKEN_EXPIRES_IN=${secrets.REFRESH_TOKEN_EXPIRES_IN}
ID_TOKEN_EXPIRES_IN=${secrets.ID_TOKEN_EXPIRES_IN}

# ==============================================
# 🌐 URLS & CORS
# ==============================================
API_URL=${secrets.API_URL}
FRONTEND_URL=${secrets.FRONTEND_URL}
CORS_ORIGINS=${secrets.CORS_ORIGINS}

# ==============================================
# 🍪 COOKIES & SESSIONS
# ==============================================
COOKIE_SECRET=${secrets.COOKIE_SECRET}
SECURE_COOKIE=${secrets.SECURE_COOKIE}

# ==============================================
# 🛡️ RATE LIMITING
# ==============================================
RATE_LIMIT_WINDOW_MS=${secrets.RATE_LIMIT_WINDOW_MS}
RATE_LIMIT_MAX_REQUESTS=${secrets.RATE_LIMIT_MAX_REQUESTS}

# ==============================================
# 🇪🇺 RGPD & CONFORMITÉ
# ==============================================
DATA_RETENTION_DAYS=${secrets.DATA_RETENTION_DAYS}
DPO_EMAIL=${secrets.DPO_EMAIL}
PRIVACY_POLICY_URL=${secrets.PRIVACY_POLICY_URL}

# ==============================================
# 📧 EMAIL (OPTIONNEL - CONFIGUREZ SELON VOS BESOINS)
# ==============================================
FROM_EMAIL=${secrets.FROM_EMAIL}
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your_email@gmail.com
# SMTP_PASS=your_app_password

# ==============================================
# 🔗 AUTH0 (OPTIONNEL - DÉCOMMENTEZ SI UTILISÉ)
# ==============================================
# AUTH0_DOMAIN=your-domain.auth0.com
# AUTH0_CLIENT_ID=your_auth0_client_id
# AUTH0_CLIENT_SECRET=your_auth0_client_secret
# AUTH0_AUDIENCE=https://api.supervia.com
# AUTH0_MANAGEMENT_AUDIENCE=https://your-domain.auth0.com/api/v2/

# ==============================================
# 📦 REDIS CACHE (OPTIONNEL)
# ==============================================
# REDIS_URL=redis://localhost:6379
# REDIS_PASSWORD=
# REDIS_DB=0
# REDIS_TTL=3600

# ==============================================
# 📊 MONITORING & MÉTRIQUES
# ==============================================
METRICS_ENABLED=${secrets.METRICS_ENABLED}

# ==============================================
# 🌍 OAUTH2 PROVIDERS (OPTIONNEL)
# ==============================================
# GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your_google_client_secret
# GITHUB_CLIENT_ID=your_github_client_id
# GITHUB_CLIENT_SECRET=your_github_client_secret

# ==============================================
# 🎯 PROCHAINES ÉTAPES:
# ==============================================
# 1. Vérifiez les URLs des services (API, Frontend, DB)
# 2. Lancez: npm run validate-config
# 3. Initialisez: npm run setup
`;

  fs.writeFileSync(filename, envContent);
  return filename;
}

/**
 * Fonction principale
 */
function main() {
  const command = process.argv[2];

  switch (command) {
    case 'single':
      const singleSecret = generateSecret(32);
      colorLog(`\n🔑 Secret généré: ${singleSecret}\n`, 'green');
      break;
      
    case 'passphrase':
      const passphrase = generatePassphrase();
      colorLog(`\n🔑 Phrase secrète: ${passphrase}\n`, 'green');
      break;
      
    case 'jwt':
      colorLog('\n🔑 Secrets JWT & Cookie générés:', 'bold');
      colorLog(`JWT_SECRET=${generateSecret(32)}`, 'yellow');
      colorLog(`COOKIE_SECRET=${generateSecret(32)}\n`, 'yellow');
      break;
      
    case 'help':
      colorLog('\n🛠️  Générateur de secrets SupervIA\n', 'bold');
      colorLog('Commandes disponibles:', 'cyan');
      colorLog('  npm run generate-secrets         - Générer un .env complet', 'green');
      colorLog('  npm run generate-secrets single  - Générer un secret unique', 'green');
      colorLog('  npm run generate-secrets jwt     - Générer le secret JWT et le secret cookie', 'green');
      colorLog('  npm run generate-secrets help    - Afficher cette aide\n', 'green');
      break;
      
    default:
      // Génération complète par défaut
      const secrets = generateAllSecrets();
      
      // Vérifier si .env existe déjà
      if (fs.existsSync('.env')) {
        colorLog('\n⚠️  Le fichier .env existe déjà!', 'yellow');
        colorLog('Voulez-vous le remplacer? (o/N):', 'yellow');
        
        // En mode automatique, créer .env.generated
        const filename = '.env.generated';
        createEnvFile(secrets, filename);
        
        colorLog(`\n✅ Configuration sauvegardée dans ${filename}`, 'green');
        colorLog('💡 Copiez les valeurs nécessaires dans votre .env existant', 'blue');
      } else {
        createEnvFile(secrets, '.env');
        colorLog('\n✅ Fichier .env créé avec succès!', 'green');
      }
      
      colorLog('\n🎯 PROCHAINES ÉTAPES:', 'bold');
      colorLog('1. Vérifiez les URLs des services (API, Frontend, DB)', 'cyan');
      colorLog('2. Lancez: npm run validate-config', 'cyan');
      colorLog('3. Initialisez: npm run setup\n', 'cyan');
      break;
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  main();
}

module.exports = { generateSecret, generatePassphrase, generateAllSecrets, createEnvFile }; 
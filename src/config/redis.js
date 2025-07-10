const { createClient } = require('redis');

let redisClient = null;
let isConnecting = false;

/**
 * Récupère la configuration Redis à partir des variables d'environnement
 * Utilise l'infrastructure partagée SupervIA (DB 1 pour auth-service)
 * @returns {Object} Configuration Redis
 */
const getRedisConfig = () => {
  // Configuration pour l'infrastructure partagée SupervIA
  const redisUrl = process.env.REDIS_URL || 'redis://supervia-redis:6379/1';
  const redisPassword = process.env.REDIS_PASSWORD || null; // Pas de password en dev
  const redisDb = parseInt(process.env.REDIS_DB || '1', 10); // DB 1 pour auth-service

  // Masquer le mot de passe dans les logs
  const redisUrlForLogs = redisPassword 
    ? redisUrl.replace(/:([^@/]*)@/, ':***@').replace(`:${redisPassword}`, ':***')
    : redisUrl;

  return {
    url: redisUrl,
    urlForLogs: redisUrlForLogs,
    password: redisPassword,
    database: redisDb,
    // Configuration optimisée pour l'auth-service
    socket: {
      connectTimeout: 5000,
      lazyConnect: true,
      reconnectDelay: 1000,
      maxRetriesPerRequest: 3,
    },
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  };
};

/**
 * Initialise la connexion Redis avec l'infrastructure partagée
 * @returns {Promise<Object>} Client Redis
 */
const initRedis = async () => {
  if (redisClient && redisClient.isReady) {
    return redisClient;
  }

  if (isConnecting) {
    // Attendre que la connexion soit établie
    let attempts = 0;
    while (isConnecting && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    return redisClient;
  }

  isConnecting = true;

  try {
    const config = getRedisConfig();
    console.log(`🔗 Connexion Redis SupervIA: ${config.urlForLogs}, DB: ${config.database}`);

    // Configuration optimisée pour l'infrastructure partagée
    const clientConfig = {
      url: config.url,
      database: config.database,
      socket: config.socket,
      // Préfixe pour éviter les collisions avec les autres services
      keyPrefix: 'auth:',
      // Configuration de retry
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.error('🔴 Redis: Connexion refusée');
          return new Error('Redis connexion refusée');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.error('🔴 Redis: Timeout de retry atteint');
          return new Error('Redis retry timeout');
        }
        if (options.attempt > 10) {
          console.error('🔴 Redis: Trop de tentatives de connexion');
          return undefined;
        }
        // Reconnexion avec backoff exponentiel
        return Math.min(options.attempt * 100, 3000);
      }
    };

    // Ajouter le password seulement s'il est défini
    if (config.password) {
      clientConfig.password = config.password;
    }

    redisClient = createClient(clientConfig);

    // Gestion des événements optimisée
    redisClient.on('error', (err) => {
      console.error('🔴 Redis Error (Auth Service):', err.message);
    });

    redisClient.on('connect', () => {
      console.log('🟢 Redis Auth Service connecté à l\'infrastructure partagée');
    });

    redisClient.on('reconnecting', () => {
      console.log('🟡 Redis Auth Service: Reconnexion en cours...');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis Auth Service: Prêt pour les opérations');
    });

    redisClient.on('end', () => {
      console.log('🟠 Redis Auth Service: Connexion fermée');
    });

    // Connexion au serveur Redis de l'infrastructure
    await redisClient.connect();
    isConnecting = false;
    
    // Test de connexion
    await redisClient.ping();
    console.log('🚀 Redis Auth Service: Connexion établie avec succès');
    
    return redisClient;
  } catch (error) {
    isConnecting = false;
    console.error('❌ Erreur Redis Auth Service:', error.message);
    
    // En développement, ne pas faire échouer le service si Redis n'est pas disponible
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Redis non disponible en développement - Cache désactivé');
      return null;
    }
    
    throw error;
  }
};

/**
 * Ferme la connexion Redis proprement
 */
const closeRedis = async () => {
  if (redisClient && redisClient.isReady) {
    try {
      await redisClient.quit();
      console.log('👋 Connexion Redis Auth Service fermée proprement');
      redisClient = null;
    } catch (error) {
      console.error('❌ Erreur lors de la fermeture Redis:', error.message);
      // Force la fermeture en cas d'erreur
      if (redisClient) {
        await redisClient.disconnect();
        redisClient = null;
      }
    }
  }
};

/**
 * Récupère le client Redis, l'initialise si nécessaire
 * @returns {Promise<Object|null>} Client Redis ou null si indisponible
 */
const getRedisClient = async () => {
  if (!redisClient || !redisClient.isReady) {
    return await initRedis();
  }
  return redisClient;
};

/**
 * Vérifie si Redis est disponible et fonctionnel
 * @returns {Promise<boolean>} True si Redis est disponible
 */
const isRedisAvailable = async () => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    await client.ping();
    return true;
  } catch (error) {
    console.warn('⚠️  Redis temporairement indisponible:', error.message);
    return false;
  }
};

/**
 * Stocke des données dans Redis avec préfixe auth: et expiration
 * @param {string} key Clé (sera préfixée par auth:)
 * @param {any} data Données à stocker (sera sérialisée en JSON)
 * @param {number} expiration Expiration en secondes (défaut: 1 jour)
 * @returns {Promise<string|null>} Résultat de l'opération ou null si Redis indisponible
 */
const storeData = async (key, data, expiration = 86400) => {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    
    const serialized = JSON.stringify(data);
    const result = await client.setEx(key, expiration, serialized);
    
    console.log(`📝 Redis: Stocké ${key} (expire dans ${expiration}s)`);
    return result;
  } catch (error) {
    console.error(`❌ Erreur stockage Redis (${key}):`, error.message);
    // En production, on peut choisir de fail silently pour ne pas casser l'auth
    if (process.env.NODE_ENV === 'production') {
      return null;
    }
    throw error;
  }
};

/**
 * Récupère des données depuis Redis avec préfixe auth:
 * @param {string} key Clé (sera préfixée par auth:)
 * @returns {Promise<any|null>} Données désérialisées ou null
 */
const getData = async (key) => {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    
    const data = await client.get(key);
    const result = data ? JSON.parse(data) : null;
    
    if (result) {
      console.log(`📖 Redis: Récupéré ${key}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Erreur lecture Redis (${key}):`, error.message);
    return null;
  }
};

/**
 * Supprime des données de Redis avec préfixe auth:
 * @param {string} key Clé (sera préfixée par auth:)
 * @returns {Promise<number>} Nombre de clés supprimées
 */
const deleteData = async (key) => {
  try {
    const client = await getRedisClient();
    if (!client) return 0;
    
    const result = await client.del(key);
    console.log(`🗑️  Redis: Supprimé ${key}`);
    return result;
  } catch (error) {
    console.error(`❌ Erreur suppression Redis (${key}):`, error.message);
    return 0;
  }
};

/**
 * Nettoie les données expirées et obsolètes (maintenance)
 * @returns {Promise<number>} Nombre de clés nettoyées
 */
const cleanup = async () => {
  try {
    const client = await getRedisClient();
    if (!client) return 0;
    
    // Supprimer les sessions expirées et autres données obsolètes
    const keys = await client.keys('session:*');
    let cleaned = 0;
    
    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl === -1) { // Pas d'expiration définie
        await client.expire(key, 86400); // 24h par défaut
        cleaned++;
      }
    }
    
    console.log(`🧹 Redis: ${cleaned} clés de session nettoyées`);
    return cleaned;
  } catch (error) {
    console.error('❌ Erreur nettoyage Redis:', error.message);
    return 0;
  }
};

module.exports = {
  getRedisConfig,
  initRedis,
  closeRedis,
  getRedisClient,
  isRedisAvailable,
  storeData,
  getData,
  deleteData,
  cleanup
}; 
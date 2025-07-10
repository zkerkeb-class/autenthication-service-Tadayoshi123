require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const promBundle = require('express-prom-bundle');
const swaggerDocument = require('./swagger.json');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { setupRoutes } = require('./routes');
const { addPrivacyHeaders } = require('./middlewares/rgpd');
const healthController = require('./controllers/health.controller');
const { initRedis, closeRedis, isRedisAvailable } = require('./config/redis');
const logger = require('./config/logger');
const pinoHttp = require('pino-http');

// Importation des services
const DbServiceClient = require('./services/db-client');
const AuthService = require('./services/auth.service');
const OAuthService = require('./services/oauth.service');
const Auth0Service = require('./services/auth0.service');
const NotificationService = require('./services/notification.service');

/**
 * Initialisation de l'application Express
 */
const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Variable pour stocker l'instance du serveur
 */
let serverInstance = null;

/**
 * Configuration des middlewares de base
 * @param {Object} app - Application Express
 */
const setupMiddlewares = (app) => {
  // Compression des réponses
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  // Logging HTTP avec Morgan
  const logFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(logFormat, {
    skip: (req, res) => {
      // Skip health checks et metrics en production
      if (NODE_ENV === 'production') {
        return req.url === '/health' || req.url === '/metrics';
      }
      return false;
    }
  }));

  // Headers de sécurité avec Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Pour Swagger UI
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      },
    },
    crossOriginEmbedderPolicy: NODE_ENV === 'production',
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    hsts: NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: 'draft-7', // Utiliser draft-7 au lieu d'un objet
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    },
    handler: (req, res, next, options) => {
      res.status(429).json(options.message);
    }
  });

  app.use(limiter);

  // CORS avec configuration SupervIA améliorée
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:4000'];
  
  app.use(cors({
    origin: (origin, callback) => {
      // En développement, on peut être plus permissif
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      // Autoriser les requêtes sans origine (ex: Postman, apps mobiles)
      if (!origin) {
        return callback(null, true);
      }
      // Vérifier si l'origine est dans la liste blanche
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      
      return callback(new Error('La politique CORS pour ce site n\'autorise pas l\'accès depuis cette origine.'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client', 'X-Version', 'X-Service', 'X-Environment', 'X-Request-ID', 'X-Timestamp'],
    exposedHeaders: ['X-Total-Count', 'X-Privacy-Policy']
  }));

  // Parsing
  app.use(express.json({ 
    limit: '10mb',
    type: ['application/json', 'application/json; charset=utf-8']
  }));
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
  }));
  app.use(cookieParser(process.env.COOKIE_SECRET));

  // Middlewares SupervIA
  app.use(addPrivacyHeaders);

  // --- Logging ---
  app.use(pinoHttp({ logger }));
};

/**
 * Prometheus metrics middleware
 * Note: all custom metrics are automatically collected
 */
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  promClient: {
    collectDefaultMetrics: {}
  },
});

/**
 * Configuration de la documentation Swagger
 * @param {Object} app - Application Express
 */
const setupSwagger = (app) => {
  // Configuration Swagger UI
  const swaggerOptions = {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .scheme-container { background: #f8f9fa; padding: 10px; border-radius: 5px; }
    `,
    customSiteTitle: 'SupervIA Auth API',
    customfavIcon: '/favicon.ico'
  };

  try {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));
    logger.info(`📚 Documentation Swagger disponible sur http://localhost:${PORT}/api-docs`);
  } catch (err) {
    logger.warn('swagger.json non trouvé. La documentation API est désactivée.');
    logger.warn("Exécutez 'npm run swagger:gen' pour la générer.");
  }
  
  // Endpoint JSON pour la spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });
};

/**
 * Configuration des endpoints de santé
 * @param {Object} app - Application Express
 */
const setupHealthEndpoints = (app) => {
  app.get('/health', (req, res) => healthController.simple(req, res));
  app.get('/health/detailed', (req, res) => healthController.detailed(req, res));
  app.get('/health/stats', (req, res) => healthController.stats(req, res));
};

/**
 * Vérification des dépendances
 * @returns {Promise<boolean>} true si toutes les dépendances sont disponibles
 */
const checkDependencies = async () => {
  const checks = {
    redis: false
  };

  try {
    // Vérifier Redis si configuré
    if (process.env.REDIS_URL) {
      checks.redis = await isRedisAvailable();
      if (!checks.redis) {
        logger.warn('⚠️  Redis n\'est pas disponible. Le service fonctionnera avec des fonctionnalités limitées.');
      } else {
        logger.info('✅ Redis connecté');
      }
    } else {
      logger.info('ℹ️  Redis non configuré');
    }

    return true;
  } catch (error) {
    logger.error({ err: error }, '❌ Erreur lors de la vérification des dépendances:');
    return false;
  }
};

/**
 * Initialisation des connexions
 */
const initializeConnections = async () => {
  try {
    // Initialiser Redis si configuré
    if (process.env.REDIS_URL) {
      await initRedis();
    }
    
    return true;
  } catch (error) {
    logger.error({ err: error }, '❌ Erreur lors de l\'initialisation des connexions:');
    return false;
  }
};

/**
 * Configuration de la gestion des erreurs globales
 */
const setupErrorHandlers = (app) => {
  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, '❌ Erreur non capturée:');
    if (NODE_ENV === 'production') {
      gracefulShutdown('uncaughtException');
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ err: reason, promise: promise }, '❌ Promise rejetée non gérée:');
    if (NODE_ENV === 'production') {
      gracefulShutdown('unhandledRejection');
    }
  });

  app.use(errorHandler(logger));
};

/**
 * Arrêt gracieux du serveur
 */
const gracefulShutdown = async (signal) => {
  logger.info(`\n🔄 ${signal} reçu, arrêt gracieux du serveur...`);
  
  if (serverInstance) {
    serverInstance.close(async () => {
      logger.info('🛑 Serveur HTTP arrêté');
      
      try {
        // Fermer Redis
        await closeRedis();
        
        logger.info('✅ Toutes les connexions fermées, arrêt du processus');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, '❌ Erreur lors de la fermeture des connexions:');
        process.exit(1);
      }
    });
    
    // Forcer l'arrêt après un délai
    setTimeout(() => {
      logger.error('⏰ Délai d\'arrêt gracieux dépassé, arrêt forcé');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

/**
 * Démarrage du serveur
 */
const startServer = async () => {
  try {
    if (serverInstance) {
      logger.info('ℹ️ Serveur déjà en cours d\'exécution.');
      return { app, server: serverInstance };
    }

    // Configuration des middlewares
    setupMiddlewares(app);

    // Ajout du middleware Prometheus avant les routes principales
    app.use(metricsMiddleware);

    // Initialisation des services avec le logger
    const dbClient = new DbServiceClient(logger);
    const notificationService = new NotificationService(logger);
    const authService = new AuthService({ dbClient, notificationService, logger });
    const oauthService = new OAuthService({ dbClient, authService, logger });
    const auth0Service = new Auth0Service({ dbClient, authService, logger });

    // Configuration des routes avec les services injectés
    setupRoutes(app, { authService, oauthService, auth0Service });

    // Configuration des endpoints de santé et de documentation
    setupHealthEndpoints(app);
    
    // Initialisation de Swagger
    setupSwagger(app);

    // Gestionnaires d'erreurs (doivent être les derniers middlewares)
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Vérification des dépendances et initialisation des connexions
    await checkDependencies();
    await initializeConnections();

    serverInstance = app.listen(PORT, () => {
      logger.info(`🚀 Serveur démarré sur http://localhost:${PORT} [${NODE_ENV}]`);
    });

    return { app, server: serverInstance };
  } catch (error) {
    logger.error({ err: error }, '❌ Erreur fatale lors du démarrage du serveur:');
    process.exit(1);
  }
};

// Démarrer le serveur si ce fichier est exécuté directement
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer }; 
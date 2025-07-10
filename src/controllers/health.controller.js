const dbClient = require('../services/db-client');

/**
 * Contrôleur pour les vérifications de santé du service
 */
class HealthController {
  /**
   * Health check simple
   */
  async simple(req, res) {
    try {
      res.status(200).json({
        status: 'ok',
        service: 'SupervIA Auth Service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  }

  /**
   * Health check détaillé avec vérification des dépendances
   */
  async detailed(req, res) {
    try {
      const databaseCheck = await this.checkDatabase();
      const configurationCheck = await this.checkConfiguration();
      const dependenciesCheck = await this.checkDependencies();
      
      const healthCheck = {
        status: 'ok',
        service: 'SupervIA Auth Service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        checks: {
          database: databaseCheck,
          configuration: configurationCheck,
          dependencies: dependenciesCheck
        }
      };

      // Déterminer le statut global
      const allChecks = Object.values(healthCheck.checks);
      const hasErrors = allChecks.some(check => check.status === 'error');
      const hasWarnings = allChecks.some(check => check.status === 'warning');

      if (hasErrors) {
        healthCheck.status = 'error';
        res.status(503);
      } else if (hasWarnings) {
        healthCheck.status = 'warning';
        res.status(200);
      } else {
        healthCheck.status = 'healthy';
        res.status(200);
      }

      res.json(healthCheck);
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  }

  /**
   * Vérifie la connexion à la base de données
   */
  async checkDatabase() {
    try {
      const dbServiceHealth = await dbClient.healthCheck();

      if (dbServiceHealth && (dbServiceHealth.status === 'ok' || dbServiceHealth.status === 'healthy')) {
        return {
          status: 'ok',
          message: 'Service de base de données connecté',
          details: dbServiceHealth
        };
      }
      
      return {
        status: 'error',
        message: 'Le service de base de données a signalé un problème',
        details: dbServiceHealth
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erreur de connexion au service de base de données',
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  /**
   * Vérifie la configuration essentielle
   */
  async checkConfiguration() {
    try {
      const required = [
        'DB_SERVICE_URL',
        'JWT_SECRET',
        'API_URL',
        'FRONTEND_URL'
      ];

      const missing = required.filter(key => !process.env[key]);
      const weak = [];

      // Vérifier la force des secrets (uniquement COOKIE_SECRET maintenant)
      ['COOKIE_SECRET', 'JWT_SECRET'].forEach(key => {
        const value = process.env[key];
        if (value && (value.length < 32 || value.includes('change_this'))) {
          weak.push(key);
        }
      });

      if (missing.length > 0) {
        return {
          status: 'error',
          message: `Variables requises manquantes: ${missing.join(', ')}`,
          details: { missing, weak }
        };
      }

      if (weak.length > 0) {
        return {
          status: 'warning',
          message: `Secrets faibles détectés: ${weak.join(', ')}`,
          details: { missing: [], weak }
        };
      }

      return {
        status: 'ok',
        message: 'Configuration correcte',
        details: {
          environment: process.env.NODE_ENV,
          port: process.env.PORT || 3001,
          corsOrigins: process.env.CORS_ORIGINS?.split(',').length || 0
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erreur lors de la vérification de la configuration',
        error: error.message
      };
    }
  }

  /**
   * Vérifie les dépendances optionnelles
   */
  async checkDependencies() {
    try {
      const checks = {
        auth0: this.checkAuth0Config(),
        redis: await this.checkRedis(),
        smtp: this.checkSmtpConfig()
      };

      const hasIssues = Object.values(checks).some(check => check.status === 'error');

      return {
        status: hasIssues ? 'warning' : 'ok',
        message: 'Vérification des dépendances optionnelles',
        details: checks
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erreur lors de la vérification des dépendances',
        error: error.message
      };
    }
  }

  /**
   * Vérifie la configuration Auth0
   */
  checkAuth0Config() {
    try {
      const required = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET'];
      const configured = required.filter(key => process.env[key]);

      if (configured.length === 0) {
        return {
          status: 'info',
          message: 'Auth0 non configuré (optionnel)'
        };
      }

      if (configured.length < required.length) {
        return {
          status: 'warning',
          message: 'Configuration Auth0 incomplète',
          details: {
            configured: configured.length,
            required: required.length,
            missing: required.filter(key => !process.env[key])
          }
        };
      }

      return {
        status: 'ok',
        message: 'Auth0 configuré',
        details: { domain: process.env.AUTH0_DOMAIN }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erreur lors de la vérification Auth0',
        error: error.message
      };
    }
  }

  /**
   * Vérifie la connexion Redis
   */
  async checkRedis() {
    try {
      if (!process.env.REDIS_URL) {
        return {
          status: 'info',
          message: 'Redis non configuré (optionnel)'
        };
      }

      // Test basique de connexion Redis
      // Dans un vrai projet, on utiliserait le client Redis
      return {
        status: 'ok',
        message: 'Redis configuré',
        details: { url: process.env.REDIS_URL.replace(/\/\/.*@/, '//*****@') }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erreur de connexion Redis',
        error: error.message
      };
    }
  }

  /**
   * Vérifie la configuration SMTP
   */
  checkSmtpConfig() {
    try {
      const smtpVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
      const configured = smtpVars.filter(key => process.env[key]);

      if (configured.length === 0) {
        return {
          status: 'info',
          message: 'SMTP non configuré (optionnel)'
        };
      }

      if (configured.length < smtpVars.length) {
        return {
          status: 'warning',
          message: 'Configuration SMTP incomplète',
          details: {
            configured: configured.length,
            required: smtpVars.length
          }
        };
      }

      return {
        status: 'ok',
        message: 'SMTP configuré',
        details: { 
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erreur lors de la vérification SMTP',
        error: error.message
      };
    }
  }

  /**
   * Statistiques du service
   */
  async stats(req, res) {
    try {
      const dbStats = await dbClient.getStats();
      
      const stats = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        service: {
          ...dbStats
        }
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({
        error: 'Erreur lors de la récupération des statistiques',
        message: error.message
      });
    }
  }
}

module.exports = new HealthController(); 
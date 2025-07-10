const healthController = require('../src/controllers/health.controller');
const { AppError } = require('../src/middlewares/errorHandler');
const dbClient = require('../src/services/db-client');

// Mock Express request/response
const mockRequest = (query = {}, params = {}) => ({
  query,
  params
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('HealthController', () => {
  let req, res;

  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();
    jest.clearAllMocks();

    // Configuration environnement test
    process.env.NODE_ENV = 'test';
    process.env.DB_SERVICE_URL = 'http://test-db-service:3002';
    process.env.JWT_SECRET = 'test_secret_with_32_characters_minimum';
    process.env.API_URL = 'http://localhost:3001';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  describe('simple', () => {
    it('should return basic health status', async () => {
      await healthController.simple(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          service: 'SupervIA Auth Service',
          version: '1.0.0',
          environment: 'test',
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle errors gracefully', async () => {
      // Simuler une erreur durant l'exécution de simple()
      // En mockant new Date() pour lever une exception
      const originalDate = Date;
      global.Date = jest.fn(() => {
        throw new Error('Date error');
      });

      await healthController.simple(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: 'Date error'
        })
      );
      
      // Restaurer Date
      global.Date = originalDate;
    });
  });

  describe('detailed', () => {
    it('should return detailed health check when all systems healthy', async () => {
      // Mock des dépendances
      dbClient.healthCheck.mockResolvedValue({ status: 'ok' });

      await healthController.detailed(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          checks: expect.objectContaining({
            database: expect.objectContaining({
              status: 'ok',
              message: 'Service de base de données connecté'
            }),
            configuration: expect.objectContaining({
              status: 'ok'
            }),
            dependencies: expect.any(Object)
          })
        })
      );
    });

    it('should return error status when db-service health check fails', async () => {
      dbClient.healthCheck.mockRejectedValue(new Error('DB Service Connection failed'));

      await healthController.detailed(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          checks: expect.objectContaining({
            database: expect.objectContaining({
              status: 'error',
              message: 'Erreur de connexion au service de base de données'
            })
          })
        })
      );
    });
    
    it('should return warning status when db-service reports an issue', async () => {
      dbClient.healthCheck.mockResolvedValue({ status: 'error', message: 'DB issue' });

      await healthController.detailed(req, res);

      expect(res.status).toHaveBeenCalledWith(503); // L'état global est 'error' si un sous-check est 'error'
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          checks: expect.objectContaining({
            database: expect.objectContaining({
              status: 'error',
              message: 'Le service de base de données a signalé un problème'
            })
          })
        })
      );
    });

    it('should detect missing required configuration', async () => {
      delete process.env.DB_SERVICE_URL;

      await healthController.detailed(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            configuration: expect.objectContaining({
              status: 'error',
              message: expect.stringContaining('DB_SERVICE_URL')
            })
          })
        })
      );
    });

    it('should detect weak secrets', async () => {
      process.env.JWT_SECRET = 'short'; // Secret trop court

      await healthController.detailed(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            configuration: expect.objectContaining({
              status: 'warning',
              message: expect.stringContaining('Secrets faibles')
            })
          })
        })
      );
    });
  });

  describe('checkConfiguration', () => {
    it('should validate required environment variables', async () => {
      const result = await healthController.checkConfiguration();

      expect(result.status).toBe('ok');
      expect(result.details).toEqual(
        expect.objectContaining({
          environment: 'test',
          port: expect.any(String),
          corsOrigins: expect.any(Number)
        })
      );
    });

    it('should detect secrets with default values', async () => {
      process.env.JWT_SECRET = 'change_this_in_production_secret';

      const result = await healthController.checkConfiguration();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('Secrets faibles détectés');
    });
  });

  describe('checkDependencies', () => {
    it('should check Auth0 configuration', () => {
      // Sauvegarder et supprimer les variables Auth0 de test
      const backup = {
        AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
        AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
        AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET
      };
      
      delete process.env.AUTH0_DOMAIN;
      delete process.env.AUTH0_CLIENT_ID;
      delete process.env.AUTH0_CLIENT_SECRET;

      const auth0Check = healthController.checkAuth0Config();

      expect(auth0Check.status).toBe('info');
      expect(auth0Check.message).toContain('Auth0 non configuré');
      
      // Restaurer
      Object.assign(process.env, backup);
    });

    it('should detect partial Auth0 configuration', () => {
      // Sauvegarder les variables
      const backup = {
        AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
        AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
        AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET
      };
      
      process.env.AUTH0_DOMAIN = 'test.auth0.com';
      delete process.env.AUTH0_CLIENT_ID;
      delete process.env.AUTH0_CLIENT_SECRET;

      const auth0Check = healthController.checkAuth0Config();

      expect(auth0Check.status).toBe('warning');
      expect(auth0Check.message).toContain('Configuration Auth0 incomplète');
      
      // Restaurer
      Object.assign(process.env, backup);
    });

    it('should confirm complete Auth0 configuration', () => {
      process.env.AUTH0_DOMAIN = 'test.auth0.com';
      process.env.AUTH0_CLIENT_ID = 'test_client_id';
      process.env.AUTH0_CLIENT_SECRET = 'test_client_secret';

      const auth0Check = healthController.checkAuth0Config();

      expect(auth0Check.status).toBe('ok');
      expect(auth0Check.message).toContain('Auth0 configuré');
    });
  });

  describe('stats', () => {
    it('should return service statistics from db-service', async () => {
      // Mock process.uptime et process.memoryUsage
      jest.spyOn(process, 'uptime').mockReturnValue(3600); // 1 heure
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 50000000,
        heapTotal: 30000000,
        heapUsed: 20000000,
        external: 1000000
      });

      // Mock la réponse de dbClient.getStats
      const mockDbStats = {
        totalUsers: 100,
        activeUsers: 95,
        activeKeyPairs: 2
      };
      dbClient.getStats.mockResolvedValue(mockDbStats);

      await healthController.stats(req, res);

      expect(dbClient.getStats).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
          uptime: 3600,
          memory: expect.objectContaining({
            rss: 50000000
          }),
          service: mockDbStats
        })
      );
    });

    it('should handle db-service errors in stats', async () => {
      // Simuler une erreur de dbClient
      dbClient.getStats.mockRejectedValue(new Error('DB Stats Error'));

      await healthController.stats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Erreur lors de la récupération des statistiques',
          message: 'DB Stats Error'
        })
      );
    });
  });

  describe('checkRedis', () => {
    it('should indicate Redis not configured when URL missing', async () => {
      delete process.env.REDIS_URL;

      const result = await healthController.checkRedis();

      expect(result.status).toBe('info');
      expect(result.message).toContain('Redis non configuré');
    });

    it('should show Redis configured when URL present', async () => {
      process.env.REDIS_URL = 'redis://user:password@localhost:6379';

      const result = await healthController.checkRedis();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('Redis configuré');
      expect(result.details.url).toContain('*****'); // Password masqué
    });
  });

  describe('checkSmtpConfig', () => {
    it('should indicate SMTP not configured', () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;

      const result = healthController.checkSmtpConfig();

      expect(result.status).toBe('info');
      expect(result.message).toContain('SMTP non configuré');
    });

    it('should detect incomplete SMTP configuration', () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      // Pas de SMTP_USER ni SMTP_PASS

      const result = healthController.checkSmtpConfig();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('Configuration SMTP incomplète');
    });

    it('should confirm complete SMTP configuration', () => {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.SMTP_USER = 'test@gmail.com';
      process.env.SMTP_PASS = 'test_password';
      process.env.SMTP_PORT = '587';

      const result = healthController.checkSmtpConfig();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('SMTP configuré');
      expect(result.details).toEqual({
        host: 'smtp.gmail.com',
        port: '587'
      });
    });
  });
}); 
// tests/setup.js

// Charger le fichier .env de test
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

// Configuration globale pour les tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_service_communication_min_32_chars';
process.env.DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:3002';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.API_URL = process.env.API_URL || 'http://localhost:3001';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test_cookie_secret_with_minimum_32_characters_for_security';

// Désactiver les logs pendant les tests
console.log = jest.fn();
console.warn = jest.fn();
console.error = jest.fn();

// Mock du db-client
jest.mock('../src/services/db-client', () => ({
  // Mock des méthodes du client ici
  // Par exemple :
  createUser: jest.fn().mockResolvedValue({ id: 'new_user_id', email: 'test@example.com' }),
  getUserByEmail: jest.fn().mockResolvedValue(null),
  getUserById: jest.fn().mockResolvedValue(null),
  verifyPassword: jest.fn().mockResolvedValue(true),
  // ... autres méthodes
  getActiveKeyPair: jest.fn().mockResolvedValue({
    id: 'keypair1',
    publicKey: JSON.stringify({ kty: 'RSA', n: '...', e: 'AQAB' }),
    privateKey: JSON.stringify({ kty: 'RSA', n: '...', e: 'AQAB', d: '...' }),
    algorithm: 'RS256',
    kid: 'mock-kid'
  }),
  getActiveKeyPairs: jest.fn().mockResolvedValue([]),
  getRefreshTokenByValue: jest.fn().mockResolvedValue(null),
  createRefreshToken: jest.fn().mockResolvedValue({}),
  revokeRefreshToken: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock bcrypt v6
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockImplementation((data, saltRounds) => Promise.resolve('hashed_password')),
  compare: jest.fn().mockImplementation((data, hash) => Promise.resolve(true)),
  genSalt: jest.fn().mockImplementation((saltRounds) => Promise.resolve('generated_salt'))
}));

// Mock jose v6
jest.mock('jose', () => {
  const mockJwk = {
    key: 'mock_jwk_key'
  };
  
  return {
    importJWK: jest.fn().mockResolvedValue(mockJwk),
    exportJWK: jest.fn().mockResolvedValue({ kty: 'RSA', kid: 'mock-kid' }),
    generateKeyPair: jest.fn().mockResolvedValue({
      privateKey: 'mock_private_key',
      publicKey: 'mock_public_key'
    }),
    SignJWT: jest.fn().mockImplementation(() => ({
      setProtectedHeader: jest.fn().mockReturnThis(),
      setIssuedAt: jest.fn().mockReturnThis(),
      setIssuer: jest.fn().mockReturnThis(),
      setAudience: jest.fn().mockReturnThis(),
      setExpirationTime: jest.fn().mockReturnThis(),
      setSubject: jest.fn().mockReturnThis(),
      setJti: jest.fn().mockReturnThis(),
      setPayload: jest.fn().mockReturnThis(),
      sign: jest.fn().mockResolvedValue('mock_jwt_token')
    })),
    jwtVerify: jest.fn().mockResolvedValue({
      payload: { sub: 'user123', type: 'access' },
      protectedHeader: { alg: 'RS256' }
    }),
    createRemoteJWKSet: jest.fn().mockReturnValue(() => Promise.resolve(mockJwk)),
    errors: {
      JOSEError: class JOSEError extends Error {},
      JWTExpired: class JWTExpired extends Error {
        constructor() {
          super('JWT expired');
          this.code = 'ERR_JWT_EXPIRED';
        }
      },
      JWTInvalid: class JWTInvalid extends Error {
        constructor() {
          super('JWT invalid');
          this.code = 'ERR_JWT_INVALID';
        }
      }
    }
  };
});

// Mock JWT utils
jest.mock('../src/utils/jwt', () => ({
  generateAccessToken: jest.fn().mockResolvedValue('mock_access_token'),
  generateRefreshToken: jest.fn().mockResolvedValue('mock_refresh_token'),
  generateIdToken: jest.fn().mockResolvedValue('mock_id_token'),
  verifyAccessToken: jest.fn().mockResolvedValue({ userId: 'user123', type: 'access' }),
  verifyRefreshToken: jest.fn().mockResolvedValue({ userId: 'user123', valid: true }),
  revokeRefreshToken: jest.fn().mockResolvedValue({ success: true }),
  getActiveKeyPair: jest.fn().mockResolvedValue({
    id: 'keypair1',
    publicKey: 'mock_public_key',
    privateKey: 'mock_private_key',
    active: true
  }),
  getJwks: jest.fn().mockResolvedValue({
    keys: [{ kid: 'keypair1', kty: 'RSA', alg: 'RS256' }]
  })
}));

// Mock Redis v5
jest.mock('redis', () => {
  const mockRedisClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    isOpen: jest.fn().mockReturnValue(true),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(true),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
    ping: jest.fn().mockResolvedValue('PONG')
  };

  return {
    createClient: jest.fn().mockReturnValue(mockRedisClient)
  };
});

// Mock RGPD functions
jest.mock('../src/middlewares/rgpd', () => ({
  logDataProcessing: jest.fn().mockResolvedValue(true),
  addPrivacyHeaders: jest.fn().mockImplementation((req, res, next) => next()),
  validateConsent: jest.fn().mockImplementation((purposes) => (req, res, next) => next()),
  minimizeData: jest.fn().mockImplementation((data) => data),
  DataProcessingTypes: {
    AUTHENTICATION: 'authentication',
    SECURITY: 'security',
    ANALYTICS: 'analytics',
    MARKETING: 'marketing'
  }
}));

// Configuration des timeouts
jest.setTimeout(10000);

// Setup et cleanup
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.resetAllMocks();
});

// Exposer le mock pour utilisation dans les tests
global.mockPrisma = mockPrismaClient; 
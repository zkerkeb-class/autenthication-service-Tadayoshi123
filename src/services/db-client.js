// autenthication-service-Tadayoshi123/src/services/db-client.js
// Client HTTP pour communiquer avec le db-service

const axios = require('axios');
const jwt = require('jsonwebtoken');

class DbServiceClient {
  constructor(logger) {
    this.baseURL = process.env.DB_SERVICE_URL || 'http://localhost:3002';
    this.serviceId = 'auth-service';
    this.timeout = 10000; // 10 secondes
    this.logger = logger || console;
    
    // Configuration axios
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SupervIA-Auth-Service/1.0.0'
      }
    });
    
    // Intercepteur pour ajouter automatiquement le JWT
    this.client.interceptors.request.use(
      (config) => {
        const token = this.generateServiceToken();
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Intercepteur de réponse pour gérer les erreurs
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('DB Service Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.response?.data?.error?.message || error.message
        });
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Générer un token JWT pour l'authentification inter-services
   */
  generateServiceToken() {
    const payload = {
      serviceId: 'auth-service',
      permissions: [
        'users:create', 
        'users:read', 
        'users:update', 
        'users:delete',
        'users:verify-password',
        'clients:*', 
        'tokens:*', 
        'keys:*',
        'admin'
      ],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (5 * 60) // 5 minutes
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET);
  }
  
  // ==============================================
  // 👥 GESTION DES UTILISATEURS
  // ==============================================
  
  /**
   * Créer un utilisateur
   */
  async createUser(userData) {
    const response = await this.client.post('/api/v1/users', userData);
    return response.data.data;
  }
  
  /**
   * Récupérer un utilisateur par ID
   */
  async getUserById(userId, options = {}) {
    const params = new URLSearchParams();
    if (options.includePassword) params.append('includePassword', 'true');
    if (options.includeRefreshTokens) params.append('includeRefreshTokens', 'true');
    
    let url = `/api/v1/users/${userId}`;
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await this.client.get(url);
    return response.data.data;
  }
  
  /**
   * Récupérer un utilisateur par email
   */
  async getUserByEmail(email, options = {}) {
    const params = new URLSearchParams();
    if (options.includePassword) {
      params.append('includePassword', 'true');
    }
    
    let url = `/api/v1/users/email/${encodeURIComponent(email)}`;
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await this.client.get(url);
    return response.data.data;
  }
  
  /**
   * Mettre à jour un utilisateur
   */
  async updateUser(userId, updateData) {
    const response = await this.client.put(`/api/v1/users/${userId}`, updateData);
    return response.data.data;
  }
  
  /**
   * Vérifier un mot de passe
   */
  async verifyPassword(userId, password) {
    const response = await this.client.post(`/api/v1/users/${userId}/verify-password`, { password });
    return response.data.data.isValid;
  }
  
  /**
   * Vérifier si un email existe
   */
  async checkEmailExists(email) {
    try {
      const response = await this.client.get(
        `/api/v1/users/check-email/${encodeURIComponent(email)}`
      );
      return response.data.data.exists;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }
  
  // ==============================================
  // 🔑 GESTION DES CLIENTS OAUTH
  // ==============================================
  
  /**
   * Créer un client OAuth
   */
  async createClient(clientData) {
    const response = await this.client.post('/api/v1/clients', clientData);
    return response.data.data;
  }
  
  /**
   * Récupérer un client par ID
   */
  async getClientById(clientId) {
    const response = await this.client.get(`/api/v1/clients/${clientId}`);
    return response.data.data;
  }
  
  /**
   * Récupérer un client par clientId
   */
  async getClientByClientId(clientId) {
    const response = await this.client.get(`/api/v1/clients/by-client-id/${clientId}`);
    return response.data.data;
  }
  
  /**
   * Mettre à jour un client
   */
  async updateClient(clientId, updateData) {
    const response = await this.client.put(`/api/v1/clients/${clientId}`, updateData);
    return response.data.data;
  }
  
  // ==============================================
  // 🔑 GESTION DES CLÉS (JWKS)
  // ==============================================

  /**
   * Créer une paire de clés
   */
  async createKeyPair(keyPairData) {
    const response = await this.client.post('/api/v1/keys', keyPairData);
    return response.data.data;
  }

  /**
   * Récupérer une paire de clés par kid
   */
  async getKeyPairByKid(kid) {
    try {
      const response = await this.client.get(`/api/v1/keys/kid/${kid}`);
      return response.data.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Récupérer la paire de clés active
   */
  async getActiveKeyPair() {
    try {
      const response = await this.client.get('/api/v1/keys/active');
      return response.data.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Récupérer toutes les paires de clés actives (pour JWKS)
   */
  async getActiveKeyPairs() {
    const response = await this.client.get('/api/v1/keys/jwks');
    return response.data;
  }
  
  // ==============================================
  // 🔄 GESTION DES REFRESH TOKENS
  // ==============================================
  
  /**
   * Créer un refresh token
   */
  async createRefreshToken(tokenData) {
    const response = await this.client.post('/api/v1/refresh-tokens', tokenData);
    return response.data.data;
  }
  
  /**
   * Récupérer un refresh token par sa valeur
   */
  async getRefreshTokenByValue(token) {
    try {
      const response = await this.client.get(`/api/v1/refresh-tokens/by-token/${token}`);
      return response.data.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Récupérer tous les refresh tokens d'un utilisateur
   */
  async getUserRefreshTokens(userId, includeRevoked = false) {
    const params = includeRevoked ? '?includeRevoked=true' : '';
    const response = await this.client.get(`/api/v1/refresh-tokens/user/${userId}${params}`);
    return response.data.data;
  }
  
  /**
   * Révoquer un refresh token par sa valeur
   */
  async revokeRefreshToken(token) {
    const response = await this.client.post('/api/v1/refresh-tokens/revoke-by-token', {
      token
    });
    return response.data;
  }
  
  /**
   * Révoquer tous les refresh tokens d'un utilisateur
   */
  async revokeAllUserRefreshTokens(userId) {
    const response = await this.client.post(`/api/v1/refresh-tokens/user/${userId}/revoke-all`);
    return response.data;
  }
  
  // ==============================================
  // 🔧 MÉTHODES UTILITAIRES
  // ==============================================
  
  /**
   * Récupérer les statistiques du db-service
   */
  async getStats() {
    const response = await this.client.get('/api/v1/stats');
    return response.data.data;
  }
  
  /**
   * Vérifier la santé du db-service
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Tester la connexion avec retry automatique
   */
  async testConnection(maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const health = await this.healthCheck();
        if (health.success) {
          console.log('✅ Connection to DB Service successful');
          return true;
        }
      } catch (error) {
        console.warn(`⚠️  DB Service connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
        
        if (i < maxRetries - 1) {
          // Attendre avant de réessayer (backoff exponentiel)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    
    console.error('❌ Failed to connect to DB Service after', maxRetries, 'attempts');
    return false;
  }
}

// Singleton instance
const dbClient = new DbServiceClient();

module.exports = DbServiceClient; 
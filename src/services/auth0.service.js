const axios = require('axios');
const jwt = require('jsonwebtoken');
const generatePassword = require('generate-password');
const { AppError, AuthErrorCodes } = require('../middlewares/errorHandler');

/**
 * Service d'intégration Auth0 pour SupervIA
 */
class Auth0Service {
  constructor({ dbClient, authService, logger }) {
    if (!dbClient || !authService) {
      throw new Error('Auth0Service: dbClient and authService are required');
    }
    this.dbClient = dbClient;
    this.authService = authService;
    this.logger = logger || console;
    
    this.domain = process.env.AUTH0_DOMAIN;
    this.clientId = process.env.AUTH0_CLIENT_ID;
    this.clientSecret = process.env.AUTH0_CLIENT_SECRET;
    this.audience = process.env.AUTH0_AUDIENCE;
    this.managementAudience = process.env.AUTH0_MANAGEMENT_AUDIENCE;
    
    // Vérifier la configuration
    if (!this.domain || !this.clientId || !this.clientSecret) {
      this.logger.warn('Configuration Auth0 incomplète - fonctionnalités OAuth limitées');
    }
    
    this.managementToken = null;
    this.managementTokenExpiry = null;
  }

  /**
   * Obtient un token de management Auth0
   * @returns {Promise<string>} Management token
   */
  async getManagementToken() {
    try {
      // Vérifier si on a déjà un token valide
      if (this.managementToken && this.managementTokenExpiry > Date.now()) {
        return this.managementToken;
      }

      const response = await axios.post(`https://${this.domain}/oauth/token`, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        audience: this.managementAudience,
        grant_type: 'client_credentials'
      });

      this.managementToken = response.data.access_token;
      // Expiration avec marge de sécurité (5 minutes avant)
      this.managementTokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

      return this.managementToken;
    } catch (error) {
      this.logger.error({ err: error }, 'Erreur lors de l\'obtention du token de management Auth0');
      throw new AppError('Erreur de communication avec Auth0', 500, 'AUTH0_ERROR');
    }
  }

  /**
   * Vérifie un token Auth0
   * @param {string} token - Token à vérifier
   * @returns {Promise<Object>} Payload décodé
   */
  async verifyAuth0Token(token) {
    try {
      // Obtenir les clés publiques Auth0
      const jwksResponse = await axios.get(`https://${this.domain}/.well-known/jwks.json`);
      const jwks = jwksResponse.data;

      // Décoder le token pour obtenir le kid
      const decodedToken = jwt.decode(token, { complete: true });
      if (!decodedToken || !decodedToken.header.kid) {
        throw new AppError('Token invalide', 401, AuthErrorCodes.TOKEN_INVALID);
      }

      // Trouver la clé correspondante
      const key = jwks.keys.find(k => k.kid === decodedToken.header.kid);
      if (!key) {
        throw new AppError('Clé de signature introuvable', 401, AuthErrorCodes.TOKEN_INVALID);
      }

      // Construire la clé publique
      const publicKey = `-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`;

      // Vérifier le token
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        audience: this.audience,
        issuer: `https://${this.domain}/`
      });

      return payload;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Token expiré', 401, AuthErrorCodes.TOKEN_EXPIRED);
      }
      
      if (error.name === 'JsonWebTokenError') {
        throw new AppError('Token invalide', 401, AuthErrorCodes.TOKEN_INVALID);
      }

      throw error;
    }
  }

  /**
   * Synchronise un utilisateur Auth0 avec la base locale
   * @param {Object} auth0User - Données utilisateur Auth0
   * @returns {Promise<Object>} Utilisateur local créé/mis à jour
   */
  async syncAuth0User(auth0User) {
    try {
      const email = auth0User.email;
      
      if (!email) {
        throw new AppError('Email requis pour la synchronisation', 400, 'SYNC_ERROR');
      }

      // Chercher l'utilisateur existant via le db-service
      let user = await this.dbClient.getUserByEmail(email).catch(() => null);

      const userData = {
        email,
        firstName: auth0User.given_name || auth0User.name?.split(' ')[0] || email,
        lastName: auth0User.family_name || auth0User.name?.split(' ').slice(1).join(' ') || 'User',
        picture: auth0User.picture || null,
        emailVerified: auth0User.email_verified || false,
        roles: ['USER'] // Rôle par défaut
      };

      if (user) {
        // Mettre à jour l'utilisateur existant
        user = await this.dbClient.updateUser(user.id, {
          ...userData,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Créer un nouvel utilisateur
        const password = generatePassword.generate({
          length: 16,
          numbers: true,
          symbols: true,
          strict: true,
        });

        user = await this.dbClient.createUser({
          ...userData,
          password,
          active: true
        });
        this.logger.info({ userId: user.id, email }, 'Nouvel utilisateur créé localement via Auth0');
      }
      
      return user;
    } catch (error) {
      this.logger.error({ err: error, email }, 'Erreur lors de la synchronisation de l\'utilisateur Auth0');
      throw error;
    }
  }

  /**
   * Authentifie un utilisateur via Auth0
   * @param {string} auth0Token - Token Auth0
   * @returns {Promise<Object>} Tokens SupervIA et données utilisateur
   */
  async authenticateWithAuth0(auth0Token) {
    try {
      // Vérifier le token Auth0
      const auth0Payload = await this.verifyAuth0Token(auth0Token);
      
      // Obtenir les détails utilisateur depuis Auth0
      const userInfo = await this.getAuth0UserInfo(auth0Token);
      
      // Synchroniser avec la base locale
      const localUser = await this.syncAuth0User(userInfo);
      
      // Générer les tokens SupervIA en utilisant les fonctions de jwt.js via authService pour la cohérence
      const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
      const accessToken = await generateAccessToken(localUser, this.dbClient);
      const refreshToken = await generateRefreshToken(localUser.id, this.dbClient);

      return {
        success: true,
        accessToken,
        refreshToken,
        user: localUser,
        provider: 'auth0'
      };
    } catch (error) {
      this.logger.error({ err: error }, 'Erreur lors de l\'authentification Auth0');
      throw error;
    }
  }

  /**
   * Obtient les informations utilisateur depuis Auth0
   * @param {string} accessToken - Token d'accès Auth0
   * @returns {Promise<Object>} Informations utilisateur
   */
  async getAuth0UserInfo(accessToken) {
    try {
      const response = await axios.get(`https://${this.domain}/userinfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error({ err: error }, 'Erreur lors de la récupération des infos utilisateur Auth0');
      throw new AppError('Impossible de récupérer les informations utilisateur', 500, 'AUTH0_USERINFO_ERROR');
    }
  }

  /**
   * Crée un utilisateur dans Auth0
   * @param {Object} userData - Données de l'utilisateur
   * @returns {Promise<Object>} Utilisateur Auth0 créé
   */
  async createAuth0User(userData) {
    try {
      const managementToken = await this.getManagementToken();
      
      const auth0UserData = {
        email: userData.email,
        password: userData.password,
        name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
        given_name: userData.firstName,
        family_name: userData.lastName,
        connection: 'Username-Password-Authentication', // Connexion par défaut
        email_verified: false
      };

      const response = await axios.post(
        `https://${this.domain}/api/v2/users`,
        auth0UserData,
        {
          headers: {
            Authorization: `Bearer ${managementToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error({ err: error, email: userData.email }, 'Erreur lors de la création de l\'utilisateur dans Auth0');
      
      if (error.response?.data?.message?.includes('already exists')) {
        throw new AppError('Un utilisateur avec cet email existe déjà', 400, AuthErrorCodes.EMAIL_ALREADY_IN_USE);
      }
      
      throw new AppError('Impossible de créer l\'utilisateur dans Auth0', 500, 'AUTH0_USER_CREATION_ERROR');
    }
  }

  /**
   * Supprime un utilisateur d'Auth0
   * @param {string} auth0UserId - ID utilisateur Auth0
   * @returns {Promise<boolean>} Succès de la suppression
   */
  async deleteAuth0User(auth0UserId) {
    try {
      const managementToken = await this.getManagementToken();
      
      await axios.delete(
        `https://${this.domain}/api/v2/users/${auth0UserId}`,
        {
          headers: {
            Authorization: `Bearer ${managementToken}`
          }
        }
      );
      this.logger.info({ auth0UserId }, 'Utilisateur supprimé d\'Auth0 avec succès');
      return true;
    } catch (error) {
      this.logger.error({ err: error, auth0UserId }, 'Erreur lors de la suppression de l\'utilisateur dans Auth0');
      // Ne pas bloquer si la suppression échoue, juste logger
      return false;
    }
  }

  /**
   * Génère l'URL d'autorisation Auth0
   * @param {string} redirectUri - URI de redirection
   * @param {string} state - État pour sécurité
   * @param {string[]} scopes - Scopes demandés
   * @returns {string} URL d'autorisation
   */
  generateAuthorizationUrl(redirectUri, state, scopes = ['openid', 'profile', 'email']) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      audience: this.audience
    });

    return `https://${this.domain}/authorize?${params.toString()}`;
  }

  /**
   * Échange un code d'autorisation contre des tokens
   * @param {string} code - Code d'autorisation
   * @param {string} redirectUri - URI de redirection
   * @returns {Promise<Object>} Tokens Auth0
   */
  async exchangeCodeForTokens(code, redirectUri) {
    try {
      const response = await axios.post(`https://${this.domain}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri
      });

      return response.data;
    } catch (error) {
      this.logger.error({ err: error, code }, 'Erreur lors de l\'échange du code Auth0 pour des tokens');
      throw new AppError('Erreur d\'échange de code Auth0', 500, 'AUTH0_CODE_EXCHANGE_ERROR');
    }
  }
}

module.exports = Auth0Service; 
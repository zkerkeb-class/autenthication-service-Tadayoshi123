const axios = require('axios');
const crypto = require('crypto');
const generatePassword = require('generate-password');
const { AppError, AuthErrorCodes } = require('../middlewares/errorHandler');
const { logDataProcessing, DataProcessingTypes } = require('../middlewares/rgpd');

/**
 * Service OAuth2 pour Google et GitHub
 */
class OAuthService {
  constructor({ dbClient, authService, logger }) {
    if (!dbClient || !authService) {
      throw new Error('OAuthService: dbClient and authService are required');
    }
    this.dbClient = dbClient;
    this.authService = authService;
    this.logger = logger || console;
    
    this.providers = {
      google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scope: 'openid profile email',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET
      },
      github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        emailUrl: 'https://api.github.com/user/emails',
        scope: 'user:email',
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET
      }
    };
  }

  /**
   * Génère l'URL d'autorisation pour un provider
   * @param {string} provider - Provider (google, github)
   * @param {string} state - État pour sécurité
   * @returns {string} URL d'autorisation
   */
  generateAuthUrl(provider, state) {
    const config = this.providers[provider];
    
    if (!config || !config.clientId) {
      throw new AppError(`Provider ${provider} non configuré`, 400, 'PROVIDER_NOT_CONFIGURED');
    }

    const redirectUri = `${process.env.FRONTEND_URL}/auth/callback/${provider}`;

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scope,
      response_type: 'code',
      state,
    });

    if (provider === 'google') {
      params.append('access_type', 'offline');
      params.append('prompt', 'consent');
    }

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Échange un code d'autorisation contre un token d'accès
   * @param {string} provider - Provider (google, github)
   * @param {string} code - Code d'autorisation
   * @param {string} redirectUri - URI de redirection
   * @param {string} state - L'état qui n'est plus utilisé ici mais gardé pour la signature
   * @returns {Promise<Object>} Token d'accès
   */
  async exchangeCodeForToken(provider, code, redirectUri, state) {
    const config = this.providers[provider];
    
    if (!config || !config.clientId || !config.clientSecret) {
      throw new AppError(`Provider ${provider} non configuré`, 400, 'PROVIDER_NOT_CONFIGURED');
    }

    try {
      const data = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      };

      const response = await axios.post(config.tokenUrl, data, {
        headers: {
          Accept: provider === 'github' ? 'application/json' : 'application/x-www-form-urlencoded',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error({ err: error, provider }, `Erreur lors de l'échange du code pour le token pour le provider ${provider}`);
      throw new AppError(`Erreur d'authentification ${provider}`, 400, 'OAUTH_TOKEN_EXCHANGE_ERROR');
    }
  }

  /**
   * Récupère les informations utilisateur depuis le provider
   * @param {string} provider - Provider (google, github)
   * @param {string} accessToken - Token d'accès
   * @returns {Promise<Object>} Informations utilisateur
   */
  async getUserInfo(provider, accessToken) {
    const config = this.providers[provider];
    
    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'SupervIA-Auth-Service'
      };

      // Récupérer les infos de base
      const userResponse = await axios.get(config.userInfoUrl, { headers });
      let userInfo = userResponse.data;

      // Pour GitHub, récupérer aussi les emails
      if (provider === 'github') {
        try {
          const emailResponse = await axios.get(config.emailUrl, { headers });
          const emails = emailResponse.data;
          
          // Prendre l'email principal et vérifié
          const primaryEmail = emails.find(email => email.primary && email.verified);
          userInfo.email = primaryEmail?.email || emails[0]?.email;
          userInfo.email_verified = primaryEmail?.verified || false;
        } catch (emailError) {
          this.logger.warn({ err: emailError, provider }, 'Impossible de récupérer les emails GitHub');
          userInfo.email_verified = false;
        }
      }

      return this.normalizeUserInfo(provider, userInfo);
    } catch (error) {
      this.logger.error({ err: error, provider }, `Erreur lors de la récupération des informations utilisateur pour le provider ${provider}`);
      throw new AppError(`Erreur récupération données ${provider}`, 500, 'OAUTH_USERINFO_ERROR');
    }
  }

  /**
   * Normalise les informations utilisateur selon le provider
   * @param {string} provider - Provider
   * @param {Object} rawUserInfo - Données brutes du provider
   * @returns {Object} Données normalisées
   */
  normalizeUserInfo(provider, rawUserInfo) {
    const normalized = {
      providerId: rawUserInfo.id?.toString(),
      provider,
      email: rawUserInfo.email,
      emailVerified: false,
      firstName: null,
      lastName: null,
      picture: null,
      rawData: rawUserInfo
    };

    switch (provider) {
      case 'google':
        normalized.emailVerified = rawUserInfo.verified_email || false;
        normalized.firstName = rawUserInfo.given_name;
        normalized.lastName = rawUserInfo.family_name;
        normalized.picture = rawUserInfo.picture;
        break;
        
      case 'github':
        normalized.emailVerified = rawUserInfo.email_verified || false;
        // GitHub peut avoir le nom complet dans 'name'
        if (rawUserInfo.name) {
          const nameParts = rawUserInfo.name.split(' ');
          normalized.firstName = nameParts[0];
          normalized.lastName = nameParts.slice(1).join(' ') || null;
        }
        normalized.picture = rawUserInfo.avatar_url;
        break;
    }

    return normalized;
  }

  /**
   * Authentifie un utilisateur via OAuth2
   * @param {string} provider - Provider (google, github)
   * @param {string} code - Code d'autorisation
   * @param {string} state - État reçu pour validation
   * @returns {Promise<Object>} Résultat de l'authentification
   */
  async authenticateWithProvider(provider, code, state) {
    try {
      const redirectUri = `${process.env.FRONTEND_URL}/auth/callback/${provider}`;

      // 1. Échanger le code contre un token
      const tokenData = await this.exchangeCodeForToken(provider, code, redirectUri, state);
      
      // 2. Récupérer les infos utilisateur
      const userInfo = await this.getUserInfo(provider, tokenData.access_token);
      
      if (!userInfo.email) {
        throw new AppError('Email requis pour l\'authentification', 400, 'EMAIL_REQUIRED');
      }

      // 3. Créer ou mettre à jour l'utilisateur local
      const localUser = await this.syncOAuthUser(userInfo);
      
      // 4. Générer les tokens SupervIA
      const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
      const accessToken = await generateAccessToken(localUser, this.dbClient);
      const refreshToken = await generateRefreshToken(localUser.id, this.dbClient);

      // 5. Log RGPD
      await logDataProcessing(
        localUser.id, 
        'oauth_login', 
        'authentication', 
        DataProcessingTypes.AUTHENTICATION, 
        'legitimate_interest'
      );

      return {
        success: true,
        accessToken,
        refreshToken,
        user: localUser,
        provider,
        tokenData: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in
        }
      };
    } catch (error) {
      this.logger.error({ err: error, provider }, `Erreur lors de l'authentification OAuth pour le provider ${provider}`);
      throw error;
    }
  }

  /**
   * Synchronise un utilisateur OAuth avec la base locale
   * @param {Object} oauthUser - Données utilisateur OAuth normalisées
   * @returns {Promise<Object>} Utilisateur local
   */
  async syncOAuthUser(oauthUser) {
    try {
      const email = oauthUser.email;
      let localUser = null;

      // 1. Chercher si l'utilisateur existe déjà
      try {
        localUser = await this.dbClient.getUserByEmail(email);
      } catch (error) {
        // Si 404, c'est un nouvel utilisateur. On continue.
        if (error.response?.status !== 404) {
          throw error; // Relancer les autres erreurs
        }
      }

      // 2. Si l'utilisateur n'existe pas, le créer
      if (!localUser) {
        const newUserPayload = {
          email: oauthUser.email,
          firstName: oauthUser.firstName,
          lastName: oauthUser.lastName,
          picture: oauthUser.picture,
          emailVerified: oauthUser.emailVerified,
          password: generatePassword.generate({
            length: 16, numbers: true, symbols: true, uppercase: true, strict: true
          }),
          provider: oauthUser.provider,
          providerId: oauthUser.providerId
        };
        localUser = await this.dbClient.createUser(newUserPayload);

        this.logger.info({ userId: localUser.id, email: oauthUser.email }, `Nouvel utilisateur créé via OAuth ${oauthUser.provider}`);
        
        // Log RGPD pour la création
        await logDataProcessing(
          localUser.id, 
          'oauth_login', 
          'authentication', 
          DataProcessingTypes.AUTHENTICATION, 
          'legitimate_interest'
        );

      } 
      // 3. Sinon (optionnel), mettre à jour ses informations
      else {
        const updatePayload = {
          firstName: oauthUser.firstName,
          lastName: oauthUser.lastName,
          picture: oauthUser.picture,
          provider: oauthUser.provider,
          providerId: oauthUser.providerId
        };
        localUser = await this.dbClient.updateUser(localUser.id, updatePayload);
      }

      return localUser;
    } catch (error) {
      this.logger.error({ err: error }, 'Erreur lors de la synchronisation de l\'utilisateur OAuth');
      throw new AppError('Erreur interne lors de la synchronisation du compte', 500, 'OAUTH_SYNC_ERROR');
    }
  }

  /**
   * Génère un état de sécurité aléatoire
   * @returns {string} L'état généré
   */
  generateState() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Valide que l'état reçu correspond à l'état stocké
   * @param {string} state - État reçu du provider
   * @param {string} storedState - État stocké (session, cookie)
   * @returns {boolean} True si valide
   */
  validateState(state, storedState) {
    return state && storedState && state === storedState;
  }

  /**
   * Vérifie si un provider est supporté et configuré
   * @param {string} provider - Provider
   * @returns {boolean} True si supporté et configuré
   */
  isProviderSupported(provider) {
    return provider in this.providers && this.providers[provider].clientId;
  }

  /**
   * Obtient le statut de configuration des providers
   * @returns {Object} Statut des providers
   */
  getProvidersStatus() {
    const status = {};
    for (const provider in this.providers) {
      const config = this.providers[provider];
      status[provider] = {
        configured: !!config.clientId && !!config.clientSecret
      };
    }
    return status;
  }
}

module.exports = OAuthService; 
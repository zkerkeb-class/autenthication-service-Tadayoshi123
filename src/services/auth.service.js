const crypto = require('crypto');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  generateIdToken,
  verifyRefreshToken,
  revokeRefreshToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken
} = require('../utils/jwt');
const { importSPKI, exportJWK } = require('jose');
const { AppError, AuthErrorCodes } = require('../middlewares/errorHandler');
const { incrementAuthAttempt, incrementUserRegistration } = require('../middlewares/metrics');
const { logDataProcessing, minimizeData, DataProcessingTypes } = require('../middlewares/rgpd');
const notificationService = require('./notification.service');

/**
 * Service d'authentification
 */
class AuthService {
  /**
   * @param {object} params
   * @param {DbServiceClient} params.dbClient
   * @param {NotificationService} params.notificationService
   * @param {Pino.Logger} params.logger
   */
  constructor({ dbClient, notificationService, logger }) {
    if (!dbClient || !notificationService || !logger) {
      throw new Error('AuthService: dbClient, notificationService, and logger are required');
    }
    this.dbClient = dbClient;
    this.notificationService = notificationService;
    this.logger = logger;
  }

  /**
   * Enregistre un nouvel utilisateur
   * @param {Object} userData - Les données de l'utilisateur à créer
   * @returns {Promise<Object>} L'utilisateur créé (sans mot de passe)
   */
  async register(userData) {
    this.logger.info({ email: userData.email }, 'Tentative d\'inscription pour un nouvel utilisateur.');

    // 1. Vérifier si l'utilisateur existe déjà
    const existingUser = await this.dbClient.getUserByEmail(userData.email).catch(() => null);
    
    if (existingUser) {
      throw new AppError('Cet email est déjà utilisé', 400, AuthErrorCodes.EMAIL_ALREADY_IN_USE);
    }
    
    this.logger.debug({ email: userData.email }, 'Création de l\'utilisateur dans la base de données.');
    // 2. Créer l'utilisateur via le db-service
    const user = await this.dbClient.createUser({
      email: userData.email,
      password: userData.password, // Envoi du mot de passe en clair
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      roles: ['USER']
    });
    
    // Déclencher l'envoi de l'e-mail de confirmation
    this.logger.info({ userId: user.id }, 'Génération du token de vérification et envoi de l\'e-mail.');
    const verificationToken = await generateEmailVerificationToken(user, this.dbClient);
    const confirmationLink = `${process.env.FRONTEND_URL}/auth/verify-email?token=${verificationToken}`;
    
    this.notificationService.sendConfirmationEmail(
      user.email,
      user.firstName || 'nouvel utilisateur',
      confirmationLink
    ).catch(err => this.logger.error({ err, userId: user.id }, 'Échec de l\'envoi de l\'e-mail de confirmation en arrière-plan.'));
    
    // Enregistrer l'activité RGPD
    await logDataProcessing(user.id, 'create', 'user_account', DataProcessingTypes.AUTHENTICATION, 'contract');
    
    // Incrémenter les métriques
    incrementUserRegistration();
    
    this.logger.info({ userId: user.id, email: user.email }, 'Inscription réussie.');

    // Retourner l'utilisateur sans le mot de passe
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  
  /**
   * Authentifie un utilisateur avec email et mot de passe
   * @param {string} email - Email de l'utilisateur
   * @param {string} password - Mot de passe en clair
   * @returns {Promise<Object>} Tokens et informations utilisateur
   */
  async login(email, password) {
    // Récupérer l'utilisateur via db-service
    const user = await this.dbClient.getUserByEmail(email).catch(() => null);
    
    if (!user) {
      throw new AppError('Email ou mot de passe incorrect', 401, AuthErrorCodes.INVALID_CREDENTIALS);
    }
    
    // Vérifier si le compte est actif
    if (!user.active) {
      throw new AppError('Ce compte a été désactivé', 403, AuthErrorCodes.UNAUTHORIZED);
    }
    
    // Vérifier le mot de passe via db-service
    const passwordMatch = await this.dbClient.verifyPassword(user.id, password);
    
    if (!passwordMatch) {
      incrementAuthAttempt('login', 'failure');
      throw new AppError('Email ou mot de passe incorrect', 401, AuthErrorCodes.INVALID_CREDENTIALS);
    }
    
    // Générer les tokens individuellement
    const accessToken = await generateAccessToken(user, this.dbClient);
    const refreshToken = await generateRefreshToken(user.id, this.dbClient);

    // Retourner l'utilisateur et les tokens
    return {
      user,
      accessToken: accessToken,
      refreshToken: refreshToken
    };
  }
  
  /**
   * Rafraîchit un access token à partir d'un refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} Nouveaux tokens
   */
  async refreshToken(refreshToken) {
    // La vérification du token se fait maintenant dans jwt.js via dbClient
    const refreshTokenData = await verifyRefreshToken(refreshToken, this.dbClient);
    
    // Récupérer l'utilisateur via db-service
    const user = await this.dbClient.getUserById(refreshTokenData.userId);
    
    if (!user || !user.active) {
      throw new AppError('Utilisateur non trouvé ou inactif', 401, AuthErrorCodes.UNAUTHORIZED);
    }
    
    // Générer un nouvel access token
    const accessToken = await generateAccessToken(user, this.dbClient);
    
    // Générer un nouveau refresh token et révoquer l'ancien
    const newRefreshToken = await generateRefreshToken(user.id, this.dbClient, refreshTokenData.clientId);
    await revokeRefreshToken(refreshToken, this.dbClient);
    
    return {
      success: true,
      accessToken,
      refreshToken: newRefreshToken
    };
  }
  
  /**
   * Révoque un refresh token (déconnexion)
   * @param {string} refreshToken - Refresh token à révoquer
   * @returns {Promise<boolean>} Résultat de l'opération
   */
  async revokeToken(refreshToken) {
    const result = await revokeRefreshToken(refreshToken, this.dbClient);
    
    return {
      success: result,
      message: result ? 'Token révoqué avec succès' : 'Échec de la révocation du token'
    };
  }
  
  /**
   * Traite une demande OAuth2 d'Authorization Code
   * @param {string} clientId - ID du client
   * @param {string} redirectUri - URI de redirection
   * @param {string} scope - Scopes demandés
   * @param {string} state - État à préserver
   * @param {string} responseType - Type de réponse (code)
   * @param {string} codeChallenge - Challenge PKCE (optional)
   * @param {string} codeChallengeMethod - Méthode de challenge PKCE (optional)
   * @returns {Promise<string>} URL de redirection avec code
   */
  async handleAuthorizationRequest(clientId, redirectUri, scope, state, responseType, codeChallenge, codeChallengeMethod) {
    // Vérifier le client via db-service
    const client = await this.dbClient.getClientByClientId(clientId).catch(() => null);
    
    if (!client || !client.active) {
      throw new AppError('Client non trouvé ou inactif', 400, AuthErrorCodes.CLIENT_NOT_FOUND);
    }
    
    if (!client.redirectUris.includes(redirectUri)) {
      throw new AppError('URI de redirection non autorisée', 400, AuthErrorCodes.INVALID_REDIRECT_URI);
    }
    
    if (responseType !== 'code') {
      throw new AppError('Type de réponse non supporté', 400, AuthErrorCodes.INVALID_GRANT_TYPE);
    }
    
    const requestedScopes = scope.split(' ');
    const invalidScopes = requestedScopes.filter(s => !client.allowedScopes.includes(s));
    
    if (invalidScopes.length > 0) {
      throw new AppError(`Scopes non autorisés: ${invalidScopes.join(', ')}`, 400, AuthErrorCodes.INVALID_SCOPE);
    }
    
    const code = crypto.randomBytes(32).toString('hex');
    
    // TODO: Enregistrer le code d'autorisation dans le db-service
    
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.append('code', code);
    
    if (state) {
      redirectUrl.searchParams.append('state', state);
    }
    
    return redirectUrl.toString();
  }
  
  /**
   * Échange un code d'autorisation contre des tokens
   * @param {string} code - Code d'autorisation
   * @param {string} clientId - ID du client
   * @param {string} clientSecret - Secret du client
   * @param {string} redirectUri - URI de redirection
   * @param {string} codeVerifier - Vérificateur PKCE (optional)
   * @returns {Promise<Object>} Tokens générés
   */
  async exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, codeVerifier) {
    const client = await this.dbClient.getClientByClientId(clientId).catch(() => null);
    
    if (!client || !client.active) {
      throw new AppError('Client non trouvé ou inactif', 400, AuthErrorCodes.CLIENT_NOT_FOUND);
    }
    
    if (client.clientSecret !== clientSecret) {
      throw new AppError('Secret client invalide', 401, AuthErrorCodes.INVALID_CLIENT_CREDENTIALS);
    }
    
    if (!client.redirectUris.includes(redirectUri)) {
      throw new AppError('URI de redirection non autorisée', 400, AuthErrorCodes.INVALID_REDIRECT_URI);
    }
    
    // TODO: Vérifier le code d'autorisation via db-service
    
    const user = await this.dbClient.getUserById(client.ownerId);
    
    if (!user || !user.active) {
      throw new AppError('Utilisateur non trouvé ou inactif', 401, AuthErrorCodes.UNAUTHORIZED);
    }
    
    const accessToken = await generateAccessToken(user, this.dbClient);
    const refreshToken = await generateRefreshToken(user.id, this.dbClient, client.id);
    const idToken = await generateIdToken(user, client.clientId, this.dbClient);
    
    return {
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 900
    };
  }
  
  /**
   * Récupère les informations de l'utilisateur connecté
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>} Informations de l'utilisateur
   */
  async getUserInfo(userId) {
    const user = await this.dbClient.getUserById(userId);
    
    if (!user) {
      throw new AppError('Utilisateur non trouvé', 404, AuthErrorCodes.USER_NOT_FOUND);
    }
    
    // Formater selon OpenID Connect (le format devrait déjà être bon depuis db-service)
    return {
      sub: user.id,
      email: user.email,
      email_verified: user.emailVerified,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      given_name: user.firstName,
      family_name: user.lastName,
      picture: user.picture,
      updated_at: user.updatedAt ? Math.floor(new Date(user.updatedAt).getTime() / 1000) : undefined
    };
  }

  /**
   * Vérifie l'email d'un utilisateur à partir d'un token
   * @param {string} token - Le token de vérification
   * @returns {Promise<Object>} L'utilisateur avec l'email vérifié
   */
  async verifyEmail(token) {
    // 1. Vérifier le token
    const payload = await verifyEmailVerificationToken(token, this.dbClient);
    
    // 2. Récupérer l'utilisateur
    const user = await this.dbClient.getUserById(payload.sub);
    if (!user) {
      throw new AppError('Utilisateur non trouvé', 404, AuthErrorCodes.USER_NOT_FOUND);
    }
    
    // 3. Mettre à jour l'utilisateur si nécessaire
    if (user.emailVerified) {
      console.log(`L'email de l'utilisateur ${user.id} est déjà vérifié.`);
      return { user, message: 'Email déjà vérifié.' };
    }
    
    const updatedUser = await this.dbClient.updateUser(user.id, { emailVerified: true });
    
    // 4. Log RGPD
    await logDataProcessing(
      updatedUser.id,
      'verify_email',
      'user_profile',
      DataProcessingTypes.SECURITY,
      'legitimate_interest'
    );
    
    return { user: updatedUser, message: 'Email vérifié avec succès.' };
  }

  /**
   * Récupère les clés publiques au format JWKS
   * @returns {Promise<Object>} JWKS
   */
  async getJwks() {
    this.logger.info('Récupération des clés JWKS depuis db-service.');
    const jwks = await this.dbClient.getActiveKeyPairs();

    if (!jwks || !jwks.keys || jwks.keys.length === 0) {
      this.logger.warn('Aucune clé JWK active retournée par le db-service.');
      return { keys: [] };
    }

    this.logger.info(`JWKS récupéré avec succès contenant ${jwks.keys.length} clé(s).`);
    return jwks;
  }
}

module.exports = AuthService; 
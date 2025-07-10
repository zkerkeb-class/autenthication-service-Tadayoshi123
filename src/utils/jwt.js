/**
 * Utilitaires JWT pour la gestion des tokens d'authentification
 * Utilise la bibliothèque jose v6 pour une meilleure sécurité et conformité aux standards
 */
const { SignJWT, jwtVerify, generateKeyPair, exportJWK, importPKCS8, importSPKI } = require('jose');
const crypto = require('crypto');
const { AppError, AuthErrorCodes } = require('../middlewares/errorHandler');

/**
 * Génère un access token JWT
 * @param {Object} user - Les données de l'utilisateur
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<string>} Le token généré
 */
const generateAccessToken = async (user, dbClient) => {
  try {
    const activeKeyPair = await getActiveKeyPair(dbClient);
    
    if (!activeKeyPair) {
      throw new Error('Aucune paire de clés active trouvée');
    }
    
    const privateKey = await importPKCS8(
      activeKeyPair.privateKey,
      activeKeyPair.algorithm
    );
    
    const expiresIn = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
    
    return new SignJWT({
      sub: user.id,
      email: user.email,
      roles: user.roles,
      scope: 'openid profile email'
    })
      .setProtectedHeader({ 
        alg: activeKeyPair.algorithm, 
        kid: activeKeyPair.kid,
        typ: 'JWT' 
      })
      .setIssuedAt()
      .setIssuer(process.env.API_URL)
      .setAudience(process.env.FRONTEND_URL)
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  } catch (error) {
    console.error('Erreur lors de la génération du token d\'accès:', error);
    throw error;
  }
};

/**
 * Génère un refresh token et l'enregistre via le db-service
 * @param {string} userId - ID de l'utilisateur
 * @param {string} clientId - ID du client (optionnel)
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<string>} Le refresh token généré
 */
const generateRefreshToken = async (userId, dbClient, clientId = null) => {
  try {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
    const expiresAt = new Date();
    
    const days = parseInt(expiresIn.replace('d', ''));
    expiresAt.setDate(expiresAt.getDate() + days);

    await dbClient.createRefreshToken({
      token,
      userId,
      clientId,
      expiresAt: expiresAt.toISOString()
    });
    
    return token;
  } catch (error) {
    console.error('Erreur lors de la génération du refresh token:', error);
    throw error;
  }
};

/**
 * Génère un ID token pour OpenID Connect
 * @param {Object} user - Informations de l'utilisateur
 * @param {string} clientId - ID du client
 * @param {string} nonce - Nonce pour éviter les attaques par rejeu
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<string>} L'ID token généré
 */
const generateIdToken = async (user, clientId, dbClient, nonce = null) => {
  try {
    const activeKeyPair = await getActiveKeyPair(dbClient);
    
    if (!activeKeyPair) {
      throw new Error('Aucune paire de clés active trouvée');
    }
    
    const privateKey = await importJWK(
      JSON.parse(activeKeyPair.privateKey),
      activeKeyPair.algorithm
    );
    
    const payload = {
      sub: user.id,
      email: user.email,
      email_verified: user.emailVerified,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      given_name: user.firstName,
      family_name: user.lastName,
      picture: user.picture,
      ...(nonce && { nonce })
    };
    
    const expiresIn = process.env.ID_TOKEN_EXPIRES_IN || '1h';
    
    return new SignJWT(payload)
      .setProtectedHeader({ 
        alg: activeKeyPair.algorithm, 
        kid: activeKeyPair.kid,
        typ: 'JWT' 
      })
      .setIssuedAt()
      .setIssuer(process.env.API_URL)
      .setAudience(clientId)
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  } catch (error) {
    console.error('Erreur lors de la génération de l\'ID token:', error);
    throw error;
  }
};

/**
 * Vérifie un access token JWT
 * @param {string} token - Le token à vérifier
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<Object>} Le payload décodé
 */
const verifyAccessToken = async (token, dbClient) => {
  try {
    const decodedHeader = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    
    if (!decodedHeader || !decodedHeader.kid) {
      throw new AppError('Token invalide', 401, AuthErrorCodes.TOKEN_INVALID);
    }
    
    const keyPair = await dbClient.getKeyPairByKid(decodedHeader.kid);
    
    if (!keyPair) {
      throw new AppError('Clé de signature introuvable', 401, AuthErrorCodes.TOKEN_INVALID);
    }
    
    const publicKey = await importSPKI(
      keyPair.publicKey,
      keyPair.algorithm
    );
    
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: process.env.API_URL,
      audience: process.env.FRONTEND_URL
    });
    
    return payload;
  } catch (error) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new AppError('Token expiré', 401, AuthErrorCodes.TOKEN_EXPIRED);
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Token invalide', 401, AuthErrorCodes.TOKEN_INVALID);
  }
};

/**
 * Vérifie un refresh token
 * @param {string} token - Le refresh token à vérifier
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<Object>} Les informations du token
 */
const verifyRefreshToken = async (token, dbClient) => {
  try {
    const refreshToken = await dbClient.getRefreshTokenByValue(token);
    
    if (!refreshToken) {
      throw new AppError('Token de rafraîchissement invalide', 401, AuthErrorCodes.INVALID_REFRESH_TOKEN);
    }
    
    if (new Date(refreshToken.expiresAt) < new Date()) {
      throw new AppError('Token de rafraîchissement expiré', 401, AuthErrorCodes.TOKEN_EXPIRED);
    }
    
    if (refreshToken.revokedAt) {
      throw new AppError('Token de rafraîchissement révoqué', 401, AuthErrorCodes.TOKEN_INVALID);
    }
    
    return refreshToken;
  } catch (error) {
    console.error('Erreur lors de la vérification du refresh token:', error);
    throw error;
  }
};

/**
 * Révoque un refresh token
 * @param {string} token - Le refresh token à révoquer
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<boolean>} True si révoqué avec succès
 */
const revokeRefreshToken = async (token, dbClient) => {
  try {
    const result = await dbClient.revokeRefreshToken(token);
    return result.success;
  } catch (error) {
    console.error('Erreur lors de la révocation du refresh token:', error);
    return false;
  }
};

/**
 * Récupère la paire de clés active
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<Object>} La paire de clés active
 */
const getActiveKeyPair = async (dbClient) => {
  try {
    return await dbClient.getActiveKeyPair();
  } catch (error) {
    console.error('Impossible de récupérer la clé active depuis db-service', error);
    return null;
  }
};

/**
 * Génère une nouvelle paire de clés RSA
 * @returns {Promise<Object>} La paire de clés générée
 */
const generateKeyPairRSA = async () => {
  try {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);
    const kid = crypto.randomBytes(8).toString('hex');
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    const keyPairData = {
      kid,
      publicKey: JSON.stringify(publicJwk),
      privateKey: JSON.stringify(privateJwk),
      algorithm: 'RS256',
      active: true,
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };
    
    return await dbClient.createKeyPair(keyPairData);
  } catch (error) {
    console.error('Erreur lors de la génération de la paire de clés:', error);
    throw error;
  }
};

/**
 * Génère un token de vérification d'email
 * @param {Object} user - L'objet utilisateur
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<string>} Le token généré
 */
const generateEmailVerificationToken = async (user, dbClient) => {
  try {
    const activeKeyPair = await getActiveKeyPair(dbClient);
    if (!activeKeyPair) {
      throw new Error('Aucune paire de clés active trouvée pour la vérification d\'email');
    }
    const privateKey = await importPKCS8(activeKeyPair.privateKey, activeKeyPair.algorithm);
    const expiresIn = '24h';

    return new SignJWT({
      sub: user.id,
      purpose: 'email_verification'
    })
      .setProtectedHeader({ alg: activeKeyPair.algorithm, kid: activeKeyPair.kid, typ: 'JWT' })
      .setIssuedAt()
      .setIssuer(process.env.API_URL)
      .setAudience(process.env.FRONTEND_URL)
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  } catch (error) {
    console.error('Erreur lors de la génération du token de vérification d\'email:', error);
    throw error;
  }
};

/**
 * Vérifie un token de vérification d'email
 * @param {string} token - Le token à vérifier
 * @param {Object} dbClient - Le client pour le service de base de données
 * @returns {Promise<Object>} Le payload décodé
 */
const verifyEmailVerificationToken = async (token, dbClient) => {
  try {
    const { payload } = await jwtVerify(token, async (header) => {
      const key = await dbClient.getActiveKeyPair(); // Utiliser la clé active pour vérifier
      if (!key) {
        throw new Error('Clé publique non trouvée pour la vérification');
      }
      // Correction: Utiliser la clé publique (SPKI) pour la vérification
      return await importSPKI(key.publicKey, key.algorithm);
    }, {
      issuer: process.env.API_URL,
      audience: process.env.FRONTEND_URL,
    });

    if (payload.purpose !== 'email_verification') {
      throw new AppError('Token invalide (mauvais usage)', 400, 'INVALID_TOKEN_PURPOSE');
    }
    
    return payload;
  } catch (error) {
    console.error('Erreur lors de la vérification du token d\'email:', error);
    if (error instanceof AppError) throw error;
    throw new AppError('Token de vérification invalide ou expiré', 401, 'INVALID_VERIFICATION_TOKEN');
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateIdToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  getActiveKeyPair,
  generateKeyPairRSA,
  generateEmailVerificationToken,
  verifyEmailVerificationToken
}; 
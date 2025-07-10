const jwt = require('jsonwebtoken');
const { AppError, AuthErrorCodes } = require('./errorHandler');
const { verifyAccessToken } = require('../utils/jwt');

/**
 * Middleware pour vérifier l'authentification via JWT
 */
const authenticate = async (req, res, next) => {
  try {
    // Récupération du token depuis le header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token d\'authentification requis', 401, AuthErrorCodes.TOKEN_REQUIRED);
    }
    
    const token = authHeader.split(' ')[1];
    
    // Vérification du token
    const payload = await verifyAccessToken(token);
    
    // Ajout des informations utilisateur à l'objet req
    req.user = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles || []
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expiré', 401, AuthErrorCodes.TOKEN_EXPIRED));
    }
    
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Token invalide', 401, AuthErrorCodes.TOKEN_INVALID));
    }
    
    next(error);
  }
};

/**
 * Middleware pour vérifier si un utilisateur a les rôles requis
 * @param {string[]} requiredRoles - Tableau des rôles requis
 */
const authorize = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Non authentifié', 401, AuthErrorCodes.UNAUTHORIZED));
    }
    
    const userRoles = req.user.roles || [];
    
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      return next(new AppError('Permissions insuffisantes', 403, AuthErrorCodes.INSUFFICIENT_PERMISSIONS));
    }
    
    next();
  };
};

module.exports = {
  authenticate,
  authorize
}; 
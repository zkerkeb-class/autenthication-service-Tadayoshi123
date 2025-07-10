class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (logger) => (err, req, res, next) => {
  const errorLogger = logger || console;
  let error = { ...err, message: err.message }; // Créer une copie pour la modification

  // Log de l'erreur brute pour le débogage interne
  errorLogger.error({ 
    err: error,
    stack: error.stack,
    url: req.originalUrl,
    service: req.service?.id || 'unknown',
    requestId: req.id,
  }, `Erreur traitée par le ErrorHandler: ${error.message}`);

  // Si l'erreur est une instance de AppError, elle est opérationnelle et peut être traitée
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.errorCode
      }
    });
  }

  // Si on arrive ici, c'est une erreur non gérée
  console.error('Erreur non gérée:', err);

  // En production, on ne renvoie pas les détails techniques
  const isProduction = process.env.NODE_ENV === 'production';
  
  return res.status(500).json({
    success: false,
    error: {
      message: isProduction ? 'Une erreur interne est survenue' : err.message,
      code: 'INTERNAL_SERVER_ERROR'
    }
  });
};

// Codes d'erreur pour l'authentification
const AuthErrorCodes = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  EMAIL_ALREADY_IN_USE: 'EMAIL_ALREADY_IN_USE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_REQUIRED: 'TOKEN_REQUIRED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  INVALID_CLIENT_CREDENTIALS: 'INVALID_CLIENT_CREDENTIALS',
  INVALID_GRANT_TYPE: 'INVALID_GRANT_TYPE',
  INVALID_REDIRECT_URI: 'INVALID_REDIRECT_URI',
  INVALID_SCOPE: 'INVALID_SCOPE'
};

const notFoundHandler = (logger) => (req, res, next) => {
  const error = new AppError(
    `Route non trouvée: ${req.method} ${req.originalUrl}`,
    404,
    'ROUTE_NOT_FOUND'
  );
  (logger || console).warn({
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  }, `Tentative d'accès à une route non trouvée: ${req.method} ${req.originalUrl}`);
  
  next(error);
};

module.exports = {
  AppError,
  errorHandler,
  AuthErrorCodes,
  notFoundHandler
}; 
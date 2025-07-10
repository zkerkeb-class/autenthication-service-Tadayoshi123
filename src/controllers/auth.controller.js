const authService = require('../services/auth.service');
const auth0Service = require('../services/auth0.service');
const { AppError, AuthErrorCodes } = require('../middlewares/errorHandler');

class AuthController {
  constructor(authService) {
    this.authService = authService;
  }
  
  /**
   * Enregistre un nouvel utilisateur
   */
  async register(req, res, next) {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      // Validation basique
      if (!email || !password) {
        throw new AppError('Email et mot de passe requis', 400, 'VALIDATION_ERROR');
      }
      
      const user = await this.authService.register({ email, password, firstName, lastName });
      
      res.status(201).json({
        success: true,
        message: 'Utilisateur créé avec succès',
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Vérifie l'email d'un utilisateur avec un token
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.body;
      if (!token) {
        throw new AppError('Token de vérification requis', 400, 'VALIDATION_ERROR');
      }
      
      const result = await this.authService.verifyEmail(token);
      
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Connecte un utilisateur
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const { user, accessToken, refreshToken } = await this.authService.login(email, password);

      res.json({
        success: true,
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: user
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Gère le login via un access token Auth0
   */
  async loginWithAuth0(req, res, next) {
    try {
      const { accessToken } = req.body;
      
      if (!accessToken) {
        throw new AppError('Access token Auth0 requis', 400, AuthErrorCodes.TOKEN_REQUIRED);
      }
      
      const result = await auth0Service.authenticateWithAuth0(accessToken);
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Rafraîchit un token d'accès
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        throw new AppError('Refresh token requis', 400, AuthErrorCodes.TOKEN_REQUIRED);
      }
      
      const result = await this.authService.refreshToken(refreshToken);
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Révoque un refresh token
   */
  async revokeToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        throw new AppError('Refresh token requis', 400, AuthErrorCodes.TOKEN_REQUIRED);
      }
      
      const result = await this.authService.revokeToken(refreshToken);
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Récupère les informations de l'utilisateur authentifié
   */
  async userInfo(req, res, next) {
    try {
      // L'utilisateur est déjà authentifié via le middleware
      const userId = req.user.id;
      
      const userInfo = await this.authService.getUserInfo(userId);
      
      res.json(userInfo);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Fournit le endpoint JWKS
   */
  async jwks(req, res, next) {
    try {
      const jwks = await this.authService.getJwks();
      
      res.json(jwks);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
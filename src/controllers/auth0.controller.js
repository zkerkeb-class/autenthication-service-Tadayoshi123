const { AppError } = require('../middlewares/errorHandler');
const crypto = require('crypto');

class Auth0Controller {
  constructor(auth0Service) {
    if (!auth0Service) {
      throw new Error('Auth0Controller: auth0Service is required');
    }
    this.auth0Service = auth0Service;
  }

  /**
   * Redirige l'utilisateur vers la page de connexion Auth0
   */
  async login(req, res, next) {
    try {
      const state = crypto.randomBytes(16).toString('hex');
      const redirectUri = `${process.env.FRONTEND_URL}/auth/callback/auth0`;
      
      console.log(`[AUTH0 DEBUG] Generating redirect URI: "${redirectUri}"`);

      const authorizationUrl = this.auth0Service.generateAuthorizationUrl(redirectUri, state);
      
      res.json({
        success: true,
        data: {
          authUrl: authorizationUrl,
          state: state
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Gère le callback après l'authentification Auth0
   */
  async callback(req, res, next) {
    try {
      const { code, state, error: auth0Error } = req.query;

      if (auth0Error) {
        throw new AppError(`Erreur Auth0: ${auth0Error}`, 400, 'AUTH0_ERROR');
      }

      // La validation de l'état (state) est désormais gérée côté frontend
      // pour harmoniser avec les autres fournisseurs OAuth.
      // Le frontend compare le state reçu dans le callback avec celui
      // qu'il a stocké dans le sessionStorage.
      if (!state) {
        throw new AppError('État manquant dans la requête de callback', 400, 'MISSING_STATE');
      }

      if (!code) {
        throw new AppError('Code d\'autorisation manquant', 400, 'MISSING_AUTH_CODE');
      }
      
      const redirectUri = `${process.env.FRONTEND_URL}/auth/callback/auth0`;

      // Échanger le code contre des tokens
      const tokenData = await this.auth0Service.exchangeCodeForTokens(code, redirectUri);
      
      // Authentifier l'utilisateur dans notre système
      const authResult = await this.auth0Service.authenticateWithAuth0(tokenData.access_token);
      
      // Pour l'instant, on retourne le résultat en JSON.
      // Une redirection vers le frontend avec les tokens est aussi possible.
      res.json({
        success: true,
        data: authResult
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = Auth0Controller; 
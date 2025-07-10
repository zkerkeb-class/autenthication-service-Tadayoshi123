const { AppError } = require('../middlewares/errorHandler');

/**
 * Contrôleur OAuth2 pour Google et GitHub
 */
class OAuthController {
  constructor(oauthService) {
    if (!oauthService) {
      throw new Error('OAuthController: oauthService is required');
    }
    this.oauthService = oauthService;
  }

  /**
   * Génère l'URL d'authentification pour un provider et la retourne en JSON
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async generateAuthUrl(req, res, next) {
    try {
      const { provider } = req.params;
      
      // Valider le provider
      if (!this.oauthService.isProviderSupported(provider)) {
        throw new AppError('Provider OAuth non supporté', 400, 'UNSUPPORTED_PROVIDER');
      }

      const state = this.oauthService.generateState();
      const authUrl = this.oauthService.generateAuthUrl(provider, state);
      
      res.json({
        success: true,
        data: {
          authUrl,
          state // Renvoyer le state au client
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Gère le callback OAuth2
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async handleCallback(req, res, next) {
    try {
      const { provider } = req.params;
      const { code, state, error: oauthError } = req.query;
      
      // --- DEBUGGING ---
      console.log(`[OAuth Callback - ${provider}] Received callback.`);
      console.log(`[OAuth Callback - ${provider}] Query State:`, state);
      console.log(`[OAuth Callback - ${provider}] Cookies received:`, req.cookies);
      console.log(`[OAuth Callback - ${provider}] Signed Cookies received:`, req.signedCookies);
      // --- END DEBUGGING ---
      
      // Vérifier s'il y a une erreur OAuth
      if (oauthError) {
        throw new AppError(`Erreur OAuth de ${provider}: ${oauthError}`, 400, 'OAUTH_ERROR');
      }
      
      // Vérifier la présence du code
      if (!code) {
        throw new AppError("Code d'autorisation manquant", 400, 'MISSING_AUTH_CODE');
      }
      
      // La validation du state se fera désormais par le service qui reçoit le state du client
      
      // Authentifier avec le provider
      const authResult = await this.oauthService.authenticateWithProvider(provider, code, state);
      
      // En mode API, retourner JSON (par exemple pour un client mobile)
      if (req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          data: authResult
        });
      }
      
      // En mode web, rediriger vers le frontend avec les tokens
      const frontendUrl = new URL(process.env.FRONTEND_CALLBACK_URL || process.env.FRONTEND_URL);
      frontendUrl.searchParams.append('access_token', authResult.accessToken);
      if(authResult.refreshToken) {
        frontendUrl.searchParams.append('refresh_token', authResult.refreshToken);
      }
      frontendUrl.searchParams.append('provider', provider);
      
      res.redirect(frontendUrl.toString());
    } catch (error) {
      // En cas d'erreur, rediriger vers le frontend avec un message d'erreur
      if (!req.headers.accept?.includes('application/json')) {
        const frontendUrl = new URL(process.env.FRONTEND_CALLBACK_URL || process.env.FRONTEND_URL);
        frontendUrl.pathname = '/auth/login'; // Rediriger vers la page de login
        frontendUrl.searchParams.append('error', 'oauth_failed');
        frontendUrl.searchParams.append('error_description', error.message || 'An unknown error occurred.');
        frontendUrl.searchParams.append('provider', req.params.provider);
        
        return res.redirect(frontendUrl.toString());
      }
      
      next(error);
    }
  }

  /**
   * Obtient le statut des providers OAuth
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async getProvidersStatus(req, res, next) {
    try {
      const status = this.oauthService.getProvidersStatus();
      
      res.json({
        success: true,
        providers: status,
        availableProviders: Object.keys(status).filter(p => status[p].configured)
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lie un compte OAuth à un utilisateur existant
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async linkAccount(req, res, next) {
    try {
      const { provider } = req.params;
      const { code, state } = req.body;
      const userId = req.user.id; // Utilisateur authentifié
      
      // Valider le provider
      if (!['google', 'github'].includes(provider)) {
        throw new AppError('Provider OAuth non supporté', 400, 'UNSUPPORTED_PROVIDER');
      }
      
      // Vérifier l'état
      const storedState = req.cookies[`oauth_state_${provider}`];
      if (!this.oauthService.validateState(state, storedState)) {
        throw new AppError('État OAuth invalide', 400, 'INVALID_OAUTH_STATE');
      }
      
      // TODO: Implémenter la liaison de compte
      // Ceci nécessiterait une table pour stocker les liens OAuth par utilisateur
      
      res.json({
        success: true,
        message: `Compte ${provider} lié avec succès`,
        provider
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Dissocie un compte OAuth d'un utilisateur
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  async unlinkAccount(req, res, next) {
    try {
      const { provider } = req.params;
      const userId = req.user.id;
      
      // TODO: Implémenter la dissociation de compte
      
      res.json({
        success: true,
        message: `Compte ${provider} dissocié avec succès`,
        provider
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = OAuthController; 
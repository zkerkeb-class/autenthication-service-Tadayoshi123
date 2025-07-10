const express = require('express');
const passport = require('passport');
const OAuthController = require('../controllers/oauth.controller');
const { authenticate } = require('../middlewares/auth');

const oauthRouter = (services) => {
  const router = express.Router();
  const oauthController = new OAuthController(services.oauthService);

  /**
   * @swagger
   * tags:
   *   name: Authentification Sociale (OAuth2)
   *   description: Endpoints pour l'authentification via des fournisseurs tiers comme Google ou GitHub.
   */

  /**
   * @swagger
   * /api/v1/oauth/{provider}:
   *   get:
   *     summary: Rediriger vers la page de connexion du fournisseur OAuth2.
   *     tags: [Authentification Sociale (OAuth2)]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [google, github]
   *         description: Le fournisseur OAuth2 à utiliser.
   *     responses:
   *       302:
   *         description: Redirection vers la page d'authentification du fournisseur.
   */
  router.get('/:provider', (req, res, next) => {
    const { provider } = req.params;
    passport.authenticate(provider, { scope: provider === 'google' ? ['profile', 'email'] : ['user:email'] })(req, res, next);
  });

  /**
   * @swagger
   * /api/v1/oauth/{provider}/callback:
   *   get:
   *     summary: Callback après l'authentification du fournisseur.
   *     tags: [Authentification Sociale (OAuth2)]
   *     description: Le fournisseur redirige ici après une tentative de connexion. En cas de succès, le service génère des tokens et les retourne, souvent via des query params ou en postMessage au frontend.
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [google, github]
   *         description: Le fournisseur OAuth2 qui a répondu.
   *     responses:
   *       302:
   *         description: Redirection vers le frontend avec les tokens en query params (ou gestion d'une erreur).
   *       500:
   *         description: Erreur interne lors de la gestion du callback.
   */
  router.get('/:provider/callback', (req, res, next) => {
    const { provider } = req.params;
    passport.authenticate(provider, {
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=oauth_failed`,
      session: false
    })(req, res, next);
  }, oauthController.handleCallback);

  // Routes publiques - Initialisation de l'authentification OAuth
  router.get('/providers', oauthController.getProvidersStatus.bind(oauthController));
  router.get('/:provider/auth', oauthController.generateAuthUrl.bind(oauthController));

  // Routes protégées - Gestion des comptes liés (nécessite authentification)
  router.post('/:provider/link', authenticate, oauthController.linkAccount.bind(oauthController));
  router.delete('/:provider/unlink', authenticate, oauthController.unlinkAccount.bind(oauthController));

  return router;
};

module.exports = oauthRouter; 
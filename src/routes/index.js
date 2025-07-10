const express = require('express');
const authRoutes = require('./auth.routes');
const oauthRoutes = require('./oauth.routes');
const auth0Routes = require('./auth0.routes');

const apiRouter = (services) => {
  const router = express.Router();
  
  // Monter les sous-routeurs sur le routeur principal de l'API
  router.use('/auth', authRoutes(services));
  router.use('/oauth', oauthRoutes(services));
  router.use('/auth0', auth0Routes(services));

  return router;
};

/**
 * Configure les routes de l'application pour le MVP
 * @param {Express} app - L'application Express
 * @param {object} services - Les services injectés
 * @param {AuthService} services.authService
 * @param {OAuthService} services.oauthService
 * @param {Auth0Service} services.auth0Service
 */
const setupRoutes = (app, services) => {
  // Appliquer le préfixe global /api/v1 pour toutes les routes de l'API
  app.use('/api/v1', apiRouter(services));
  
  // Les routes ci-dessous sont gérées par le apiRouter maintenant
  // app.use('/auth', authRoutes);
  // app.use('/oauth', oauthRoutes);
};

module.exports = { setupRoutes }; 
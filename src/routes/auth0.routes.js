const express = require('express');
const Auth0Controller = require('../controllers/auth0.controller');

const auth0Router = (services) => {
  const router = express.Router();
  
  // Le contrôleur a besoin du service auth0
  const controller = new Auth0Controller(services.auth0Service);

  // Route pour initier la connexion Auth0
  router.get('/login', controller.login.bind(controller));

  // Route de callback pour Auth0 (maintenant en GET)
  router.get('/callback', controller.callback.bind(controller));

  return router;
};

module.exports = auth0Router; 
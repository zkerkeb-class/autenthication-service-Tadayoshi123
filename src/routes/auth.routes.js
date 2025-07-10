const express = require('express');
const AuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');

const authRouter = (services) => {
  const router = express.Router();
  const authController = new AuthController(services.authService);

  /**
   * @swagger
   * tags:
   *   name: Authentification Standard
   *   description: Endpoints pour l'inscription, la connexion et la gestion des comptes utilisateurs.
   */

  /**
   * @swagger
   * /api/v1/auth/register:
   *   post:
   *     summary: Inscrire un nouvel utilisateur.
   *     tags: [Authentification Standard]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [firstName, lastName, email, password]
   *             properties:
   *               firstName:
   *                 type: string
   *               lastName:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *                 format: password
   *     responses:
   *       201:
   *         description: Utilisateur créé avec succès. Retourne l'utilisateur et les tokens.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *                 tokens:
   *                   $ref: '#/components/schemas/Tokens'
   *       400:
   *         description: Données d'entrée invalides ou l'email est déjà utilisé.
   */
  router.post('/register', authController.register.bind(authController));

  /**
   * @swagger
   * /api/v1/auth/login:
   *   post:
   *     summary: Connecter un utilisateur.
   *     tags: [Authentification Standard]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *     responses:
   *       200:
   *         description: Connexion réussie. Retourne l'utilisateur et les tokens.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *                 tokens:
   *                   $ref: '#/components/schemas/Tokens'
   *       401:
   *         description: Identifiants incorrects.
   */
  router.post('/login', authController.login.bind(authController));

  // Authentification Auth0 (token-based)
  router.post('/auth0/login', authController.loginWithAuth0.bind(authController));

  // Gestion des tokens
  router.post('/refresh', authController.refreshToken.bind(authController));
  router.post('/revoke', authController.revokeToken.bind(authController));

  /**
   * @swagger
   * /api/v1/auth/me:
   *   get:
   *     summary: Récupérer les informations de l'utilisateur actuellement connecté.
   *     tags: [Authentification Standard]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Informations de l'utilisateur.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         description: Non autorisé (token manquant ou invalide).
   */
  router.get('/me', authenticate, authController.userInfo.bind(authController));

  // JWKS endpoint pour la vérification des tokens
  router.get('/jwks.json', authController.jwks.bind(authController));

  return router;
};

module.exports = authRouter; 
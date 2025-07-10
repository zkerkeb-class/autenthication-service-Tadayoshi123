const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');
const logger = require('../src/config/logger');
require('dotenv').config();

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SupervIA - Authentication Service API',
      version: '1.0.0',
      description:
        'Service central pour la gestion de l\'authentification des utilisateurs, ' +
        'des sessions, des tokens JWT, et des connexions via des fournisseurs OAuth2 (Google, GitHub, Auth0).',
      contact: {
        name: 'Support Technique SupervIA',
        email: 'support@supervia.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: 'Serveur de développement local',
      },
      {
        url: 'https://api.supervia.com/auth',
        description: 'Serveur de production',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token d\'accès JWT obtenu après une connexion réussie.',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'ID unique de l\'utilisateur.' },
            firstName: { type: 'string', description: 'Prénom de l\'utilisateur.' },
            lastName: { type: 'string', description: 'Nom de l\'utilisateur.' },
            email: { type: 'string', format: 'email', description: 'Adresse e-mail de l\'utilisateur.' },
            role: { type: 'string', enum: ['user', 'admin'], description: 'Rôle de l\'utilisateur.' },
          },
        },
        Tokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', description: 'Token JWT pour accéder aux ressources protégées.' },
            refreshToken: { type: 'string', description: 'Token pour renouveler l\'accessToken.' },
          },
        },
      },
    },
  },
  // Chemin vers les fichiers contenant les annotations JSDoc pour Swagger
  apis: ['./src/routes/*.js'],
};

try {
  const swaggerSpec = swaggerJsdoc(options);
  const swaggerJsonPath = path.join(__dirname, '../src/swagger.json');

  fs.writeFileSync(swaggerJsonPath, JSON.stringify(swaggerSpec, null, 2));

  logger.info(`Documentation Swagger générée avec succès : ${swaggerJsonPath}`);
} catch (error) {
  logger.error('Erreur lors de la génération de la documentation Swagger:', error);
  process.exit(1);
} 
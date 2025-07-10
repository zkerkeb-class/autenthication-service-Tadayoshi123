const express = require('express');
const healthController = require('../controllers/health.controller');

const router = express.Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Vérifie l'état de santé du service
 *     tags: [Health]
 *     description: "Retourne un statut simple indiquant que le service est en cours d'exécution et opérationnel."
 *     responses:
 *       200:
 *         description: Service sain et opérationnel
 *       503:
 *         description: Le service est en panne ou une de ses dépendances critiques est inaccessible.
 */
router.get('/', healthController.checkHealth);

module.exports = router; 
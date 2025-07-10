/**
 * Middleware de métriques pour le service d'authentification
 * Utilise prom-client pour exposer des métriques Prometheus
 */
const client = require('prom-client');

// Métriques spécifiques à l'authentification
// Ces métriques sont automatiquement enregistrées dans le registre global de prom-client
// et seront exposées par le middleware express-prom-bundle.

const authAttemptsTotal = new client.Counter({
  name: 'auth_attempts_total',
  help: 'Nombre total de tentatives d\'authentification',
  labelNames: ['type', 'status'], // type: login, refresh, oauth | status: success, failure
});

const activeTokensGauge = new client.Gauge({
  name: 'active_tokens_current',
  help: 'Nombre de tokens actifs actuellement',
  labelNames: ['type'], // type: access, refresh
});

const userRegistrationsTotal = new client.Counter({
  name: 'user_registrations_total',
  help: 'Nombre total d\'inscriptions d\'utilisateurs',
});

const jwkRotationsTotal = new client.Counter({
  name: 'jwk_rotations_total',
  help: 'Nombre total de rotations de clés JWK',
});

// Métriques pour les erreurs
const errorCounter = new client.Counter({
  name: 'errors_total',
  help: 'Nombre total d\'erreurs',
  labelNames: ['type', 'code'],
});

// Fonctions pour incrémenter les métriques métier
const incrementAuthAttempt = (type, status) => {
  authAttemptsTotal.labels(type, status).inc();
};

const setActiveTokens = (type, count) => {
  activeTokensGauge.labels(type).set(count);
};

const incrementUserRegistration = () => {
  userRegistrationsTotal.inc();
};

const incrementJwkRotation = () => {
  jwkRotationsTotal.inc();
};

const incrementError = (type, code) => {
  errorCounter.labels(type, code.toString()).inc();
};

module.exports = {
  incrementAuthAttempt,
  setActiveTokens,
  incrementUserRegistration,
  incrementJwkRotation,
  incrementError
}; 
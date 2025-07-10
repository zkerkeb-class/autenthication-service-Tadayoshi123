const dbClient = require('../services/db-client');

/**
 * Types de traitement de données pour le RGPD
 */
const DataProcessingTypes = Object.freeze({
  AUTHENTICATION: 'authentication',
  SECURITY: 'security',
  ANALYTICS: 'analytics',
  MARKETING: 'marketing',
  USER_PROFILE: 'user_profile',
});

/**
 * Middleware pour ajouter des en-têtes liés à la confidentialité
 */
const addPrivacyHeaders = (req, res, next) => {
  res.setHeader('X-Privacy-Policy', process.env.PRIVACY_POLICY_URL || '/privacy');
  next();
};

/**
 * Enregistre une activité de traitement de données
 * @param {string} userId - ID de l'utilisateur
 * @param {string} activity - Description de l'activité (ex: login, create_account)
 * @param {string} dataType - Type de données traitées (ex: user_profile, authentication)
 * @param {string} processingType - Type de traitement RGPD
 * @param {string} legalBasis - Base légale du traitement (ex: contract, consent, legitimate_interest)
 * @returns {Promise<void>}
 */
const logDataProcessing = async (userId, activity, dataType, processingType, legalBasis) => {
  try {
    // Dans une implémentation réelle, on appellerait le db-service
    // Pour l'instant, on se contente de logger en console pour ne pas bloquer.
    // await dbClient.createLog({ userId, activity, dataType, processingType, legalBasis });
    // console.log(`RGPD Log: User ${userId}, Activity: ${activity}, Type: ${processingType}`);
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du log RGPD:', error);
  }
};

/**
 * Middleware pour valider le consentement de l'utilisateur
 * @param {string[]} requiredPurposes - Tableau des finalités requises
 */
const validateConsent = (requiredPurposes) => async (req, res, next) => {
  // Implémentation factice pour le moment
  // Dans une vraie app, on vérifierait les consentements de req.user
  next();
};

/**
 * Minimise les données utilisateur selon les consentements
 * @param {Object} user - L'objet utilisateur complet
 * @param {Object} consents - Les consentements de l'utilisateur
 * @returns {Object} L'objet utilisateur minimisé
 */
const minimizeData = (user, consents = {}) => {
  if (!user) {
    return null;
  }
  
  const minimalUser = {
    id: user.id,
    sub: user.id,
  };

  // Données de base toujours incluses (base contractuelle)
  if (user.email) minimalUser.email = user.email;
  if (user.roles) minimalUser.roles = user.roles;

  // Données de profil si consentement (ici on met à true par défaut pour le dev)
  if (consents.profile || true) { 
    if (user.firstName) minimalUser.firstName = user.firstName;
    if (user.lastName) minimalUser.lastName = user.lastName;
    if (user.picture) minimalUser.picture = user.picture;
    if (user.name) minimalUser.name = user.name;
    if (user.given_name) minimalUser.given_name = user.given_name;
    if (user.family_name) minimalUser.family_name = user.family_name;
  }

  return minimalUser;
};


module.exports = {
  DataProcessingTypes,
  addPrivacyHeaders,
  logDataProcessing,
  validateConsent,
  minimizeData,
}; 
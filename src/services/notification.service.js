const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

/**
 * Client pour communiquer avec le service de notification SupervIA.
 */
class NotificationService {
  constructor() {
    this.baseURL = process.env.NOTIFICATION_SERVICE_URL;
    if (!this.baseURL) {
      logger.warn('NOTIFICATION_SERVICE_URL not set. Notification service will be disabled.');
      this.client = null;
    } else {
      this.client = axios.create({
        baseURL: this.baseURL,
        timeout: 5000,
      });
      logger.info(`Notification service client initialized for URL: ${this.baseURL}`);
    }
  }

  /**
   * Génère un token JWT pour l'authentification inter-services.
   * @returns {string} Le token JWT.
   */
  _generateServiceToken() {
    const payload = {
      serviceId: 'auth-service',
      // Droits spécifiques dont ce service a besoin sur le service de notifs
      permissions: ['send_email', 'send_sms'],
    };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
  }

  /**
   * Envoie une requête au service de notification.
   * @param {string} endpoint - Le chemin de l'API à appeler.
   * @param {object} data - Les données à envoyer dans le corps de la requête.
   * @returns {Promise<object>} La réponse de l'API.
   */
  async _sendRequest(endpoint, data) {
    if (!this.baseURL) {
      return; // Ne fait rien si le service n'est pas configuré.
    }

    try {
      const token = this._generateServiceToken();
      const response = await axios.post(`${this.baseURL}${endpoint}`, data, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error(`Error calling notification service at ${endpoint}: ${errorMessage}`);
      // Ne pas bloquer le flux principal en cas d'échec de la notification.
    }
  }

  /**
   * Envoie un e-mail de confirmation de compte.
   * @param {string} email - L'adresse e-mail de l'utilisateur.
   * @param {string} name - Le nom de l'utilisateur.
   * @param {string} confirmationLink - Le lien pour confirmer le compte.
   */
  async sendConfirmationEmail(email, name, confirmationLink) {
    if (!this.client) {
      logger.warn({ email, name }, 'Skipping confirmation email because notification service is disabled.');
      return;
    }

    const logMeta = { email, name, confirmationLink };
    logger.info(logMeta, 'Attempting to send confirmation email via notification service.');

    try {
      const token = this._generateServiceToken();
      const response = await this.client.post('/api/v1/send-email', {
        to: email,
        subject: 'Confirmation de votre compte SupervIA',
        template: 'accountConfirmation',
        context: {
          name: name,
          link: confirmationLink,
        }
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      logger.info({ ...logMeta, status: response.status }, 'Successfully requested confirmation email.');
      return response.data;
    } catch (error) {
      const errMeta = {
        ...logMeta,
        status: error.response?.status,
        error: error.response?.data || error.message,
      };
      logger.error(errMeta, 'Failed to send confirmation email.');
      // Ne pas relancer l'erreur pour ne pas bloquer le processus d'inscription
    }
  }

  /**
   * Envoie un e-mail de réinitialisation de mot de passe.
   * @param {string} userEmail - L'adresse e-mail de l'utilisateur.
   * @param {string} resetLink - Le lien pour réinitialiser le mot de passe.
   */
  async sendPasswordResetEmail(userEmail, resetLink) {
    return this._sendRequest('/api/v1/send-email', {
      to: userEmail,
      subject: 'Réinitialisation de votre mot de passe SupervIA',
      template: 'passwordReset',
      context: {
        title: 'Réinitialisation de mot de passe',
        preheader: 'Vous avez demandé à réinitialiser votre mot de passe.',
        reset_link: resetLink,
      },
    });
  }
}

module.exports = NotificationService; 
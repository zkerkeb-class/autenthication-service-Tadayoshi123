require('dotenv').config();
const dbClient = require('../services/db-client');

// Les mots de passe sont maintenant hashés par le db-service
const testUser = {
  email: 'test@example.com',
  password: 'Password123!',
  firstName: 'Test',
  lastName: 'User',
  roles: ['USER']
};

const adminUser = {
  email: 'admin@example.com',
  password: 'AdminPassword123!',
  firstName: 'Admin',
  lastName: 'User',
  roles: ['USER', 'ADMIN']
};

const testClient = {
  name: 'Test Application',
  clientId: 'test-client',
  clientSecret: 'this_is_a_super_secret_dev_secret_that_should_be_long_enough', // Secret fixe pour le dev
  redirectUris: ['http://localhost:3000/callback'],
  allowedScopes: ['openid', 'profile', 'email']
};

/**
 * Crée un utilisateur de test
 * @param {Object} userData - Données de l'utilisateur
 * @returns {Promise<Object>} L'utilisateur créé
 */
async function createUser(userData) {
  try {
    // Vérifier si l'utilisateur existe déjà via le db-service
    const existingUser = await dbClient.getUserByEmail(userData.email).catch(() => null);
    
    if (existingUser) {
      console.log(`L'utilisateur avec l'email ${userData.email} existe déjà.`);
      return existingUser;
    }
    
    // Créer l'utilisateur via le db-service (envoi du mot de passe en clair)
    const user = await dbClient.createUser({
      email: userData.email,
      password: userData.password,
      firstName: userData.firstName,
      lastName: userData.lastName,
      emailVerified: true,
      roles: userData.roles
    });
    
    console.log(`Utilisateur créé avec succès: ${user.email}`);
    return user;
  } catch (error) {
    console.error(`Erreur lors de la création de l'utilisateur ${userData.email}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Crée un client OAuth
 * @param {Object} clientData - Données du client
 * @param {string} ownerId - ID du propriétaire du client
 * @returns {Promise<Object>} Le client créé
 */
async function createClient(clientData, ownerId) {
  try {
    // Vérifier si le client existe déjà via le db-service
    const existingClient = await dbClient.getClientByClientId(clientData.clientId).catch(() => null);
    
    if (existingClient) {
      console.log(`Le client avec l'ID ${clientData.clientId} existe déjà.`);
      return existingClient;
    }
    
    // Créer le client via le db-service
    const client = await dbClient.createClient({
      ...clientData,
      ownerId
    });
    
    console.log(`Client OAuth créé avec succès: ${client.clientId}`);
    return client;
  } catch (error) {
    console.error(`Erreur lors de la création du client OAuth ${clientData.clientId}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Fonction principale
 */
async function seed() {
  try {
    console.log('Démarrage du peuplement de la base de données via db-service...');
    
    // Créer l'utilisateur de test
    const user = await createUser(testUser);
    console.log('\nInformations de connexion utilisateur de test:');
    console.log(`Email: ${testUser.email}`);
    console.log(`Mot de passe: ${testUser.password}`);
    
    // Créer l'utilisateur admin
    const admin = await createUser(adminUser);
    console.log('\nInformations de connexion administrateur:');
    console.log(`Email: ${adminUser.email}`);
    console.log(`Mot de passe: ${adminUser.password}`);
    
    // Créer le client OAuth
    if (admin) {
      const client = await createClient(testClient, admin.id);
      console.log('\nInformations client OAuth:');
      console.log(`Client ID: ${client.clientId}`);
      console.log(`Client Secret: ${client.clientSecret}`);
      console.log(`Redirect URIs: ${client.redirectUris.join(', ')}`);
    }
    
    console.log('\nPopulation de la base de données terminée avec succès!');
  } catch (error) {
    console.error('Erreur lors du peuplement de la base de données.');
    // Ne pas logger l'erreur complète ici car elle est déjà loggée dans les fonctions
  }
  // Pas besoin de déconnexion avec dbClient (basé sur HTTP)
}

// Exécuter la fonction de peuplement
seed(); 
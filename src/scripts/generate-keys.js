/**
 * Script de génération de clés RSA pour la signature des JWT
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { generateKeyPair, exportPKCS8, exportSPKI } = require('jose');
const DbServiceClient = require('../services/db-client');

const dbClient = new DbServiceClient();

const KEY_ALGORITHM = 'RS256';

/**
 * Génère une nouvelle paire de clés RSA et l'enregistre via le db-service
 */
async function generateAndStoreKeyPair() {
  console.log('Génération d\'une nouvelle paire de clés RSA...');
  
  try {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });

    // Exporter au format PEM
    const privateKeyPem = await exportPKCS8(privateKey);
    const publicKeyPem = await exportSPKI(publicKey);

    // Préparer les données pour le db-service
    const keyData = {
      kid: uuidv4(),
      privateKey: privateKeyPem,
      publicKey: publicKeyPem,
      algorithm: 'RS256',
      status: 'ACTIVE',
    };

    const keyPair = await dbClient.createKeyPair(keyData);
    
    console.log(`✅ Nouvelle paire de clés générée et stockée avec succès!`);
    console.log(`🔑 Kid: ${keyPair.kid}`);
    console.log(`🔧 Algorithme: ${KEY_ALGORITHM}`);
    
    return keyPair;
  } catch (error) {
    console.error('❌ Erreur lors de la génération de la paire de clés:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Fonction principale: vérifie si une clé active existe, sinon en crée une.
 */
async function ensureActiveKey() {
  console.log('Vérification de l\'existence d\'une clé de signature active...');
  try {
    await dbClient.testConnection();
    const activeKey = await dbClient.getActiveKeyPair().catch(() => null);

    if (activeKey) {
      console.log('✅ Une clé active existe déjà. Aucune action requise.');
      return;
    }
    
    console.log('⚠️ Aucune clé active trouvée. Génération d\'une nouvelle clé...');
    await generateAndStoreKeyPair();
  } catch (error) {
    console.error('❌ Erreur lors de la vérification/création de la clé active:', error.message);
    process.exit(1);
  }
}

// Lancement du script
ensureActiveKey();

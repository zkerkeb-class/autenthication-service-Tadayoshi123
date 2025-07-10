// @/autenthication-service-Tadayoshi123/src/config/logger.js
const pino = require('pino');

const pinoConfig = {
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '{req.method} {req.url} {res.statusCode} - {responseTime}ms'
    }
  },
  serializers: {
    err: pino.stdSerializers.err,
    res: pino.stdSerializers.res,
    req: pino.stdSerializers.req,
  },
};

// En production, on utilise le format JSON par défaut qui est plus performant
// et mieux géré par les services de logging centralisés.
if (process.env.NODE_ENV === 'production') {
  delete pinoConfig.transport;
}

const logger = pino(pinoConfig);

module.exports = logger; 
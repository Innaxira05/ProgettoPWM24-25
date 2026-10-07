const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

/**
 * Genera la specifica OpenAPI leggendo i commenti @openapi presenti nei file routes/*.js.
 * La documentazione interattiva e' servita su /api-docs (richiesta dalla traccia).
 */
module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'FastFood API', version: '1.0.0', description: 'API REST del progetto PWM FastFood (UniMI)' },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Register: {
          type: 'object', required: ['username', 'email', 'password', 'ruolo'],
          properties: {
            username: { type: 'string' }, email: { type: 'string' }, password: { type: 'string', minLength: 8 },
            ruolo: { type: 'string', enum: ['cliente', 'ristoratore'] },
            nomeRistorante: { type: 'string' }, piva: { type: 'string', example: '12345678901' },
            indirizzoRistorante: { type: 'string' }, telefono: { type: 'string' },
          },
        },
        Login: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } },
        DishInput: {
          type: 'object', required: ['prezzo'],
          properties: {
            catalogId: { type: 'string', description: 'id piatto del catalogo (alternativo ai campi sotto)' },
            nome: { type: 'string' }, tipologia: { type: 'string' }, ingredienti: { type: 'array', items: { type: 'string' } },
            immagine: { type: 'string' }, prezzo: { type: 'number' },
          },
        },
        OrderInput: {
          type: 'object', required: ['ristorante', 'piatti', 'modalita'],
          properties: {
            ristorante: { type: 'string' },
            piatti: { type: 'array', items: { type: 'object', properties: { piatto: { type: 'string' }, quantita: { type: 'integer' } } } },
            modalita: { type: 'string', enum: ['ritiro', 'domicilio'] },
            indirizzoConsegna: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, 'routes', '*.js')],
});

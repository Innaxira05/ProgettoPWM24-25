// Forza DNS pubblici: alcune reti non risolvono i record SRV/TXT di Atlas (errore ESERVFAIL)
require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/db');
const swaggerSpec = require('./swagger');
const errorHandler = require('./middleware/errorHandler');
const Dish = require('./models/Dish');
const seedCatalog = require('./utils/seedCatalog');

if (!process.env.JWT_SECRET) {
  console.error('Manca JWT_SECRET: copia .env.example in .env e impostalo.');
  process.exit(1);
}

const app = express();
app.use(cors());          // il frontend puo' essere servito da un'altra origine (es. Live Server)
app.use(express.json());  // parsing del body JSON

// ---------- API REST (Express 5 inoltra automaticamente gli errori async all'errorHandler) ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));               // registrazione e login
app.use('/api/users', require('./routes/users'));             // macro-scenario 1: profilo utente
app.use('/api/restaurants', require('./routes/restaurants')); // macro-scenario 2: ristorante
app.use('/api/dishes', require('./routes/dishes'));           // menu / catalogo piatti / ricerche
app.use('/api/orders', require('./routes/orders'));           // macro-scenario 3: ordini
app.use('/api/deliveries', require('./routes/deliveries'));   // macro-scenario 4: consegne

// Documentazione Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Opzionale: serve anche il frontend (cosi' le fetch relative '/api/...' di login.html funzionano)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Qualsiasi altra rotta /api/* -> 404 JSON
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint non trovato.' }));
app.use(errorHandler);

// ---------- Avvio ----------
(async () => {
  await connectDB();
  // Fase di setup richiesta dalla traccia: se il catalogo e' vuoto carica il JSON
  if ((await Dish.countDocuments({ ristorante: null })) === 0) await seedCatalog();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[SERVER] http://localhost:${port}  |  Swagger: http://localhost:${port}/api-docs`);
  });
})().catch((e) => { console.error('Avvio fallito:', e); process.exit(1); });

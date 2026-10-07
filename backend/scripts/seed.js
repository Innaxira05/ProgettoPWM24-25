require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const seedCatalog = require('../utils/seedCatalog');

/** Script manuale: npm run seed  -> (ri)carica il catalogo piatti da meals_1.json */
(async () => {
  await connectDB();
  await seedCatalog();
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });

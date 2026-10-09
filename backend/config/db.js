const mongoose = require('mongoose');

/**
 * Connessione a MongoDB tramite Mongoose.
 * L'URI viene letto da .env (MONGO_URI), con fallback su MongoDB locale.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fastfood';
  console.log(uri)
  await mongoose.connect(uri);
  console.log('[DB] MongoDB connesso:', mongoose.connection.name);
}

module.exports = connectDB;

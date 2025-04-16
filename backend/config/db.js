const { Pool } = require('pg');

// Konfiguration aus Umgebungsvariablen
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 's_tirolshare',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

// Verbindungsversuch mit Wiederholung
const connectWithRetry = async (maxRetries = 5, delay = 5000) => {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const client = await pool.connect();
      console.log('Verbindung zur Datenbank hergestellt');
      client.release();
      return;
    } catch (err) {
      retries++;
      console.log(`Verbindungsfehler (Versuch ${retries}/${maxRetries}): ${err.message}`);
      
      if (retries === maxRetries) {
        console.error('Maximale Anzahl an Versuchen erreicht. Aufgeben.');
        break;
      }
      
      console.log(`Warte ${delay/1000} Sekunden vor dem nächsten Versuch...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Starte Verbindungsversuch
connectWithRetry();

module.exports = pool;

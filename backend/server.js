require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

// Routes importieren
const authRoutes = require('./routes/auth');
const weatherRoutes = require('./routes/weather');
const transportRoutes = require('./routes/transport');
const rideshareRoutes = require('./routes/rideshare');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// API-Routen
app.use('/api/auth', authRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/rideshare', rideshareRoutes);

// Für Produktion: Statische Dateien bereitstellen
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
  });
}

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Server Error',
  });
});

// Server starten
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
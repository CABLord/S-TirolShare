const express = require('express');
const router = express.Router();
const axios = require('axios');
const redis = require('redis');

// Redis-Client mit verbesserter Handhabung
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

(async () => {
  try {
    await redisClient.connect();
    console.log('Redis connected');
  } catch (err) {
    console.error('Redis connection error:', err);
  }
})();

// Open-Meteo API Endpoints
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

// Wetterbedingungen übersetzen
const translateCondition = (code) => {
  const conditions = {
    0: 'Klar',
    1: 'Überwiegend klar',
    2: 'Teilweise bewölkt',
    3: 'Bedeckt',
    45: 'Nebel',
    48: 'Eisnebel',
    51: 'Leichter Nieselregen',
    56: 'Gefrierender Nieselregen',
    61: 'Leichter Regen',
    66: 'Gefrierender Regen',
    80: 'Regenschauer',
    95: 'Gewitter'
  };
  return conditions[code] || 'Unbekannt';
};

// GET /api/weather/:location
router.get('/:location', async (req, res) => {
  const { location } = req.params;
  
  try {
    const cacheKey = `weather:${location}`;
    
    // Cache-Check mit Fehlerbehandlung
    let cachedData;
    try {
      cachedData = await redisClient.get(cacheKey);
      if (cachedData) return res.json(JSON.parse(cachedData));
    } catch (redisErr) {
      console.error('Cache error:', redisErr);
    }

    // Geocoding zuerst (kostenloser Service)
    const geoResponse = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${location}&count=1`);
    const { latitude, longitude } = geoResponse.data.results[0];

    // Wetterdaten abrufen
    const weatherResponse = await axios.get(WEATHER_API, {
      params: {
        latitude,
        longitude,
        current_weather: true,
        hourly: 'temperature_2m,relativehumidity_2m,windspeed_10m',
        timezone: 'auto'
      }
    });

    const current = weatherResponse.data.current_weather;
    const hourly = weatherResponse.data.hourly;

    const weatherData = {
      temperature: current.temperature,
      condition: translateCondition(current.weathercode),
      humidity: hourly.relativehumidity_2m[0],
      windSpeed: hourly.windspeed_10m[0],
      recommendation: 'Wettervorhersage verfügbar'
    };

    // Cache mit Fehlerbehandlung
    try {
      await redisClient.set(cacheKey, JSON.stringify(weatherData), { EX: 1800 });
    } catch (redisErr) {
      console.error('Cache save error:', redisErr);
    }

    res.json(weatherData);
  } catch (error) {
    console.error('Weather API error:', error.message);
    res.status(500).json({
      message: 'Wetterdienst nicht verfügbar',
      fallback: {
        temperature: 20,
        condition: 'Klar',
        recommendation: 'Sonniges Wetter!'
      }
    });
  }
});

module.exports = router;
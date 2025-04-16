const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// Alle Fahrgemeinschaften abrufen
router.get('/', async (req, res) => {
  try {
    const { from, to, date } = req.query;
    let query = `
      SELECT r.id, r.from_location, r.to_location, r.date, r.time, r.price, r.seats,
             u.name as driver_name, r.created_at,
             (r.seats - COALESCE(SUM(b.seats), 0)) as available_seats
      FROM rides r
      JOIN users u ON r.driver_id = u.id
      LEFT JOIN bookings b ON r.id = b.ride_id
    `;

    const queryParams = [];
    const conditions = [];

    if (from) {
      queryParams.push(`%${from}%`);
      conditions.push(`r.from_location ILIKE $${queryParams.length}`);
    }

    if (to) {
      queryParams.push(`%${to}%`);
      conditions.push(`r.to_location ILIKE $${queryParams.length}`);
    }

    if (date) {
      queryParams.push(date);
      conditions.push(`r.date = $${queryParams.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY r.id, u.name
      ORDER BY r.date ASC, r.time ASC
    `;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching rides:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

// Eine bestimmte Fahrgemeinschaft abrufen
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const rideQuery = `
      SELECT r.id, r.from_location, r.to_location, r.date, r.time, r.price, r.seats,
             u.id as driver_id, u.name as driver_name, r.created_at,
             (r.seats - COALESCE(SUM(b.seats), 0)) as available_seats
      FROM rides r
      JOIN users u ON r.driver_id = u.id
      LEFT JOIN bookings b ON r.id = b.ride_id
      WHERE r.id = $1
      GROUP BY r.id, u.id, u.name
    `;
    
    const ride = await pool.query(rideQuery, [id]);
    
    if (ride.rows.length === 0) {
      return res.status(404).json({ message: 'Fahrgemeinschaft nicht gefunden' });
    }
    
    // Buchungen abrufen
    const bookingsQuery = `
      SELECT b.id, b.seats, b.created_at, u.name as user_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.ride_id = $1
    `;
    
    const bookings = await pool.query(bookingsQuery, [id]);
    
    res.json({
      ...ride.rows[0],
      bookings: bookings.rows
    });
  } catch (err) {
    console.error('Error fetching ride:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

// Neue Fahrgemeinschaft erstellen
router.post('/', auth, async (req, res) => {
  try {
    const { from, to, date, time, price, seats } = req.body;
    const driverId = req.user.id;
    
    const newRide = await pool.query(
      `INSERT INTO rides (driver_id, from_location, to_location, date, time, price, seats)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [driverId, from, to, date, time, price, seats]
    );
    
    res.json(newRide.rows[0]);
  } catch (err) {
    console.error('Error creating ride:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

// Fahrgemeinschaft buchen
router.post('/:id/book', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { seats } = req.body;
    const userId = req.user.id;
    
    // Prüfen, ob Fahrgemeinschaft existiert und genügend Plätze vorhanden sind
    const rideQuery = `
      SELECT r.id, r.driver_id, r.seats,
             (r.seats - COALESCE(SUM(b.seats), 0)) as available_seats
      FROM rides r
      LEFT JOIN bookings b ON r.id = b.ride_id
      WHERE r.id = $1
      GROUP BY r.id
    `;
    
    const ride = await pool.query(rideQuery, [id]);
    
    if (ride.rows.length === 0) {
      return res.status(404).json({ message: 'Fahrgemeinschaft nicht gefunden' });
    }
    
    const { driver_id, available_seats } = ride.rows[0];
    
    // Fahrer kann seine eigene Fahrt nicht buchen
    if (driver_id === userId) {
      return res.status(400).json({ message: 'Sie können Ihre eigene Fahrgemeinschaft nicht buchen' });
    }
    
    // Nicht genügend Plätze verfügbar
    if (available_seats < seats) {
      return res.status(400).json({ message: `Nur noch ${available_seats} Plätze verfügbar` });
    }
    
    // Buchung erstellen
    const newBooking = await pool.query(
      `INSERT INTO bookings (user_id, ride_id, seats)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, id, seats]
    );
    
    res.json(newBooking.rows[0]);
  } catch (err) {
    console.error('Error booking ride:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

// Meine Fahrgemeinschaften als Fahrer
router.get('/user/driver', auth, async (req, res) => {
  try {
    const driverId = req.user.id;
    
    const query = `
      SELECT r.id, r.from_location, r.to_location, r.date, r.time, r.price, r.seats,
             r.created_at, (r.seats - COALESCE(SUM(b.seats), 0)) as available_seats
      FROM rides r
      LEFT JOIN bookings b ON r.id = b.ride_id
      WHERE r.driver_id = $1
      GROUP BY r.id
      ORDER BY r.date ASC, r.time ASC
    `;
    
    const result = await pool.query(query, [driverId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching driver rides:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

// Meine Buchungen als Passagier
router.get('/user/passenger', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const query = `
      SELECT r.id, r.from_location, r.to_location, r.date, r.time, r.price,
             b.seats as booked_seats, b.created_at as booking_date,
             u.name as driver_name
      FROM bookings b
      JOIN rides r ON b.ride_id = r.id
      JOIN users u ON r.driver_id = u.id
      WHERE b.user_id = $1
      ORDER BY r.date ASC, r.time ASC
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching passenger bookings:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

module.exports = router;
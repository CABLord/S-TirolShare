const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Registrierung: POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Prüfen, ob der Benutzer bereits existiert
    const userCheck = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'E-Mail bereits registriert' });
    }

    // Passwort hashen
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Benutzer in Datenbank speichern
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );

    // JWT-Token erstellen
    const token = jwt.sign(
      { user: { id: newUser.rows[0].id } },
      process.env.JWT_SECRET || 'jwtsecret123',
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

// Anmeldung: POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Benutzer in Datenbank suchen
    const user = await pool.query(
      'SELECT id, name, email, password FROM users WHERE email = $1',
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'Ungültige Anmeldedaten' });
    }

    // Passwort vergleichen
    const isMatch = await bcrypt.compare(password, user.rows[0].password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Ungültige Anmeldedaten' });
    }

    const userInfo = {
      id: user.rows[0].id,
      name: user.rows[0].name,
      email: user.rows[0].email,
    };

    // JWT-Token erstellen
    const token = jwt.sign(
      { user: { id: userInfo.id } },
      process.env.JWT_SECRET || 'jwtsecret123',
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: userInfo,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

// Benutzerinfo: GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    res.json(user.rows[0]);
  } catch (err) {
    console.error('Get user error:', err.message);
    res.status(500).json({ message: 'Server-Fehler' });
  }
});

module.exports = router;
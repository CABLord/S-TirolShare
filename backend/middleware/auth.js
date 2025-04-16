const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Kein Token, Zugriff verweigert' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jwtsecret123');
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token ist ungültig' });
  }
};
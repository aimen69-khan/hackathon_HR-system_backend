const jwt = require('jsonwebtoken');
const { User } = require('../models');
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'Not authorized, no token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found or inactive' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Role ${req.user?.role || 'unknown'} is not authorized` });
  }
  next();
};
module.exports = { protect, authorize };

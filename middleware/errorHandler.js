const errorHandler = (err, req, res, next) => {
  console.error(err.stack || err.message);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors).map(e => e.message).join(', ') });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(400).json({ error: `${field} already exists` });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid ID format' });
  const status = err.statusCode || 500;
  res.status(status).json({ error: process.env.NODE_ENV === 'production' && status === 500 ? 'Internal server error' : (err.message || 'Something went wrong') });
};
module.exports = errorHandler;

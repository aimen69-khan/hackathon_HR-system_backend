const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.error('Check: 1) Atlas Network Access allows 0.0.0.0/0  2) username/password  3) cluster is running');
    process.exit(1);
  }
};

module.exports = connectDB;

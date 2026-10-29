require('dotenv').config();
const mongoose = require('mongoose');
async function clearAll() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Dropping all collections...');
  const cols = await mongoose.connection.db.listCollections().toArray();
  for (const c of cols) {
    await mongoose.connection.db.dropCollection(c.name);
    console.log('Dropped:', c.name);
  }
  console.log('All data removed.');
  await mongoose.disconnect();
}
clearAll().catch(e => { console.error(e); process.exit(1); });

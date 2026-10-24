import { MongoClient } from 'mongodb';

let client;
let database;

// Create connect with db
async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  client = new MongoClient(mongoUri);
  await client.connect();
  database = client.db("test");
  console.log('MongoDB connected');
}


function getDB() {
  if (!database) throw new Error('MongoDB is not connected.');
  return database;
}

async function closeDB() {
  if (!client) return;
  await client.close();
  client = undefined;
  database = undefined;
}

export { connectDB, getDB, closeDB };

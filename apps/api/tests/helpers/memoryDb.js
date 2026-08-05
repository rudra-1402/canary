import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;
let memoryDbUri;

export async function startMemoryDb() {
  mongod = await MongoMemoryServer.create();
  memoryDbUri = mongod.getUri('canary_test');
  await mongoose.connect(memoryDbUri);
}

export function getMemoryDbUri() {
  return memoryDbUri;
}

export async function stopMemoryDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  memoryDbUri = undefined;
}

export async function clearCollections() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

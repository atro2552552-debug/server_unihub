import 'dotenv/config';
import { connectDB, closeDB, getDB } from './config/db.js';

// These accounts must already exist in MongoDB. Edit this list before running once.
const adminEmails = [
  'elbadrawy3464502@gmail.com',
  'zeyad485435@gmail.com',
  'zaki582008@gmail.com'
].map((email) => email.trim().toLowerCase());

if (!adminEmails.length || adminEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
  throw new Error('Add valid account emails to the adminEmails list in seedAdmins.js.');
}
if (new Set(adminEmails).size !== adminEmails.length) {
  throw new Error('The adminEmails list contains duplicate emails.');
}

try {
  await connectDB();
  const users = getDB().collection('users');
  const existingUsers = await users.find(
    { email: { $in: adminEmails } },
    { projection: { email: 1 } }
  ).toArray();
  const existingEmails = new Set(existingUsers.map((user) => String(user.email).toLowerCase()));
  const missingCount = adminEmails.filter((email) => !existingEmails.has(email)).length;

  if (missingCount) {
    throw new Error(`${missingCount} account(s) were not found. Create each account first, then run this file again.`);
  }

  const result = await users.updateMany(
    { email: { $in: adminEmails } },
    { $set: { role: 'admin', updatedAt: new Date() } }
  );
  console.log(`Admin role assigned to ${result.matchedCount} account(s).`);
} finally {
  await closeDB();
}

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, closeDB, getDB } from './config/db.js';

const adminEmails = [
  'elbadrawy3464502@gmail.com',
  'zeyad485435@gmail.com',
  'zaki582008@gmail.com'
].map((email) => email.trim().toLowerCase());

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Run this file directly in a Termux terminal so password entry can be hidden.'));
      return;
    }

    let value = '';
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();

    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (buffer) => {
      const key = buffer.toString('utf8');
      if (key === '\u0003') return finish(new Error('Password reset cancelled.'));
      if (key === '\r' || key === '\n') return finish();
      if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
        return;
      }
      if (!key.startsWith('\u001b') && key >= ' ') value += key;
    };

    input.on('data', onData);
  });
}

try {
  await connectDB();
  const users = getDB().collection('users');
  const admins = await users.find(
    { email: { $in: adminEmails }, role: 'admin' },
    { projection: { email: 1 } }
  ).toArray();
  const foundEmails = new Set(admins.map((user) => String(user.email).toLowerCase()));
  const missingCount = adminEmails.filter((email) => !foundEmails.has(email)).length;

  if (missingCount) {
    throw new Error(`${missingCount} admin account(s) were not found. Run seedAdmins.js first.`);
  }

  const newPasswords = new Map();
  for (const email of adminEmails) {
    while (true) {
      const password = await askHidden(`New password for ${email} (12+ characters): `);
      if (password.length < 12) {
        console.log('Password must contain at least 12 characters.');
        continue;
      }

      const confirmation = await askHidden(`Confirm new password for ${email}: `);
      if (password !== confirmation) {
        console.log('The passwords did not match. Try again.');
        continue;
      }

      newPasswords.set(email, password);
      break;
    }
  }

  for (const [email, password] of newPasswords) {
    await users.updateOne(
      { email, role: 'admin' },
      { $set: { password: await bcrypt.hash(password, 10), updatedAt: new Date() } }
    );
  }

  console.log(`Password reset completed for ${newPasswords.size} admin account(s).`);
} finally {
  await closeDB();
}

// Import system parts
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB, closeDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import imagePostRoutes from './routes/imagePostRoutes.js';
import addChatSocket from './sockets/chatSocket.js';
import dotenv from 'dotenv';
import { profileDir } from './middlewares/profileUpload.js';

dotenv.config();

// Create express server
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const port = process.env.PORT || 4000;
let isAppReady = false;

// Allow to app core only
app.use(cors());
app.use(express.json());
app.use('/uploads/profiles', express.static(profileDir));
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return sendJson(data);
  };
  next();
});
app.use('/api', (req, res, next) => {
  if (!isAppReady) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ message: 'السيرفر بدأ وبيجهز الاتصال بقاعدة البيانات. جرّب تاني بعد لحظات.' });
  }
  return next();
});
app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/posts', imagePostRoutes);
app.set('io', io);
io.use((socket, next) => {
  if (!isAppReady) return next(new Error('السيرفر لسه بيجهز الاتصال بقاعدة البيانات.'));
  return next();
});
addChatSocket(io);

app.get('/health', (req, res) => {
  res.json({ status: 'listening', ready: isAppReady });
});

app.get('/ready', (req, res) => {
  if (!isAppReady) return res.status(503).json({ status: 'starting' });
  return res.json({ status: 'ready' });
});


app.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    if (req.path.includes('/avatar')) return res.status(400).json({ message: 'حجم صورة البروفايل لازم يكون أقل من 5 ميجابايت.' });
    return res.status(400).json({ message: 'حجم الملف أكبر من 50 ميجابايت.' });
  }
  if (error?.message?.startsWith('اختار صورة')) {
    return res.status(400).json({ message: error.message });
  }
  if (error?.message?.includes('نوع الملف مش مدعوم')) {
    return res.status(400).json({ message: 'نوع الملف مش مدعوم. اختار PDF أو Word أو PowerPoint.' });
  }
  if (error) return res.status(400).json({ message: 'حصلت مشكلة في الطلب. راجع البيانات وحاول تاني.' });
  return next();
});

function listen() {
  return new Promise((resolve, reject) => {
    const handleListenError = (error) => reject(error);
    server.once('error', handleListenError);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', handleListenError);
      resolve();
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDatabaseUntilReady() {
  let retryDelay = 5000;

  while (!isAppReady) {
    try {
      if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required. Add it to server/.env.');
      if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Add it to server/.env.');
      await connectDB();
      isAppReady = true;
      console.log('MongoDB connected; API is ready.');
    } catch (error) {
      isAppReady = false;
      console.error(`Server is listening, but startup is not ready: ${error.message}. Retrying in ${Math.round(retryDelay / 1000)} seconds.`);
      await closeDB().catch(() => {});
      await wait(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    }
  }
}

async function startServer() {
  await listen();
  console.log(`UniHub server is listening on port ${port}; connecting to MongoDB.`);
  connectDatabaseUntilReady();
}

startServer().catch((error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`المنفذ ${port} مستخدم بالفعل. اقفل نسخة السيرفر القديمة أو غيّر قيمة PORT.`);
  } else {
    console.error(`Server failed to start: ${error.message}`);
  }
  closeDB().catch(() => {});
  process.exitCode = 1;
});

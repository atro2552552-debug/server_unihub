import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import getMessages from '../models/Message.js';
import getRooms from '../models/Room.js';
import getUsers from '../models/User.js';

async function addSender(message) {
  const sender = await getUsers().findOne({ _id: message.sender }, { projection: { name: 1, avatarUrl: 1 } });
  return { ...message, sender };
}

function addChatSocket(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.id;
      return next();
    } catch (error) {
      return next(new Error('سجّل دخولك عشان تدخل المحادثة.'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-room', async (roomId) => {
      try {
        if (!ObjectId.isValid(roomId)) return socket.emit('chat-error', 'رقم الغرفة غير صالح.');
        const id = new ObjectId(roomId);
        const room = await getRooms().findOne({ _id: id });
        if (!room) return socket.emit('chat-error', 'الغرفة مش موجودة.');

        socket.join(roomId);
        const messages = await getMessages().find({ room: id }).sort({ createdAt: 1 }).toArray();
        socket.emit('room-history', await Promise.all(messages.map(addSender)));
      } catch (error) {
        socket.emit('chat-error', 'مش قادرين نفتح المحادثة دلوقتي.');
      }
    });

    socket.on('send-message', async (data) => {
      try {
        const text = String(data.text || '').trim();
        if (!text || !ObjectId.isValid(data.roomId) || !ObjectId.isValid(socket.userId)) return;

        const roomId = new ObjectId(data.roomId);
        const room = await getRooms().findOne({ _id: roomId });
        if (!room || room.status === 'closed') return socket.emit('chat-error', 'الغرفة مقفولة.');

        const message = {
          room: roomId,
          sender: new ObjectId(socket.userId),
          text,
          likes: 0,
          isBestAnswer: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const result = await getMessages().insertOne(message);
        message._id = result.insertedId;
        await getRooms().updateOne({ _id: roomId }, { $inc: { messageCount: 1 }, $set: { updatedAt: new Date() } });
        io.to(String(roomId)).emit('new-message', await addSender(message));
      } catch (error) {
        socket.emit('chat-error', 'الرسالة ما اتبعتتش. حاول تاني.');
      }
    });

    socket.on('typing', (data) => {
      if (data.roomId) socket.to(data.roomId).emit('typing', { name: data.name || 'زميلك' });
    });

    socket.on('best-answer', async (data) => {
      try {
        if (!ObjectId.isValid(data.roomId) || !ObjectId.isValid(data.messageId)) return;
        const roomId = new ObjectId(data.roomId);
        const messageId = new ObjectId(data.messageId);
        const room = await getRooms().findOne({ _id: roomId });
        if (!room) return socket.emit('chat-error', 'الغرفة مش موجودة.');
        if (String(room.creator) !== socket.userId) {
          return socket.emit('chat-error', 'صاحب السؤال بس يقدر يختار أفضل إجابة.');
        }

        const message = await getMessages().findOne({ _id: messageId, room: roomId });
        if (!message) return socket.emit('chat-error', 'الرد مش موجود.');

        await getMessages().updateMany({ room: roomId }, { $set: { isBestAnswer: false } });
        await getMessages().updateOne({ _id: messageId }, { $set: { isBestAnswer: true } });
        await getRooms().updateOne({ _id: roomId }, { $set: { bestAnswer: messageId, updatedAt: new Date() } });
        io.to(String(roomId)).emit('best-answer-changed', { messageId: String(messageId) });
      } catch (error) {
        socket.emit('chat-error', 'مش قادرين نحدد أفضل إجابة.');
      }
    });
  });
}

export default addChatSocket;

import { ObjectId } from 'mongodb';
import getRoomsCollection from '../models/Room.js';
import getMessages from '../models/Message.js';
import getSubjects from '../models/Subject.js';
import getUsers from '../models/User.js';

async function addRoomNames(room) {
  const [subject, creator] = await Promise.all([
    getSubjects().findOne({ _id: room.subject }),
    getUsers().findOne({ _id: room.creator }, { projection: { name: 1, team: 1, avatarUrl: 1 } })
  ]);

  return { ...room, subject, creator };
}

async function getRooms(req, res) {
  try {
    const filter = {};
    if (req.query.status === 'open' || req.query.status === 'closed') filter.status = req.query.status;
    if (req.query.subject && ObjectId.isValid(req.query.subject)) filter.subject = new ObjectId(req.query.subject);

    let rooms = await getRoomsCollection().find(filter).sort({ createdAt: -1 }).toArray();
    if (req.query.search) {
      const search = String(req.query.search).toLowerCase();
      rooms = rooms.filter((room) => `${room.title} ${room.body}`.toLowerCase().includes(search));
    }

    const result = await Promise.all(rooms.map(addRoomNames));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: 'مش قادرين نجيب الغرف دلوقتي.' });
  }
}

async function getRoom(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'رقم الغرفة غير صالح.' });
    const room = await getRoomsCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!room) return res.status(404).json({ message: 'الغرفة مش موجودة.' });
    return res.json(await addRoomNames(room));
  } catch (error) {
    return res.status(400).json({ message: 'رقم الغرفة غير صالح.' });
  }
}

async function createRoom(req, res) {
  try {
    const { title, body, subject } = req.body;
    if (!title || !body || !ObjectId.isValid(subject) || !ObjectId.isValid(req.userId)) {
      return res.status(400).json({ message: 'العنوان والسؤال والمادة مطلوبين.' });
    }

    const room = {
      title: title.trim(),
      body: body.trim(),
      subject: new ObjectId(subject),
      creator: new ObjectId(req.userId),
      status: 'open',
      messageCount: 0,
      bestAnswer: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await getRoomsCollection().insertOne(room);
    room._id = result.insertedId;
    return res.status(201).json(await addRoomNames(room));
  } catch (error) {
    return res.status(400).json({ message: 'مش قادرين ننشئ الغرفة. راجع بيانات المادة.' });
  }
}

async function updateRoom(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'رقم الغرفة غير صالح.' });
    const roomId = new ObjectId(req.params.id);
    const room = await getRoomsCollection().findOne({ _id: roomId });
    if (!room) return res.status(404).json({ message: 'الغرفة مش موجودة.' });
    if (room.creator.toString() !== req.userId) return res.status(403).json({ message: 'صاحب الغرفة بس يقدر يعدّلها.' });

    const updates = { updatedAt: new Date() };
    if (req.body.title !== undefined) updates.title = String(req.body.title).trim();
    if (req.body.body !== undefined) updates.body = String(req.body.body).trim();
    if (req.body.status === 'open' || req.body.status === 'closed') updates.status = req.body.status;
    if (req.body.subject && ObjectId.isValid(req.body.subject)) updates.subject = new ObjectId(req.body.subject);
    await getRoomsCollection().updateOne({ _id: roomId }, { $set: updates });
    return res.json(await addRoomNames({ ...room, ...updates }));
  } catch (error) {
    return res.status(400).json({ message: 'مش قادرين نعدّل الغرفة.' });
  }
}

async function deleteRoom(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'رقم الغرفة غير صالح.' });
    const roomId = new ObjectId(req.params.id);
    const room = await getRoomsCollection().findOne({ _id: roomId });
    if (!room) return res.status(404).json({ message: 'الغرفة مش موجودة.' });
    if (room.creator.toString() !== req.userId) return res.status(403).json({ message: 'صاحب الغرفة بس يقدر يمسحها.' });

    await getRoomsCollection().deleteOne({ _id: roomId });
    await getMessages().deleteMany({ room: roomId });
    return res.json({ message: 'الغرفة اتمسحت.' });
  } catch (error) {
    return res.status(400).json({ message: 'مش قادرين نمسح الغرفة.' });
  }
}

export { getRooms, getRoom, createRoom, updateRoom, deleteRoom };

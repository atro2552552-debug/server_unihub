import { ObjectId } from 'mongodb';
import getNotifications from '../models/Notification.js';

async function getUserNotifications(req, res) {
  try {
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });
    const recipient = new ObjectId(req.userId);
    const [notifications, unreadCount] = await Promise.all([
      getNotifications().find({ recipient }).sort({ createdAt: -1 }).limit(50).toArray(),
      getNotifications().countDocuments({ recipient, readAt: null })
    ]);

    return res.json({
      notifications: notifications.map((notification) => ({
        id: String(notification._id),
        type: notification.type,
        actorName: notification.actorName,
        fileId: String(notification.fileId),
        fileName: notification.fileName,
        resourceType: notification.resourceType,
        subjectId: String(notification.subjectId),
        subjectName: notification.subjectName,
        createdAt: notification.createdAt,
        readAt: notification.readAt || null
      })),
      unreadCount
    });
  } catch (error) {
    console.error('Could not load notifications:', error);
    return res.status(500).json({ message: 'مش قادرين نجيب الإشعارات دلوقتي.' });
  }
}

async function markNotificationsRead(req, res) {
  try {
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.map((id) => String(id)))].slice(0, 100);
    if (ids.some((id) => !ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'بيانات الإشعارات غير صالحة.' });
    }
    if (!ids.length) return res.json({ markedCount: 0 });

    const result = await getNotifications().updateMany(
      { _id: { $in: ids.map((id) => new ObjectId(id)) }, recipient: new ObjectId(req.userId), readAt: null },
      { $set: { readAt: new Date() } }
    );
    return res.json({ markedCount: result.modifiedCount });
  } catch (error) {
    console.error('Could not mark notifications read:', error);
    return res.status(500).json({ message: 'مقدرناش نحدّث حالة الإشعارات دلوقتي.' });
  }
}

export { getUserNotifications, markNotificationsRead };

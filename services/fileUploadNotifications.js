import path from 'node:path';
import { ObjectId } from 'mongodb';
import getNotifications from '../models/Notification.js';
import getSubjects from '../models/Subject.js';
import getUsers from '../models/User.js';

function displayFileName(file) {
  const extension = path.extname(file.originalName || '');
  const title = file.title || file.originalName || 'ملف';
  return title.toLowerCase().endsWith(extension.toLowerCase()) ? title : `${title}${extension}`;
}

async function createFileUploadNotifications(file, actorId, io) {
  const actorObjectId = new ObjectId(actorId);
  const [actor, subject, recipients] = await Promise.all([
    getUsers().findOne({ _id: actorObjectId }, { projection: { name: 1 } }),
    getSubjects().findOne({ _id: file.subject }, { projection: { name: 1 } }),
    getUsers().find({ _id: { $ne: actorObjectId } }, { projection: { _id: 1 } }).toArray()
  ]);
  if (!recipients.length) return 0;

  const createdAt = new Date();
  const fileName = displayFileName(file);
  const documents = recipients.map((recipient) => ({
    type: 'file-uploaded',
    recipient: recipient._id,
    actor: actorObjectId,
    actorName: actor?.name || 'طالب',
    fileId: file._id,
    fileName,
    resourceType: file.resourceType || 'file',
    subjectId: file.subject,
    subjectName: subject?.name || 'مادة دراسية',
    createdAt,
    readAt: null
  }));
  const inserted = await getNotifications().insertMany(documents);

  if (io) {
    recipients.forEach((recipient, index) => {
      io.to(`user:${recipient._id}`).emit('new-notification', {
        id: String(inserted.insertedIds[index]),
        type: 'file-uploaded',
        actorName: actor?.name || 'طالب',
        fileId: String(file._id),
        fileName,
        resourceType: file.resourceType || 'file',
        subjectId: String(file.subject),
        subjectName: subject?.name || 'مادة دراسية',
        createdAt,
        readAt: null
      });
    });
  }

  return documents.length;
}

export { createFileUploadNotifications };

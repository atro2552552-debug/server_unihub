import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import getFilesCollection from '../models/File.js';
import getSubjectsCollection from '../models/Subject.js';
import getUsers from '../models/User.js';
import { uploadSupabaseObject, downloadSupabaseObject, deleteSupabaseObject } from '../config/supabaseStorage.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function getDisplayName(file) {
  const extension = path.extname(file.originalName || '');
  const title = file.title || file.originalName || 'ملف';
  return title.toLowerCase().endsWith(extension.toLowerCase()) ? title : `${title}${extension}`;
}

function hasPdfSignature(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

async function getFiles(req, res) {
  try {
    const filter = req.query.subject && ObjectId.isValid(req.query.subject)
      ? { subject: new ObjectId(req.query.subject) }
      : {};
    const files = await getFilesCollection().find(filter).sort({ createdAt: -1 }).toArray();
    const result = await Promise.all(files.map(async (file) => {
      const [subject, uploader] = await Promise.all([
        getSubjectsCollection().findOne({ _id: file.subject }),
        getUsers().findOne({ _id: file.uploader }, { projection: { name: 1, avatarUrl: 1 } })
      ]);
      return { ...file, displayName: getDisplayName(file), subject, uploader };
    }));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: 'مش قادرين نجيب الملفات دلوقتي.' });
  }
}

async function uploadFile(req, res) {
  let objectKey;
  try {
    if (!req.file) return res.status(400).json({ message: 'اختار ملف الأول.' });
    const { title, subject } = req.body;
    const resourceType = req.body.resourceType || 'file';
    if (!title || !subject) return res.status(400).json({ message: 'اسم الملف والمادة مطلوبين.' });

    if (!['file', 'summary'].includes(resourceType)) return res.status(400).json({ message: 'نوع المحتوى غير صالح.' });

    const decodedName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const originalName = decodedName.includes('\uFFFD') ? req.file.originalname : decodedName;
    if (resourceType === 'summary') {
      if (path.extname(originalName).toLowerCase() !== '.pdf' || !hasPdfSignature(req.file.buffer)) {
        return res.status(400).json({ message: 'الملخص لازم يكون ملف PDF صالح.' });
      }
    }

    if (!ObjectId.isValid(subject) || !ObjectId.isValid(req.userId)) {
      return res.status(400).json({ message: 'المادة أو الحساب مش صالح.' });
    }

    const extension = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
    objectKey = `course-files/${randomUUID()}${extension}`;
    await uploadSupabaseObject({ key: objectKey, body: req.file.buffer, contentType: req.file.mimetype });

    const savedFile = {
      title,
      originalName,
      resourceType,
      fileName: objectKey,
      storageProvider: 'supabase',
      storageKey: objectKey,
      subject: new ObjectId(subject),
      uploader: new ObjectId(req.userId),
      size: req.file.size,
      mimeType: req.file.mimetype,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await getFilesCollection().insertOne(savedFile);
    savedFile._id = result.insertedId;

    return res.status(201).json(savedFile);
  } catch (error) {
    if (objectKey) await deleteSupabaseObject(objectKey).catch(() => {});
    if (error.code === 'SUPABASE_STORAGE_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'تخزين Supabase مش متظبط على السيرفر. أضف إعدادات Supabase وحاول تاني.' });
    }
    console.error('Cloud file upload failed:', error);
    return res.status(502).json({ message: 'مقدرناش نرفع الملف للتخزين السحابي. حاول تاني.' });
  }
}

async function downloadFile(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'رقم الملف غير صالح.' });
    const savedFile = await getFilesCollection().findOne({ _id: new ObjectId(req.params.id) });
    if (!savedFile) return res.status(404).json({ message: 'الملف مش موجود.' });

    const storageKey = savedFile.storageKey || (savedFile.storageProvider === 'supabase' ? savedFile.fileName : '');
    if (storageKey) {
      const storedObject = await downloadSupabaseObject(storageKey);
      if (!storedObject?.body) return res.status(404).json({ message: 'الملف مش موجود في التخزين السحابي.' });
      res.setHeader('Content-Type', savedFile.mimeType || storedObject.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(getDisplayName(savedFile))}`);
      if (storedObject.contentLength != null) res.setHeader('Content-Length', String(storedObject.contentLength));
      return res.send(storedObject.body);
    }

    const uploadDir = path.resolve(currentDir, '../uploads');
    const fileName = String(savedFile.fileName || '');
    if (!fileName || path.basename(fileName) !== fileName) return res.status(404).json({ message: 'مسار الملف غير صالح.' });
    const filePath = path.resolve(uploadDir, fileName);
    if (path.dirname(filePath) !== uploadDir || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'الملف مش موجود على السيرفر.' });
    }
    return res.download(filePath, getDisplayName(savedFile));
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    if (error.code === 'SUPABASE_STORAGE_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'تخزين Supabase مش متظبط على السيرفر.' });
    }
    if (Number(error.statusCode || error.status) === 404 || error.name === 'NotFound') {
      return res.status(404).json({ message: 'الملف مش موجود في التخزين السحابي.' });
    }
    console.error('Cloud file download failed:', error);
    return res.status(502).json({ message: 'مقدرناش نجيب الملف من التخزين السحابي دلوقتي.' });
  }
}

async function deleteFile(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'رقم الملف غير صالح.' });
    const files = getFilesCollection();
    const fileId = new ObjectId(req.params.id);
    const savedFile = await files.findOne({ _id: fileId });
    if (!savedFile) return res.status(404).json({ message: 'الملف مش موجود.' });

    const storageKey = savedFile.storageKey || (savedFile.storageProvider === 'supabase' ? savedFile.fileName : '');
    if (storageKey) {
      await deleteSupabaseObject(storageKey);
      await files.deleteOne({ _id: fileId });
      return res.json({ message: 'الملف اتحذف.' });
    }

    const uploadDir = path.resolve(currentDir, '../uploads');
    const storedName = String(savedFile.fileName || '');
    const safeName = path.basename(storedName);
    if (!safeName || safeName !== storedName) {
      return res.status(500).json({ message: 'مسار الملف غير صالح، ومقدرناش نحذفه بأمان.' });
    }

    const filePath = path.resolve(uploadDir, safeName);
    if (path.dirname(filePath) !== uploadDir) {
      return res.status(500).json({ message: 'مسار الملف غير صالح، ومقدرناش نحذفه بأمان.' });
    }

    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    await files.deleteOne({ _id: fileId });
    return res.json({ message: 'الملف اتحذف.' });
  } catch (error) {
    if (error.code === 'SUPABASE_STORAGE_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'تخزين Supabase مش متظبط على السيرفر.' });
    }
    console.error('File deletion failed:', error);
    return res.status(500).json({ message: 'مقدرناش نحذف الملف دلوقتي.' });
  }
}

export { getFiles, uploadFile, downloadFile, deleteFile };

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import getUsers from '../models/User.js';
import { deleteSupabaseObject, downloadSupabaseObject, uploadSupabaseObject } from '../config/supabaseStorage.js';
import { getAvatarUrl } from '../utils/avatar.js';

const avatarTypes = {
  'image/jpeg': { extension: '.jpg', signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: '.png', signature: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: '.webp', signature: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
};

function makeToken(user) {
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    department: user.department,
    team: user.team,
    avatarUrl: getAvatarUrl(user),
    role: user.role === 'admin' ? 'admin' : 'user'
  };
}

async function register(req, res) {
  try {
    const { name, email, password, department, team } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'اكتب الاسم والبريد الإلكتروني وكلمة المرور.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await getUsers().findOne({ email: cleanEmail });
    if (existingUser) return res.status(409).json({ message: 'البريد الإلكتروني مسجل بالفعل.' });
    const now = new Date();
    const user = {
      name: name.trim(),
      email: cleanEmail,
      password: await bcrypt.hash(password, 10),
      role: 'user',
      department: department?.trim() || 'حاسبات ومعلومات',
      team: team?.trim() || 'الفرقة الأولى',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };
    const result = await getUsers().insertOne(user);
    user._id = result.insertedId;
    return res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'مقدرناش ننشئ الحساب دلوقتي. جرّب تاني.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json({ message: 'اكتب البريد الإلكتروني وكلمة المرور.' });
    }

    const user = await getUsers().findOne({ email: email.trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    }
    user.lastLoginAt = new Date();
    await getUsers().updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });
    return res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'مقدرناش نسجل دخولك دلوقتي. جرّب تاني.' });
  }
}

async function getMe(req, res) {
  try {
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });
    const user = await getUsers().findOne({ _id: new ObjectId(req.userId) }, { projection: { password: 0 } });
    if (!user) return res.status(404).json({ message: 'الحساب مش موجود.' });
    return res.json(publicUser(user));
  } catch (error) {
    return res.status(500).json({ message: 'مقدرناش نجيب بيانات الحساب دلوقتي.' });
  }
}

async function updateProfile(req, res) {
  try {
    const { name, email, department, team } = req.body;
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });
    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ message: 'الاسم والبريد الإلكتروني مطلوبين.' });
    }

    const userId = new ObjectId(req.userId);
    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await getUsers().findOne({ email: cleanEmail, _id: { $ne: userId } });
    if (existingUser) return res.status(409).json({ message: 'البريد الإلكتروني مستخدم في حساب تاني.' });

    const changes = {
      name: name.trim(),
      email: cleanEmail,
      department: department?.trim() || '',
      team: team?.trim() || '',
      updatedAt: new Date()
    };
    const updateResult = await getUsers().updateOne({ _id: userId }, { $set: changes });
    if (!updateResult.matchedCount) return res.status(404).json({ message: 'الحساب مش موجود.' });

    const updatedUser = await getUsers().findOne({ _id: userId }, { projection: { password: 0 } });
    return res.json(publicUser(updatedUser));
  } catch (error) {
    return res.status(500).json({ message: 'مقدرناش نحفظ التعديلات دلوقتي. جرّب تاني.' });
  }
}

async function updateProfileImage(req, res) {
  let uploadedKey;
  try {
    if (!req.file) return res.status(400).json({ message: 'اختار صورة الأول.' });
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });

    const avatarType = avatarTypes[req.file.mimetype];
    if (!avatarType || !avatarType.signature(req.file.buffer)) {
      return res.status(400).json({ message: 'الصورة غير صالحة. اختار JPG أو PNG أو WEBP.' });
    }

    const userId = new ObjectId(req.userId);
    const users = getUsers();
    const currentUser = await users.findOne({ _id: userId }, { projection: { avatarStorageKey: 1 } });
    if (!currentUser) return res.status(404).json({ message: 'الحساب مش موجود.' });

    const previousAvatarKey = currentUser.avatarStorageKey;
    uploadedKey = `profile-avatars/${userId}/${randomUUID()}${avatarType.extension}`;
    const newAvatarKey = uploadedKey;
    await uploadSupabaseObject({ key: newAvatarKey, body: req.file.buffer, contentType: req.file.mimetype });

    const now = new Date();
    const result = await users.updateOne({ _id: userId }, {
      $set: {
        avatarStorageKey: uploadedKey,
        avatarMimeType: req.file.mimetype,
        avatarUpdatedAt: now,
        updatedAt: now
      },
      $unset: { avatarUrl: '' }
    });
    if (!result.matchedCount) {
      await deleteSupabaseObject(uploadedKey).catch(() => {});
      uploadedKey = null;
      return res.status(404).json({ message: 'الحساب مش موجود.' });
    }

    uploadedKey = null;
    if (previousAvatarKey && previousAvatarKey !== newAvatarKey) {
      await deleteSupabaseObject(previousAvatarKey).catch((error) => {
        console.warn(`Could not delete the previous profile image for ${userId}: ${error.message}`);
      });
    }

    const user = await users.findOne({ _id: userId }, { projection: { password: 0 } });
    return res.json(publicUser(user));
  } catch (error) {
    if (uploadedKey) await deleteSupabaseObject(uploadedKey).catch(() => {});
    console.error(`Could not save profile image: ${error.message}`);
    return res.status(500).json({ message: 'مقدرناش نحفظ صورة البروفايل.' });
  }
}

async function getProfileAvatar(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).end();
    const user = await getUsers().findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { avatarStorageKey: 1, avatarMimeType: 1 } }
    );
    if (!user?.avatarStorageKey) return res.status(404).end();

    const image = await downloadSupabaseObject(user.avatarStorageKey);
    if (!image) return res.status(404).end();
    const contentType = avatarTypes[user.avatarMimeType]?.extension ? user.avatarMimeType : 'application/octet-stream';
    if (contentType === 'application/octet-stream') return res.status(415).end();

    res.set({
      'Content-Type': contentType,
      'Content-Length': String(image.contentLength),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(image.body);
  } catch (error) {
    console.error(`Could not load profile image: ${error.message}`);
    return res.status(502).json({ message: 'مقدرناش نحمّل صورة البروفايل دلوقتي.' });
  }
}

export { register, login, getMe, updateProfile, updateProfileImage, getProfileAvatar };

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import getUsers from '../models/User.js';

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
    avatarUrl: user.avatarUrl || '',
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
    const user = {
      name: name.trim(),
      email: cleanEmail,
      password: await bcrypt.hash(password, 10),
      role: 'user',
      department: department?.trim() || 'حاسبات ومعلومات',
      team: team?.trim() || 'الفرقة الأولى',
      createdAt: new Date(),
      updatedAt: new Date()
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
  try {
    if (!req.file) return res.status(400).json({ message: 'اختار صورة الأول.' });
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });

    const avatarUrl = `/uploads/profiles/${req.file.filename}`;
    const userId = new ObjectId(req.userId);
    const result = await getUsers().updateOne({ _id: userId }, { $set: { avatarUrl, updatedAt: new Date() } });
    if (!result.matchedCount) return res.status(404).json({ message: 'الحساب مش موجود.' });

    const user = await getUsers().findOne({ _id: userId }, { projection: { password: 0 } });
    return res.json(publicUser(user));
  } catch (error) {
    return res.status(500).json({ message: 'مقدرناش نحفظ صورة البروفايل.' });
  }
}

export { register, login, getMe, updateProfile, updateProfileImage };

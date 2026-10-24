import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import getUsers from '../models/User.js';

function protect(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'سجّل دخولك الأول.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'جلسة الدخول غير صالحة.' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });
    const user = await getUsers().findOne({ _id: new ObjectId(req.userId) }, { projection: { role: 1 } });
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'الإجراء ده متاح للأدمن بس.' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ message: 'مقدرناش نتأكد من الصلاحية دلوقتي.' });
  }
}

export default protect;
export { requireAdmin };

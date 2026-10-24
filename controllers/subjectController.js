import getSubjectsCollection from '../models/Subject.js';

const defaultSubjects = [
  { name: 'تفاضل وتكامل', icon: 'chart', color: 'indigo' },
  { name: 'إنجليزي', icon: 'globe', color: 'cyan' },
  { name: 'مقدمة في الحاسبات', icon: 'computer', color: 'amber' },
  { name: 'فيزياء', icon: 'atom', color: 'violet' },
  { name: 'علوم البيئة', icon: 'leaf', color: 'green' },
  { name: 'برمجة الحاسبات', icon: 'code', color: 'indigo' }
];

async function getSubjects(req, res) {
  try {
    let subjects = await getSubjectsCollection().find().sort({ createdAt: 1 }).toArray();
    if (subjects.length === 0) {
      const now = new Date();
      const result = await getSubjectsCollection().insertMany(defaultSubjects.map((subject) => ({ ...subject, createdAt: now, updatedAt: now })));
      subjects = await getSubjectsCollection().find({ _id: { $in: Object.values(result.insertedIds) } }).sort({ createdAt: 1 }).toArray();
    }
    return res.json(subjects);
  } catch (error) {
    return res.status(500).json({ message: 'مش قادرين نجيب المواد دلوقتي.' });
  }
}

export { getSubjects };

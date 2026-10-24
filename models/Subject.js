import { getDB } from '../config/db.js';

function getSubjects() {
  return getDB().collection('subjects');
}

export default getSubjects;

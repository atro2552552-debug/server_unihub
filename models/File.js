import { getDB } from '../config/db.js';

function getFiles() {
  return getDB().collection('files');
}

export default getFiles;

import { getDB } from '../config/db.js';

function getMessages() {
  return getDB().collection('messages');
}

export default getMessages;

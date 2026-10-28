import { getDB } from '../config/db.js';

function getNotifications() {
  return getDB().collection('notifications');
}

export default getNotifications;

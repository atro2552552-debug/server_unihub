import { getDB } from '../config/db.js';

function getUsers() {
  return getDB().collection('users');
}

export default getUsers;

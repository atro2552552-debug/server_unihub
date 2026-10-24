import { getDB } from '../config/db.js';

function getRooms() {
  return getDB().collection('rooms');
}

export default getRooms;

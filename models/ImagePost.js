import { getDB } from '../config/db.js';

function getImagePosts() {
  return getDB().collection('imagePosts');
}

function getImagePostLikes() {
  return getDB().collection('imagePostLikes');
}

function getImagePostViews() {
  return getDB().collection('imagePostViews');
}

let indexesPromise;
function ensureImagePostIndexes() {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      getImagePosts().createIndex({ createdAt: -1 }),
      getImagePostLikes().createIndex({ postId: 1, userId: 1 }, { unique: true }),
      getImagePostViews().createIndex({ postId: 1, userId: 1 }, { unique: true })
    ]).catch((error) => {
      indexesPromise = undefined;
      throw error;
    });
  }
  return indexesPromise;
}

export { getImagePosts, getImagePostLikes, getImagePostViews, ensureImagePostIndexes };

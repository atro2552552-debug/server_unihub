import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import getUsers from '../models/User.js';
import { getImagePosts, getImagePostLikes, getImagePostViews, ensureImagePostIndexes } from '../models/ImagePost.js';
import { deleteSupabaseObject, downloadSupabaseObject, uploadSupabaseObject } from '../config/supabaseStorage.js';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const imageTypes = {
  'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', signature: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', signature: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
};

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function toPostResponse(post, authorName, likeCount, viewCount, likedByMe) {
  return {
    id: String(post._id),
    authorName: authorName || 'الأدمن',
    caption: post.caption,
    createdAt: post.createdAt,
    images: post.images.map((image, index) => ({
      url: `/posts/${post._id}/images/${index}`,
      mimeType: image.mimeType,
      size: image.size
    })),
    likeCount,
    viewCount,
    likedByMe
  };
}

async function getPosts(req, res) {
  try {
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });
    await ensureImagePostIndexes();
    const viewerId = new ObjectId(req.userId);
    const posts = await getImagePosts().find({}).sort({ createdAt: -1, _id: -1 }).limit(60).toArray();
    if (!posts.length) return res.json([]);

    const postIds = posts.map((post) => post._id);
    const [authors, likes, views, ownLikes] = await Promise.all([
      getUsers().find({ _id: { $in: [...new Set(posts.map((post) => String(post.authorId)))].map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray(),
      getImagePostLikes().aggregate([{ $match: { postId: { $in: postIds } } }, { $group: { _id: '$postId', count: { $sum: 1 } } }]).toArray(),
      getImagePostViews().aggregate([{ $match: { postId: { $in: postIds } } }, { $group: { _id: '$postId', count: { $sum: 1 } } }]).toArray(),
      getImagePostLikes().find({ postId: { $in: postIds }, userId: viewerId }, { projection: { postId: 1 } }).toArray()
    ]);
    const authorNames = new Map(authors.map((author) => [String(author._id), author.name]));
    const likeCounts = new Map(likes.map((row) => [String(row._id), row.count]));
    const viewCounts = new Map(views.map((row) => [String(row._id), row.count]));
    const ownLikeIds = new Set(ownLikes.map((row) => String(row.postId)));
    return res.json(posts.map((post) => toPostResponse(
      post,
      authorNames.get(String(post.authorId)),
      likeCounts.get(String(post._id)) || 0,
      viewCounts.get(String(post._id)) || 0,
      ownLikeIds.has(String(post._id))
    )));
  } catch (error) {
    console.error('Could not load image posts:', error);
    return res.status(500).json({ message: 'مقدرناش نجيب الصور دلوقتي.' });
  }
}

async function getPostCount(req, res) {
  try {
    const count = await getImagePosts().countDocuments();
    return res.json({ count });
  } catch (error) {
    console.error('Could not count image posts:', error);
    return res.status(500).json({ message: 'مقدرناش نجيب عدد المنشورات دلوقتي.' });
  }
}

async function createPost(req, res) {
  const uploadedKeys = [];
  let postSaved = false;
  try {
    if (!ObjectId.isValid(req.userId)) return res.status(401).json({ message: 'سجّل دخولك تاني.' });
    const files = req.files || [];
    const caption = String(req.body.caption || '').trim();
    if (files.length < 1 || files.length > 3) return res.status(400).json({ message: 'اختار من صورة إلى 3 صور للمنشور.' });
    if (caption.length > 500) return res.status(400).json({ message: 'الكلام لازم يكون 500 حرف أو أقل.' });

    for (const file of files) {
      const type = Object.hasOwn(imageTypes, file.mimetype) ? imageTypes[file.mimetype] : null;
      if (!type || !type.signature(file.buffer)) {
        return res.status(400).json({ message: 'ارفع صور JPEG أو PNG أو WEBP صالحة.' });
      }
      if (file.size > MAX_IMAGE_SIZE) return res.status(400).json({ message: 'حجم كل صورة لازم يكون 5 ميجا أو أقل.' });
    }

    await ensureImagePostIndexes();
    const author = await getUsers().findOne({ _id: new ObjectId(req.userId) }, { projection: { name: 1 } });
    if (!author) return res.status(401).json({ message: 'الحساب مش موجود. سجّل دخولك تاني.' });
    const postId = new ObjectId();
    const images = [];
    for (const file of files) {
      const type = imageTypes[file.mimetype];
      const storageKey = `image-posts/${postId}/${randomUUID()}.${type.extension}`;
      await uploadSupabaseObject({ key: storageKey, body: file.buffer, contentType: file.mimetype });
      uploadedKeys.push(storageKey);
      images.push({ storageKey, mimeType: file.mimetype, size: file.size });
    }

    const post = {
      _id: postId,
      authorId: new ObjectId(req.userId),
      caption,
      images,
      createdAt: new Date()
    };
    await getImagePosts().insertOne(post);
    postSaved = true;
    return res.status(201).json(toPostResponse(post, author?.name, 0, 0, false));
  } catch (error) {
    if (!postSaved) await Promise.all(uploadedKeys.map((key) => deleteSupabaseObject(key).catch(() => {})));
    if (error.code === 'SUPABASE_STORAGE_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'تخزين الصور مش متظبط على السيرفر.' });
    }
    console.error('Could not create image post:', error);
    return res.status(502).json({ message: 'مقدرناش ننشر الصور دلوقتي. حاول تاني.' });
  }
}

async function getPostImage(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'المنشور غير صالح.' });
    const post = await getImagePosts().findOne({ _id: new ObjectId(req.params.id) }, { projection: { images: 1 } });
    const imageIndex = Number(req.params.index);
    if (!post || !Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= post.images.length) {
      return res.status(404).json({ message: 'الصورة مش موجودة.' });
    }
    const image = post.images[imageIndex];
    const storedObject = await downloadSupabaseObject(image.storageKey);
    if (!storedObject?.body) return res.status(404).json({ message: 'الصورة مش موجودة في التخزين.' });
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(image.size || storedObject.contentLength || storedObject.body.length));
    return res.send(storedObject.body);
  } catch (error) {
    if (error.code === 'SUPABASE_STORAGE_NOT_CONFIGURED') return res.status(503).json({ message: 'تخزين الصور مش متظبط على السيرفر.' });
    if (Number(error.statusCode || error.status) === 404 || error.name === 'NotFound') return res.status(404).json({ message: 'الصورة مش موجودة في التخزين.' });
    console.error('Could not load image post image:', error);
    return res.status(502).json({ message: 'مقدرناش نفتح الصورة دلوقتي.' });
  }
}

async function recordPostView(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.userId)) return res.status(400).json({ message: 'المنشور غير صالح.' });
    await ensureImagePostIndexes();
    const postId = new ObjectId(req.params.id);
    if (!(await getImagePosts().findOne({ _id: postId }, { projection: { _id: 1 } }))) return res.status(404).json({ message: 'المنشور مش موجود.' });
    let recorded = false;
    try {
      await getImagePostViews().insertOne({ postId, userId: new ObjectId(req.userId), viewedAt: new Date() });
      recorded = true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    const viewCount = await getImagePostViews().countDocuments({ postId });
    return res.json({ viewCount, recorded });
  } catch (error) {
    console.error('Could not record image post view:', error);
    return res.status(500).json({ message: 'مقدرناش نسجل المشاهدة دلوقتي.' });
  }
}

async function setPostLike(req, res) {
  try {
    if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.userId)) return res.status(400).json({ message: 'المنشور غير صالح.' });
    const liked = req.body?.liked;
    if (typeof liked !== 'boolean') return res.status(400).json({ message: 'حالة الإعجاب غير صالحة.' });
    await ensureImagePostIndexes();
    const postId = new ObjectId(req.params.id);
    if (!(await getImagePosts().findOne({ _id: postId }, { projection: { _id: 1 } }))) return res.status(404).json({ message: 'المنشور مش موجود.' });
    const userId = new ObjectId(req.userId);
    if (liked) {
      try {
        await getImagePostLikes().insertOne({ postId, userId, createdAt: new Date() });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
      }
    } else {
      await getImagePostLikes().deleteOne({ postId, userId });
    }
    const likeCount = await getImagePostLikes().countDocuments({ postId });
    return res.json({ liked, likeCount });
  } catch (error) {
    console.error('Could not update image post like:', error);
    return res.status(500).json({ message: 'مقدرناش نحفظ الإعجاب دلوقتي.' });
  }
}

export { getPosts, getPostCount, createPost, getPostImage, recordPostView, setPostLike };

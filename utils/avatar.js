function getAvatarUrl(user) {
  if (!user) return '';
  if (user.avatarStorageKey) {
    const version = user.avatarUpdatedAt instanceof Date ? user.avatarUpdatedAt.getTime() : 0;
    return `/api/auth/avatar/${user._id}?v=${version}`;
  }
  return user.avatarUrl || '';
}

function publicAvatarUser(user) {
  if (!user) return null;
  const { avatarStorageKey, avatarMimeType, avatarUpdatedAt, ...publicUser } = user;
  return { ...publicUser, avatarUrl: getAvatarUrl(user) };
}

export { getAvatarUrl, publicAvatarUser };

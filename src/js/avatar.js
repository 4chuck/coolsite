import { ref as dbRef, child, get } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";
import { ref as storageRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-storage.js";

const PROFILE_AVATAR_CACHE_KEY = 'tetron_profile_avatar';

export function defaultAvatarUrl(name = 'User') {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
}

export function getCachedProfileAvatar(uid) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const item = localStorage.getItem(PROFILE_AVATAR_CACHE_KEY);
    if (!item) return null;
    const cached = JSON.parse(item);
    if (!cached || cached.uid !== uid || !cached.url) return null;
    return cached;
  } catch (error) {
    console.warn('Avatar cache parse failed:', error);
    return null;
  }
}

export function cacheProfileAvatarUrl(uid, url, path = null) {
  if (!uid || !url || typeof window === 'undefined' || !window.localStorage) return;

  const cached = {
    uid,
    url,
    path: path || null,
    updated: Date.now(),
  };

  try {
    localStorage.setItem(PROFILE_AVATAR_CACHE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to cache profile avatar URL:', error);
  }

  return cached;
}

export function applyCachedProfileAvatar(avatarElem, user) {
  if (!avatarElem || !user) return false;

  const name = user.displayName || 'User';
  const cached = getCachedProfileAvatar(user.uid);
  const fallback = defaultAvatarUrl(name);
  const avatarUrl = cached?.url || user.photoURL || fallback;

  avatarElem.src = avatarUrl;
  avatarElem.onerror = () => {
    avatarElem.onerror = null;
    avatarElem.src = fallback;
  };

  return Boolean(cached);
}

async function resolveAvatarPathFromDb(storage, path) {
  if (!path) return null;
  let storagePath = path;

  if (storagePath.startsWith('https://firebasestorage.googleapis.com/')) {
    return { url: storagePath, path: storagePath };
  }

  if (storagePath.startsWith('gs://')) {
    console.warn('gs:// paths are not supported for avatar resolution');
    return null;
  }

  const imageRef = storageRef(storage, storagePath);

  try {
    return { url: await getDownloadURL(imageRef), path: storagePath };
  } catch (error) {
    // if thumb path fails, fall back to profile.jpg in the same folder
    if (storagePath.includes('/thumb_')) {
      const alternatePath = storagePath.replace(/\/thumb_[^/]+$/, '/profile.jpg');
      try {
        const alternateRef = storageRef(storage, alternatePath);
        return { url: await getDownloadURL(alternateRef), path: alternatePath };
      } catch (fallbackError) {
        console.warn('Failed to resolve fallback profile.jpg path:', fallbackError);
      }
    }
    throw error;
  }
}

const preloadImageUrl = async (url, retries = 4, delayMs = 400) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image preload failed'));
        img.src = url;
      });
      return true;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
};

const resolveAvatarPathWithRetry = async (storage, path, retries = 4, delayMs = 500) => {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resolved = await resolveAvatarPathFromDb(storage, path);
      return resolved;
    } catch (err) {
      lastError = err;
      const isTransient = err?.code === 'storage/object-not-found' || err?.message?.includes('404') || err?.message?.includes('Could not parse');
      if (!isTransient || attempt === retries) break;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw lastError;
};

export async function fetchProfileAvatarData(db, storage, user) {
  if (!db || !storage || !user) return null;

  try {
    const snapshot = await get(child(dbRef(db), `users/${user.uid}`));
    if (!snapshot.exists()) {
      return user.photoURL ? { url: user.photoURL, path: null } : null;
    }

    const data = snapshot.val();
    if (data?.profilePic) {
      try {
        const resolved = await resolveAvatarPathWithRetry(storage, data.profilePic);
        if (resolved?.url) return { url: resolved.url, path: resolved.path };
        console.warn('Failed to resolve profilePic path:', data.profilePic);
      } catch (error) {
        console.warn('Failed to resolve profilePic path:', error);
      }
    }
  } catch (error) {
    console.warn('Failed to fetch profile data:', error);
  }

  return user.photoURL ? { url: user.photoURL, path: null } : null;
}

export async function fetchProfileAvatarUrl(db, storage, user) {
  const data = await fetchProfileAvatarData(db, storage, user);
  return data?.url || null;
}

export async function getOrFetchCachedProfileAvatar(avatarElem, user, db, storage) {
  if (!avatarElem || !user) return false;

  const name = user.displayName || 'User';
  const fallback = defaultAvatarUrl(name);
  const cached = getCachedProfileAvatar(user.uid);

  const setAvatar = (url) => {
    avatarElem.src = url;
    avatarElem.onerror = null;
  };

  if (cached?.url) {
    setAvatar(cached.url);
    avatarElem.onerror = async () => {
      avatarElem.onerror = null;
      if (db && storage) {
        try {
          const profileData = await fetchProfileAvatarData(db, storage, user);
          if (profileData?.url) {
            try {
              await preloadImageUrl(profileData.url);
              setAvatar(profileData.url);
              cacheProfileAvatarUrl(user.uid, profileData.url, profileData.path);
              return;
            } catch (preloadError) {
              console.warn('Preload failed for refreshed avatar URL:', preloadError);
            }
          }
        } catch (error) {
          console.warn('Failed to refresh cached avatar URL:', error);
        }
      }
      avatarElem.src = fallback;
    };

    if (db && storage) {
      fetchProfileAvatarData(db, storage, user).then(async (profileData) => {
        if (profileData?.url && profileData.url !== cached.url) {
          try {
            await preloadImageUrl(profileData.url);
            setAvatar(profileData.url);
            cacheProfileAvatarUrl(user.uid, profileData.url, profileData.path);
          } catch (preloadError) {
            console.warn('Preload failed for refreshed avatar URL:', preloadError);
          }
        }
      }).catch(() => {});
    }

    return true;
  }

  const initialUrl = user.photoURL || fallback;
  setAvatar(initialUrl);
  avatarElem.onerror = () => {
    avatarElem.onerror = null;
    avatarElem.src = fallback;
  };

  const profileData = await fetchProfileAvatarData(db, storage, user);
  if (profileData?.url) {
    try {
      await preloadImageUrl(profileData.url);
      setAvatar(profileData.url);
      cacheProfileAvatarUrl(user.uid, profileData.url, profileData.path);
      return true;
    } catch (preloadError) {
      console.warn('Failed to preload avatar URL:', preloadError);
    }
  }

  return false;
}

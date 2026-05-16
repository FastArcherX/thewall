const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const ExifParser = require('exif-parser');
const { v4: uuidv4 } = require('uuid');
const { loadDB, saveDB } = require('./db');
const { executeCommand, printHelp, tokenizeCommand } = require('./cli');
const { WALL_ICONS, normalizeWallIcon } = require('./wall-icons');
const appPackage = require('../package.json');

const app = express();
const PORT = 3000;
const EVERYONE_WALL_ID = 'wall:everyone';

// Map to store temporary share codes: code -> { itemId, wallId, expiresAt, filename, mimeType }
const temporaryShares = new Map();

// Load persisted temporary shares from DB (if any)
try {
  const _db = loadDB();
  if (Array.isArray(_db.temporaryShares)) {
    for (const s of _db.temporaryShares) {
      if (s && s.code) {
        temporaryShares.set(s.code, {
          itemId: s.itemId,
          wallId: s.wallId,
          expiresAt: s.expiresAt,
          filename: s.filename,
          mimeType: s.mimeType || 'application/octet-stream'
        });
      }
    }
    console.log(`Loaded ${temporaryShares.size} temporary share(s) from DB`);
  }
} catch (err) {
  console.error('Failed to load persisted temporary shares:', err);
}

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer storage - preserve original extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|gif|webp|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)|video\/(mp4|webm|ogg|quicktime|x-msvideo|3gpp|avi|x-matroska)|audio\/(mpeg|mp3|wav|x-wav)/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only supported images, videos and audio files are allowed.'));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(session({
  secret: 'thewall-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function getWallById(db, wallId) {
  return db.walls.find(wall => wall.id === wallId);
}

function isEveryoneWall(wallOrId) {
  const value = typeof wallOrId === 'string' ? wallOrId : wallOrId?.id;
  return value === EVERYONE_WALL_ID;
}

function serializeWall(wall, currentUser, canManageMeta = false, pingCount = 0) {
  const icon = wall.iconId ? normalizeWallIcon(wall.iconId || wall.icon).emoji : (String(wall.icon || '').trim() || normalizeWallIcon(wall.icon).emoji);
  const iconId = wall.iconId ? normalizeWallIcon(wall.iconId || wall.icon).id : null;
  return {
    id: wall.id,
    name: wall.name,
    icon,
    iconId,
    owner: wall.owner,
    allowedUsers: normalizeNameList(wall.allowedUsers || []),
    createdAt: wall.createdAt,
    canManageMeta,
    isFavourites: false,
    isEveryone: isEveryoneWall(wall),
    pingCount: Math.max(0, Number(pingCount || 0))
  };
}

function parseWallPayload(body) {
  const icon = normalizeWallIcon(body.iconId || body.icon);
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    icon: icon.emoji,
    iconId: icon.id
  };
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeNameList(values) {
  const seen = new Set();
  const normalized = [];
  for (const value of Array.isArray(values) ? values : []) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const key = normalizeName(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(raw);
  }
  return normalized;
}

function isOperator(db, userName) {
  return (db.operators || []).some(name => normalizeName(name) === normalizeName(userName));
}

function canUserAccessWall(db, wall, userName) {
  if (!wall) return false;
  if (isEveryoneWall(wall)) return true;
  if (normalizeName(wall.owner) === normalizeName(userName)) return true;
  if (isOperator(db, userName)) return true;
  return (wall.allowedUsers || []).some(name => normalizeName(name) === normalizeName(userName));
}

function canManageWallMeta(db, wall, userName) {
  if (!wall) return false;
  if (isEveryoneWall(wall)) return false;
  if (normalizeName(wall.owner) === normalizeName(userName)) return true;
  return isOperator(db, userName);
}

function extractMentionNames(value) {
  const text = String(value || '');
  const matches = text.match(/@([\w.-]+)/g) || [];
  return new Set(matches.map(match => match.slice(1).toLowerCase()));
}

function getPingCount(db, userName, wallId) {
  return (db.notifications || [])
    .filter(entry => normalizeName(entry.user) === normalizeName(userName) && entry.wallId === wallId)
    .reduce((sum, entry) => sum + Number(entry.count || 0), 0);
}

function clearWallPings(db, userName, wallId) {
  const before = (db.notifications || []).length;
  db.notifications = (db.notifications || []).filter(entry => !(normalizeName(entry.user) === normalizeName(userName) && entry.wallId === wallId));
  return db.notifications.length !== before;
}

function addWallPing(db, userName, wallId) {
  if (!userName || !wallId) return;
  db.notifications = db.notifications || [];
  const entry = db.notifications.find(item => normalizeName(item.user) === normalizeName(userName) && item.wallId === wallId);
  if (entry) {
    entry.count = Number(entry.count || 0) + 1;
    return;
  }
  db.notifications.push({ user: userName, wallId, count: 1 });
}

function notifyMentions(db, wall, actorName, previousCaption, nextCaption) {
  const before = extractMentionNames(previousCaption);
  const after = extractMentionNames(nextCaption);
  const added = Array.from(after).filter(name => !before.has(name));
  if (added.length === 0) return;

  const recipients = new Set();
  const actorKey = normalizeName(actorName);

  if (added.includes('everyone')) {
    (db.users || []).forEach(user => {
      if (!user?.name) return;
      if (normalizeName(user.name) === actorKey) return;
      if (!canUserAccessWall(db, wall, user.name)) return;
      recipients.add(user.name);
    });
  }

  added.forEach(mention => {
    if (mention === 'everyone') return;
    const user = findUserByName(db, mention);
    if (!user?.name) return;
    if (normalizeName(user.name) === actorKey) return;
    if (!canUserAccessWall(db, wall, user.name)) return;
    recipients.add(user.name);
  });

  recipients.forEach(userName => addWallPing(db, userName, wall.id));
}

function parseAllowedUsers(values) {
  return normalizeNameList(values);
}

function getFavouritesWallId(userName) {
  return `favourites:${normalizeName(userName)}`;
}

function isUserFavouritesWallId(wallId, userName) {
  return wallId === getFavouritesWallId(userName);
}

function ensureUserFavouritesEntry(db, userName) {
  const normalizedUser = normalizeName(userName);
  let entry = db.favourites.find(fav => normalizeName(fav.user) === normalizedUser);
  if (!entry) {
    entry = { user: userName, items: [] };
    db.favourites.push(entry);
  }
  return entry;
}

function getUserFavouritesEntry(db, userName) {
  return db.favourites.find(fav => normalizeName(fav.user) === normalizeName(userName)) || null;
}

function serializeFavouritesWall(currentUser) {
  const icon = normalizeWallIcon(9);
  return {
    id: getFavouritesWallId(currentUser),
    name: 'Favourites',
    icon: icon.emoji,
    iconId: icon.id,
    owner: currentUser,
    createdAt: null,
    canManageMeta: false,
    isFavourites: true,
    isEveryone: false,
    pingCount: 0
  };
}

function getFavouriteRefKey(ref) {
  return `${ref.wallId}::${ref.itemId}`;
}

function findItemByReference(db, ref) {
  const sourceWall = getWallById(db, ref.wallId);
  if (!sourceWall) return null;
  const sourceItem = sourceWall.items.find(item => item.id === ref.itemId);
  if (!sourceItem) return null;
  return { sourceWall, sourceItem };
}

function findUserByName(db, name) {
  return db.users.find(user => normalizeName(user.name) === normalizeName(name));
}

function isWallNameAvailable(db, name, currentWallId = null) {
  return !db.walls.some(wall => normalizeName(wall.name) === normalizeName(name) && wall.id !== currentWallId);
}

function sanitizeUploadDisplayName(displayName, originalName) {
  const fallback = path.basename(originalName || 'file');
  const provided = path.basename(String(displayName || '').trim()) || fallback;
  const originalExt = path.extname(fallback);
  const providedExt = path.extname(provided);
  const safeName = provided.replace(/[\\/:*?"<>|]/g, '').trim() || fallback;
  if (!originalExt) {
    return safeName;
  }
  if (providedExt.toLowerCase() === originalExt.toLowerCase()) {
    return safeName;
  }
  return `${safeName}${originalExt}`;
}

function parseDateFromFilename(filename) {
  const name = String(filename || '').trim();
  if (!name) return null;

  const patterns = [
    /(?:^|[-_])(\d{4})(\d{2})(\d{2})(?:[-_]|\b)/,
    /(?:^|[-_])(\d{4})-(\d{2})-(\d{2})(?:[-_]|\b)/
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) continue;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  return null;
}

function startAdminConsole() {
  if (!process.stdin.isTTY) {
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  console.log('Admin console ready. Type "friend list" or "help".');
  rl.prompt();

  rl.on('line', async line => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'help') {
      printHelp();
      rl.prompt();
      return;
    }

    if (trimmed === 'exit') {
      rl.close();
      return;
    }

    try {
      const result = await executeCommand(tokenizeCommand(trimmed), {
        confirm: message => new Promise(resolve => rl.question(message, answer => resolve(/^y(es)?$/i.test(String(answer).trim()))))
      });
      if (!result.handled) {
        printHelp();
      }
    } catch (error) {
      console.error(error.message || error);
    }

    rl.prompt();
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Missing fields' });
  const db = loadDB();
  const user = db.users.find(u => u.name === name);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = { name: user.name };
  res.json({ success: true, name: user.name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ authenticated: false });
  res.json({ authenticated: true, name: req.session.user.name });
});

app.get('/api/users', requireAuth, (req, res) => {
  const db = loadDB();
  const names = db.users
    .map(user => user.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  res.json(names);
});

app.get('/api/wall-icons', (req, res) => {
  res.json(WALL_ICONS);
});

app.get('/api/version', (req, res) => {
  res.json({ version: appPackage.version });
});

app.patch('/api/profile', requireAuth, async (req, res) => {
  const { name, newPassword, currentPassword } = req.body;
  if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });

  const db = loadDB();
  const user = findUserByName(db, req.session.user.name);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const passwordOk = await bcrypt.compare(currentPassword, user.password);
  if (!passwordOk) return res.status(401).json({ error: 'Current password is incorrect' });

  const nextName = typeof name === 'string' ? name.trim() : '';
  const nextPassword = typeof newPassword === 'string' ? newPassword : '';

  if (!nextName && !nextPassword) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  if (nextName && normalizeName(nextName) !== normalizeName(user.name)) {
    if (findUserByName(db, nextName)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const previousName = user.name;
    user.name = nextName;
    db.walls.forEach(wall => {
      if (normalizeName(wall.owner) === normalizeName(previousName)) {
        wall.owner = nextName;
      }
      wall.allowedUsers = (wall.allowedUsers || []).map(entry =>
        normalizeName(entry) === normalizeName(previousName) ? nextName : entry
      );
    });
    db.favourites.forEach(entry => {
      if (normalizeName(entry.user) === normalizeName(previousName)) {
        entry.user = nextName;
      }
    });
    db.operators = (db.operators || []).map(entry =>
      normalizeName(entry) === normalizeName(previousName) ? nextName : entry
    );
    db.notifications = (db.notifications || []).map(entry => ({
      ...entry,
      user: normalizeName(entry.user) === normalizeName(previousName) ? nextName : entry.user
    }));
    req.session.user.name = nextName;
  }

  if (nextPassword) {
    user.password = await bcrypt.hash(nextPassword, 10);
  }

  saveDB(db);
  res.json({ success: true, name: user.name });
});

// ── Walls ─────────────────────────────────────────────────────────────────────

app.get('/api/walls', requireAuth, (req, res) => {
  const db = loadDB();
  const regularWalls = db.walls
    .filter(wall => canUserAccessWall(db, wall, req.session.user.name))
    .sort((a, b) => {
      if (isEveryoneWall(a) && !isEveryoneWall(b)) return -1;
      if (!isEveryoneWall(a) && isEveryoneWall(b)) return 1;
      return 0;
    })
    .map(wall => serializeWall(
      wall,
      req.session.user.name,
      canManageWallMeta(db, wall, req.session.user.name),
      getPingCount(db, req.session.user.name, wall.id)
    ));
  res.json([serializeFavouritesWall(req.session.user.name), ...regularWalls]);
});

app.post('/api/walls', requireAuth, (req, res) => {
  const { name, icon, iconId } = parseWallPayload(req.body);
  if (!name) return res.status(400).json({ error: 'Wall name required' });

  if (!Array.isArray(req.body?.allowedUsers)) {
    return res.status(400).json({ error: 'allowedUsers array is required' });
  }

  const allowedUsers = parseAllowedUsers(req.body?.allowedUsers);

  const db = loadDB();
  if (!isWallNameAvailable(db, name)) return res.status(409).json({ error: 'Wall name already exists' });

  const invalidUsers = allowedUsers.filter(userName => normalizeName(userName) !== normalizeName(req.session.user.name) && !findUserByName(db, userName));
  if (invalidUsers.length > 0) {
    return res.status(400).json({ error: `Unknown users: ${invalidUsers.join(', ')}` });
  }

  const ownerName = req.session.user.name;
  const withOwnerIncluded = normalizeNameList([...allowedUsers, ownerName]);

  const wall = {
    id: uuidv4(),
    name,
    icon,
    iconId,
    owner: ownerName,
    allowedUsers: withOwnerIncluded,
    createdAt: new Date().toISOString(),
    items: []
  };
  db.walls.push(wall);
  saveDB(db);
  res.json(serializeWall(wall, req.session.user.name, true));
});

app.delete('/api/walls/:wallId', requireAuth, (req, res) => {
  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    return res.status(403).json({ error: 'Favourites wall cannot be deleted' });
  }
  if (isEveryoneWall(req.params.wallId)) {
    return res.status(403).json({ error: '@everyone wall cannot be deleted' });
  }

  const db = loadDB();
  const idx = db.walls.findIndex(w => w.id === req.params.wallId);
  if (idx === -1) return res.status(404).json({ error: 'Wall not found' });
  if (!canUserAccessWall(db, db.walls[idx], req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to this wall' });
  }
  if (!canManageWallMeta(db, db.walls[idx], req.session.user.name)) return res.status(403).json({ error: 'Only owner or operators can delete this wall' });
  // Delete associated files
  db.walls[idx].items.forEach(item => {
    const filePath = path.join(UPLOADS_DIR, item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.favourites.forEach(entry => {
    entry.items = entry.items.filter(ref => ref.wallId !== req.params.wallId);
  });
  db.notifications = (db.notifications || []).filter(entry => entry.wallId !== req.params.wallId);
  db.walls.splice(idx, 1);
  saveDB(db);
  res.json({ success: true });
});

app.patch('/api/walls/:wallId', requireAuth, (req, res) => {
  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    return res.status(403).json({ error: 'Favourites wall cannot be edited' });
  }
  if (isEveryoneWall(req.params.wallId)) {
    return res.status(403).json({ error: '@everyone wall cannot be edited' });
  }

  const { name, icon, iconId } = parseWallPayload(req.body);
  const db = loadDB();
  const wall = getWallById(db, req.params.wallId);
  if (!wall) return res.status(404).json({ error: 'Wall not found' });
  if (!canUserAccessWall(db, wall, req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to this wall' });
  }
  if (!canManageWallMeta(db, wall, req.session.user.name)) return res.status(403).json({ error: 'Only owner or operators can edit wall details' });
  if (!name) return res.status(400).json({ error: 'Wall name required' });
  if (!isWallNameAvailable(db, name, wall.id)) return res.status(409).json({ error: 'Wall name already exists' });
  wall.name = name;
  wall.icon = icon;
  wall.iconId = iconId;
  saveDB(db);
  res.json(serializeWall(wall, req.session.user.name, canManageWallMeta(db, wall, req.session.user.name)));
});

app.patch('/api/walls/:wallId/access', requireAuth, (req, res) => {
  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    return res.status(403).json({ error: 'Favourites wall cannot be edited' });
  }
  if (isEveryoneWall(req.params.wallId)) {
    return res.status(403).json({ error: '@everyone wall access is fixed for all users' });
  }

  if (!Array.isArray(req.body?.allowedUsers)) {
    return res.status(400).json({ error: 'allowedUsers array is required' });
  }

  const db = loadDB();
  const wall = getWallById(db, req.params.wallId);
  if (!wall) return res.status(404).json({ error: 'Wall not found' });
  if (!canUserAccessWall(db, wall, req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to this wall' });
  }
  if (!canManageWallMeta(db, wall, req.session.user.name)) {
    return res.status(403).json({ error: 'Only owner or operators can edit wall access' });
  }

  const allowedUsers = parseAllowedUsers(req.body.allowedUsers);
  const invalidUsers = allowedUsers.filter(userName => normalizeName(userName) !== normalizeName(wall.owner) && !findUserByName(db, userName));
  if (invalidUsers.length > 0) {
    return res.status(400).json({ error: `Unknown users: ${invalidUsers.join(', ')}` });
  }

  wall.allowedUsers = normalizeNameList([...allowedUsers, wall.owner]);
  saveDB(db);
  res.json(serializeWall(wall, req.session.user.name, canManageWallMeta(db, wall, req.session.user.name)));
});

app.get('/api/favourites', requireAuth, (req, res) => {
  const db = loadDB();
  const entry = getUserFavouritesEntry(db, req.session.user.name);
  res.json(entry?.items || []);
});

app.post('/api/favourites', requireAuth, (req, res) => {
  const wallId = String(req.body?.wallId || '').trim();
  const itemId = String(req.body?.itemId || '').trim();

  if (!wallId || !itemId) {
    return res.status(400).json({ error: 'wallId and itemId are required' });
  }

  if (isUserFavouritesWallId(wallId, req.session.user.name)) {
    return res.status(400).json({ error: 'Cannot favourite from Favourites wall' });
  }

  const db = loadDB();
  const sourceWall = getWallById(db, wallId);
  if (!sourceWall) return res.status(404).json({ error: 'Source wall not found' });
  if (!canUserAccessWall(db, sourceWall, req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to source wall' });
  }
  const sourceItem = sourceWall.items.find(item => item.id === itemId);
  if (!sourceItem) return res.status(404).json({ error: 'Source item not found' });

  const entry = ensureUserFavouritesEntry(db, req.session.user.name);
  const nextRef = { wallId, itemId };
  const alreadyAdded = entry.items.some(ref => ref.wallId === wallId && ref.itemId === itemId);

  if (!alreadyAdded) {
    entry.items.push(nextRef);
    saveDB(db);
  }

  res.json({ success: true });
});

app.delete('/api/favourites', requireAuth, (req, res) => {
  const wallId = String(req.body?.wallId || '').trim();
  const itemId = String(req.body?.itemId || '').trim();

  if (!wallId || !itemId) {
    return res.status(400).json({ error: 'wallId and itemId are required' });
  }

  const db = loadDB();
  const entry = ensureUserFavouritesEntry(db, req.session.user.name);
  const before = entry.items.length;
  entry.items = entry.items.filter(ref => !(ref.wallId === wallId && ref.itemId === itemId));
  if (entry.items.length !== before) {
    saveDB(db);
  }

  res.json({ success: true });
});

// ── Items ─────────────────────────────────────────────────────────────────────

app.get('/api/walls/:wallId/items', requireAuth, (req, res) => {
  const db = loadDB();

  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    const entry = ensureUserFavouritesEntry(db, req.session.user.name);
    const mapped = entry.items.map(ref => {
      const found = findItemByReference(db, ref);
      if (!found) return null;
      if (!canUserAccessWall(db, found.sourceWall, req.session.user.name)) return null;
      return {
        ...found.sourceItem,
        id: getFavouriteRefKey(ref),
        sourceWallId: ref.wallId,
        sourceWallName: found.sourceWall.name,
        sourceItemId: ref.itemId,
        isFavourite: true
      };
    }).filter(Boolean);

    if (mapped.length !== entry.items.length) {
      const validKeys = new Set(mapped.map(item => `${item.sourceWallId}::${item.sourceItemId}`));
      entry.items = entry.items.filter(ref => validKeys.has(`${ref.wallId}::${ref.itemId}`));
      saveDB(db);
    }

    return res.json(mapped);
  }

  const wall = getWallById(db, req.params.wallId);
  if (!wall) return res.status(404).json({ error: 'Wall not found' });
  if (!canUserAccessWall(db, wall, req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to this wall' });
  }

  if (clearWallPings(db, req.session.user.name, wall.id)) {
    saveDB(db);
  }

  const entry = getUserFavouritesEntry(db, req.session.user.name);
  const favouriteKeys = new Set((entry?.items || []).map(getFavouriteRefKey));
  const items = wall.items.map(item => ({
    ...item,
    isFavourite: favouriteKeys.has(`${wall.id}::${item.id}`)
  }));

  res.json(items);
});

app.post('/api/walls/:wallId/items', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Cannot upload items to Favourites wall' });
  }

  const db = loadDB();
  const wall = getWallById(db, req.params.wallId);
  if (!wall) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Wall not found' });
  }
  if (!canUserAccessWall(db, wall, req.session.user.name)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Access denied to this wall' });
  }
  // Extract EXIF date if available
  let exifDate = null;
  let exifSource = null;
  if (req.file.mimetype.startsWith('image/')) {
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const parser = ExifParser.create(fileBuffer);
      const result = parser.parse();
      
      const dtTags = result.tags || {};
      const tryParseExifValue = (val) => {
        if (!val && val !== 0) return null;
        // numeric timestamp (seconds since epoch)
        if (typeof val === 'number') {
          try {
            return new Date(val * 1000).toISOString();
          } catch (e) {
            return null;
          }
        }
        // string in format "YYYY:MM:DD HH:MM:SS"
        if (typeof val === 'string') {
          const formatted = val.replace(/(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T').replace(/\s/, '');
          try {
            return new Date(formatted + 'Z').toISOString();
          } catch (e) {
            return null;
          }
        }
        return null;
      };

      // Prefer DateTimeOriginal, then DateTime, then other candidates
      const candidates = [dtTags.DateTimeOriginal, dtTags.DateTime, dtTags.CreateDate, dtTags.ModifyDate];
      let parsed = null;
      for (const cand of candidates) {
        parsed = tryParseExifValue(cand);
        if (parsed) {
          console.log('[EXIF] Parsed candidate:', cand, '->', parsed);
          exifDate = parsed;
          exifSource = 'exif';
          break;
        }
      }
      if (!exifDate) console.log('[EXIF] No DateTime tags found or parse failed');
    } catch (err) {
      // EXIF extraction failed, will use uploadedAt instead
      console.log('[EXIF] Extraction error:', err.message);
    }
  }

  // Fallback to client-side file metadata when EXIF is absent
  if (!exifDate && req.body.fileLastModified) {
    const ms = Number(req.body.fileLastModified);
    if (Number.isFinite(ms) && ms > 0) {
      const dt = new Date(ms);
      if (!Number.isNaN(dt.getTime())) {
        exifDate = dt.toISOString();
        exifSource = 'file';
      }
    }
  }

  if (!exifDate) {
    const filenameDate = parseDateFromFilename(req.file.originalname || req.body.displayName || req.file.filename);
    if (filenameDate) {
      exifDate = filenameDate;
      exifSource = 'filename';
    }
  }

  const item = {
    id: uuidv4(),
    filename: req.file.filename,
    originalName: sanitizeUploadDisplayName(req.body.displayName, req.file.originalname),
    mimetype: req.file.mimetype,
    caption: req.body.caption || '',
    uploadedAt: new Date().toISOString(),
    uploadedBy: req.session.user.name,
    exifDate: exifDate,
    exifSource: exifSource
  };
  wall.items.push(item);
  notifyMentions(db, wall, req.session.user.name, '', item.caption || '');
  saveDB(db);
  res.json(item);
});

app.patch('/api/walls/:wallId/items/order', requireAuth, (req, res) => {
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ error: 'itemIds array is required' });
  }

  const db = loadDB();

  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    const entry = ensureUserFavouritesEntry(db, req.session.user.name);
    const keysInEntry = new Set(entry.items.map(ref => `${ref.wallId}::${ref.itemId}`));
    if (itemIds.some(id => !keysInEntry.has(id))) {
      return res.status(400).json({ error: 'Invalid favourites order payload' });
    }

    const refByKey = new Map(entry.items.map(ref => [`${ref.wallId}::${ref.itemId}`, ref]));
    const reorderedRefs = itemIds.map(id => refByKey.get(id)).filter(Boolean);
    const reorderedKeys = new Set(itemIds);
    const remainingRefs = entry.items.filter(ref => !reorderedKeys.has(`${ref.wallId}::${ref.itemId}`));
    entry.items = [...reorderedRefs, ...remainingRefs];
    saveDB(db);
    return res.json({ success: true });
  }

  const wall = getWallById(db, req.params.wallId);
  if (!wall) return res.status(404).json({ error: 'Wall not found' });
  if (!canUserAccessWall(db, wall, req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to this wall' });
  }

  const idsInWall = new Set(wall.items.map(item => item.id));
  
  // Validate that all sent itemIds exist in the wall
  if (itemIds.some(id => !idsInWall.has(id))) {
    return res.status(400).json({ error: 'One or more itemIds do not exist in this wall' });
  }

  // Build a map of all items
  const byId = new Map(wall.items.map(item => [item.id, item]));
  
  // Reorder items: put the reordered ones first (in the new order),
  // then append any items that weren't in the reorder list at the end
  const reorderedItems = itemIds.map(id => byId.get(id)).filter(Boolean);
  const unreorderedIds = new Set(itemIds);
  const remainingItems = wall.items.filter(item => !unreorderedIds.has(item.id));
  
  wall.items = [...reorderedItems, ...remainingItems];
  saveDB(db);
  res.json({ success: true });
});

app.delete('/api/walls/:wallId/items/:itemId', requireAuth, (req, res) => {
  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    return res.status(403).json({ error: 'Cannot delete items from Favourites wall' });
  }

  const db = loadDB();
  const wall = getWallById(db, req.params.wallId);
  if (!wall) return res.status(404).json({ error: 'Wall not found' });
  if (!canUserAccessWall(db, wall, req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to this wall' });
  }
  const idx = wall.items.findIndex(i => i.id === req.params.itemId);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  const [item] = wall.items.splice(idx, 1);
  const filePath = path.join(UPLOADS_DIR, item.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.favourites.forEach(entry => {
    entry.items = entry.items.filter(ref => !(ref.wallId === req.params.wallId && ref.itemId === req.params.itemId));
  });
  saveDB(db);
  res.json({ success: true });
});

app.patch('/api/walls/:wallId/items/:itemId', requireAuth, (req, res) => {
  if (isUserFavouritesWallId(req.params.wallId, req.session.user.name)) {
    return res.status(403).json({ error: 'Cannot edit items from Favourites wall' });
  }

  const { caption, originalName } = req.body;
  const db = loadDB();
  const wall = getWallById(db, req.params.wallId);
  if (!wall) return res.status(404).json({ error: 'Wall not found' });
  if (!canUserAccessWall(db, wall, req.session.user.name)) {
    return res.status(403).json({ error: 'Access denied to this wall' });
  }
  const item = wall.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const previousCaption = item.caption || '';
  if (typeof caption === 'string') item.caption = caption;
  if (typeof originalName === 'string' && originalName.trim()) {
    item.originalName = sanitizeUploadDisplayName(originalName.trim(), item.originalName);
  }
  if (typeof caption === 'string') {
    notifyMentions(db, wall, req.session.user.name, previousCaption, item.caption || '');
  }
  saveDB(db);
  res.json({ success: true });
});

// ── Share endpoints ───────────────────────────────────────────────────────────
app.post('/api/share', requireAuth, (req, res) => {
  const { itemId, wallId } = req.body;
  const db = loadDB();

  if (!itemId || !wallId) {
    return res.status(400).json({ error: 'itemId and wallId required' });
  }

  // Verify user has access to this item
  const wall = getWallById(db, wallId);
  if (!wall) return res.status(404).json({ error: 'Wall not found' });

  const item = wall.items?.find(i => i.id === itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  // Generate random share code (8 characters)
  const code = Math.random().toString(36).substring(2, 10);
  const expiresAt = Date.now() + (5 * 24 * 60 * 60 * 1000); // 5 days

  // Store share info in memory
  temporaryShares.set(code, {
    itemId,
    wallId,
    expiresAt,
    filename: item.filename,
    mimeType: item.mimetype || 'application/octet-stream'
  });

  // Persist to DB
  try {
    const db2 = loadDB();
    db2.temporaryShares = Array.from(temporaryShares.entries()).map(([codeKey, info]) => ({
      code: codeKey,
      itemId: info.itemId,
      wallId: info.wallId,
      expiresAt: info.expiresAt,
      filename: info.filename,
      mimeType: info.mimeType
    }));
    saveDB(db2);
  } catch (err) {
    console.error('Failed to persist temporary share:', err);
  }

  res.json({ code, expiresAt });
});

// Lookup existing share for an item
app.get('/api/share', requireAuth, (req, res) => {
  const { itemId, wallId } = req.query;
  if (!itemId || !wallId) return res.status(400).json({ error: 'itemId and wallId required' });
  for (const [code, info] of temporaryShares.entries()) {
    if (info.itemId === itemId && info.wallId === wallId) {
      // if expired, remove and return 404
      if (Date.now() > info.expiresAt) {
        temporaryShares.delete(code);
        try {
          const db2 = loadDB();
          db2.temporaryShares = Array.from(temporaryShares.entries()).map(([codeKey, info2]) => ({
            code: codeKey,
            itemId: info2.itemId,
            wallId: info2.wallId,
            expiresAt: info2.expiresAt,
            filename: info2.filename,
            mimeType: info2.mimeType
          }));
          saveDB(db2);
        } catch (err) { console.error('Failed to persist temporary share removal:', err); }
        return res.status(404).json({ error: 'Share not found' });
      }
      return res.json({ code, expiresAt: info.expiresAt });
    }
  }
  return res.status(404).json({ error: 'Share not found' });
});

// Delete a share by code (or by item/wall via query)
app.delete('/api/share', requireAuth, (req, res) => {
  const { code, itemId, wallId } = req.query;
  let removed = false;
  if (code) {
    removed = temporaryShares.delete(code);
  } else if (itemId && wallId) {
    for (const [c, info] of temporaryShares.entries()) {
      if (info.itemId === itemId && info.wallId === wallId) {
        temporaryShares.delete(c);
        removed = true;
        break;
      }
    }
  } else {
    return res.status(400).json({ error: 'code or itemId+wallId required' });
  }

  if (removed) {
    try {
      const db2 = loadDB();
      db2.temporaryShares = Array.from(temporaryShares.entries()).map(([codeKey, info]) => ({
        code: codeKey,
        itemId: info.itemId,
        wallId: info.wallId,
        expiresAt: info.expiresAt,
        filename: info.filename,
        mimeType: info.mimeType
      }));
      saveDB(db2);
    } catch (err) { console.error('Failed to persist temporary share removal:', err); }
    return res.json({ success: true });
  }
  return res.status(404).json({ error: 'Share not found' });
});

// Serve shared file without authentication
app.get('/id-shared/:code', (req, res) => {
  const { code } = req.params;
  const shareInfo = temporaryShares.get(code);

  if (!shareInfo) {
    // Code not found or expired - redirect to home
    return res.redirect('/');
  }

  // Check if code is expired
  if (Date.now() > shareInfo.expiresAt) {
    temporaryShares.delete(code);
    try {
      const db2 = loadDB();
      db2.temporaryShares = Array.from(temporaryShares.entries()).map(([codeKey, info2]) => ({
        code: codeKey,
        itemId: info2.itemId,
        wallId: info2.wallId,
        expiresAt: info2.expiresAt,
        filename: info2.filename,
        mimeType: info2.mimeType
      }));
      saveDB(db2);
    } catch (err) { console.error('Failed to persist expired share removal:', err); }
    return res.redirect('/');
  }

  // Serve the file
  const filePath = path.join(UPLOADS_DIR, shareInfo.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Type', shareInfo.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(shareInfo.filename)}"`);
  res.sendFile(filePath);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  return next(err);
});

// ── Serve SPA ─────────────────────────────────────────────────────────────────
app.get(/^(?!\/api|\/uploads).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`The Wall is running at http://localhost:${PORT}`);
  startAdminConsole();
});

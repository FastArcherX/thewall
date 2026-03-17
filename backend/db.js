const fs = require('fs');
const path = require('path');
const { normalizeWallIcon } = require('./wall-icons');

const DB_PATH = path.join(__dirname, '..', 'data.json');

function normalizeDB(data) {
  const normalized = {
    users: Array.isArray(data?.users) ? data.users : [],
    walls: Array.isArray(data?.walls) ? data.walls : [],
    favourites: Array.isArray(data?.favourites) ? data.favourites : [],
    operators: Array.isArray(data?.operators) ? data.operators : []
  };

  normalized.walls = normalized.walls.map(wall => ({
    id: wall.id,
    name: wall.name || 'Untitled Wall',
    icon: normalizeWallIcon(wall.icon).emoji,
    iconId: normalizeWallIcon(wall.iconId || wall.icon).id,
    owner: wall.owner || 'unknown',
    allowedUsers: Array.isArray(wall.allowedUsers)
      ? wall.allowedUsers.map(name => String(name || '').trim()).filter(Boolean)
      : [],
    createdAt: wall.createdAt || new Date().toISOString(),
    items: Array.isArray(wall.items)
      ? wall.items.map(item => ({
          id: item.id,
          filename: item.filename,
          originalName: item.originalName || item.filename,
          mimetype: item.mimetype || 'application/octet-stream',
          caption: item.caption || '',
          uploadedAt: item.uploadedAt || new Date().toISOString(),
          uploadedBy: item.uploadedBy || wall.owner || 'Unknown'
        }))
      : []
  }));

  normalized.favourites = normalized.favourites.map(entry => ({
    user: String(entry?.user || '').trim(),
    items: Array.isArray(entry?.items)
      ? entry.items
          .map(ref => ({
            wallId: String(ref?.wallId || '').trim(),
            itemId: String(ref?.itemId || '').trim()
          }))
          .filter(ref => ref.wallId && ref.itemId)
      : []
  })).filter(entry => entry.user);

  normalized.operators = normalized.operators
    .map(name => String(name || '').trim())
    .filter(Boolean);

  return normalized;
}

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { users: [], walls: [], favourites: [], operators: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return normalizeDB(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(normalizeDB(data), null, 2));
}

module.exports = { loadDB, saveDB };

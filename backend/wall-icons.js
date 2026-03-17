const WALL_ICONS = [
  { id: 1, emoji: '🧱', label: 'Brick' },
  { id: 2, emoji: '📸', label: 'Camera' },
  { id: 3, emoji: '🌅', label: 'Sunset' },
  { id: 4, emoji: '🎬', label: 'Cinema' },
  { id: 5, emoji: '🎉', label: 'Party' },
  { id: 6, emoji: '🫶', label: 'Hands' },
  { id: 7, emoji: '🎵', label: 'Music' },
  { id: 8, emoji: '🌈', label: 'Rainbow' },
  { id: 9, emoji: '⭐', label: 'Star' },
  { id: 10, emoji: '🎈', label: 'Balloon' },
  { id: 11, emoji: '🍀', label: 'Clover' },
  { id: 12, emoji: '🚀', label: 'Rocket' },
  { id: 13, emoji: '🌊', label: 'Wave' },
  { id: 14, emoji: '🦋', label: 'Butterfly' },
  { id: 15, emoji: '🏆', label: 'Trophy' }
];

const DEFAULT_WALL_ICON = WALL_ICONS[0];

function getWallIconById(value) {
  const id = Number(value);
  return WALL_ICONS.find(icon => icon.id === id) || null;
}

function getWallIconByEmoji(value) {
  return WALL_ICONS.find(icon => icon.emoji === value) || null;
}

function normalizeWallIcon(value) {
  if (value && typeof value === 'object' && value.id) {
    return getWallIconById(value.id) || DEFAULT_WALL_ICON;
  }

  return getWallIconById(value) || getWallIconByEmoji(value) || DEFAULT_WALL_ICON;
}

module.exports = {
  WALL_ICONS,
  DEFAULT_WALL_ICON,
  getWallIconById,
  getWallIconByEmoji,
  normalizeWallIcon
};
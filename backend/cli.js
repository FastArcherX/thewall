#!/usr/bin/env node
const bcrypt = require('bcryptjs');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const { loadDB, saveDB } = require('./db');
const { WALL_ICONS, DEFAULT_WALL_ICON, getWallIconById, normalizeWallIcon } = require('./wall-icons');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const REPO_ROOT = path.join(__dirname, '..');
const UPDATE_REPO_URL = 'https://github.com/FastArcherX/thewall';
const UPDATE_BRANCH = 'main';

function printHelp() {
  console.log(`
The Wall - Admin CLI
--------------------
  friend add "<name>" "<password>"       Add a new user
  friend remove "<name>"                 Remove a user
  friend nedit "<name>" "<new name>"     Rename a user
  friend pedit "<name>" "<new password>" Change a user's password
  friend list                            List all users
  op add "<name>"                        Add user to operator list
  op remove "<name>"                     Remove user from operator list
  op list                                List operators
  update                                 Update tracked files from GitHub
  wall add "<name>"                      Add a new wall
  wall remove "<name>"                   Remove a wall
  wall edit "<name>" "<new name>"        Rename a wall
  wall icon "<name>" "<icon id>"         Change a wall icon
  wall list                              List all walls
  wall reset "<name>"                    Remove all items from a wall
`);
}

function tokenizeCommand(input) {
  return (input.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(token => token.replace(/^['"]|['"]$/g, ''));
}

async function executeFriendCommand(tokens) {
  const [command, ...args] = tokens;
  if (command !== 'friend') {
    return { handled: false };
  }

  const subcommand = args[0];
  const db = loadDB();

  if (subcommand === 'add') {
    const [name, password] = args.slice(1);
    if (!name || !password) {
      console.error('Usage: friend add "<name>" "<password>"');
      return { handled: true, success: false };
    }
    if (findUserByName(db, name)) {
      console.error(`User "${name}" already exists.`);
      return { handled: true, success: false };
    }
    const hash = await bcrypt.hash(password, 10);
    db.users.push({ name, password: hash });
    saveDB(db);
    console.log(`User "${name}" added successfully.`);
    return { handled: true, success: true };

  } else if (subcommand === 'remove') {
    const [name] = args.slice(1);
    if (!name) {
      console.error('Usage: friend remove "<name>"');
      return { handled: true, success: false };
    }
    const idx = db.users.findIndex(u => normalizeName(u.name) === normalizeName(name));
    if (idx === -1) {
      console.error(`User "${name}" not found.`);
      return { handled: true, success: false };
    }
    const removedUser = db.users[idx].name;
    db.users.splice(idx, 1);
    db.operators = (db.operators || []).filter(name => normalizeName(name) !== normalizeName(removedUser));
    db.walls.forEach(wall => {
      wall.allowedUsers = (wall.allowedUsers || []).filter(name => normalizeName(name) !== normalizeName(removedUser));
    });
    db.favourites = (db.favourites || []).filter(entry => normalizeName(entry.user) !== normalizeName(removedUser));
    saveDB(db);
    console.log(`User "${name}" removed successfully.`);
    return { handled: true, success: true };

  } else if (subcommand === 'nedit') {
    const [name, newName] = args.slice(1);
    if (!name || !newName) {
      console.error('Usage: friend nedit "<name>" "<new name>"');
      return { handled: true, success: false };
    }
    const user = findUserByName(db, name);
    if (!user) {
      console.error(`User "${name}" not found.`);
      return { handled: true, success: false };
    }
    if (findUserByName(db, newName)) {
      console.error(`User "${newName}" already exists.`);
      return { handled: true, success: false };
    }
    const previousName = user.name;
    user.name = newName;
    db.walls.forEach(wall => {
      if (normalizeName(wall.owner) === normalizeName(previousName)) {
        wall.owner = newName;
      }
      wall.allowedUsers = (wall.allowedUsers || []).map(entry =>
        normalizeName(entry) === normalizeName(previousName) ? newName : entry
      );
    });
    db.operators = (db.operators || []).map(entry =>
      normalizeName(entry) === normalizeName(previousName) ? newName : entry
    );
    db.favourites.forEach(entry => {
      if (normalizeName(entry.user) === normalizeName(previousName)) {
        entry.user = newName;
      }
    });
    saveDB(db);
    console.log(`User renamed from "${name}" to "${newName}".`);
    return { handled: true, success: true };

  } else if (subcommand === 'pedit') {
    const [name, newPassword] = args.slice(1);
    if (!name || !newPassword) {
      console.error('Usage: friend pedit "<name>" "<new password>"');
      return { handled: true, success: false };
    }
    const user = findUserByName(db, name);
    if (!user) {
      console.error(`User "${name}" not found.`);
      return { handled: true, success: false };
    }
    user.password = await bcrypt.hash(newPassword, 10);
    saveDB(db);
    console.log(`Password for "${name}" updated successfully.`);
    return { handled: true, success: true };

  } else if (subcommand === 'list') {
    if (db.users.length === 0) {
      console.log('No users found.');
      return { handled: true, success: true };
    }
    console.log('Users:');
    db.users.forEach(u => console.log(`  - ${u.name}`));
    return { handled: true, success: true };

  } else {
    printHelp();
    return { handled: true, success: false };
  }
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function findUserByName(db, userName) {
  return db.users.find(user => normalizeName(user.name) === normalizeName(userName));
}

function findWallByName(db, wallName) {
  return db.walls.find(wall => normalizeName(wall.name) === normalizeName(wallName));
}

function ensureUniqueWallName(db, wallName, currentWallId = null) {
  return !db.walls.some(wall => normalizeName(wall.name) === normalizeName(wallName) && wall.id !== currentWallId);
}

function removeWallFiles(wall) {
  for (const item of wall.items) {
    const filePath = path.join(UPLOADS_DIR, item.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function executeWallCommand(tokens, options = {}) {
  const [command, ...args] = tokens;
  if (command !== 'wall') {
    return { handled: false };
  }

  const subcommand = args[0];
  const db = loadDB();

  if (subcommand === 'add') {
    const [name] = args.slice(1);
    if (!name) {
      console.error('Usage: wall add "<name>"');
      return { handled: true, success: false };
    }
    if (!ensureUniqueWallName(db, name)) {
      console.error(`Wall "${name}" already exists.`);
      return { handled: true, success: false };
    }
    db.walls.push({
      id: uuidv4(),
      name: name.trim(),
      icon: DEFAULT_WALL_ICON.emoji,
      iconId: DEFAULT_WALL_ICON.id,
      owner: 'Admin',
      createdAt: new Date().toISOString(),
      items: []
    });
    saveDB(db);
    console.log(`Wall "${name}" added with icon #${DEFAULT_WALL_ICON.id} ${DEFAULT_WALL_ICON.emoji}.`);
    return { handled: true, success: true };
  }

  if (subcommand === 'remove') {
    const [name] = args.slice(1);
    if (!name) {
      console.error('Usage: wall remove "<name>"');
      return { handled: true, success: false };
    }
    const index = db.walls.findIndex(wall => normalizeName(wall.name) === normalizeName(name));
    if (index === -1) {
      console.error(`Wall "${name}" not found.`);
      return { handled: true, success: false };
    }
    removeWallFiles(db.walls[index]);
    db.walls.splice(index, 1);
    saveDB(db);
    console.log(`Wall "${name}" removed successfully.`);
    return { handled: true, success: true };
  }

  if (subcommand === 'edit') {
    const [name, newName] = args.slice(1);
    if (!name || !newName) {
      console.error('Usage: wall edit "<name>" "<new name>"');
      return { handled: true, success: false };
    }
    const wall = findWallByName(db, name);
    if (!wall) {
      console.error(`Wall "${name}" not found.`);
      return { handled: true, success: false };
    }
    if (!ensureUniqueWallName(db, newName, wall.id)) {
      console.error(`Wall "${newName}" already exists.`);
      return { handled: true, success: false };
    }
    wall.name = newName.trim();
    saveDB(db);
    console.log(`Wall renamed from "${name}" to "${newName}".`);
    return { handled: true, success: true };
  }

  if (subcommand === 'icon') {
    const [name, iconId] = args.slice(1);
    if (!name || !iconId) {
      console.error('Usage: wall icon "<name>" "<icon id>"');
      return { handled: true, success: false };
    }
    const wall = findWallByName(db, name);
    if (!wall) {
      console.error(`Wall "${name}" not found.`);
      return { handled: true, success: false };
    }
    const icon = getWallIconById(iconId);
    if (!icon) {
      console.error(`Unknown icon id "${iconId}".`);
      console.log('Available icons:');
      WALL_ICONS.forEach(entry => console.log(`  #${entry.id} ${entry.emoji} ${entry.label}`));
      return { handled: true, success: false };
    }
    wall.icon = icon.emoji;
    wall.iconId = icon.id;
    saveDB(db);
    console.log(`Wall "${name}" icon updated to #${icon.id} ${icon.emoji}.`);
    return { handled: true, success: true };
  }

  if (subcommand === 'list') {
    if (db.walls.length === 0) {
      console.log('No walls found.');
      return { handled: true, success: true };
    }
    console.log('Walls:');
    db.walls.forEach(wall => {
      const icon = normalizeWallIcon(wall.iconId || wall.icon);
      console.log(`  - ${wall.name} | icon #${icon.id} ${icon.emoji} | owner ${wall.owner} | ${wall.items.length} item(s)`);
    });
    console.log('Available icons:');
    WALL_ICONS.forEach(entry => console.log(`  #${entry.id} ${entry.emoji} ${entry.label}`));
    return { handled: true, success: true };
  }

  if (subcommand === 'reset') {
    const [name] = args.slice(1);
    if (!name) {
      console.error('Usage: wall reset "<name>"');
      return { handled: true, success: false };
    }
    const wall = findWallByName(db, name);
    if (!wall) {
      console.error(`Wall "${name}" not found.`);
      return { handled: true, success: false };
    }
    const confirm = options.confirm || (async () => false);
    const approved = await confirm(`Reset wall "${wall.name}"? This removes all uploaded items. [y/N] `);
    if (!approved) {
      console.log('Reset cancelled.');
      return { handled: true, success: false };
    }
    removeWallFiles(wall);
    wall.items = [];
    saveDB(db);
    console.log(`Wall "${wall.name}" has been reset.`);
    return { handled: true, success: true };
  }

  printHelp();
  return { handled: true, success: false };
}

async function executeOperatorCommand(tokens) {
  const [command, ...args] = tokens;
  if (command !== 'op') {
    return { handled: false };
  }

  const subcommand = args[0];
  const db = loadDB();

  if (subcommand === 'add') {
    const [name] = args.slice(1);
    if (!name) {
      console.error('Usage: op add "<name>"');
      return { handled: true, success: false };
    }
    const user = findUserByName(db, name);
    if (!user) {
      console.error(`User "${name}" not found.`);
      return { handled: true, success: false };
    }
    db.operators = db.operators || [];
    if (db.operators.some(entry => normalizeName(entry) === normalizeName(user.name))) {
      console.log(`User "${user.name}" is already an operator.`);
      return { handled: true, success: true };
    }
    db.operators.push(user.name);
    saveDB(db);
    console.log(`User "${user.name}" added to operators.`);
    return { handled: true, success: true };
  }

  if (subcommand === 'remove') {
    const [name] = args.slice(1);
    if (!name) {
      console.error('Usage: op remove "<name>"');
      return { handled: true, success: false };
    }
    db.operators = db.operators || [];
    const before = db.operators.length;
    db.operators = db.operators.filter(entry => normalizeName(entry) !== normalizeName(name));
    if (db.operators.length === before) {
      console.error(`Operator "${name}" not found.`);
      return { handled: true, success: false };
    }
    saveDB(db);
    console.log(`Operator "${name}" removed.`);
    return { handled: true, success: true };
  }

  if (subcommand === 'list') {
    const operators = db.operators || [];
    if (operators.length === 0) {
      console.log('No operators configured.');
      return { handled: true, success: true };
    }
    console.log('Operators:');
    operators.forEach(name => console.log(`  - ${name}`));
    return { handled: true, success: true };
  }

  printHelp();
  return { handled: true, success: false };
}

function downloadBuffer(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'thewall-update'
    }
  }).then(async response => {
    if (!response.ok) {
      throw new Error(`Failed to download update archive: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  });
}

function applyGitHubArchiveUpdate(archivePath) {
  execFileSync('tar', ['-xzf', archivePath, '-C', REPO_ROOT, '--strip-components=1'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function updateFromGitHubArchive() {
  const archiveUrl = `${UPDATE_REPO_URL}/archive/refs/heads/${UPDATE_BRANCH}.tar.gz`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thewall-update-'));
  const archivePath = path.join(tempDir, 'thewall-update.tar.gz');

  try {
    const archiveBuffer = await downloadBuffer(archiveUrl);
    fs.writeFileSync(archivePath, archiveBuffer);
    applyGitHubArchiveUpdate(archivePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function executeUpdateCommand(tokens, options = {}) {
  if (tokens[0] !== 'update') {
    return { handled: false };
  }

  try {
    const confirm = options.confirm || (async () => false);

    const approved = await confirm('Update from GitHub and preserve uploads/data.json? [y/N] ');
    if (!approved) {
      console.log('Update cancelled.');
      return { handled: true, success: false };
    }

    await updateFromGitHubArchive();
    console.log('Update completed from GitHub.');
    return { handled: true, success: true };
  } catch (error) {
    console.error(`Update failed: ${error.message}`);
    return { handled: true, success: false };
  }
}

async function executeCommand(tokens, options = {}) {
  const friendResult = await executeFriendCommand(tokens);
  if (friendResult.handled) {
    return friendResult;
  }

  const opResult = await executeOperatorCommand(tokens);
  if (opResult.handled) {
    return opResult;
  }

  const updateResult = await executeUpdateCommand(tokens, options);
  if (updateResult.handled) {
    return updateResult;
  }

  return executeWallCommand(tokens, options);
}

function createConfirmPrompt() {
  if (!process.stdin.isTTY) {
    return async () => false;
  }

  return async message => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question(message, resolve));
    rl.close();
    return /^y(es)?$/i.test(String(answer).trim());
  };
}

async function main() {
  const args = process.argv.slice(2);
  const result = await executeCommand(args, { confirm: createConfirmPrompt() });
  if (!result.handled) {
    printHelp();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  executeCommand,
  executeFriendCommand,
  executeUpdateCommand,
  executeWallCommand,
  printHelp,
  tokenizeCommand,
  createConfirmPrompt
};

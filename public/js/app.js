/* ── State ───────────────────────────────────────────────────────────────── */
let currentUser = null;
let currentWallId = null;
let walls = [];
let wallIcons = [];
let selectedFiles = [];
let mentionUsers = [];
let allWallItems = [];
let lastUploadedItemIds = [];
let favouriteRefSet = new Set();
const customSelectMap = new Map();
const mentionState = {
  visible: false,
  activeIndex: 0,
  atIndex: -1,
  cursor: -1,
  suggestions: []
};
let activeMentionInput = null;
const mentionBoundInputs = new WeakSet();
const EVERYONE_MENTION = 'everyone';
const EVERYONE_WALL_ID = 'wall:everyone';
const reorderState = {
  sourceEl: null,
  placeholderEl: null,
  dragEnabledForId: null,
  dragArmedAt: 0,
  cloneEl: null,
  lastPlaceholderTarget: null,
  dragoverTimeout: null,
  grabOffsetX: 0,
  grabOffsetY: 0,
  autoScrollRaf: null,
  autoScrollSpeed: 0,
  lastClientX: 0,
  lastClientY: 0,
  draggingClassTimeout: null,
  dragSessionId: 0
};

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginName = document.getElementById('login-name');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const userGreeting = document.getElementById('user-greeting');
const changeNameBtn = document.getElementById('change-name-btn');
const changePasswordBtn = document.getElementById('change-password-btn');
const logoutBtn = document.getElementById('logout-btn');
const favouritesList = document.getElementById('favourites-list');
const wallsList = document.getElementById('walls-list');
const newWallBtn = document.getElementById('new-wall-btn');
const emptyState = document.getElementById('empty-state');
const wallView = document.getElementById('wall-view');
const wallTitle = document.getElementById('wall-title');
const wallMeta = document.getElementById('wall-meta');
const wallActions = document.getElementById('wall-actions');
const editAccessBtn = document.getElementById('edit-access-btn');
const changeIconBtn = document.getElementById('change-icon-btn');
const renameWallBtn = document.getElementById('rename-wall-btn');
const deleteWallBtn = document.getElementById('delete-wall-btn');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const captionInput = document.getElementById('caption-input');
const captionMentionMenu = document.getElementById('caption-mention-menu');
const searchInput = document.getElementById('search-input');
const filterMention = document.getElementById('filter-mention');
const filterPublisher = document.getElementById('filter-publisher');
const filterType = document.getElementById('filter-type');
const uploadBtn = document.getElementById('upload-btn');
const uploadCancelBtn = document.getElementById('upload-cancel-btn');
const uploadLabel = document.getElementById('upload-label');
const uploadPreview = document.getElementById('upload-preview');
const uploadProgress = document.getElementById('upload-progress');
const uploadBar = document.getElementById('upload-bar');
const uploadPercent = document.getElementById('upload-percent');
const sidebarFooter = document.getElementById('sidebar-footer');
const mediaGrid = document.getElementById('media-grid');
const lightbox = document.getElementById('lightbox');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxShareControls = document.getElementById('lightbox-share-controls');
const lightboxShareBtn = document.getElementById('lightbox-share-btn');
const lightboxContent = document.getElementById('lightbox-content');
const lightboxCaption = document.getElementById('lightbox-caption');
const shareNotification = document.getElementById('share-notification');
const everyoneNotification = document.getElementById('everyone-notification');
const lightboxShareDeleteBtn = document.getElementById('lightbox-share-delete-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalBox = document.getElementById('modal-box');
const modalMessage = document.getElementById('modal-message');
const modalInput = document.getElementById('modal-input');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');
const modalLabel1 = document.getElementById('modal-label-1');
const modalLabel2 = document.getElementById('modal-label-2');
const modalLabel3 = document.getElementById('modal-label-3');
const modalInput3Wrap = document.getElementById('modal-input3-wrap');
const modalInput2 = document.getElementById('modal-input2');
const modalInput3 = document.getElementById('modal-input3');
const modalInput3Trigger = document.getElementById('modal-input3-trigger');
const emojiOverlay = document.getElementById('emoji-overlay');
const emojiBox = document.getElementById('emoji-box');
const emojiGrid = document.getElementById('emoji-grid');
const emojiClose = document.getElementById('emoji-close');
const infoOverlay = document.getElementById('info-overlay');
const infoClose = document.getElementById('info-close');
const infoContent = document.getElementById('info-content');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const undoContainer = document.getElementById('undo-container');
const undoBtn = document.getElementById('undo-btn');
const multiSelectContainer = document.getElementById('multi-select-container');
const multiSelectPanel = document.getElementById('multi-select-panel');
const multiSelectCount = document.getElementById('multi-select-count');
const multiSelectCancel = document.getElementById('multi-select-cancel');
const multiSelectDelete = document.getElementById('multi-select-delete');

// When true, the undo control remains suppressed until a new upload resets it
let undoSuppressed = false;

const uploadState = {
  inProgress: false,
  cancelRequested: false,
  currentXhr: null,
  totalBytes: 0,
  uploadedBytes: 0
};

const multiSelectState = {
  active: false,
  selectedIds: new Set()
};

const shareState = {
  currentItem: null,
  currentCode: null,
  expiresAt: null,
  countdownInterval: null
};

let everyoneNotificationTimeout = null;

let appVersion = '';
let soundEnabled = true;

const operaInjectedSelectors = [
  '#detach-button-host',
  '#skip-button.custom-button',
  '.custom-button#skip-button',
  '.custom-button[aria-label="Skip button"]',
  'html > div[is-visible]'
];

function removeOperaInjectedOverlays() {
  for (const selector of operaInjectedSelectors) {
    document.querySelectorAll(selector).forEach(node => node.remove());
  }
}

function initOperaOverlayBlocker() {
  removeOperaInjectedOverlays();

  const observer = new MutationObserver(() => {
    removeOperaInjectedOverlays();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function applySoundStateToMedia() {
  const muted = !soundEnabled;
  document.querySelectorAll('#media-grid video, #media-grid audio, #lightbox-content video, #lightbox-content audio').forEach(media => {
    media.muted = muted;
  });
}

function updateSoundToggleUI() {
  if (!soundToggleBtn) return;
  soundToggleBtn.classList.toggle('is-muted', !soundEnabled);
  soundToggleBtn.title = soundEnabled ? 'Sound on' : 'Sound muted';
  soundToggleBtn.setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Unmute sound');
  soundToggleBtn.innerHTML = soundEnabled
    ? '<i class="fa-solid fa-volume-high"></i>'
    : '<i class="fa-solid fa-volume-xmark"></i>';
}

function initSoundToggle() {
  updateSoundToggleUI();
  applySoundStateToMedia();
  if (!soundToggleBtn) return;
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateSoundToggleUI();
    applySoundStateToMedia();
  });
}

function getCurrentWall() {
  return walls.find(wall => wall.id === currentWallId) || null;
}

function isFavouritesWall(wall = getCurrentWall()) {
  return Boolean(wall?.isFavourites);
}

function getFavouriteRefKey(wallId, itemId) {
  return `${String(wallId || '').trim()}::${String(itemId || '').trim()}`;
}

function setUploadModeForWall(wall) {
  const favouritesMode = Boolean(wall?.isFavourites);

  uploadLabel.classList.toggle('hidden', favouritesMode);
  captionInput.classList.toggle('hidden', favouritesMode);
  captionMentionMenu.classList.toggle('hidden', favouritesMode);
  uploadBtn.classList.toggle('hidden', favouritesMode);
  uploadProgress.classList.add('hidden');
  uploadPreview.classList.toggle('hidden', favouritesMode || selectedFiles.length === 0);

  if (favouritesMode) {
    resetUploadPreview();
    captionInput.value = '';
  }
}

async function loadFavouriteRefs() {
  try {
    const refs = await api('GET', '/api/favourites');
    favouriteRefSet = new Set((refs || []).map(ref => getFavouriteRefKey(ref.wallId, ref.itemId)));
  } catch {
    favouriteRefSet = new Set();
  }
}

function setFavouriteButtonState(button, isFavourite, mode = 'favourite', isEveryoneAdded = false) {
  button.dataset.mode = mode;
  button.classList.remove('is-everyone');
  button.classList.toggle('is-everyone-mode', mode === 'everyone');
  button.classList.toggle('is-everyone-added', mode === 'everyone' && isEveryoneAdded);
  button.classList.toggle('is-active', mode === 'favourite' && isFavourite);
  if (mode === 'everyone') {
    button.setAttribute('aria-label', isEveryoneAdded ? 'Added to @everyone' : 'Add to @everyone');
    button.title = isEveryoneAdded ? 'Added to @everyone' : 'Add to @everyone';
    button.innerHTML = '<i class="fa-solid fa-globe"></i>';
  } else {
    button.setAttribute('aria-label', isFavourite ? 'Remove from favourites' : 'Add to favourites');
    button.title = isFavourite ? 'Remove from favourites' : 'Add to favourites';
    button.innerHTML = `<i class="fa-${isFavourite ? 'solid' : 'regular'} fa-star"></i>`;
  }
}

function setEveryoneButtonState(button, isEveryone) {
  setFavouriteButtonState(button, false, isEveryone ? 'everyone' : 'favourite', isEveryone);
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest'
  });
}

function formatDateTimeLocalInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocalInputValue(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function closeAllCustomSelects() {
  for (const [, custom] of customSelectMap) {
    custom.field.classList.remove('is-open');
    custom.menu.classList.add('hidden');
  }
}

function renderCustomSelectOptions(selectElement) {
  const custom = customSelectMap.get(selectElement.id);
  if (!custom) return;

  custom.trigger.textContent = selectElement.options[selectElement.selectedIndex]?.textContent || '';
  custom.menu.innerHTML = '';

  Array.from(selectElement.options).forEach(option => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `custom-select-option${option.value === selectElement.value ? ' is-selected' : ''}`;
    item.textContent = option.textContent;
    item.addEventListener('click', () => {
      selectElement.value = option.value;
      renderCustomSelectOptions(selectElement);
      selectElement.dispatchEvent(new Event('change', { bubbles: true }));
      custom.field.classList.remove('is-open');
      custom.menu.classList.add('hidden');
    });
    custom.menu.appendChild(item);
  });
}

function initCustomSelect(selectElement) {
  const field = selectElement.closest('.filter-field');
  if (!field || customSelectMap.has(selectElement.id)) return;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu hidden';

  selectElement.classList.add('native-select-hidden');
  field.append(trigger, menu);

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const shouldOpen = menu.classList.contains('hidden');
    closeAllCustomSelects();
    field.classList.toggle('is-open', shouldOpen);
    menu.classList.toggle('hidden', !shouldOpen);
  });

  customSelectMap.set(selectElement.id, { field, trigger, menu });
  renderCustomSelectOptions(selectElement);
}

function initCustomFilterSelects() {
  [filterMention, filterPublisher, filterType].forEach(initCustomSelect);
}

function extractMentions(value) {
  const text = String(value || '');
  const matches = text.match(/@([\w.-]+)/g) || [];
  return Array.from(new Set(matches.map(match => match.slice(1).toLowerCase())));
}

function getMentionSuggestionUsers() {
  const baseUsers = Array.from(new Set((mentionUsers || []).map(name => String(name || '').trim()).filter(Boolean)));
  const lower = new Set(baseUsers.map(name => name.toLowerCase()));
  if (!lower.has(EVERYONE_MENTION)) {
    baseUsers.unshift(EVERYONE_MENTION);
  }
  return baseUsers;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightPlainText(value, term) {
  const text = String(value || '');
  const query = String(term || '').trim();
  if (!query) return escapeHtml(text);

  const regex = new RegExp(escapeRegExp(query), 'gi');
  let html = '';
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text))) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    html += `<span class="search-highlight">${escapeHtml(match[0])}</span>`;
    lastIndex = regex.lastIndex;
  }

  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function formatTextHtml(value, { highlightTerm = '', mentionAware = false, highlightedMention = '' } = {}) {
  const text = String(value || '');
  if (!mentionAware) return highlightPlainText(text, highlightTerm);

  const users = new Set([...mentionUsers.map(name => name.toLowerCase()), EVERYONE_MENTION]);
  const mentionToHighlight = String(highlightedMention || '').toLowerCase();
  const mentionRegex = /@([\w.-]+)/g;
  let html = '';
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text))) {
    const start = match.index;
    const end = mentionRegex.lastIndex;
    html += highlightPlainText(text.slice(lastIndex, start), highlightTerm);

    const username = match[1];
    const mentionToken = `@${username}`;
    const mentionHtml = highlightPlainText(mentionToken, highlightTerm);
    if (users.has(username.toLowerCase())) {
      const extraClass = mentionToHighlight && username.toLowerCase() === mentionToHighlight ? ' caption-mention-highlight' : '';
      html += `<span class="caption-mention${extraClass}">${mentionHtml}</span>`;
    } else {
      html += mentionHtml;
    }
    lastIndex = end;
  }

  html += highlightPlainText(text.slice(lastIndex), highlightTerm);
  return html;
}

function getItemType(mimetype) {
  const type = String(mimetype || '').toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (mimetype === 'image/gif') return 'gif';
  if (type.startsWith('image/')) return 'image';
  return 'other';
}

function syncFiltersFromItems() {
  const items = Array.from(mediaGrid.querySelectorAll('.media-item'));
  const mentionSet = new Set();
  const publisherSet = new Set();

  for (const element of items) {
    const mentions = (element.dataset.mentions || '').split(',').filter(Boolean);
    mentions.forEach(value => mentionSet.add(value));
    if (element.dataset.publisher) publisherSet.add(element.dataset.publisher);
  }

  const selectedMention = filterMention.value;
  const selectedPublisher = filterPublisher.value;

  filterMention.innerHTML = '<option value="">Ping: all</option>';
  Array.from(mentionSet).sort((a, b) => a.localeCompare(b)).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    const prettyName = mentionUsers.find(entry => entry.toLowerCase() === name) || name;
    option.textContent = `@${prettyName}`;
    filterMention.appendChild(option);
  });

  filterPublisher.innerHTML = '<option value="">Publisher: all</option>';
  Array.from(publisherSet).sort((a, b) => a.localeCompare(b)).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = mentionUsers.find(entry => entry.toLowerCase() === name.toLowerCase()) || name;
    filterPublisher.appendChild(option);
  });

  if (selectedMention && mentionSet.has(selectedMention)) filterMention.value = selectedMention;
  if (selectedPublisher && publisherSet.has(selectedPublisher)) filterPublisher.value = selectedPublisher;

  renderCustomSelectOptions(filterMention);
  renderCustomSelectOptions(filterPublisher);
}

function applyMediaFilters() {
  const term = searchInput.value.trim().toLowerCase();
  const mention = filterMention.value;
  const publisher = filterPublisher.value;
  const type = filterType.value;
  const hasActiveFilters = Boolean(term || mention || publisher || type);

  mediaGrid.classList.toggle('is-filtering', hasActiveFilters);

  if (hasActiveFilters) {
    reorderState.dragEnabledForId = null;
    if (reorderState.sourceEl) {
      finalizeDragReorder({ persist: false });
    }
  }

  const items = Array.from(mediaGrid.querySelectorAll('.media-item'));
  for (const element of items) {
    element.draggable = !hasActiveFilters;

    const searchable = element.dataset.search || '';
    const mentions = (element.dataset.mentions || '').split(',').filter(Boolean);
    const matchesTerm = !term || searchable.includes(term);
    const matchesMention = !mention || mentions.includes(mention);
    const matchesPublisher = !publisher || (element.dataset.publisher || '') === publisher;
    const matchesType = !type || (element.dataset.fileType || '') === type;
    element.classList.toggle('hidden', !(matchesTerm && matchesMention && matchesPublisher && matchesType));

    const titleElement = element.querySelector('.item-title');
    const captionElement = element.querySelector('.item-caption');
    if (titleElement) {
      titleElement.innerHTML = formatTextHtml(element.dataset.titleRaw || '', { highlightTerm: searchInput.value });
    }
    if (captionElement) {
      captionElement.innerHTML = formatTextHtml(element.dataset.captionRaw || '', { highlightTerm: searchInput.value, mentionAware: true, highlightedMention: mention });
    }
  }
}

function getDragInsertionReference(container, clientX, clientY) {
  const items = [...container.querySelectorAll('.media-item:not(.dragging)')];
  if (items.length === 0) return null;

  const getNextMediaSibling = element => {
    let next = element?.nextElementSibling || null;
    while (next && !next.classList.contains('media-item')) {
      next = next.nextElementSibling;
    }
    return next;
  };

  const containerRect = container.getBoundingClientRect();
  const styles = window.getComputedStyle(container);
  const columnCountRaw = parseInt(styles.columnCount, 10);
  const columnCount = Number.isFinite(columnCountRaw) && columnCountRaw > 0 ? columnCountRaw : 1;
  const columnGap = parseFloat(styles.columnGap) || 0;
  const totalGaps = Math.max(0, columnCount - 1) * columnGap;
  const columnWidth = Math.max(1, (containerRect.width - totalGaps) / columnCount);

  const cursorX = Math.min(Math.max(clientX, containerRect.left), containerRect.right - 1);
  const normalizedX = cursorX - containerRect.left;
  const targetColumn = Math.max(0, Math.min(columnCount - 1, Math.floor(normalizedX / (columnWidth + columnGap))));

  const withMetrics = items.map(item => {
    const box = item.getBoundingClientRect();
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    const columnIndex = Math.max(0, Math.min(columnCount - 1, Math.round((centerX - containerRect.left - columnWidth / 2) / (columnWidth + columnGap))));
    return { item, box, centerX, centerY, columnIndex };
  });

  let columnItems = withMetrics.filter(entry => entry.columnIndex === targetColumn);
  if (columnItems.length === 0) {
    const nearestColumn = withMetrics.reduce((closest, entry) => {
      const distance = Math.abs(entry.columnIndex - targetColumn);
      if (distance < closest.distance) {
        return { distance, column: entry.columnIndex };
      }
      return closest;
    }, { distance: Number.POSITIVE_INFINITY, column: 0 }).column;
    columnItems = withMetrics.filter(entry => entry.columnIndex === nearestColumn);
  }

  columnItems.sort((a, b) => a.box.top - b.box.top);

  for (const entry of columnItems) {
    if (clientY <= entry.box.top + entry.box.height / 2) {
      return entry.item;
    }
  }

  const lastInColumn = columnItems[columnItems.length - 1]?.item || null;
  if (!lastInColumn) return null;
  return getNextMediaSibling(lastInColumn) || null;
}

function placeDragPlaceholder(clientX, clientY) {
  if (!reorderState.sourceEl) return;
  const target = getDragInsertionReference(mediaGrid, clientX, clientY);
  if (target === reorderState.lastPlaceholderTarget) return;
  reorderState.lastPlaceholderTarget = target;

  if (target) {
    mediaGrid.insertBefore(reorderState.sourceEl, target);
  } else {
    mediaGrid.appendChild(reorderState.sourceEl);
  }
}

function stopDragAutoScroll() {
  if (reorderState.autoScrollRaf) {
    cancelAnimationFrame(reorderState.autoScrollRaf);
  }
  reorderState.autoScrollRaf = null;
  reorderState.autoScrollSpeed = 0;
}

function updateDragAutoScroll(clientY) {
  if (!reorderState.sourceEl) return;

  const topEdgeThreshold = 140;
  const bottomEdgeThreshold = Math.min(420, Math.max(280, Math.round(window.innerHeight * 0.35)));
  const maxStep = 18;
  let speed = 0;

  if (clientY < topEdgeThreshold) {
    const intensity = (topEdgeThreshold - clientY) / topEdgeThreshold;
    speed = -Math.max(3, intensity * maxStep);
  } else if (clientY > window.innerHeight - bottomEdgeThreshold) {
    const intensity = (clientY - (window.innerHeight - bottomEdgeThreshold)) / bottomEdgeThreshold;
    speed = Math.max(3, intensity * maxStep);
  }

  reorderState.autoScrollSpeed = speed;

  if (!reorderState.autoScrollRaf && speed !== 0) {
    const tick = () => {
      if (!reorderState.sourceEl || reorderState.autoScrollSpeed === 0) {
        stopDragAutoScroll();
        return;
      }

      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const before = window.scrollY;
      const next = Math.min(maxScrollY, Math.max(0, before + reorderState.autoScrollSpeed));
      if (next !== before) {
        window.scrollTo({ top: next, behavior: 'auto' });
        placeDragPlaceholder(reorderState.lastClientX, reorderState.lastClientY);
      }

      if (next === before) {
        stopDragAutoScroll();
        return;
      }

      reorderState.autoScrollRaf = requestAnimationFrame(tick);
    };

    reorderState.autoScrollRaf = requestAnimationFrame(tick);
  } else if (speed === 0) {
    stopDragAutoScroll();
  }
}

function finalizeDragReorder({ persist = true } = {}) {
  if (!reorderState.sourceEl) return;

  if (reorderState.draggingClassTimeout) {
    clearTimeout(reorderState.draggingClassTimeout);
    reorderState.draggingClassTimeout = null;
  }

  reorderState.sourceEl.classList.remove('dragging');

  if (reorderState.cloneEl && reorderState.cloneEl.parentNode) {
    reorderState.cloneEl.remove();
  }

  reorderState.sourceEl = null;
  reorderState.placeholderEl = null;
  reorderState.cloneEl = null;
  reorderState.dragEnabledForId = null;
  reorderState.dragArmedAt = 0;
  reorderState.lastPlaceholderTarget = null;
  reorderState.grabOffsetX = 0;
  reorderState.grabOffsetY = 0;
  reorderState.lastClientX = 0;
  reorderState.lastClientY = 0;
  stopDragAutoScroll();
  if (reorderState.dragoverTimeout) clearTimeout(reorderState.dragoverTimeout);

  if (persist) {
    persistCurrentItemOrder();
  }
}

function persistCurrentItemOrder() {
  if (!currentWallId) return;
  
  // Get the current order of visible items from the DOM
  const visibleItemIds = Array.from(mediaGrid.querySelectorAll('.media-item')).map(el => el.dataset.id).filter(Boolean);
  
  if (visibleItemIds.length === 0) return;

  // Build a Set for quick lookup
  const visibleSet = new Set(visibleItemIds);
  
  // Create reordered list: items in DOM order first, then any items not shown
  const allItemIds = [];
  
  // Add visible items in their current DOM order
  for (const id of visibleItemIds) {
    allItemIds.push(id);
  }
  
  // Add any items from allWallItems that are not in the DOM (in case any are filtered out)
  for (const item of allWallItems) {
    if (!visibleSet.has(item.id)) {
      allItemIds.push(item.id);
    }
  }

  api('PATCH', `/api/walls/${currentWallId}/items/order`, { itemIds: allItemIds }).catch(() => {
    alert('Unable to save new item order. Refresh and try again.');
  });
}

function makeItemSortable(wrapper, dragHandle) {
  wrapper.draggable = true;
  dragHandle.draggable = false;

  const armDrag = () => {
    if (mediaGrid.classList.contains('is-filtering')) {
      reorderState.dragEnabledForId = null;
      reorderState.dragArmedAt = 0;
      return;
    }
    reorderState.dragEnabledForId = wrapper.dataset.id;
    reorderState.dragArmedAt = Date.now();
  };

  dragHandle.addEventListener('pointerdown', armDrag);
  dragHandle.addEventListener('mousedown', armDrag);
  dragHandle.addEventListener('click', event => event.preventDefault());

  wrapper.addEventListener('dragstart', event => {
    if (mediaGrid.classList.contains('is-filtering')) {
      event.preventDefault();
      return;
    }

    const isArmedForWrapper = reorderState.dragEnabledForId === wrapper.dataset.id;
    const isArmFresh = Date.now() - reorderState.dragArmedAt < 1200;
    if (!isArmedForWrapper || !isArmFresh) {
      event.preventDefault();
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    reorderState.dragSessionId += 1;
    const activeSessionId = reorderState.dragSessionId;
    reorderState.sourceEl = wrapper;
    reorderState.lastClientX = event.clientX || (rect.left + rect.width / 2);
    reorderState.lastClientY = event.clientY || (rect.top + rect.height / 2);
    reorderState.placeholderEl = null;

    // Track grab offset so clone follows from exact grab point
    reorderState.grabOffsetX = event.clientX - rect.left;
    reorderState.grabOffsetY = event.clientY - rect.top;

    // Suppress default browser ghost image (we use our own clone)
    if (event.dataTransfer) {
      const empty = document.createElement('img');
      empty.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      event.dataTransfer.setDragImage(empty, 0, 0);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', wrapper.dataset.id || '');
    }

    reorderState.cloneEl = null;

    // Delay class change so browser can capture drag start, with race protection.
    reorderState.draggingClassTimeout = setTimeout(() => {
      if (reorderState.sourceEl === wrapper && reorderState.dragSessionId === activeSessionId) {
        wrapper.classList.add('dragging');
      }
      reorderState.draggingClassTimeout = null;
    }, 0);
  });

  wrapper.addEventListener('drag', event => {
    if (!event.clientX) return;
    reorderState.lastClientX = event.clientX;
    reorderState.lastClientY = event.clientY;
    updateDragAutoScroll(event.clientY);
  });

  wrapper.addEventListener('dragend', () => {
    finalizeDragReorder({ persist: true });
  });
}

document.addEventListener('click', event => {
  const isInsideCustomSelect = event.target.closest('.filter-field');
  if (!isInsideCustomSelect) {
    closeAllCustomSelects();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeAllCustomSelects();
  }
});

function showModal({ message, withInput = false, inputValue = '', confirmLabel = 'OK', inputType = 'text', label1 = '', withSecondInput = false, secondInputValue = '', secondInputType = 'text', label2 = '', withThirdInput = false, thirdInputValue = '', thirdInputType = 'text', label3 = '' }) {
  return new Promise(resolve => {
    modalMessage.textContent = message;
    modalConfirm.textContent = confirmLabel;

    modalLabel1.textContent = label1;
    modalLabel1.classList.toggle('hidden', !label1);
    modalInput.value = inputValue;
    modalInput.type = inputType;
    modalInput.classList.toggle('hidden', !withInput);

    modalLabel2.textContent = label2;
    modalLabel2.classList.toggle('hidden', !label2);
    modalInput2.value = secondInputValue;
    modalInput2.type = secondInputType;
    modalInput2.classList.toggle('hidden', !withSecondInput);

    modalLabel3.textContent = label3;
    modalLabel3.classList.toggle('hidden', !label3);
    modalInput3.value = thirdInputValue;
    modalInput3.type = thirdInputType;
    modalInput3Wrap.classList.toggle('hidden', !withThirdInput);

    modalOverlay.classList.remove('hidden');
    if (withInput) setTimeout(() => modalInput.focus(), 25);

    function cleanup(result) {
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeyDown);
      modalOverlay.classList.add('hidden');
      resolve(result);
    }

    function onConfirm() {
      if (withSecondInput || withThirdInput) {
        cleanup({
          first: modalInput.value.trim(),
          second: modalInput2.value.trim(),
          third: modalInput3.value.trim()
        });
      } else {
        cleanup(withInput ? modalInput.value.trim() : true);
      }
    }

    function onCancel() {
      cleanup(null);
    }

    function onKeyDown(event) {
      if (event.key === 'Enter') onConfirm();
      if (event.key === 'Escape') onCancel();
    }

    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeyDown);
  });
}

if (modalInput3Trigger && modalInput3) {
  modalInput3Trigger.addEventListener('click', () => {
    if (typeof modalInput3.showPicker === 'function') {
      modalInput3.showPicker();
      return;
    }
    modalInput3.focus();
    modalInput3.click();
  });
}

function showAllowedUsersPicker({ preselectedUsers = [], confirmLabel = 'Save', defaultAll = true } = {}) {
  return new Promise(resolve => {
    const users = Array.from(new Set((mentionUsers || []).map(name => String(name || '').trim()).filter(Boolean)))
      .filter(name => name.toLowerCase() !== String(currentUser || '').toLowerCase())
      .sort((a, b) => a.localeCompare(b));

    const selectedKeys = new Set((preselectedUsers || [])
      .map(name => String(name || '').trim().toLowerCase())
      .filter(key => users.some(user => user.toLowerCase() === key)));

    if (users.length > 0 && defaultAll && selectedKeys.size === 0) {
      users.forEach(name => selectedKeys.add(name.toLowerCase()));
    }

    modalMessage.textContent = 'Select users allowed to access this wall';
    modalConfirm.textContent = confirmLabel;

    modalLabel1.classList.add('hidden');
    modalLabel2.classList.add('hidden');
    modalInput.classList.add('hidden');
    modalInput2.classList.add('hidden');

    const picker = document.createElement('div');
    picker.className = 'allowed-users-picker';

    const helper = document.createElement('p');
    helper.className = 'allowed-users-helper';
    helper.textContent = 'Users to share the wall with';
    picker.appendChild(helper);

    const grid = document.createElement('div');
    grid.className = 'allowed-users-grid';

    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'allowed-user-option allowed-user-option-all';
    allButton.textContent = 'All';

    const userButtonsByKey = new Map();

    const syncAllState = () => {
      const allSelected = users.length > 0 && selectedKeys.size === users.length;
      allButton.classList.toggle('is-selected', allSelected);
    };

    allButton.addEventListener('click', () => {
      const allSelected = users.length > 0 && selectedKeys.size === users.length;
      if (allSelected) {
        selectedKeys.clear();
        userButtonsByKey.forEach(button => button.classList.remove('is-selected'));
      } else {
        users.forEach(name => selectedKeys.add(name.toLowerCase()));
        userButtonsByKey.forEach(button => button.classList.add('is-selected'));
      }
      syncAllState();
    });
    grid.appendChild(allButton);

    users.forEach(name => {
      const key = name.toLowerCase();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'allowed-user-option';
      if (selectedKeys.has(key)) button.classList.add('is-selected');
      button.textContent = name;
      userButtonsByKey.set(key, button);
      button.addEventListener('click', () => {
        if (selectedKeys.has(key)) {
          selectedKeys.delete(key);
          button.classList.remove('is-selected');
        } else {
          selectedKeys.add(key);
          button.classList.add('is-selected');
        }
        syncAllState();
      });
      grid.appendChild(button);
    });

    syncAllState();

    picker.appendChild(grid);
    modalBox.insertBefore(picker, document.getElementById('modal-btns'));

    modalOverlay.classList.remove('hidden');

    function cleanup(result) {
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeyDown);
      picker.remove();
      modalOverlay.classList.add('hidden');
      resolve(result);
    }

    function onConfirm() {
      const selectedUsers = users.filter(name => selectedKeys.has(name.toLowerCase()));
      cleanup(selectedUsers);
    }

    function onCancel() {
      cleanup(null);
    }

    function onKeyDown(event) {
      if (event.key === 'Enter') onConfirm();
      if (event.key === 'Escape') onCancel();
    }

    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeyDown);
  });
}

async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body && !(body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    options.body = body;
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Server error');
  }
  return data;
}

async function init() {
  initOperaOverlayBlocker();
  initSoundToggle();
  initCustomFilterSelects();
  try {
    await loadWallIcons();
    const me = await api('GET', '/api/me');
    if (me.authenticated) {
      currentUser = me.name;
      await showApp();
      return;
    }
  } catch {
  }

  showLogin();
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

async function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  userGreeting.textContent = `Hello, ${currentUser}`;
  await loadAppVersion();
  await loadMentionUsers();
  await loadWalls();
}

async function loadAppVersion() {
  try {
    const result = await api('GET', '/api/version');
    appVersion = String(result?.version || '').trim() || appVersion || 'unknown';
  } catch {
    appVersion = appVersion || 'unknown';
  }

  if (sidebarFooter) {
    sidebarFooter.textContent = `ArcherInk. - All Rights Reserved\nThe Wall v${appVersion}`;
  }
}

async function loadMentionUsers() {
  try {
    const users = await api('GET', '/api/users');
    mentionUsers = Array.from(new Set((users || []).map(name => String(name || '').trim()).filter(Boolean)));
  } catch {
    mentionUsers = currentUser ? [currentUser] : [];
  }
}

function hideMentionMenu() {
  mentionState.visible = false;
  mentionState.activeIndex = 0;
  mentionState.atIndex = -1;
  mentionState.cursor = -1;
  mentionState.suggestions = [];
  activeMentionInput = null;
  captionMentionMenu.classList.add('hidden');
  captionMentionMenu.innerHTML = '';
}

function getMentionContext(inputElement) {
  const cursor = inputElement.selectionStart ?? inputElement.value.length;
  const beforeCursor = inputElement.value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([\w.-]*)$/);
  if (!match) return null;
  const query = (match[1] || '').toLowerCase();
  const atIndex = cursor - query.length - 1;
  return { query, atIndex, cursor };
}

function positionMentionMenu(inputElement) {
  const inputRect = inputElement.getBoundingClientRect();
  captionMentionMenu.style.position = 'fixed';
  captionMentionMenu.style.zIndex = '2305';
  captionMentionMenu.style.left = `${inputRect.left}px`;
  captionMentionMenu.style.top = `${inputRect.bottom + 6}px`;
  captionMentionMenu.style.width = `${inputRect.width}px`;
}

function applyMention(name) {
  const inputElement = activeMentionInput;
  if (!inputElement || !mentionState.visible || mentionState.atIndex < 0) return;

  const cursor = inputElement.selectionStart ?? inputElement.value.length;
  const before = inputElement.value.slice(0, mentionState.atIndex);
  const after = inputElement.value.slice(cursor);
  const nextValue = `${before}@${name} ${after}`;
  inputElement.value = nextValue;
  const nextCursor = (before + `@${name} `).length;
  inputElement.focus();
  inputElement.setSelectionRange(nextCursor, nextCursor);
  hideMentionMenu();
}

function renderMentionMenu(inputElement = activeMentionInput) {
  if (!inputElement) {
    hideMentionMenu();
    return;
  }

  activeMentionInput = inputElement;
  const context = getMentionContext(inputElement);
  if (!context) {
    hideMentionMenu();
    return;
  }

  const suggestions = getMentionSuggestionUsers()
    .filter(name => name.toLowerCase().includes(context.query))
    .slice(0, 8);

  if (suggestions.length === 0) {
    hideMentionMenu();
    return;
  }

  mentionState.visible = true;
  mentionState.atIndex = context.atIndex;
  mentionState.cursor = context.cursor;
  mentionState.suggestions = suggestions;
  mentionState.activeIndex = Math.min(mentionState.activeIndex, suggestions.length - 1);

  captionMentionMenu.innerHTML = '';
  suggestions.forEach((name, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `mention-option${index === mentionState.activeIndex ? ' is-active' : ''}`;
    option.textContent = `@${name}`;
    option.addEventListener('mousedown', event => {
      event.preventDefault();
      applyMention(name);
    });
    captionMentionMenu.appendChild(option);
  });

  positionMentionMenu(inputElement);
  captionMentionMenu.classList.remove('hidden');
}

function bindMentionAutocomplete(inputElement) {
  if (!inputElement || mentionBoundInputs.has(inputElement)) return;
  mentionBoundInputs.add(inputElement);

  inputElement.addEventListener('input', () => {
    mentionState.activeIndex = 0;
    renderMentionMenu(inputElement);
  });

  inputElement.addEventListener('click', () => {
    renderMentionMenu(inputElement);
  });

  inputElement.addEventListener('keydown', event => {
    if (!mentionState.visible || mentionState.suggestions.length === 0 || activeMentionInput !== inputElement) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      mentionState.activeIndex = (mentionState.activeIndex + 1) % mentionState.suggestions.length;
      renderMentionMenu(inputElement);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      mentionState.activeIndex = (mentionState.activeIndex - 1 + mentionState.suggestions.length) % mentionState.suggestions.length;
      renderMentionMenu(inputElement);
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      applyMention(mentionState.suggestions[mentionState.activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      hideMentionMenu();
    }
  });

  inputElement.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== inputElement) {
        hideMentionMenu();
      }
    }, 100);
  });
}

async function loadWallIcons() {
  try {
    wallIcons = await api('GET', '/api/wall-icons');
  } catch {
    wallIcons = [
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
  }
}

function getIconById(iconId) {
  return wallIcons.find(icon => icon.id === Number(iconId)) || wallIcons[0] || { id: 1, emoji: '🧱', label: 'Brick' };
}

function getIconByEmoji(emoji) {
  return wallIcons.find(icon => icon.emoji === emoji) || getIconById(1);
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';

  try {
    const data = await api('POST', '/api/login', {
      name: loginName.value.trim(),
      password: loginPassword.value
    });
    currentUser = data.name;
    loginPassword.value = '';
    await showApp();
  } catch {
    loginError.textContent = 'Invalid username or password.';
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('POST', '/api/logout');
  currentUser = null;
  currentWallId = null;
  walls = [];
  mentionUsers = [];
  hideMentionMenu();
  resetUploadPreview();
  showLogin();
});

changeNameBtn.addEventListener('click', async () => {
  const currentPassword = await showModal({
    message: 'Enter your current password',
    withInput: true,
    inputValue: '',
    confirmLabel: 'Next',
    inputType: 'password'
  });
  if (!currentPassword) return;

  const newName = await showModal({
    message: 'Choose your new nickname',
    withInput: true,
    inputValue: currentUser,
    confirmLabel: 'Save'
  });
  if (!newName) return;

  try {
    const result = await api('PATCH', '/api/profile', { currentPassword, name: newName });
    currentUser = result.name;
    userGreeting.textContent = `Hello, ${currentUser}`;
    await loadMentionUsers();
    await loadWalls();
  } catch (error) {
    alert(error.message);
  }
});

changePasswordBtn.addEventListener('click', async () => {
  const currentPassword = await showModal({
    message: 'Enter your current password',
    withInput: true,
    inputValue: '',
    confirmLabel: 'Next',
    inputType: 'password'
  });
  if (!currentPassword) return;

  const newPassword = await showModal({
    message: 'Choose your new password',
    withInput: true,
    inputValue: '',
    confirmLabel: 'Save',
    inputType: 'password'
  });
  if (!newPassword) return;

  try {
    await api('PATCH', '/api/profile', { currentPassword, newPassword });
    alert('Password updated successfully.');
  } catch (error) {
    alert(error.message);
  }
});

async function loadWalls() {
  await loadFavouriteRefs();
  walls = await api('GET', '/api/walls');
  renderWallsList();

  if (currentWallId && getCurrentWall()) {
    await openWall(currentWallId);
    return;
  }

  if (walls.length > 0) {
    await openWall(walls[0].id);
    return;
  }

  currentWallId = null;
  showEmptyState();
}

function renderWallsList() {
  favouritesList.innerHTML = '';
  wallsList.innerHTML = '';

  const topWalls = walls.filter(wall => wall.isFavourites || wall.isEveryone);
  const sharedWalls = walls.filter(wall => !wall.isFavourites && !wall.isEveryone);

  for (const wall of [...topWalls, ...sharedWalls]) {
    const item = document.createElement('li');
    item.dataset.id = wall.id;
    if (wall.id === currentWallId) item.classList.add('active');
    const ping = Number(wall.pingCount || 0);
    const pingHtml = ping > 0 ? `<span class="wall-ping" aria-label="${ping} unread ping${ping === 1 ? '' : 's'}">${ping}</span>` : '';
    item.innerHTML = `<span class="wall-icon">${escapeHtml(wall.icon || '🧱')}</span><span class="wall-name">${escapeHtml(wall.name)}</span>${pingHtml}`;
    item.title = `${wall.name} · by ${wall.owner}`;
    item.addEventListener('click', () => openWall(wall.id));
    if (wall.isFavourites || wall.isEveryone) {
      favouritesList.appendChild(item);
    } else {
      wallsList.appendChild(item);
    }
  }
}

function showEmptyState() {
  emptyState.classList.remove('hidden');
  wallView.classList.add('hidden');
}

function syncWallMetaControls(wall) {
  const favouritesMode = Boolean(wall?.isFavourites);
  wallActions.classList.toggle('hidden', favouritesMode);
  const disabled = !wall?.canManageMeta;
  editAccessBtn.disabled = disabled;
  changeIconBtn.disabled = disabled;
  renameWallBtn.disabled = disabled;
  deleteWallBtn.disabled = disabled;
}

function updateWallTitle(wall) {
  wallTitle.textContent = `${wall.icon || '🧱'} ${wall.name}`;
  if (wall.isFavourites) {
    wallMeta.textContent = 'Personal wall · Favourite items mirror original file info';
    return;
  }

  if (wall.isEveryone) {
    wallMeta.textContent = 'Created by everyone · Everyone use can share and see';
    return;
  }

  wallMeta.textContent = `Created by ${wall.owner}${wall.canManageMeta ? ' · You can edit this wall' : ' · Only owner or operators can edit wall details'}`;
}

async function openWall(wallId) {
  currentWallId = wallId;
  const wall = getCurrentWall();
  if (!wall) return;
  wall.pingCount = 0;

  emptyState.classList.add('hidden');
  wallView.classList.remove('hidden');
  updateWallTitle(wall);
  syncWallMetaControls(wall);
  setUploadModeForWall(wall);
  mediaGrid.style.columnCount = '';
  mediaGrid.style.columnFill = '';
  renderWallsList();
  await loadItems();
}

function showEmojiPicker(initialIconId) {
  return new Promise(resolve => {
    const selectedId = Number(initialIconId) || getIconById(1).id;
    emojiGrid.innerHTML = '';

    function cleanup(result) {
      emojiClose.removeEventListener('click', onCancel);
      emojiOverlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeyDown);
      emojiOverlay.classList.add('hidden');
      resolve(result);
    }

    function onCancel() {
      cleanup(null);
    }

    function onOverlayClick(event) {
      if (!emojiBox.contains(event.target)) {
        cleanup(null);
      }
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        cleanup(null);
      }
    }

    wallIcons.forEach(icon => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `emoji-option${icon.id === selectedId ? ' is-selected' : ''}`;
      button.innerHTML = `
        <span class="emoji-mark">${icon.emoji}</span>
        <span class="emoji-id">#${icon.id}</span>
        <span class="emoji-label">${icon.label}</span>
      `;
      button.addEventListener('click', () => cleanup(icon));
      emojiGrid.appendChild(button);
    });

    emojiClose.addEventListener('click', onCancel);
    emojiOverlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeyDown);
    emojiOverlay.classList.remove('hidden');
  });
}

async function promptWallDetails(initialName = '', initialIconId = 1, { requireAllowedUsers = false } = {}) {
  const name = await showModal({
    message: 'Wall name',
    withInput: true,
    inputValue: initialName,
    confirmLabel: 'Next'
  });

  if (!name) return null;

  const icon = await showEmojiPicker(initialIconId);
  if (!icon) return null;

  if (!requireAllowedUsers) {
    return { name, icon: icon.emoji, iconId: icon.id };
  }

  const allowedUsers = await showAllowedUsersPicker({ confirmLabel: 'Create', defaultAll: true });
  if (!allowedUsers) return null;

  return { name, icon: icon.emoji, iconId: icon.id, allowedUsers };
}

newWallBtn.addEventListener('click', async () => {
  const details = await promptWallDetails('', 1, { requireAllowedUsers: true });
  if (!details) return;

  try {
    const wall = await api('POST', '/api/walls', details);
    walls.unshift(wall);
    await openWall(wall.id);
  } catch (error) {
    alert(error.message);
  }
});

renameWallBtn.addEventListener('click', async () => {
  const wall = getCurrentWall();
  if (!wall || !wall.canManageMeta) return;

  const details = await promptWallDetails(wall.name, wall.iconId || getIconByEmoji(wall.icon).id, { requireAllowedUsers: false });
  if (!details) return;

  try {
    const updated = await api('PATCH', `/api/walls/${wall.id}`, details);
    walls = walls.map(entry => entry.id === wall.id ? updated : entry);
    await openWall(wall.id);
  } catch (error) {
    alert(error.message);
  }
});

editAccessBtn.addEventListener('click', async () => {
  const wall = getCurrentWall();
  if (!wall || !wall.canManageMeta || wall.isFavourites) return;

  const preselectedUsers = (wall.allowedUsers || []).filter(name => String(name).toLowerCase() !== String(currentUser).toLowerCase());
  const allowedUsers = await showAllowedUsersPicker({ preselectedUsers, confirmLabel: 'Save access', defaultAll: false });
  if (!allowedUsers) return;

  try {
    const updated = await api('PATCH', `/api/walls/${wall.id}/access`, { allowedUsers });
    walls = walls.map(entry => entry.id === wall.id ? updated : entry);
    await openWall(wall.id);
  } catch (error) {
    alert(error.message);
  }
});

changeIconBtn.addEventListener('click', async () => {
  const wall = getCurrentWall();
  if (!wall || !wall.canManageMeta) return;

  const icon = await showEmojiPicker(wall.iconId || getIconByEmoji(wall.icon).id);

  if (!icon) return;

  try {
    const updated = await api('PATCH', `/api/walls/${wall.id}`, { name: wall.name, icon: icon.emoji, iconId: icon.id });
    walls = walls.map(entry => entry.id === wall.id ? updated : entry);
    await openWall(wall.id);
  } catch (error) {
    alert(error.message);
  }
});

deleteWallBtn.addEventListener('click', async () => {
  const wall = getCurrentWall();
  if (!wall || !wall.canManageMeta) return;

  const confirmed = await showModal({
    message: `Delete "${wall.name}"? All media will be removed.`,
    confirmLabel: 'Delete'
  });

  if (!confirmed) return;

  try {
    await api('DELETE', `/api/walls/${wall.id}`);
    walls = walls.filter(entry => entry.id !== wall.id);
    currentWallId = null;
    await loadWalls();
  } catch (error) {
    alert(error.message);
  }
});

async function loadItems() {
  mediaGrid.innerHTML = '';
  allWallItems = [];

  try {
    const items = await api('GET', `/api/walls/${currentWallId}/items`);
    allWallItems = items;
    for (const item of items) {
      appendItem(item);
    }
    syncFiltersFromItems();
    applyMediaFilters();
  } catch (error) {
    console.error(error);
  }
}

function activateMultiSelect() {
  multiSelectState.active = true;
  // Starting a multi-select suppresses undo until a new upload resets it
  undoSuppressed = true;
  // Occupy undo slot when suppression is active
  multiSelectContainer.style.bottom = '16px';
  multiSelectContainer.classList.remove('hidden');
  // hide undo while multi-select is active
  undoContainer.classList.add('hidden');
  updateMultiSelectCount();
}

function deactivateMultiSelect() {
  multiSelectState.active = false;
  multiSelectState.selectedIds.clear();
  multiSelectContainer.classList.add('hidden');
  // Do not reveal undo if it was suppressed by starting a multi-select.
  // Only show undo when not suppressed and there are undoable items.
  if (!undoSuppressed && Array.isArray(lastUploadedItemIds) && lastUploadedItemIds.length > 0) {
    undoContainer.classList.remove('hidden');
  } else {
    undoContainer.classList.add('hidden');
  }
  
  document.querySelectorAll('.media-item.selected').forEach(item => {
    item.classList.remove('selected');
  });
}

function toggleItemSelection(itemId, element) {
  if (multiSelectState.selectedIds.has(itemId)) {
    multiSelectState.selectedIds.delete(itemId);
    element.classList.remove('selected');
  } else {
    multiSelectState.selectedIds.add(itemId);
    element.classList.add('selected');
  }
  updateMultiSelectCount();
  
  // Auto-annulla se non ci sono elementi selezionati
  if (multiSelectState.selectedIds.size === 0 && multiSelectState.active) {
    deactivateMultiSelect();
  }
}

function updateMultiSelectCount() {
  const count = multiSelectState.selectedIds.size;
  multiSelectCount.textContent = `${count} selected`;
}

async function deleteMultipleItems() {
  if (multiSelectState.selectedIds.size === 0) return;
  
  const itemIds = Array.from(multiSelectState.selectedIds);
  
  const confirmed = await showModal({
    message: `Delete ${itemIds.length} item${itemIds.length > 1 ? 's' : ''}?`,
    confirmLabel: 'Delete'
  });
  
  if (!confirmed) return;
  
  for (const itemId of itemIds) {
    try {
      await fetch(`/api/walls/${currentWallId}/items/${itemId}`, { method: 'DELETE' });
      const element = mediaGrid.querySelector(`[data-id="${itemId}"]`);
      if (element) element.remove();
    } catch (error) {
      console.error(`Failed to delete item ${itemId}:`, error);
    }
  }
  
  allWallItems = allWallItems.filter(item => !itemIds.includes(item.id));
  syncFiltersFromItems();
  applyMediaFilters();
  deactivateMultiSelect();
}

function appendItem(item) {
  const favouritesWallOpen = isFavouritesWall();
  const sourceWallId = item.sourceWallId || currentWallId;
  const sourceItemId = item.sourceItemId || item.id;
  const favouriteKey = getFavouriteRefKey(sourceWallId, sourceItemId);
  const isFavourite = item.isFavourite === true || favouriteRefSet.has(favouriteKey);
  const isEveryone = item.isEveryone === true && currentWallId !== EVERYONE_WALL_ID;
  const isMirroredEveryoneItem = currentWallId === EVERYONE_WALL_ID && Boolean(item.sourceWallId && item.sourceItemId);

  const wrapper = document.createElement('div');
  wrapper.className = 'media-item';
  wrapper.dataset.id = item.id;
  wrapper.dataset.sourceWallId = sourceWallId;
  wrapper.dataset.sourceItemId = sourceItemId;
  wrapper.dataset.search = `${String(item.originalName || '').toLowerCase()} ${String(item.caption || '').toLowerCase()}`;
  wrapper.dataset.mentions = extractMentions(item.caption).join(',');
  wrapper.dataset.publisher = String(item.uploadedBy || 'Unknown');
  wrapper.dataset.fileType = getItemType(item.mimetype);
  wrapper.dataset.titleRaw = String(item.originalName || '');
  wrapper.dataset.captionRaw = String(item.caption || '');

  let media;
  const mediaThumb = document.createElement('div');
  mediaThumb.className = 'media-thumb';

  if (item.mimetype.startsWith('video/')) {
    media = document.createElement('video');
    media.src = `/uploads/${item.filename}`;
    media.muted = true;
    media.loop = true;
    media.playsInline = true;
    media.draggable = false;
      media.disablePictureInPicture = true;
      media.setAttribute('disableremoteplayback', '');
      media.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
    mediaThumb.addEventListener('mouseenter', () => {
      media.muted = !soundEnabled;
      media.play().catch(() => {});
    });
    mediaThumb.addEventListener('mouseleave', () => {
      media.pause();
      media.currentTime = 0;
      media.muted = true;
    });
  } else if (String(item.mimetype || '').startsWith('audio/')) {
    const audioPreview = document.createElement('audio');
    audioPreview.src = `/uploads/${item.filename}`;
    audioPreview.preload = 'metadata';
    audioPreview.className = 'audio-preview-source';
    audioPreview.muted = !soundEnabled;

    media = document.createElement('div');
    media.className = 'audio-tile-visual';
    media.innerHTML = '<i class="fa-solid fa-music"></i><span class="audio-tile-label">Audio</span>';
    mediaThumb.classList.add('media-thumb-audio');
    mediaThumb.appendChild(audioPreview);

    mediaThumb.addEventListener('mouseenter', () => {
      audioPreview.muted = !soundEnabled;
      audioPreview.currentTime = 0;
      audioPreview.play().catch(() => {});
    });
    mediaThumb.addEventListener('mouseleave', () => {
      audioPreview.pause();
      audioPreview.currentTime = 0;
    });
  } else {
    media = document.createElement('img');
    media.src = `/uploads/${item.filename}`;
    media.alt = item.caption || item.originalName;
    media.loading = 'lazy';
    media.draggable = false;
  }

  mediaThumb.appendChild(media);
  const thumbShield = document.createElement('div');
  thumbShield.className = 'media-thumb-shield';
  mediaThumb.appendChild(thumbShield);
  mediaThumb.addEventListener('click', () => openLightbox(item));

  const ownerBadge = document.createElement('span');
  ownerBadge.className = 'item-owner';
  ownerBadge.textContent = item.uploadedBy || 'Unknown';

  const overlay = document.createElement('div');
  overlay.className = 'item-overlay';

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'Reorder item';
  dragHandle.setAttribute('aria-label', 'Reorder item');
  dragHandle.innerHTML = '<i class="fa-solid fa-grip-lines"></i>';

  const downloadButton = document.createElement('button');
  downloadButton.className = 'download-btn';
  downloadButton.title = 'Download file';
  downloadButton.setAttribute('aria-label', 'Download file');
  downloadButton.innerHTML = '<i class="fa-solid fa-download"></i>';
  downloadButton.addEventListener('click', event => {
    event.stopPropagation();
    const link = document.createElement('a');
    link.href = `/uploads/${item.filename}`;
    link.download = item.originalName || item.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  const favouriteButton = document.createElement('button');
  favouriteButton.className = 'fav-btn';
  setFavouriteButtonState(favouriteButton, isFavourite, 'favourite', false);
  favouriteButton.addEventListener('click', event => {
    event.stopPropagation();
    if (favouriteButton.dataset.mode === 'everyone') {
      toggleEveryone(item, wrapper, favouriteButton);
      return;
    }
    toggleFavourite(item, wrapper, favouriteButton);
  });
  favouriteButton.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    const nextMode = favouriteButton.dataset.mode === 'everyone' ? 'favourite' : 'everyone';
    setFavouriteButtonState(favouriteButton, isFavourite, nextMode, Boolean(item.isEveryone));
  });

  const infoButton = document.createElement('button');
  infoButton.className = 'info-btn';
  infoButton.title = 'File info';
  infoButton.setAttribute('aria-label', 'File info');
  infoButton.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
  infoButton.addEventListener('click', event => {
    event.stopPropagation();
    showInfoModal(item);
  });

  const editButton = document.createElement('button');
  editButton.className = 'edit-btn';
  editButton.title = 'Edit item';
  editButton.setAttribute('aria-label', 'Edit item');
  editButton.innerHTML = '<i class="fa-solid fa-pen"></i>';
  editButton.addEventListener('click', event => {
    event.stopPropagation();
    editItem(item, wrapper);
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'del-btn';
  deleteButton.title = 'Delete item';
  deleteButton.setAttribute('aria-label', 'Delete item');
  deleteButton.innerHTML = '<i class="fa-solid fa-trash"></i>';
  deleteButton.addEventListener('click', event => {
    event.stopPropagation();
    deleteItem(item.id, wrapper);
  });
  deleteButton.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!multiSelectState.active) {
      activateMultiSelect();
    }
    toggleItemSelection(item.id, wrapper);
  });

  if (favouritesWallOpen) {
    overlay.append(downloadButton, favouriteButton, infoButton);
  } else {
    overlay.append(downloadButton, favouriteButton, infoButton, editButton);
    if (!isMirroredEveryoneItem) {
      overlay.append(deleteButton);
    }
  }
  wrapper.append(mediaThumb, dragHandle, ownerBadge, overlay);
  makeItemSortable(wrapper, dragHandle);

  wrapper.addEventListener('click', event => {
    if (multiSelectState.active && event.target.closest('.item-overlay') === null) {
      toggleItemSelection(item.id, wrapper);
    }
  });

  const title = document.createElement('p');
  title.className = 'item-title';
  title.innerHTML = formatTextHtml(item.originalName || '', { highlightTerm: searchInput.value });
  wrapper.appendChild(title);

  if (item.caption && item.caption.trim()) {
    const caption = document.createElement('p');
    caption.className = 'item-caption';
    caption.innerHTML = formatTextHtml(item.caption, { highlightTerm: searchInput.value, mentionAware: true, highlightedMention: filterMention.value });
    wrapper.appendChild(caption);
  }

  mediaGrid.appendChild(wrapper);
}

async function toggleFavourite(item, element, button) {
  const sourceWallId = item.sourceWallId || element.dataset.sourceWallId || currentWallId;
  const sourceItemId = item.sourceItemId || element.dataset.sourceItemId || item.id;
  const key = getFavouriteRefKey(sourceWallId, sourceItemId);
  const isFavourite = favouriteRefSet.has(key);

  try {
    if (isFavourite) {
      await api('DELETE', '/api/favourites', { wallId: sourceWallId, itemId: sourceItemId });
      favouriteRefSet.delete(key);
      if (isFavouritesWall()) {
        element.remove();
        allWallItems = allWallItems.filter(entry => {
          const entrySourceWallId = entry.sourceWallId || currentWallId;
          const entrySourceItemId = entry.sourceItemId || entry.id;
          return !(entrySourceWallId === sourceWallId && entrySourceItemId === sourceItemId);
        });
        syncFiltersFromItems();
        applyMediaFilters();
      }
    } else {
      await api('POST', '/api/favourites', { wallId: sourceWallId, itemId: sourceItemId });
      favouriteRefSet.add(key);
    }

    if (button && button.isConnected) {
      setFavouriteButtonState(button, !isFavourite, 'favourite');
    }
  } catch (error) {
    alert(error.message);
  }
}

async function toggleEveryone(item, element, button) {
  const sourceWallId = item.sourceWallId || element.dataset.sourceWallId || currentWallId;
  const sourceItemId = item.sourceItemId || element.dataset.sourceItemId || item.id;
  const key = getFavouriteRefKey(sourceWallId, sourceItemId);

  try {
    if (item.isEveryone) {
      await api('DELETE', '/api/everyone', { wallId: sourceWallId, itemId: sourceItemId });
      item.isEveryone = false;
    } else {
      await api('POST', '/api/everyone', { wallId: sourceWallId, itemId: sourceItemId });
      item.isEveryone = true;
    }

    if (button && button.isConnected) {
      setFavouriteButtonState(button, favouriteRefSet.has(key), 'everyone', item.isEveryone);
    }

    showEveryoneNotification(item.isEveryone);
  } catch (error) {
    alert(error.message);
  }
}

async function deleteItem(itemId, element) {
  if (isFavouritesWall()) return;

  const confirmed = await showModal({
    message: 'Delete this item?',
    confirmLabel: 'Delete'
  });

  if (!confirmed) return;

  try {
    await api('DELETE', `/api/walls/${currentWallId}/items/${itemId}`);
    favouriteRefSet.delete(getFavouriteRefKey(currentWallId, itemId));
    allWallItems = allWallItems.filter(item => item.id !== itemId);
    element.remove();
    syncFiltersFromItems();
    applyMediaFilters();
  } catch (error) {
    alert(error.message);
  }
}

async function editItem(item, element) {
  if (isFavouritesWall()) return;

  const result = await showModal({
    message: 'Edit item',
    withInput: true,
    inputValue: item.originalName || '',
    label1: 'Title',
    withSecondInput: true,
    secondInputValue: item.caption || '',
    label2: 'Caption',
    withThirdInput: true,
    thirdInputValue: formatDateTimeLocalInputValue(item.exifDate || item.uploadedAt),
    thirdInputType: 'datetime-local',
    label3: 'Date & time',
    confirmLabel: 'Save'
  });

  if (result === null) return;

  const newName = result.first.trim();
  const newCaption = result.second;
  const newDateTime = parseDateTimeLocalInputValue(result.third) || item.exifDate || item.uploadedAt;

  try {
    await api('PATCH', `/api/walls/${currentWallId}/items/${item.id}`, {
      originalName: newName || item.originalName,
      caption: newCaption,
      exifDate: newDateTime,
      exifSource: 'manual'
    });
    if (newName) item.originalName = newName;
    item.caption = newCaption;
    item.exifDate = newDateTime;
    item.exifSource = 'manual';

    element.dataset.search = `${String(item.originalName || '').toLowerCase()} ${String(item.caption || '').toLowerCase()}`;
    element.dataset.mentions = extractMentions(item.caption).join(',');
    element.dataset.titleRaw = String(item.originalName || '');
    element.dataset.captionRaw = String(item.caption || '');

    const existingTitle = element.querySelector('.item-title');
    if (existingTitle) {
      existingTitle.innerHTML = formatTextHtml(item.originalName || '', { highlightTerm: searchInput.value });
    }

    const existingCaption = element.querySelector('.item-caption');
    if (newCaption.trim()) {
      if (existingCaption) {
        existingCaption.innerHTML = formatTextHtml(newCaption, { highlightTerm: searchInput.value, mentionAware: true, highlightedMention: filterMention.value });
      } else {
        const caption = document.createElement('p');
        caption.className = 'item-caption';
        caption.innerHTML = formatTextHtml(newCaption, { highlightTerm: searchInput.value, mentionAware: true, highlightedMention: filterMention.value });
        element.appendChild(caption);
      }
    } else if (existingCaption) {
      existingCaption.remove();
    }

    syncFiltersFromItems();
    applyMediaFilters();
  } catch (error) {
    alert(error.message);
  }
}

function showInfoModal(item) {
  const date = formatDateTime(item.exifDate || item.uploadedAt);
  const dateSourceLabel = item.exifSource === 'exif'
    ? ' <em style="color:var(--text-muted); font-size:.85em;">(from image metadata)</em>'
    : item.exifSource === 'file'
      ? ' <em style="color:var(--text-muted); font-size:.85em;">(from file date)</em>'
      : item.exifSource === 'filename'
        ? ' <em style="color:var(--text-muted); font-size:.85em;">(from filename)</em>'
      : item.exifSource === 'manual'
        ? ' <em style="color:var(--text-muted); font-size:.85em;">(edited manually)</em>'
      : '';
  const sourceWall = item.sourceWallName ? `<div class="info-row"><span class="info-label">Source wall</span><span class="info-value">${escapeHtml(item.sourceWallName)}</span></div>` : '';

  infoContent.innerHTML = `
    <div class="info-row"><span class="info-label">Title</span><span class="info-value">${escapeHtml(item.originalName || '')}</span></div>
    ${sourceWall}
    <div class="info-row"><span class="info-label">Caption</span><span class="info-value">${item.caption && item.caption.trim() ? escapeHtml(item.caption) : '<em style="color:var(--text-muted)">None</em>'}</span></div>
    <div class="info-row"><span class="info-label">Uploaded by</span><span class="info-value">${escapeHtml(item.uploadedBy || 'Unknown')}</span></div>
    <div class="info-row"><span class="info-label">Date &amp; time</span><span class="info-value">${escapeHtml(date)}${dateSourceLabel}</span></div>
    <div class="info-row"><span class="info-label">Format</span><span class="info-value">${escapeHtml(item.mimetype || 'Unknown')}</span></div>
  `;

  infoOverlay.classList.remove('hidden');

  function cleanup() {
    infoClose.removeEventListener('click', cleanup);
    infoOverlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onKeyDown);
    infoOverlay.classList.add('hidden');
  }

  function onOverlayClick(event) {
    if (!document.getElementById('info-box').contains(event.target)) cleanup();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') cleanup();
  }

  infoClose.addEventListener('click', cleanup);
  infoOverlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onKeyDown);
}

function resetUploadPreview() {
  selectedFiles.forEach(item => URL.revokeObjectURL(item.previewUrl));
  selectedFiles = [];
  uploadPreview.innerHTML = '';
  uploadPreview.classList.add('hidden');
  fileInput.value = '';
  uploadBtn.disabled = true;
  uploadCancelBtn.classList.add('hidden');
  uploadCancelBtn.disabled = false;
}

function getFileSignature(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function appendSelectedFiles(files) {
  const existing = new Set(selectedFiles.map(entry => getFileSignature(entry.file)));
  for (const file of Array.from(files)) {
    const signature = getFileSignature(file);
    if (existing.has(signature)) continue;
    selectedFiles.push({
      file,
      displayName: file.name,
      previewUrl: URL.createObjectURL(file)
    });
    existing.add(signature);
  }
  createFileListFromSelection();
  renderUploadPreview();
}

function createFileListFromSelection() {
  const transfer = new DataTransfer();
  for (const entry of selectedFiles) {
    transfer.items.add(entry.file);
  }
  fileInput.files = transfer.files;
}

function getPreviewKindLabel(file) {
  if (file.type.startsWith('video/')) return 'Video';
  if (file.type.startsWith('audio/')) return 'Audio';
  if (file.type === 'image/gif') return 'GIF';
  if (file.type === 'image/svg+xml') return 'SVG';
  if (file.type === 'image/avif') return 'AVIF';
  if (file.type === 'image/bmp') return 'BMP';
  if (file.type === 'image/x-icon' || file.type === 'image/vnd.microsoft.icon') return 'ICO';
  return 'Image';
}

function renderUploadPreview() {
  uploadPreview.innerHTML = '';

  if (selectedFiles.length === 0) {
    uploadPreview.classList.add('hidden');
    uploadBtn.disabled = true;
    return;
  }

  uploadPreview.classList.remove('hidden');
  uploadBtn.disabled = false;

  const header = document.createElement('div');
  header.className = 'preview-header';
  header.innerHTML = `
    <div>
      <div class="preview-title"><i class="fa-regular fa-eye"></i><span>Ready to upload</span></div>
      <div class="preview-subtitle">${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected</div>
    </div>
  `;

  const grid = document.createElement('div');
  grid.className = 'preview-grid';

  selectedFiles.forEach((entry, index) => {
    const card = document.createElement('div');
    card.className = 'preview-card';

    let media;
    if (entry.file.type.startsWith('video/')) {
      media = document.createElement('video');
      media.src = entry.previewUrl;
      media.muted = true;
      media.playsInline = true;
      media.autoplay = true;
      media.loop = true;
    } else if (entry.file.type.startsWith('audio/')) {
      media = document.createElement('div');
      media.className = 'audio-preview-container';
      media.innerHTML = '<i class="fa-solid fa-music"></i><span>Audio</span>';
    } else {
      media = document.createElement('img');
      media.src = entry.previewUrl;
      media.alt = entry.displayName;
    }

    const removeButton = document.createElement('button');
    removeButton.className = 'preview-remove';
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove ${entry.displayName}`);
    removeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeButton.addEventListener('click', () => {
      URL.revokeObjectURL(entry.previewUrl);
      selectedFiles.splice(index, 1);
      createFileListFromSelection();
      renderUploadPreview();
    });

    const badge = document.createElement('span');
    badge.className = 'preview-badge';
    const kindLabel = getPreviewKindLabel(entry.file);
    const kindIcon = entry.file.type.startsWith('video/') ? 'fa-solid fa-film'
      : entry.file.type.startsWith('audio/') ? 'fa-solid fa-music'
      : entry.file.type === 'image/svg+xml' ? 'fa-solid fa-bezier-curve'
      : 'fa-regular fa-image';
    badge.innerHTML = `<i class="${kindIcon}"></i><span>${kindLabel}</span>`;

    const meta = document.createElement('div');
    meta.className = 'preview-meta';
    meta.innerHTML = `
      <div class="preview-type">${getPreviewKindLabel(entry.file)}</div>
    `;

    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.className = 'preview-rename';
    renameInput.value = entry.displayName;
    renameInput.setAttribute('aria-label', `Rename ${entry.displayName}`);
    renameInput.placeholder = 'File name';
    renameInput.addEventListener('input', event => {
      entry.displayName = event.target.value;
    });

    meta.appendChild(renameInput);
    // Make preview clickable to open full preview for files not yet uploaded
    media.style.cursor = 'pointer';
    media.addEventListener('click', () => openTempPreview(entry));

    card.append(media, removeButton, badge, meta);
    grid.appendChild(card);
  });

  uploadPreview.append(header, grid);
}

function openTempPreview(entry) {
  lightboxContent.innerHTML = '';
  lightboxShareControls.classList.add('hidden');
  lightboxShareDeleteBtn.classList.add('hidden');
  lightboxShareBtn.innerHTML = '<i class="fa-solid fa-link"></i><span>Create</span>';

  let media;
  const type = String(entry.file?.type || '');
  if (type.startsWith('video/')) {
    media = document.createElement('video');
    media.src = entry.previewUrl;
    media.controls = true;
    media.autoplay = true;
    media.muted = !soundEnabled;
  } else if (type.startsWith('audio/')) {
    media = document.createElement('audio');
    media.src = entry.previewUrl;
    media.controls = true;
    media.autoplay = true;
    media.muted = !soundEnabled;
  } else {
    media = document.createElement('img');
    media.src = entry.previewUrl;
    media.alt = entry.displayName || '';
  }

  lightboxContent.appendChild(media);
  lightboxCaption.textContent = entry.displayName || '';
  if (lightboxCaption.textContent) {
    lightboxCaption.classList.remove('hidden');
  } else {
    lightboxCaption.classList.add('hidden');
  }

  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

fileInput.addEventListener('change', () => {
  const pickedFiles = Array.from(fileInput.files);
  appendSelectedFiles(pickedFiles);
  fileInput.value = '';
});

function setUploadProgress(value) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  uploadBar.style.width = `${clamped}%`;
  uploadPercent.textContent = `${clamped}%`;
}

function cancelCurrentUpload() {
  if (!uploadState.inProgress) return;
  uploadState.cancelRequested = true;
  uploadCancelBtn.disabled = true;
  if (uploadState.currentXhr) {
    uploadState.currentXhr.abort();
  }
}

uploadCancelBtn.addEventListener('click', cancelCurrentUpload);

undoBtn.addEventListener('click', async () => {
  if (!lastUploadedItemIds || lastUploadedItemIds.length === 0) return;
  
  const itemIds = [...lastUploadedItemIds];
  lastUploadedItemIds = [];
  undoContainer.classList.add('hidden');
  
  for (const itemId of itemIds) {
    try {
      await fetch(`/api/walls/${currentWallId}/items/${itemId}`, { method: 'DELETE' });
      // Remove element from DOM immediately
      const element = mediaGrid.querySelector(`[data-id="${itemId}"]`);
      if (element) element.remove();
    } catch (error) {
      console.error(`Failed to delete item ${itemId}:`, error);
    }
  }
  
  allWallItems = allWallItems.filter(item => !itemIds.includes(item.id));
  syncFiltersFromItems();
  applyMediaFilters();
});

multiSelectCancel.addEventListener('click', event => {
  event.stopPropagation();
  deactivateMultiSelect();
});

multiSelectDelete.addEventListener('click', event => {
  event.stopPropagation();
  deleteMultipleItems();
});

uploadBtn.addEventListener('click', async () => {
  if (isFavouritesWall()) return;
  if (uploadState.inProgress) return;
  if (!currentWallId || selectedFiles.length === 0) return;

  const queue = [...selectedFiles];
  const completedSignatures = new Set();
  lastUploadedItemIds = [];

  uploadState.inProgress = true;
  uploadState.cancelRequested = false;
  uploadState.currentXhr = null;
  uploadState.totalBytes = queue.reduce((sum, entry) => sum + (entry.file?.size || 0), 0);
  uploadState.uploadedBytes = 0;

  uploadProgress.classList.remove('hidden');
  setUploadProgress(0);
  uploadBtn.disabled = true;
  uploadCancelBtn.classList.remove('hidden');
  uploadCancelBtn.disabled = false;

  for (const entry of queue) {
    if (uploadState.cancelRequested) break;

    const formData = new FormData();
    formData.append('file', entry.file);
    formData.append('caption', captionInput.value.trim());
    formData.append('displayName', entry.displayName || entry.file.name);
    formData.append('fileLastModified', String(entry.file?.lastModified || ''));
    const fileSize = entry.file?.size || 0;

    try {
      const item = await uploadWithProgress(formData, `/api/walls/${currentWallId}/items`, {
        onProgress: (loaded, total) => {
          const safeTotal = total > 0 ? total : fileSize;
          const aggregateLoaded = uploadState.uploadedBytes + Math.min(loaded, safeTotal);
          const percentage = uploadState.totalBytes > 0
            ? (aggregateLoaded / uploadState.totalBytes) * 100
            : 100;
          setUploadProgress(percentage);
        },
        setXhr: xhr => {
          uploadState.currentXhr = xhr;
        }
      });

      if (uploadState.cancelRequested) break;

      uploadState.uploadedBytes += fileSize;
      completedSignatures.add(getFileSignature(entry.file));
      allWallItems.push(item);
      lastUploadedItemIds.push(item.id);
      appendItem(item);
      syncFiltersFromItems();
      applyMediaFilters();
      const percentage = uploadState.totalBytes > 0
        ? (uploadState.uploadedBytes / uploadState.totalBytes) * 100
        : 100;
      setUploadProgress(percentage);
    } catch (error) {
      if (error && error.message === '__UPLOAD_CANCELLED__') {
        break;
      }
      alert(`Upload failed for "${entry.displayName || entry.file.name}": ${error.message}`);
    }
  }

  const wasCancelled = uploadState.cancelRequested;
  uploadState.inProgress = false;
  uploadState.cancelRequested = false;
  uploadState.currentXhr = null;
  uploadState.totalBytes = 0;
  uploadState.uploadedBytes = 0;

  uploadBtn.disabled = false;
  uploadCancelBtn.classList.add('hidden');
  uploadCancelBtn.disabled = false;

  if (wasCancelled) {
    selectedFiles = selectedFiles.filter(entry => !completedSignatures.has(getFileSignature(entry.file)));
    createFileListFromSelection();
    renderUploadPreview();
    uploadPercent.textContent = 'Cancelled';
  } else {
    captionInput.value = '';
    resetUploadPreview();
    
    if (lastUploadedItemIds.length > 0) {
      // New upload resets any suppression and reveals undo
      undoSuppressed = false;
      undoContainer.classList.remove('hidden');
    }
  }

  setTimeout(() => {
    uploadProgress.classList.add('hidden');
    setUploadProgress(0);
  }, 800);
});

function uploadWithProgress(formData, url, { onProgress = null, setXhr = null } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (typeof setXhr === 'function') {
      setXhr(xhr);
    }

    xhr.upload.addEventListener('progress', event => {
      if (!event.lengthComputable) return;
      if (typeof onProgress === 'function') {
        onProgress(event.loaded, event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid server response'));
        }
        return;
      }

      try {
        reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'));
      } catch {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('__UPLOAD_CANCELLED__')));
    xhr.send(formData);
  });
}

uploadLabel.addEventListener('dragover', event => {
  event.preventDefault();
  uploadLabel.style.borderColor = 'var(--accent)';
});

uploadLabel.addEventListener('dragleave', () => {
  uploadLabel.style.borderColor = '';
});

uploadLabel.addEventListener('drop', event => {
  event.preventDefault();
  uploadLabel.style.borderColor = '';
  const droppedFiles = Array.from(event.dataTransfer.files);
  appendSelectedFiles(droppedFiles);
  fileInput.value = '';
});

mediaGrid.addEventListener('dragover', event => {
  if (!reorderState.sourceEl) return;
  event.preventDefault();
  reorderState.lastClientX = event.clientX;
  reorderState.lastClientY = event.clientY;
  placeDragPlaceholder(event.clientX, event.clientY);
  updateDragAutoScroll(event.clientY);
});

document.addEventListener('dragover', event => {
  if (!reorderState.sourceEl) return;
  event.preventDefault();
  reorderState.lastClientX = event.clientX;
  reorderState.lastClientY = event.clientY;
  updateDragAutoScroll(event.clientY);
});

mediaGrid.addEventListener('drop', event => {
  if (!reorderState.sourceEl) return;
  event.preventDefault();
  stopDragAutoScroll();
});

document.addEventListener('drop', () => {
  if (!reorderState.sourceEl) return;
  finalizeDragReorder({ persist: true });
});

document.addEventListener('dragend', () => {
  if (!reorderState.sourceEl) return;
  finalizeDragReorder({ persist: true });
});

function openLightbox(item) {
  lightboxContent.innerHTML = '';
  lightboxShareControls.classList.remove('hidden');
  shareState.currentItem = item;
  // reset UI while we check for existing share
  if (shareState.countdownInterval) {
    clearInterval(shareState.countdownInterval);
    shareState.countdownInterval = null;
  }
  lightboxShareBtn.innerHTML = '<i class="fa-solid fa-link"></i><span>...</span>';
  lightboxShareDeleteBtn.classList.add('hidden');

  // Check backend if a share already exists for this item
  (async () => {
    try {
      const resp = await fetch(`/api/share?itemId=${encodeURIComponent(item.id)}&wallId=${encodeURIComponent(currentWallId)}`);
      if (resp.ok) {
        const data = await resp.json();
        shareState.currentCode = data.code;
        shareState.expiresAt = data.expiresAt;
        startShareCountdown();
        lightboxShareDeleteBtn.classList.remove('hidden');
      } else {
        // no existing share
        shareState.currentCode = null;
        shareState.expiresAt = null;
        lightboxShareBtn.innerHTML = '<i class="fa-solid fa-link"></i><span>Create</span>';
      }
    } catch (err) {
      console.error('Error checking existing share:', err);
      shareState.currentCode = null;
      shareState.expiresAt = null;
      lightboxShareBtn.innerHTML = '<i class="fa-solid fa-link"></i><span>Create</span>';
    }
  })();

  let media;
  if (item.mimetype.startsWith('video/')) {
    media = document.createElement('video');
    media.src = `/uploads/${item.filename}`;
    media.controls = true;
    media.autoplay = true;
    media.muted = !soundEnabled;
  } else if (String(item.mimetype || '').startsWith('audio/')) {
    media = document.createElement('audio');
    media.src = `/uploads/${item.filename}`;
    media.controls = true;
    media.autoplay = true;
    media.muted = !soundEnabled;
  } else {
    media = document.createElement('img');
    media.src = `/uploads/${item.filename}`;
    media.alt = item.caption || item.originalName;
  }

  lightboxContent.appendChild(media);
  if (item.caption && item.caption.trim()) {
    lightboxCaption.innerHTML = formatTextHtml(item.caption, { highlightTerm: searchInput.value, mentionAware: true, highlightedMention: filterMention.value });
    lightboxCaption.classList.remove('hidden');
  } else {
    lightboxCaption.textContent = '';
    lightboxCaption.classList.add('hidden');
  }
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function generateShareCode() {
  // Genera un codice casuale (es: abc123xyz)
  return Math.random().toString(36).substring(2, 10);
}

function showShareNotification(link) {
  shareNotification.textContent = `${link} copiato`;
  shareNotification.classList.remove('hidden');
  setTimeout(() => {
    shareNotification.classList.add('hidden');
  }, 3000);
}

function showEveryoneNotification(isEveryoneAdded) {
  if (!everyoneNotification) return;

  if (everyoneNotificationTimeout) {
    clearTimeout(everyoneNotificationTimeout);
    everyoneNotificationTimeout = null;
  }

  if (isEveryoneAdded) {
    everyoneNotification.innerHTML = 'File added to <button type="button" id="everyone-toast-link" class="toast-link">@everyone</button>';
  } else {
    everyoneNotification.textContent = 'File removed from @everyone';
  }

  everyoneNotification.classList.remove('hidden');
  everyoneNotification.style.cursor = isEveryoneAdded ? 'pointer' : 'default';

  const openEveryoneWall = event => {
    if (event) event.preventDefault();
    openWall(EVERYONE_WALL_ID).catch(() => {});
  };

  if (isEveryoneAdded) {
    const toastLink = document.getElementById('everyone-toast-link');
    if (toastLink) {
      toastLink.addEventListener('click', async event => {
        event.preventDefault();
        openEveryoneWall(event);
      }, { once: true });
    }
  }

  everyoneNotificationTimeout = setTimeout(() => {
    everyoneNotification.classList.add('hidden');
    everyoneNotification.textContent = '';
    everyoneNotification.style.cursor = '';
    everyoneNotificationTimeout = null;
  }, 3000);
}

function updateShareButtonCountdown() {
  if (!shareState.expiresAt) return;

  const now = Date.now();
  const remaining = Math.max(0, shareState.expiresAt - now);

  if (remaining === 0) {
    // Link scaduto
    clearInterval(shareState.countdownInterval);
    shareState.countdownInterval = null;
    // attempt to remove persisted share on backend
    if (shareState.currentCode) {
      fetch(`/api/share?code=${encodeURIComponent(shareState.currentCode)}`, { method: 'DELETE' }).catch(() => {});
    }
    shareState.currentCode = null;
    shareState.expiresAt = null;
    shareState.currentItem = null;
    lightboxShareBtn.innerHTML = '<i class="fa-solid fa-link"></i><span>Create</span>';
    lightboxShareBtn.title = 'Create temporary share link';
  } else {
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    const timeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    lightboxShareBtn.innerHTML = `<i class="fa-solid fa-link"></i><span>${timeStr}</span>`;
  }
}

function startShareCountdown() {
  if (shareState.countdownInterval) clearInterval(shareState.countdownInterval);
  shareState.countdownInterval = setInterval(updateShareButtonCountdown, 1000);
  updateShareButtonCountdown();
}

async function handleShareDelete() {
  if (!shareState.currentItem) return;
  try {
    // attempt delete by item+wall
    const resp = await fetch(`/api/share?itemId=${encodeURIComponent(shareState.currentItem.id)}&wallId=${encodeURIComponent(currentWallId)}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Delete failed');
    // reset UI
    if (shareState.countdownInterval) {
      clearInterval(shareState.countdownInterval);
      shareState.countdownInterval = null;
    }
    shareState.currentCode = null;
    shareState.expiresAt = null;
    lightboxShareBtn.innerHTML = '<i class="fa-solid fa-link"></i><span>Create</span>';
    lightboxShareDeleteBtn.classList.add('hidden');
  } catch (err) {
    console.error('Failed to delete share:', err);
    alert('Failed to delete share link');
  }
}

async function handleShareClick() {
  if (!shareState.currentItem) return;

  // Se esiste già un codice valido, ricopia il link
  if (shareState.currentCode && shareState.expiresAt && Date.now() < shareState.expiresAt) {
    const link = `${window.location.origin}/id-shared/${shareState.currentCode}`;
    try {
      await navigator.clipboard.writeText(link);
      showShareNotification(link);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      alert(`Link: ${link}`);
    }
    return;
  }

  // Richiedi il codice al backend
  try {
    const response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: shareState.currentItem.id,
        wallId: currentWallId
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create share link');
    }

    const { code, expiresAt } = await response.json();
    shareState.currentCode = code;
    shareState.expiresAt = expiresAt;

    // Copia link negli appunti
    const link = `${window.location.origin}/id-shared/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      showShareNotification(link);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      alert(`Link: ${link}`);
    }

    // Inizia countdown
    startShareCountdown();
    lightboxShareDeleteBtn.classList.remove('hidden');
  } catch (error) {
    console.error('Share error:', error);
    alert('Failed to create share link');
  }
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxContent.innerHTML = '';
  document.body.style.overflow = '';
  // Keep share countdown running in background so reopening shows remaining time
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxShareBtn.addEventListener('click', handleShareClick);
lightboxShareDeleteBtn.addEventListener('click', handleShareDelete);
lightbox.addEventListener('click', event => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !lightbox.classList.contains('hidden')) {
    closeLightbox();
  }
});

bindMentionAutocomplete(captionInput);
bindMentionAutocomplete(modalInput2);

window.addEventListener('resize', () => {
  if (mentionState.visible && activeMentionInput) {
    positionMentionMenu(activeMentionInput);
  }
});

searchInput.addEventListener('input', applyMediaFilters);
filterMention.addEventListener('change', () => {
  renderCustomSelectOptions(filterMention);
  applyMediaFilters();
});
filterPublisher.addEventListener('change', () => {
  renderCustomSelectOptions(filterPublisher);
  applyMediaFilters();
});
filterType.addEventListener('change', () => {
  renderCustomSelectOptions(filterType);
  applyMediaFilters();
});

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();

(() => {
  const firebaseConfig = {
    apiKey: "AIzaSyBGz-6yIFkrg_RpR6Lol5qLIGYrOaAWNWA",
    authDomain: "retrotool-nextgen.firebaseapp.com",
    databaseURL: "https://retrotool-nextgen-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "retrotool-nextgen",
    storageBucket: "retrotool-nextgen.firebasestorage.app",
    messagingSenderId: "727874981332",
    appId: "1:727874981332:web:a585310c96c0aa864c5a41",
    measurementId: "G-DSBNJZVHK8"
  };

  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();

  const POKEMON_NAMES = [
    'Pikachu','Charmander','Bulbasaur','Squirtle','Eevee','Jigglypuff',
    'Meowth','Psyduck','Snorlax','Gengar','Machop','Geodude',
    'Abra','Gastly','Onix','Voltorb','Cubone','Hitmonlee',
    'Magikarp','Lapras','Ditto','Vaporeon','Flareon','Jolteon',
    'Mew','Mewtwo','Cyndaquil','Totodile','Chikorita','Togepi',
    'Mareep','Wooper','Teddiursa','Houndour','Larvitar','Treecko',
    'Torchic','Mudkip','Ralts','Aron','Absol','Bagon',
    'Turtwig','Chimchar','Piplup','Shinx','Riolu','Gible',
    'Snivy','Tepig','Oshawott','Axew','Zorua','Deino'
  ];

  const DEFAULT_CATEGORIES = [
    { id: 'continue', name: 'Continue' },
    { id: 'start', name: 'Start' },
    { id: 'stop', name: 'Stop' }
  ];
  const MAX_VOTES_PER_CATEGORY = 3;
  const COLORS = [
    'rgba(44,73,127,0.5)','rgba(41,57,97,0.6)','rgba(136,151,189,0.25)',
    'rgba(44,73,127,0.4)','rgba(41,57,97,0.5)','rgba(136,151,189,0.2)',
    'rgba(44,73,127,0.35)','rgba(41,57,97,0.45)'
  ];

  let boardId = null;
  let userId = null;
  let userName = null;
  let userVotes = {};
  let userGroupVotes = {};
  let categories = [];
  let cardListeners = [];
  let groupListeners = [];

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => document.querySelectorAll(sel);

  function generateId() { return Math.random().toString(36).substring(2, 10); }
  function getRandomPokemon() { return POKEMON_NAMES[Math.floor(Math.random() * POKEMON_NAMES.length)]; }

  function toast(msg) {
    const el = qs('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function loadIdentity(bid) {
    const stored = localStorage.getItem(`retro_user_${bid}`);
    if (stored) {
      const data = JSON.parse(stored);
      userId = data.userId;
      userName = data.userName;
      return true;
    }
    return false;
  }

  function saveIdentity(bid) {
    localStorage.setItem(`retro_user_${bid}`, JSON.stringify({ userId, userName }));
  }

  function getCatColor(index) { return COLORS[index % COLORS.length]; }

  // =====================================================
  // DYNAMIC COLUMN RENDERING
  // =====================================================
  function buildColumns() {
    const container = qs('#columns-container');
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${categories.length}, 1fr)`;

    categories.forEach((cat, i) => {
      const color = getCatColor(i);
      const col = document.createElement('div');
      col.className = 'column';
      col.dataset.category = cat.id;
      col.innerHTML = `
        <div class="column-header" style="background: ${color};">
          <h2 class="editable-cat-name" data-cat-id="${cat.id}" title="Click to rename">${escapeHtml(cat.name)}</h2>
          <span class="vote-count" id="votes-${cat.id}"></span>
        </div>
        <form class="card-form" data-category="${cat.id}">
          <input type="text" placeholder="Add a card..." maxlength="280" required>
          <button type="submit" class="btn btn-add">+</button>
        </form>
        <div id="groups-${cat.id}" class="group-list"></div>
        <div class="card-list" id="cards-${cat.id}"></div>
      `;
      container.appendChild(col);
    });

    // Bind form submits
    qsa('.card-form').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        addCard(form.dataset.category, text);
        input.value = '';
      });
    });
  }

  // =====================================================
  // LISTENERS
  // =====================================================
  function detachListeners() {
    cardListeners.forEach(ref => ref.off());
    groupListeners.forEach(ref => ref.off());
    cardListeners = [];
    groupListeners = [];
  }

  function listenToMyVotes() {
    db.ref(`boards/${boardId}/votes/${userId}`).on('value', (snap) => {
      userVotes = snap.val() || {};
      categories.forEach(cat => { if (!userVotes[cat.id]) userVotes[cat.id] = {}; });
    });
    db.ref(`boards/${boardId}/groupVotes/${userId}`).on('value', (snap) => {
      userGroupVotes = snap.val() || {};
      categories.forEach(cat => { if (!userGroupVotes[cat.id]) userGroupVotes[cat.id] = {}; });
    });
  }

  function listenToCards() {
    detachListeners();
    categories.forEach(cat => {
      const cardRef = db.ref(`boards/${boardId}/cards/${cat.id}`);
      cardRef.on('value', (snap) => renderCards(cat.id, snap.val() || {}));
      cardListeners.push(cardRef);

      const groupRef = db.ref(`boards/${boardId}/groups/${cat.id}`);
      groupRef.on('value', (snap) => renderGroups(cat.id, snap.val() || {}));
      groupListeners.push(groupRef);
    });
  }

  // =====================================================
  // RENDER CARDS & GROUPS
  // =====================================================
  function renderCards(category, cardsObj) {
    const list = qs(`#cards-${category}`);
    if (!list) return;
    const myVotesInCat = userVotes[category] || {};
    const myGroupVotesInCat = userGroupVotes[category] || {};
    const votesUsed = Object.keys(myVotesInCat).length + Object.keys(myGroupVotesInCat).length;
    const votesLeft = MAX_VOTES_PER_CATEGORY - votesUsed;
    const votesEl = qs(`#votes-${category}`);
    if (votesEl) votesEl.textContent = `${votesLeft} vote${votesLeft !== 1 ? 's' : ''} left`;

    const cards = Object.entries(cardsObj).map(([id, card]) => ({ id, ...card }));
    const ungrouped = cards.filter(c => !c.groupId);
    ungrouped.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

    list.innerHTML = '';
    ungrouped.forEach(card => {
      const voted = !!myVotesInCat[card.id];
      const div = document.createElement('div');
      div.className = 'card';
      div.draggable = true;
      div.dataset.cardId = card.id;
      div.dataset.category = category;
      div.innerHTML = `
        <div class="card-text">${escapeHtml(card.text)}</div>
        <div class="card-footer">
          <span class="card-author">— ${escapeHtml(card.author)}</span>
          <div class="card-actions">
            ${card.authorId === userId ? `<button class="btn btn-delete" data-card="${card.id}" data-category="${category}" title="Delete card">&times;</button>` : ''}
            <button class="btn btn-vote ${voted ? 'voted' : ''}" data-card="${card.id}" data-category="${category}">&uarr; ${card.voteCount || 0}</button>
          </div>
        </div>
      `;
      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ cardId: card.id, category }));
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging');
      });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
      div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drop-target'); });
      div.addEventListener('dragleave', () => div.classList.remove('drop-target'));
      div.addEventListener('drop', (e) => {
        e.preventDefault(); div.classList.remove('drop-target');
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.cardId && data.cardId !== card.id && data.category === category) mergeCardsIntoGroup(category, data.cardId, card.id);
        } catch {}
      });
      list.appendChild(div);
    });
  }

  function renderGroups(category, groupsObj) {
    const container = qs(`#groups-${category}`);
    if (!container) return;
    const groups = Object.entries(groupsObj).map(([id, g]) => ({ id, ...g }));
    groups.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    container.innerHTML = '';
    const myGroupVotesInCat = userGroupVotes[category] || {};
    groups.forEach(group => {
      const voted = !!myGroupVotesInCat[group.id];
      const div = document.createElement('div');
      div.className = 'group-card';
      div.dataset.groupId = group.id;
      div.dataset.category = category;
      const childCards = (group.cards || []).map(c =>
        `<li><span>${escapeHtml(c.text)} <span class="card-author">— ${escapeHtml(c.author)}</span></span>
        <button class="btn btn-remove-from-group" data-card-id="${c.id}" data-group-id="${group.id}" data-category="${category}" title="Remove from group">&times;</button></li>`
      ).join('');
      div.innerHTML = `
        <div class="group-header">
          <span class="group-title">${escapeHtml(group.title)}</span>
          <div class="group-header-right">
            <button class="btn btn-vote ${voted ? 'voted' : ''}" data-group="${group.id}" data-category="${category}">&uarr; ${group.voteCount || 0}</button>
            <span class="group-count">${(group.cards || []).length} cards</span>
            <button class="btn btn-unmerge" data-group-id="${group.id}" data-category="${category}">↩ Unmerge All</button>
          </div>
        </div>
        <ul class="group-children">${childCards}</ul>
      `;
      div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drop-target'); });
      div.addEventListener('dragleave', () => div.classList.remove('drop-target'));
      div.addEventListener('drop', (e) => {
        e.preventDefault(); div.classList.remove('drop-target');
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.cardId && data.category === category) addCardToGroup(category, data.cardId, group.id);
        } catch {}
      });
      container.appendChild(div);
    });
  }

  // =====================================================
  // BOARD & CATEGORY MANAGEMENT
  // =====================================================
  async function createBoard() {
    const titleInput = qs('#board-title-input');
    const title = (titleInput.value || '').trim();
    if (!title) { toast('Please enter a board title'); titleInput.focus(); return; }

    // Read category inputs
    const catInputs = qsa('#category-inputs .input-category');
    const cats = [];
    catInputs.forEach(inp => {
      const name = inp.value.trim();
      if (name) cats.push({ id: generateId(), name });
    });
    if (cats.length === 0) { toast('Add at least one category'); return; }

    boardId = generateId();
    await db.ref(`boards/${boardId}/meta`).set({ createdAt: Date.now(), title, categories: cats });
    window.location.hash = boardId;
    joinBoard();
  }

  async function joinBoard() {
    if (!loadIdentity(boardId)) {
      userId = generateId();
      userName = getRandomPokemon();
      saveIdentity(boardId);
    }
    db.ref(`boards/${boardId}/users/${userId}`).set({ name: userName, joinedAt: Date.now() });

    // Load categories and title, then build UI
    const metaSnap = await db.ref(`boards/${boardId}/meta`).once('value');
    const meta = metaSnap.val() || {};
    categories = meta.categories || DEFAULT_CATEGORIES.map(c => ({ ...c }));

    qs('#board-title').textContent = meta.title || 'RetroTool';
    qs('#user-badge').textContent = userName;
    qs('#landing').classList.add('hidden');
    qs('#board-screen').classList.remove('hidden');

    buildColumns();
    listenToMyVotes();
    listenToCards();

    // Listen for category changes from other users
    db.ref(`boards/${boardId}/meta/categories`).on('value', (snap) => {
      const newCats = snap.val();
      if (newCats && JSON.stringify(newCats) !== JSON.stringify(categories)) {
        categories = newCats;
        buildColumns();
        listenToCards();
      }
    });

    // Listen for title changes
    db.ref(`boards/${boardId}/meta/title`).on('value', (snap) => {
      const t = snap.val();
      if (t) qs('#board-title').textContent = t;
    });
  }

  async function renameBoardTitle() {
    const current = qs('#board-title').textContent;
    const newTitle = prompt('Edit board title:', current);
    if (newTitle === null || !newTitle.trim() || newTitle.trim() === current) return;
    await db.ref(`boards/${boardId}/meta/title`).set(newTitle.trim());
    toast('Title updated');
  }

  async function renameCategoryName(catId) {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    const newName = prompt('Rename category:', cat.name);
    if (newName === null || !newName.trim() || newName.trim() === cat.name) return;
    cat.name = newName.trim();
    await db.ref(`boards/${boardId}/meta/categories`).set(categories);
    toast('Category renamed');
  }

  // =====================================================
  // CARD OPERATIONS
  // =====================================================
  async function addCard(category, text) {
    const cardId = generateId();
    await db.ref(`boards/${boardId}/cards/${category}/${cardId}`).set({
      text, author: userName, authorId: userId, voteCount: 0, createdAt: Date.now()
    });
  }

  async function clearCardVotes(category, cardId) {
    await db.ref(`boards/${boardId}/cards/${category}/${cardId}/voteCount`).set(0);
    const votesSnap = await db.ref(`boards/${boardId}/votes`).once('value');
    const allVotes = votesSnap.val() || {};
    const updates = {};
    Object.keys(allVotes).forEach(uid => {
      if (allVotes[uid] && allVotes[uid][category] && allVotes[uid][category][cardId])
        updates[`boards/${boardId}/votes/${uid}/${category}/${cardId}`] = null;
    });
    if (Object.keys(updates).length > 0) await db.ref().update(updates);
  }

  async function clearGroupVotes(category, groupId) {
    await db.ref(`boards/${boardId}/groups/${category}/${groupId}/voteCount`).set(0);
    const votesSnap = await db.ref(`boards/${boardId}/groupVotes`).once('value');
    const allVotes = votesSnap.val() || {};
    const updates = {};
    Object.keys(allVotes).forEach(uid => {
      if (allVotes[uid] && allVotes[uid][category] && allVotes[uid][category][groupId])
        updates[`boards/${boardId}/groupVotes/${uid}/${category}/${groupId}`] = null;
    });
    if (Object.keys(updates).length > 0) await db.ref().update(updates);
  }

  async function toggleVote(category, cardId) {
    const myVotesInCat = userVotes[category] || {};
    const myGroupVotesInCat = userGroupVotes[category] || {};
    const alreadyVoted = !!myVotesInCat[cardId];
    if (alreadyVoted) {
      await db.ref(`boards/${boardId}/votes/${userId}/${category}/${cardId}`).remove();
      await db.ref(`boards/${boardId}/cards/${category}/${cardId}/voteCount`).transaction(v => Math.max((v || 0) - 1, 0));
    } else {
      if (Object.keys(myVotesInCat).length + Object.keys(myGroupVotesInCat).length >= MAX_VOTES_PER_CATEGORY) { toast('Max 3 votes per category!'); return; }
      await db.ref(`boards/${boardId}/votes/${userId}/${category}/${cardId}`).set(true);
      await db.ref(`boards/${boardId}/cards/${category}/${cardId}/voteCount`).transaction(v => (v || 0) + 1);
    }
  }

  async function toggleGroupVote(category, groupId) {
    const myGroupVotesSnap = await db.ref(`boards/${boardId}/groupVotes/${userId}/${category}`).once('value');
    const myGroupVotes = myGroupVotesSnap.val() || {};
    const alreadyVoted = !!myGroupVotes[groupId];
    const myCardVotes = userVotes[category] || {};
    const totalUsed = Object.keys(myCardVotes).length + Object.keys(myGroupVotes).length;
    if (alreadyVoted) {
      await db.ref(`boards/${boardId}/groupVotes/${userId}/${category}/${groupId}`).remove();
      await db.ref(`boards/${boardId}/groups/${category}/${groupId}/voteCount`).transaction(v => Math.max((v || 0) - 1, 0));
    } else {
      if (totalUsed >= MAX_VOTES_PER_CATEGORY) { toast('Max 3 votes per category!'); return; }
      await db.ref(`boards/${boardId}/groupVotes/${userId}/${category}/${groupId}`).set(true);
      await db.ref(`boards/${boardId}/groups/${category}/${groupId}/voteCount`).transaction(v => (v || 0) + 1);
    }
  }

  async function deleteCard(category, cardId) {
    const cardSnap = await db.ref(`boards/${boardId}/cards/${category}/${cardId}`).once('value');
    const card = cardSnap.val();
    if (!card || card.authorId !== userId) return;
    await clearCardVotes(category, cardId);
    await db.ref(`boards/${boardId}/cards/${category}/${cardId}`).remove();
    toast('Card deleted');
  }

  // =====================================================
  // MERGE / UNMERGE
  // =====================================================
  async function mergeCardsIntoGroup(category, draggedId, targetId) {
    const snap = await db.ref(`boards/${boardId}/cards/${category}`).once('value');
    const allCards = snap.val() || {};
    const draggedCard = allCards[draggedId];
    const targetCard = allCards[targetId];
    if (!draggedCard || !targetCard) return;
    const title = prompt('Enter a group title for these cards:');
    if (!title || !title.trim()) return;
    const groupCards = [
      { id: targetId, text: targetCard.text, author: targetCard.author },
      { id: draggedId, text: draggedCard.text, author: draggedCard.author }
    ];
    const groupId = generateId();
    await db.ref(`boards/${boardId}/groups/${category}/${groupId}`).set({ title: title.trim(), cards: groupCards, voteCount: 0, createdBy: userName, createdAt: Date.now() });
    await db.ref().update({ [`boards/${boardId}/cards/${category}/${draggedId}/groupId`]: groupId, [`boards/${boardId}/cards/${category}/${targetId}/groupId`]: groupId });
    await clearCardVotes(category, draggedId);
    await clearCardVotes(category, targetId);
    toast(`Merged into "${title.trim()}"`);
  }

  async function addCardToGroup(category, cardId, groupId) {
    const cardSnap = await db.ref(`boards/${boardId}/cards/${category}/${cardId}`).once('value');
    const card = cardSnap.val();
    if (!card || card.groupId) return;
    const groupSnap = await db.ref(`boards/${boardId}/groups/${category}/${groupId}`).once('value');
    const group = groupSnap.val();
    if (!group) return;
    const existingCards = group.cards || [];
    existingCards.push({ id: cardId, text: card.text, author: card.author });
    await db.ref(`boards/${boardId}/groups/${category}/${groupId}/cards`).set(existingCards);
    await db.ref(`boards/${boardId}/cards/${category}/${cardId}/groupId`).set(groupId);
    await clearCardVotes(category, cardId);
    toast(`Added to "${group.title}"`);
  }

  async function unmergeGroup(category, groupId) {
    const groupSnap = await db.ref(`boards/${boardId}/groups/${category}/${groupId}`).once('value');
    const group = groupSnap.val();
    if (!group) return;
    await clearGroupVotes(category, groupId);
    const updates = {};
    (group.cards || []).forEach(c => { updates[`boards/${boardId}/cards/${category}/${c.id}/groupId`] = null; updates[`boards/${boardId}/cards/${category}/${c.id}/voteCount`] = 0; });
    updates[`boards/${boardId}/groups/${category}/${groupId}`] = null;
    await db.ref().update(updates);
    for (const c of (group.cards || [])) await clearCardVotes(category, c.id);
    toast(`Unmerged "${group.title}"`);
  }

  async function removeCardFromGroup(category, cardId, groupId) {
    const groupSnap = await db.ref(`boards/${boardId}/groups/${category}/${groupId}`).once('value');
    const group = groupSnap.val();
    if (!group) return;
    const remaining = (group.cards || []).filter(c => c.id !== cardId);
    await db.ref(`boards/${boardId}/cards/${category}/${cardId}/groupId`).remove();
    await db.ref(`boards/${boardId}/cards/${category}/${cardId}/voteCount`).set(0);
    await clearCardVotes(category, cardId);
    if (remaining.length <= 1) {
      await clearGroupVotes(category, groupId);
      const updates = {};
      remaining.forEach(c => { updates[`boards/${boardId}/cards/${category}/${c.id}/groupId`] = null; updates[`boards/${boardId}/cards/${category}/${c.id}/voteCount`] = 0; });
      updates[`boards/${boardId}/groups/${category}/${groupId}`] = null;
      await db.ref().update(updates);
      toast('Group dissolved');
    } else {
      await db.ref(`boards/${boardId}/groups/${category}/${groupId}/cards`).set(remaining);
      toast('Card removed from group');
    }
  }

  // =====================================================
  // EXPORT / SUMMARY
  // =====================================================
  async function exportSummary() {
    const lines = [];
    const metaSnap = await db.ref(`boards/${boardId}/meta`).once('value');
    const meta = metaSnap.val() || {};
    lines.push((meta.title || 'Retro Board').toUpperCase());
    lines.push(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
    lines.push('');
    const LINE_WIDTH = 60;
    function padVote(text, votes) {
      const voteStr = `(${votes} votes)`;
      const pad = Math.max(1, LINE_WIDTH - text.length - voteStr.length);
      return text + ' '.repeat(pad) + voteStr;
    }
    for (const cat of categories) {
      lines.push(`[${cat.name.toUpperCase()}]`);
      lines.push('');
      const groupSnap = await db.ref(`boards/${boardId}/groups/${cat.id}`).once('value');
      const groups = groupSnap.val() || {};
      const groupList = Object.entries(groups).map(([id, g]) => ({ id, ...g })).sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
      if (groupList.length > 0) {
        groupList.forEach(g => {
          lines.push(padVote(`  [Group] ${g.title}`, g.voteCount || 0));
          (g.cards || []).forEach(c => { lines.push(`    - ${c.text} -- ${c.author}`); });
          lines.push('');
        });
      }
      const cardSnap = await db.ref(`boards/${boardId}/cards/${cat.id}`).once('value');
      const cards = cardSnap.val() || {};
      const ungrouped = Object.entries(cards).map(([id, c]) => ({ id, ...c })).filter(c => !c.groupId).sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
      if (ungrouped.length > 0) {
        ungrouped.forEach(c => { lines.push(padVote(`  - ${c.text} -- ${c.author}`, c.voteCount || 0)); });
        lines.push('');
      }
      if (groupList.length === 0 && ungrouped.length === 0) { lines.push('  (no cards)'); lines.push(''); }
    }
    return lines.join('\n');
  }

  async function copyExport() {
    const text = await exportSummary();
    try { await navigator.clipboard.writeText(text); toast('Summary copied to clipboard!'); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('Summary copied!'); }
  }

  async function downloadExport() {
    const text = await exportSummary();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `retro-summary-${boardId}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast('Summary downloaded!');
  }

  // =====================================================
  // LANDING PAGE CATEGORY EDITOR
  // =====================================================
  function addCategoryRow(value) {
    const container = qs('#category-inputs');
    const row = document.createElement('div');
    row.className = 'category-input-row';
    row.innerHTML = `<input type="text" value="${escapeHtml(value || '')}" maxlength="40" class="input-category" placeholder="Category name"><button type="button" class="btn btn-remove-cat" title="Remove">✖</button>`;
    row.querySelector('.btn-remove-cat').addEventListener('click', () => {
      if (qsa('#category-inputs .category-input-row').length <= 1) { toast('Need at least one category'); return; }
      row.remove();
    });
    container.appendChild(row);
  }

  // Bind existing remove buttons on landing
  qsa('#category-inputs .btn-remove-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      if (qsa('#category-inputs .category-input-row').length <= 1) { toast('Need at least one category'); return; }
      btn.closest('.category-input-row').remove();
    });
  });

  qs('#btn-add-cat').addEventListener('click', () => addCategoryRow(''));

  // =====================================================
  // INIT & EVENTS
  // =====================================================
  function init() {
    const hash = window.location.hash.slice(1);
    if (hash) { boardId = hash; joinBoard(); }
    else { qs('#landing').classList.remove('hidden'); qs('#board-screen').classList.add('hidden'); }
  }

  qs('#btn-create').addEventListener('click', createBoard);
  qs('#btn-share').addEventListener('click', () => { navigator.clipboard.writeText(window.location.href).then(() => toast('Link copied!')); });
  qs('#btn-export-copy').addEventListener('click', copyExport);
  qs('#btn-export-download').addEventListener('click', downloadExport);

  // Delegated click handler
  document.addEventListener('click', (e) => {
    const voteBtn = e.target.closest('.btn-vote');
    if (voteBtn) {
      if (voteBtn.dataset.group) toggleGroupVote(voteBtn.dataset.category, voteBtn.dataset.group);
      else if (voteBtn.dataset.card) toggleVote(voteBtn.dataset.category, voteBtn.dataset.card);
      return;
    }
    const unmergeBtn = e.target.closest('.btn-unmerge');
    if (unmergeBtn) { unmergeGroup(unmergeBtn.dataset.category, unmergeBtn.dataset.groupId); return; }
    const removeBtn = e.target.closest('.btn-remove-from-group');
    if (removeBtn) { removeCardFromGroup(removeBtn.dataset.category, removeBtn.dataset.cardId, removeBtn.dataset.groupId); return; }
    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) { deleteCard(deleteBtn.dataset.category, deleteBtn.dataset.card); return; }
    // Editable category name
    const catName = e.target.closest('.editable-cat-name');
    if (catName) { renameCategoryName(catName.dataset.catId); return; }
    // Editable board title
    if (e.target.closest('#board-title')) { renameBoardTitle(); return; }
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && hash !== boardId) { boardId = hash; joinBoard(); }
  });

  init();
})();

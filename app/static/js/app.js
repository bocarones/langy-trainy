/* ── State ─────────────────────────────────────────────────────────── */
const state = {
  vocab: { page: 1, perPage: 50, total: 0, items: [], lang: '', cat: '', level: '', q: '', favorites: false },
  currentEntry: null,
  session: { lesson: null, words: [], index: 0, results: { right: [], wrong: [] } },
  lessons: [],
  editingLessonId: null,
  editingEntryId: null,
  backView: 'vocabulary',
};

/* ── Helpers ───────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (res.status === 204) return null;
    if (!res.ok) {
      console.error(`API error ${res.status} for ${path}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`API fetch failed for ${path}:`, err);
    return null;
  }
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.view === name);
  });
  window.scrollTo(0, 0);
}

function parseRaw(raw) {
  const slash = raw.indexOf(' / ');
  if (slash === -1) return { fr: raw, nl: '' };
  return { fr: raw.slice(0, slash).trim(), nl: raw.slice(slash + 3).trim() };
}

function parseSenses(raw) {
  const { fr, nl } = parseRaw(raw);
  const frSenses = fr.split('**').map(s => s.trim());
  const nlSenses = nl.split('**').map(s => s.trim());

  const dashIdx = frSenses[0].indexOf(' - ');
  const lemma = dashIdx !== -1 ? frSenses[0].slice(0, dashIdx).trim() : frSenses[0];
  frSenses[0] = dashIdx !== -1 ? frSenses[0].slice(dashIdx + 3).trim() : '';

  const senses = frSenses.map((frS, i) => {
    const nlS = nlSenses[i] ?? '';
    const nlParts = nlS.split(' - ').map(s => s.trim()).filter(Boolean);
    const frParts = frS.split(' - ').map(s => s.trim()).filter(Boolean);

    const rawLabel = nlParts[0] ?? '';
    const label = rawLabel ? (rawLabel.startsWith('(') ? rawLabel : `(${rawLabel})`) : null;
    const nlExamples = nlParts.slice(1);

    const examples = frParts.map((frEx, j) => ({ fr: frEx, nl: nlExamples[j] ?? '' }));

    const line = [frS, nlS].filter(Boolean).join(' - ');
    return { label, examples, line };
  });
  return { lemma, senses };
}

function truncate(str, n = 80) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── SVG icons for languages view ─────────────────────────────────── */
const SVG_GLOBE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--primary)" stroke-width="1.2"/><ellipse cx="9" cy="9" rx="3" ry="6.5" stroke="var(--primary)" stroke-width="1.2"/><path d="M2.5 9h13M3 6h12M3 12h12" stroke="var(--primary)" stroke-width="1" stroke-linecap="round"/></svg>`;
const SVG_FOLDER = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3.5C1 2.67 1.67 2 2.5 2h2.38c.32 0 .62.13.84.35L6.5 3H11.5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5V3.5z" fill="var(--primary-lt)" stroke="var(--primary-mid)" stroke-width="1"/></svg>`;
const SVG_LESSON = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="5" r="2.5" fill="var(--primary)"/><path d="M6 18v-4.5c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2V18" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round"/><path d="M13 10l3-3" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round"/><circle cx="16.5" cy="6.5" r="1" fill="var(--primary)"/></svg>`;

/* ── Sidebar ───────────────────────────────────────────────────────── */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}
document.getElementById('menu-btn').addEventListener('click', openSidebar);
document.getElementById('menu-btn-practice').addEventListener('click', openSidebar);
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    closeSidebar();
    const v = a.dataset.view;
    if (v === 'vocabulary') loadVocabulary();
    else if (v === 'languages') loadLanguages();
    else if (v === 'practice') loadPractice();
    else if (v === 'import') showView('import');
  });
});

/* ── VOCABULARY VIEW ───────────────────────────────────────────────── */
let searchTimer = null;

async function loadVocabulary(reset = true) {
  if (reset) { state.vocab.page = 1; state.vocab.items = []; }
  showView('vocabulary');

  const { lang, cat, level, q, page, perPage, favorites } = state.vocab;
  const params = new URLSearchParams({ page, per_page: perPage });
  if (q) params.set('q', q);
  if (lang) params.set('language', lang);
  if (cat) params.set('category', cat);
  if (level) params.set('level', level);
  if (favorites) params.set('favorite', '1');

  const data = await api(`/api/entries?${params}`);
  if (!data) return;
  if (reset) state.vocab.items = data.items;
  else state.vocab.items.push(...data.items);
  state.vocab.total = data.total;

  renderWordList();
  updateVocabTitle();
  if (reset) {
    await populateLangFilter();
    await populateCatFilter();
  }

  const loadMore = document.getElementById('load-more-wrap');
  loadMore.style.display = state.vocab.items.length < state.vocab.total ? 'block' : 'none';
}

function renderWordList() {
  const list = document.getElementById('word-list');
  if (!state.vocab.items.length) {
    list.innerHTML = '<div class="empty-state">No words found.</div>';
    return;
  }
  list.innerHTML = state.vocab.items.map(e => {
    const { lemma, senses } = parseSenses(e.raw);
    const senseRows = senses.map(s => {
      const frLine = s.examples.map(ex => ex.fr).join(' — ');
      const nlLine = s.examples.map(ex => ex.nl).filter(Boolean).join(' — ');
      return `<div class="example-row">
        <span class="ex-fr">${esc(frLine)}</span>
        <span class="ex-nl">${esc(nlLine)}</span>
      </div>`;
    }).join('');
    const typeGender = e.word_type
      ? (e.gender ? `${e.word_type}·${e.gender}` : e.word_type)
      : '';
    const badges = [
      typeGender   ? `<span class="badge badge-type">${esc(typeGender)}</span>` : '',
      `<span class="badge badge-level">L${e.level}</span>`,
      e.register   ? `<span class="badge badge-reg">${esc(e.register)}</span>` : '',
      e.category   ? `<span class="badge badge-cat">${esc(e.category)}</span>` : '',
      e.favorite   ? `<span class="badge badge-fav">★</span>` : '',
    ].join('');
    return `<div class="word-card-row" data-id="${e.id}">
      <div class="word-card-header">
        <span class="word-lemma-header">${esc(lemma)}</span>
        ${badges}
      </div>
      ${senseRows}
    </div>`;
  }).join('');

  list.querySelectorAll('.word-card-row').forEach(row => {
    row.addEventListener('click', () => openWordView(parseInt(row.dataset.id)));
  });
}

function updateVocabTitle() {
  let title = 'All Words';
  if (state.vocab.favorites) title = 'Favorites';
  else if (state.vocab.lang) title = state.vocab.lang;
  if (!state.vocab.favorites && state.vocab.cat && state.vocab.cat !== '__none__') title += ` › ${state.vocab.cat}`;
  document.getElementById('vocab-title').textContent = title;
}

async function populateLangFilter() {
  const sel = document.getElementById('vocab-lang-filter');
  const current = sel.value;
  const langs = await api('/api/languages');
  if (!langs) return;
  sel.innerHTML = `<option value="">All languages</option>` +
    langs.map(l => `<option value="${esc(l.language)}">${esc(l.language)} (${l.total})</option>`).join('');
  sel.value = current || state.vocab.lang;
}

async function populateCatFilter() {
  const sel = document.getElementById('vocab-cat-filter');
  const current = sel.value;
  const params = state.vocab.lang ? `?language=${encodeURIComponent(state.vocab.lang)}` : '';
  const cats = await api(`/api/categories${params}`);
  if (!cats) return;
  sel.innerHTML = `<option value="">All categories</option>` +
    cats.map(c => `<option value="${esc(c.category)}">${c.category === '__none__' ? 'Without category' : esc(c.category)} (${c.total})</option>`).join('');
  sel.value = current || state.vocab.cat;
}

document.getElementById('vocab-search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  state.vocab.q = e.target.value.trim();
  searchTimer = setTimeout(() => loadVocabulary(), 280);
});

document.getElementById('vocab-lang-filter').addEventListener('change', e => {
  state.vocab.lang = e.target.value;
  state.vocab.cat = '';
  state.vocab.favorites = false;
  document.getElementById('vocab-cat-filter').value = '';
  loadVocabulary();
});

document.getElementById('vocab-cat-filter').addEventListener('change', e => {
  state.vocab.cat = e.target.value;
  loadVocabulary();
});

document.getElementById('vocab-level-filter').addEventListener('click', e => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  document.querySelectorAll('#vocab-level-filter .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  state.vocab.level = pill.dataset.level;
  loadVocabulary();
});

document.getElementById('btn-load-more').addEventListener('click', () => {
  state.vocab.page++;
  loadVocabulary(false);
});

document.getElementById('btn-add-word').addEventListener('click', () => openWordEditModal(null));
document.getElementById('btn-practice-fab').addEventListener('click', () => loadPractice());

/* ── WORD DETAIL VIEW ─────────────────────────────────────────────── */
async function openWordView(id, backView = 'vocabulary') {
  const entry = await api(`/api/entries/${id}`);
  if (!entry) return;
  state.currentEntry = entry;
  state.backView = backView;

  const { lemma, senses } = parseSenses(entry.raw);

  // Extract tag from lemma string (e.g. "chavirer [v]" → "[v]")
  const tagMatch = lemma.match(/\s(\[.*?\].*)$/);
  const lemmaBase = tagMatch ? lemma.slice(0, lemma.length - tagMatch[0].length) : lemma;
  const lemmaTag = tagMatch ? tagMatch[1] : '';

  document.getElementById('word-lemma').innerHTML =
    esc(lemmaBase) + (lemmaTag ? ` <span class="word-lemma-tag">${esc(lemmaTag)}</span>` : '');

  document.getElementById('word-senses').innerHTML = senses.map((s, i) => {
    const frLine = s.examples.map(ex => ex.fr).join(' — ');
    const nlLine = s.examples.map(ex => ex.nl).filter(Boolean).join(' — ');
    const translationLabel = s.label ? s.label.replace(/^\(|\)$/g, '') : '';
    return `${i > 0 ? '<hr class="word-divider" />' : ''}
    <div class="detail-sense">
      <div class="example-row"><span class="ex-fr">${esc(frLine)}</span></div>
      ${translationLabel ? `<div class="sense-translation">${esc(translationLabel)}</div>` : ''}
      ${nlLine ? `<div class="example-row"><span class="ex-nl">${esc(nlLine)}</span></div>` : ''}
    </div>`;
  }).join('');

  document.getElementById('word-nav-title').textContent = entry.lemma;

  const fav = document.getElementById('btn-word-fav');
  fav.textContent = entry.favorite ? '★' : '☆';
  fav.style.color = entry.favorite ? 'var(--accent)' : '';

  const pct = entry.times_tested
    ? Math.round((entry.times_correct / entry.times_tested) * 100)
    : null;
  const statClass = pct !== null && pct >= 60 ? 'badge-stat good' : 'badge-stat';
  const typeGender = entry.word_type
    ? (entry.gender ? `${entry.word_type}·${entry.gender}` : entry.word_type)
    : '';
  const meta = [
    typeGender     ? `<span class="badge badge-type">${esc(typeGender)}</span>` : '',
    entry.register ? `<span class="badge badge-reg">${esc(entry.register)}</span>` : '',
    `<span class="badge badge-level">Level ${entry.level}</span>`,
    entry.language ? `<span class="badge badge-cat">${esc(entry.language)}</span>` : '',
    entry.category ? `<span class="badge badge-cat">${esc(entry.category)}</span>` : '',
    entry.times_tested
      ? `<span class="badge ${statClass}">✓ ${entry.times_correct}/${entry.times_tested} · ${pct}%</span>`
      : `<span class="badge badge-stat">not yet tested</span>`,
  ].join('');
  document.getElementById('word-meta').innerHTML = meta;

  showView('word');
}

document.getElementById('btn-word-back').addEventListener('click', () => {
  if (state.backView === 'vocabulary') loadVocabulary(false);
  else showView(state.backView);
});

document.getElementById('btn-word-fav').addEventListener('click', async () => {
  const e = state.currentEntry;
  const updated = await api(`/api/entries/${e.id}`, {
    method: 'PUT',
    body: JSON.stringify({ favorite: e.favorite ? 0 : 1 }),
  });
  if (!updated) return;
  state.currentEntry = updated;
  const fav = document.getElementById('btn-word-fav');
  fav.textContent = updated.favorite ? '★' : '☆';
  fav.style.color = updated.favorite ? 'var(--accent)' : '';
  // refresh badge in word list
  const row = document.querySelector(`[data-id="${e.id}"]`);
  if (row) {
    const header = row.querySelector('.word-card-header');
    const favBadge = header && header.querySelector('.badge-fav');
    if (updated.favorite && header && !favBadge) {
      header.insertAdjacentHTML('beforeend', '<span class="badge badge-fav">★</span>');
    }
    if (!updated.favorite && favBadge) favBadge.remove();
  }
});

document.getElementById('btn-word-delete').addEventListener('click', async () => {
  if (!confirm(`Delete "${state.currentEntry.lemma}"?`)) return;
  await api(`/api/entries/${state.currentEntry.id}`, { method: 'DELETE' });
  state.vocab.items = state.vocab.items.filter(i => i.id !== state.currentEntry.id);
  renderWordList();
  showView('vocabulary');
});

document.getElementById('btn-word-edit').addEventListener('click', () => {
  openWordEditModal(state.currentEntry);
});

document.getElementById('btn-word-level').addEventListener('click', async () => {
  const e = state.currentEntry;
  const newLevel = e.level >= 5 ? 1 : e.level + 1;
  const updated = await api(`/api/entries/${e.id}`, {
    method: 'PUT',
    body: JSON.stringify({ level: newLevel }),
  });
  if (!updated) return;
  state.currentEntry = updated;
  const lvlBadge = document.getElementById('word-meta').querySelector('.badge-level');
  if (lvlBadge) lvlBadge.textContent = `Level ${updated.level}`;
});

/* ── WORD EDIT MODAL ──────────────────────────────────────────────── */
function renderEditSenses(senses) {
  const container = document.getElementById('edit-senses');
  container.innerHTML = '';
  senses.forEach((s, si) => renderEditSense(container, s, si));
}

function renderEditSense(container, s, si) {
  const div = document.createElement('div');
  div.className = 'edit-sense';
  div.dataset.si = si;

  const labelVal = s.label ? s.label.replace(/^\(|\)$/g, '') : '';
  const frVal = s.examples.map(e => e.fr).join(' - ');
  const nlVal = s.examples.map(e => e.nl).filter(Boolean).join(' - ');

  div.innerHTML = `
    <div class="edit-sense-header">
      <span class="edit-sense-num">Sense ${si + 1}</span>
      <button type="button" class="btn-remove-sense" title="Delete sense">✕</button>
    </div>
    <label class="edit-sense-field">Translation
      <input class="sense-translation" value="${esc(labelVal)}" placeholder="e.g. kapseizen, omslaan" />
    </label>
    <div class="edit-sense-cols">
      <label>FR examples <span class="field-hint">(separate with  -  )</span>
        <input class="sense-fr" value="${esc(frVal)}" placeholder="le bateau a chaviré - …" />
      </label>
      <label>NL examples <span class="field-hint">(separate with  -  )</span>
        <input class="sense-nl" value="${esc(nlVal)}" placeholder="de boot is gekapseisd - …" />
      </label>
    </div>`;

  div.querySelector('.btn-remove-sense').addEventListener('click', () => div.remove());
  container.appendChild(div);
}

function addEditSense() {
  const container = document.getElementById('edit-senses');
  const si = container.querySelectorAll('.edit-sense').length;
  renderEditSense(container, { label: null, examples: [{ fr: '', nl: '' }] }, si);
}

function collectRaw(form) {
  const lemma    = form.elements['lemma'].value.trim();
  const wtype    = form.elements['word_type'].value;
  const gender   = form.elements['gender'].value;
  const register = form.elements['register'].value.trim();

  const tagMap = { noun: gender || 'm', verb: 'v', adjective: 'adj', adverb: 'adv', expression: 'expr' };
  const tag = tagMap[wtype] ?? wtype;
  const regSuffix = register ? ` (${register})` : '';
  const lemmaTag = tag ? `${lemma} [${tag}]${regSuffix}` : lemma;

  const senseDivs = document.querySelectorAll('#edit-senses .edit-sense');
  const frParts = [], nlParts = [];

  senseDivs.forEach((div, i) => {
    const translation = div.querySelector('.sense-translation').value.trim();
    const frExamples  = div.querySelector('.sense-fr').value.trim();
    const nlExamples  = div.querySelector('.sense-nl').value.trim();

    const frSense = i === 0
      ? [lemmaTag, frExamples].filter(Boolean).join(' - ')
      : frExamples;

    const nlLabel = translation ? `(${translation.replace(/^\(|\)$/g, '')})` : '';
    const nlSense = [nlLabel, nlExamples].filter(Boolean).join(' - ');

    frParts.push(frSense);
    nlParts.push(nlSense);
  });

  return frParts.join(' ** ') + ' / ' + nlParts.join(' ** ');
}

function openWordEditModal(entry) {
  state.editingEntryId = entry ? entry.id : null;
  const form = document.getElementById('form-word-edit');
  document.getElementById('modal-word-title').textContent = entry ? 'Edit Word' : 'Add Word';

  const fields = ['lemma', 'word_type', 'gender', 'register', 'language', 'category', 'level'];
  fields.forEach(f => {
    const el = form.elements[f];
    if (el) el.value = entry ? (entry[f] ?? '') : (f === 'language' ? 'Frans' : f === 'level' ? '1' : '');
  });

  if (entry) {
    const { senses } = parseSenses(entry.raw);
    renderEditSenses(senses);
  } else {
    renderEditSenses([{ label: null, examples: [{ fr: '', nl: '' }] }]);
  }

  document.getElementById('modal-word-edit').style.display = 'flex';
}

function closeWordEditModal() {
  document.getElementById('modal-word-edit').style.display = 'none';
}

document.getElementById('btn-modal-word-close').addEventListener('click', closeWordEditModal);
document.getElementById('btn-modal-word-cancel').addEventListener('click', closeWordEditModal);
document.getElementById('btn-add-sense').addEventListener('click', addEditSense);

document.getElementById('form-word-edit').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const raw = collectRaw(form);
  const body = { raw };
  ['lemma','word_type','gender','register','language','category','level'].forEach(f => {
    body[f] = form.elements[f].value || null;
  });
  body.level = parseInt(body.level) || 1;

  let saved;
  if (state.editingEntryId) {
    saved = await api(`/api/entries/${state.editingEntryId}`, { method: 'PUT', body: JSON.stringify(body) });
    if (!saved) return;
    const idx = state.vocab.items.findIndex(i => i.id === state.editingEntryId);
    if (idx !== -1) state.vocab.items[idx] = saved;
    renderWordList();
    state.currentEntry = saved;
    closeWordEditModal();
    openWordView(saved.id, state.backView);
  } else {
    saved = await api('/api/entries', { method: 'POST', body: JSON.stringify(body) });
    if (!saved) return;
    closeWordEditModal();
    await loadVocabulary();
  }
});

/* ── LANGUAGES VIEW ───────────────────────────────────────────────── */
async function loadLanguages() {
  showView('languages');

  const [langs, allEntries, favs] = await Promise.all([
    api('/api/languages'),
    api('/api/entries?per_page=1'),
    api('/api/entries?favorite=1&per_page=1'),
  ]);

  if (allEntries) document.getElementById('count-all').textContent = allEntries.total;
  if (favs) document.getElementById('count-favorites').textContent = favs.total;

  if (!langs) return;
  const langList = document.getElementById('lang-list');
  const langRows = await Promise.all(langs.map(async lang => {
    const cats = await api(`/api/categories?language=${encodeURIComponent(lang.language)}`);
    const catRows = (cats || []).map(c => {
      const label = c.category === '__none__' ? 'Without Category' : esc(c.category);
      return `<div class="lang-row lang-sub clickable" data-lang="${esc(lang.language)}" data-cat="${esc(c.category)}">
        <span class="lang-icon-svg">${SVG_FOLDER}</span>
        <span class="lang-name">${label}</span>
        <span class="lang-count">${c.total}</span>
      </div>`;
    }).join('');

    return `<div class="lang-row clickable" data-lang="${esc(lang.language)}" data-cat="">
        <span class="lang-icon-svg">${SVG_GLOBE}</span>
        <span class="lang-name" style="font-weight:600">${esc(lang.language)}</span>
        <span class="lang-count">${lang.total}</span>
      </div>${catRows}`;
  }));
  langList.innerHTML = langRows.join('');

  document.getElementById('collections-list').querySelectorAll('.clickable').forEach(row => {
    row.addEventListener('click', () => {
      const filter = row.dataset.filter;
      state.vocab.lang = '';
      state.vocab.cat = '';
      state.vocab.favorites = filter === 'favorites';
      loadVocabulary();
    });
  });

  langList.querySelectorAll('.clickable').forEach(row => {
    row.addEventListener('click', () => {
      state.vocab.lang = row.dataset.lang || '';
      state.vocab.cat  = row.dataset.cat  || '';
      state.vocab.favorites = false;
      loadVocabulary();
    });
  });
}

document.getElementById('btn-lang-back').addEventListener('click', () => loadVocabulary(false));

/* ── PRACTICE VIEW ────────────────────────────────────────────────── */
async function loadPractice() {
  showView('practice');
  const lessons = await api('/api/lessons');
  if (!lessons) return;
  state.lessons = lessons;

  const list = document.getElementById('lesson-list');
  if (!lessons.length) {
    list.innerHTML = '<div class="empty-state">No lessons yet. Create one below.</div>';
    return;
  }
  list.innerHTML = lessons.map(l => {
    const levelStr = l.levels.split(',').join('·');
    const desc = `${l.language || 'All'} · L${levelStr} · ${l.amount || 'All'} words · ${l.direction}`;
    return `<div class="lesson-row" data-id="${l.id}">
      <div class="lesson-icon">${SVG_LESSON}</div>
      <div class="lesson-info">
        <div class="lesson-name">${esc(l.name)}</div>
        <div class="lesson-desc">${esc(desc)}</div>
      </div>
      <div class="lesson-actions">
        <button class="lesson-btn btn-lesson-edit" data-id="${l.id}" title="Edit">✏</button>
        <button class="lesson-btn btn-lesson-delete" data-id="${l.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.lesson-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.lesson-actions')) return;
      startLesson(parseInt(row.dataset.id));
    });
  });
  list.querySelectorAll('.btn-lesson-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const lesson = state.lessons.find(l => l.id === parseInt(btn.dataset.id));
      openLessonModal(lesson);
    });
  });
  list.querySelectorAll('.btn-lesson-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this lesson?')) return;
      await api(`/api/lessons/${btn.dataset.id}`, { method: 'DELETE' });
      loadPractice();
    });
  });
}

/* ── LESSON MODAL ─────────────────────────────────────────────────── */
async function openLessonModal(lesson = null) {
  state.editingLessonId = lesson ? lesson.id : null;
  document.getElementById('modal-lesson-title').textContent = lesson ? 'Edit Lesson' : 'New Lesson';

  const form = document.getElementById('form-lesson');
  form.elements['name'].value = lesson ? lesson.name : '';
  form.elements['repeat_all'].checked = lesson ? !!lesson.repeat_all : false;

  const langSel = document.getElementById('lesson-lang-select');
  const langs = await api('/api/languages');
  langSel.innerHTML = `<option value="">All languages</option>` +
    (langs || []).map(l => `<option value="${esc(l.language)}">${esc(l.language)}</option>`).join('');
  langSel.value = lesson ? (lesson.language || '') : '';

  await updateLessonCats(langSel.value, lesson ? lesson.category : null);

  const activeLevels = lesson ? lesson.levels.split(',') : ['1','2','3','4','5'];
  document.querySelectorAll('#lesson-levels .pill').forEach(p => {
    const v = p.dataset.val;
    p.classList.toggle('active', v === 'A' ? activeLevels.length === 5 : activeLevels.includes(v));
  });

  const amount = lesson ? String(lesson.amount) : '20';
  document.querySelectorAll('#lesson-amount .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.val === amount);
  });

  const dir = lesson ? lesson.direction : 'vocabulary';
  document.querySelectorAll('#lesson-direction .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.val === dir);
  });

  document.getElementById('modal-lesson').style.display = 'flex';
}

async function updateLessonCats(lang, selectedCat) {
  const catSel = document.getElementById('lesson-cat-select');
  const params = lang ? `?language=${encodeURIComponent(lang)}` : '';
  const cats = await api(`/api/categories${params}`);
  catSel.innerHTML = `<option value="">All categories</option>` +
    (cats || []).filter(c => c.category !== '__none__')
        .map(c => `<option value="${esc(c.category)}">${esc(c.category)}</option>`).join('');
  catSel.value = selectedCat || '';
}

document.getElementById('lesson-lang-select').addEventListener('change', e => {
  updateLessonCats(e.target.value, null);
});

['lesson-levels','lesson-amount','lesson-direction'].forEach(groupId => {
  document.getElementById(groupId).addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    if (groupId === 'lesson-levels') {
      if (pill.dataset.val === 'A') {
        const allActive = !pill.classList.contains('active');
        document.querySelectorAll('#lesson-levels .pill').forEach(p => p.classList.toggle('active', allActive));
      } else {
        pill.classList.toggle('active');
        const allNums = document.querySelectorAll('#lesson-levels .pill:not([data-val="A"])');
        const allActive = [...allNums].every(p => p.classList.contains('active'));
        document.querySelector('#lesson-levels .pill[data-val="A"]').classList.toggle('active', allActive);
      }
    } else {
      document.querySelectorAll(`#${groupId} .pill`).forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    }
  });
});

function closeLessonModal() {
  document.getElementById('modal-lesson').style.display = 'none';
}
document.getElementById('btn-modal-lesson-close').addEventListener('click', closeLessonModal);
document.getElementById('btn-modal-lesson-cancel').addEventListener('click', closeLessonModal);
document.getElementById('btn-new-lesson').addEventListener('click', () => openLessonModal(null));

document.getElementById('form-lesson').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;

  const levels = [...document.querySelectorAll('#lesson-levels .pill.active')]
    .map(p => p.dataset.val).filter(v => v !== 'A').join(',') || '1,2,3,4,5';
  const amount = document.querySelector('#lesson-amount .pill.active')?.dataset.val ?? '20';
  const direction = document.querySelector('#lesson-direction .pill.active')?.dataset.val ?? 'vocabulary';

  const body = {
    name: form.elements['name'].value,
    language: document.getElementById('lesson-lang-select').value || null,
    category: document.getElementById('lesson-cat-select').value || null,
    levels,
    amount: amount === '0' ? 0 : parseInt(amount),
    direction,
    repeat_all: form.elements['repeat_all'].checked ? 1 : 0,
  };

  if (state.editingLessonId) {
    await api(`/api/lessons/${state.editingLessonId}`, { method: 'PUT', body: JSON.stringify(body) });
  } else {
    await api('/api/lessons', { method: 'POST', body: JSON.stringify(body) });
  }
  closeLessonModal();
  loadPractice();
});

/* ── SESSION ──────────────────────────────────────────────────────── */
async function startLesson(lessonId) {
  const data = await api(`/api/lessons/${lessonId}/start`);
  if (!data || !data.words.length) {
    alert('No words match the lesson criteria.');
    return;
  }
  state.session = {
    lesson: data.lesson,
    words: data.words,
    index: 0,
    results: { right: [], wrong: [] },
    lessonId,
  };
  showSessionCard();
  showView('session');
}

function renderSessionWord(word, revealed) {
  const direction = state.session.lesson.direction;
  // word.question is already the correct side based on direction from the server
  const isTranslation = direction === 'translation';
  const frText = isTranslation ? word.answer : word.question;
  const nlText = isTranslation ? word.question : word.answer;

  if (revealed) {
    return `<div class="word-card-row" style="box-shadow:none;border:none;padding:6px 0">
      <div class="word-card-header"><span class="word-lemma-header">${esc(frText.split(' - ')[0] || frText)}</span></div>
      <div class="example-row">
        <span class="ex-fr">${esc(frText)}</span>
        <span class="ex-nl">${esc(nlText)}</span>
      </div>
    </div>`;
  }
  // Hidden: show question side, hide answer side
  if (isTranslation) {
    // NL → FR: show NL, hide FR
    return `<div class="word-card-row" style="box-shadow:none;border:none;padding:6px 0">
      <div class="example-row">
        <span class="ex-fr session-col-hidden">${esc(frText)}</span>
        <span class="ex-nl">${esc(nlText)}</span>
      </div>
    </div>`;
  }
  // FR → NL: show FR, hide NL
  return `<div class="word-card-row" style="box-shadow:none;border:none;padding:6px 0">
    <div class="word-card-header"><span class="word-lemma-header">${esc(frText.split(' - ')[0] || frText)}</span></div>
    <div class="example-row">
      <span class="ex-fr">${esc(frText)}</span>
      <span class="ex-nl session-col-hidden">${esc(nlText)}</span>
    </div>
  </div>`;
}

function showSessionCard() {
  const { words, index } = state.session;
  const word = words[index];
  const total = words.length;

  document.getElementById('session-title').textContent =
    `${state.session.lesson.name} · ${index + 1} of ${total}`;
  document.getElementById('session-num').textContent = `card ${index + 1} / ${total}`;

  const fill = document.getElementById('session-progress-fill');
  fill.style.width = `${Math.round((index / total) * 100)}%`;

  document.getElementById('session-word-content').innerHTML = renderSessionWord(word, false);

  document.getElementById('btn-show-answer').style.display = '';
  document.getElementById('swipe-hint').style.display = 'none';
  document.getElementById('answer-buttons').style.display = 'none';
  document.getElementById('swipe-buttons').style.display = '';

  const card = document.getElementById('session-card');
  card.classList.remove('swipe-left', 'swipe-right', 'dragging', 'drag-left', 'drag-right');
  card.style.transform = '';
  card.style.opacity = '';
}

function revealAnswer() {
  const word = state.session.words[state.session.index];
  document.getElementById('session-word-content').innerHTML = renderSessionWord(word, true);
  document.getElementById('btn-show-answer').style.display = 'none';
  document.getElementById('swipe-buttons').style.display = 'none';
  document.getElementById('swipe-hint').style.display = 'flex';
  document.getElementById('answer-buttons').style.display = 'flex';
  initSwipe();
}

document.getElementById('btn-show-answer').addEventListener('click', revealAnswer);

function recordAnswer(correct) {
  const word = state.session.words[state.session.index];
  if (correct) state.session.results.right.push(word);
  else state.session.results.wrong.push(word);

  api(`/api/entries/${word.id}/answer`, {
    method: 'POST',
    body: JSON.stringify({ correct }),
  });

  state.session.index++;
  if (state.session.index >= state.session.words.length) {
    showResults();
  } else {
    showSessionCard();
  }
}

document.getElementById('btn-wrong').addEventListener('click', () => recordAnswer(false));
document.getElementById('btn-right').addEventListener('click', () => recordAnswer(true));
document.getElementById('btn-session-exit').addEventListener('click', () => loadPractice());
document.getElementById('btn-session-end').addEventListener('click', () => {
  if (confirm('End this lesson?')) showResults();
});

/* ── Swipe gesture ────────────────────────────────────────────────── */
let swipeDragging = false, swipeStartX = 0, swipeCurrentX = 0;

function initSwipe() {
  swipeDragging = false;
  swipeStartX = 0;
  swipeCurrentX = 0;
}

function swipeStart(x) {
  swipeStartX = x;
  swipeDragging = true;
  document.getElementById('session-card').classList.add('dragging');
}
function swipeMove(x) {
  if (!swipeDragging) return;
  swipeCurrentX = x - swipeStartX;
  const card = document.getElementById('session-card');
  card.style.transform = `translateX(${swipeCurrentX}px) rotate(${swipeCurrentX * 0.04}deg)`;
  card.classList.toggle('drag-left',  swipeCurrentX < -30);
  card.classList.toggle('drag-right', swipeCurrentX >  30);
}
function swipeEnd() {
  if (!swipeDragging) return;
  swipeDragging = false;
  const card = document.getElementById('session-card');
  card.classList.remove('dragging', 'drag-left', 'drag-right');
  if (swipeCurrentX < -80) {
    card.classList.add('swipe-left');
    setTimeout(() => recordAnswer(false), 220);
  } else if (swipeCurrentX > 80) {
    card.classList.add('swipe-right');
    setTimeout(() => recordAnswer(true), 220);
  } else {
    card.style.transform = '';
  }
  swipeCurrentX = 0;
}

document.getElementById('session-card').addEventListener('mousedown', e => swipeStart(e.clientX));
window.addEventListener('mousemove', e => { if (swipeDragging) swipeMove(e.clientX); });
window.addEventListener('mouseup', () => { if (swipeDragging) swipeEnd(); });

document.getElementById('session-card').addEventListener('touchstart', e => swipeStart(e.touches[0].clientX), { passive: true });
window.addEventListener('touchmove', e => { if (swipeDragging) swipeMove(e.touches[0].clientX); }, { passive: true });
window.addEventListener('touchend', () => { if (swipeDragging) swipeEnd(); });

/* ── RESULTS VIEW ─────────────────────────────────────────────────── */
function showResults() {
  const { right, wrong } = state.session.results;
  const total = right.length + wrong.length;
  const pct = total ? Math.round((right.length / total) * 100) : 0;

  document.getElementById('score-pct').textContent = `${pct}%`;
  document.getElementById('score-right').textContent = `✓ ${right.length} correct`;
  document.getElementById('score-wrong').textContent = `✗ ${wrong.length} incorrect`;
  document.getElementById('score-meta').textContent =
    `${state.session.lesson.name} · ${total} words`;

  // Animate score ring: circumference = 2π×32 ≈ 201
  const circumference = 201;
  const offset = circumference - (pct / 100) * circumference;
  const ringFill = document.getElementById('score-ring-fill');
  ringFill.style.strokeDashoffset = offset;

  const wrongList = document.getElementById('wrong-words-list');
  wrongList.innerHTML = wrong.map(w =>
    `<div class="wrong-word-row">${esc(truncate(w.question, 90))}</div>`
  ).join('') || '<div class="wrong-word-row" style="color:var(--success)">All correct! 🎉</div>';

  showView('results');
}

document.getElementById('btn-results-done').addEventListener('click', () => loadPractice());

document.getElementById('btn-repeat').addEventListener('click', () => {
  startLesson(state.session.lessonId);
});

document.getElementById('btn-practice-wrong').addEventListener('click', () => {
  const wrong = state.session.results.wrong;
  if (!wrong.length) { alert('No wrong answers to practice!'); return; }
  state.session = {
    ...state.session,
    words: wrong.sort(() => Math.random() - 0.5),
    index: 0,
    results: { right: [], wrong: [] },
  };
  showSessionCard();
  showView('session');
});

/* ── IMPORT VIEW ──────────────────────────────────────────────────── */
document.getElementById('btn-import-back').addEventListener('click', () => loadVocabulary());

document.getElementById('btn-import-submit').addEventListener('click', async () => {
  const text = document.getElementById('import-text').value.trim();
  const lang = document.getElementById('import-lang').value.trim() || 'Frans';
  const cat  = document.getElementById('import-cat').value.trim() || null;

  if (!text) { alert('Please paste some entries first.'); return; }

  const lines = text.split('\n').filter(l => l.trim());
  const result = await api('/api/import', {
    method: 'POST',
    body: JSON.stringify({ lines, language: lang, category: cat }),
  });

  if (!result) return;
  const resultEl = document.getElementById('import-result');
  resultEl.style.display = 'block';
  resultEl.textContent = `✓ Imported ${result.inserted} entries${result.skipped ? `, skipped ${result.skipped}` : ''}.`;
  document.getElementById('import-text').value = '';
});

/* ── Boot ──────────────────────────────────────────────────────────── */
loadVocabulary();

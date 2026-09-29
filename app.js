(function () {
  'use strict';

  console.log('APP STARTED');
  console.log('notes:', typeof notes !== 'undefined' ? notes.length : 'undefined');
  console.log('splash:', document.getElementById('splash'));

  /* ---------- Состояние ---------- */
  let currentNoteId = null;
  let isTransitioning = false;
  let searchOpen = false;

  // Тактильный свайп с сопротивлением
  let touchStartY = 0;
  let pullAtTop = false;
  let pullAtBottom = false;
  let pullMode = null; // 'next' | 'prev' | null
  let pullOffset = 0;
  let lastPullHint = 0;
  let pullHintTimer = null;

  // Защита колеса мыши от случайных срабатываний
  let wheelAcc = 0;
  let wheelDir = 0;
  let wheelTimer = null;

  // Дебаунс сохранения прогресса чтения
  let readSaveTimer = null;

  /* ---------- DOM ---------- */
  const container = document.getElementById('main-container');
  const searchPanel = document.getElementById('search-panel');
  const searchInput = document.getElementById('search-input');
  const searchToggle = document.querySelector('.search-toggle');
  const searchClose = document.querySelector('.search-close');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxError = document.querySelector('.lightbox-error');
  const lightboxClose = document.querySelector('.lightbox-close');
  const splash = document.getElementById('splash');
  const themeToggle = document.getElementById('theme-toggle');
  const resumeDialog = document.getElementById('resume-dialog');
  const resumeId = document.getElementById('resume-id');
  const resumeYes = document.getElementById('resume-yes');
  const resumeNo = document.getElementById('resume-no');
  const readerSheet = document.getElementById('reader-sheet');
  const readerBackdrop = document.getElementById('reader-backdrop');
  const dimOverlay = document.getElementById('dim-overlay');
  const dimRange = document.getElementById('reader-dim');
  const fontMinus = document.getElementById('font-minus');
  const fontPlus = document.getElementById('font-plus');
  const fontDots = document.querySelectorAll('.font-dot');
  const toneButtons = document.querySelectorAll('.reader-tone');
  const pullHint = document.getElementById('pull-hint');
  const quoteWrapper = document.querySelector('.quote-wrapper');
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  const siteTitleLink = document.querySelector('.site-branding');

  /* ---------- Backlinks ---------- */
  const backlinks = {};
  notes.forEach(note => {
    backlinks[note.id] = [];
  });
  notes.forEach(note => {
    note.links.forEach(targetId => {
      if (backlinks[targetId]) {
        backlinks[targetId].push(note.id);
      }
    });
  });

  /* ---------- Утилиты ---------- */
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function getPreview(content, length) {
    const text = stripHtml(content).replace(/\s+/g, ' ').trim();
    if (text.length <= length) return text;
    return text.substring(0, length) + '…';
  }

  function findNote(id) {
    return notes.find(n => n.id === id);
  }

  function getNoteIndex(id) {
    return notes.findIndex(n => n.id === id);
  }

  function parseHash() {
    return window.location.hash.replace(/^#/, '');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ---------- Тема ---------- */
  function updateMetaThemeColor() {
    if (metaThemeColor) {
      metaThemeColor.content = document.body.dataset.theme === 'dark' ? '#12100e' : '#f7f5f0';
    }
  }

  function initTheme() {
    const saved = localStorage.getItem('zettel-theme');
    document.body.dataset.theme = saved || '';
    updateMetaThemeColor();
  }

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem('zettel-theme', theme);
    updateMetaThemeColor();
  }

  function toggleTheme() {
    setTheme(document.body.dataset.theme === 'dark' ? '' : 'dark');
  }

  /* ---------- Настройки чтения ---------- */
  const READER_KEY = 'zettel-reader';
  const FONT_STEPS = [18, 20, 22, 24];
  let readerState = { font: 0, tone: 'standard', dim: 0 };

  function loadReaderState() {
    try {
      const saved = JSON.parse(localStorage.getItem(READER_KEY));
      if (saved && typeof saved === 'object') {
        readerState.font = Math.min(FONT_STEPS.length - 1, Math.max(0, saved.font | 0));
        readerState.tone = ['standard', 'soft', 'warm'].includes(saved.tone) ? saved.tone : 'standard';
        readerState.dim = Math.min(45, Math.max(0, saved.dim | 0));
      }
    } catch (err) { /* повреждённые данные — используем значения по умолчанию */ }
  }

  function saveReaderState() {
    localStorage.setItem(READER_KEY, JSON.stringify(readerState));
  }

  function applyReaderState() {
    document.body.style.setProperty('--note-font-size', FONT_STEPS[readerState.font] + 'px');
    document.body.dataset.tone = readerState.tone === 'standard' ? '' : readerState.tone;
    dimOverlay.style.opacity = readerState.dim / 100;

    fontDots.forEach((dot, i) => {
      dot.classList.toggle('active', i <= readerState.font);
    });
    fontMinus.classList.toggle('disabled', readerState.font === 0);
    fontPlus.classList.toggle('disabled', readerState.font === FONT_STEPS.length - 1);
    toneButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tone === readerState.tone);
    });
    dimRange.value = readerState.dim;
  }

  function isReaderSheetOpen() {
    return readerSheet.classList.contains('open');
  }

  function toggleReaderSheet(forceState) {
    const open = forceState !== undefined ? forceState : !isReaderSheetOpen();
    readerSheet.classList.toggle('open', open);
    readerBackdrop.classList.toggle('open', open);
  }

  fontMinus.addEventListener('click', () => {
    if (readerState.font > 0) {
      readerState.font--;
      saveReaderState();
      applyReaderState();
    }
  });

  fontPlus.addEventListener('click', () => {
    if (readerState.font < FONT_STEPS.length - 1) {
      readerState.font++;
      saveReaderState();
      applyReaderState();
    }
  });

  toneButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      readerState.tone = btn.dataset.tone;
      saveReaderState();
      applyReaderState();
    });
  });

  dimRange.addEventListener('input', () => {
    readerState.dim = Math.min(45, Math.max(0, parseInt(dimRange.value, 10) || 0));
    saveReaderState();
    applyReaderState();
  });

  readerBackdrop.addEventListener('click', () => toggleReaderSheet(false));

  /* ---------- Память прочитанного ---------- */
  const READ_KEY = 'zettel-read';
  const READ_THRESHOLD = 0.85;

  function getReadMap() {
    try {
      const map = JSON.parse(localStorage.getItem(READ_KEY));
      return map && typeof map === 'object' ? map : {};
    } catch (err) {
      return {};
    }
  }

  function getReadFraction() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, window.scrollY / max) : 1;
  }

  function updateReadingProgress() {
    if (!currentNoteId) return;
    const frac = getReadFraction();
    const noteId = currentNoteId;

    const fill = document.querySelector('.note-progress-fill');
    if (fill) {
      fill.style.width = (frac * 100) + '%';
    }

    clearTimeout(readSaveTimer);
    readSaveTimer = setTimeout(() => {
      const map = getReadMap();
      if (frac > (map[noteId] || 0)) {
        map[noteId] = Math.round(frac * 1000) / 1000;
        localStorage.setItem(READ_KEY, JSON.stringify(map));
      }
    }, 500);
  }

  window.addEventListener('scroll', updateReadingProgress, { passive: true });

  /* ---------- Splash screen & вступление «тихое растворение» ---------- */
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let quietActive = false;
  let quietRouted = false;
  let quietTimers = [];
  let splashHintTimer = null;

  function quietLater(fn, ms) {
    const id = setTimeout(fn, ms);
    quietTimers.push(id);
    return id;
  }

  function clearQuietTimers() {
    quietTimers.forEach(clearTimeout);
    quietTimers = [];
  }

  function isSplashVisible() {
    if (!splash) return false;
    return splash.style.display !== 'none' && getComputedStyle(splash).display !== 'none';
  }

  function resetSplashState() {
    if (!splash) return;
    clearTimeout(splashHintTimer);
    splash.classList.remove('hiding');
    splash.dataset.hiding = '';
    splash.style.transition = '';
    splash.style.opacity = '1';
    splash.style.display = 'none';
    const hint = splash.querySelector('.splash-hint');
    if (hint) hint.classList.remove('visible');
  }

  function showSplash() {
    if (!splash) return;
    // Сброс состояния: вступление играет при каждом показе обложки
    clearQuietTimers();
    quietActive = false;
    quietRouted = false;
    document.body.classList.remove('quiet-intro', 'quiet-quote', 'quiet-header', 'quiet-items');
    container.querySelectorAll('.toc-item').forEach(item => {
      item.style.transitionDelay = '';
    });

    splash.classList.remove('hiding');
    splash.dataset.hiding = '';
    splash.style.transition = 'opacity 600ms ease';
    splash.style.opacity = '1';
    splash.style.display = 'flex';

    // Акт 0: подсказка «раскрыть» проявляется спустя ~1.2с
    clearTimeout(splashHintTimer);
    splashHintTimer = setTimeout(() => {
      if (!quietActive && isSplashVisible()) {
        const hint = splash.querySelector('.splash-hint');
        if (hint) hint.classList.add('visible');
      }
    }, 1200);
  }

  function hideSplash() {
    if (!splash || splash.dataset.hiding === 'true') return;
    splash.dataset.hiding = 'true';

    splash.classList.add('hiding');

    setTimeout(() => {
      splash.style.display = 'none';
      splash.classList.remove('hiding');
      splash.style.opacity = '1';
      splash.dataset.hiding = '';
      localStorage.setItem('zettel-visited', 'true');
      handleRoute();
    }, 600);
  }

  /* Акт 1: обложка тает, под ней оглавление проявляется по очереди */
  function startQuiet() {
    if (quietActive) return;
    quietActive = true;
    clearTimeout(splashHintTimer);

    // Оглавление рендерится под обложкой, элементы скрыты служебным классом
    document.body.classList.add('quiet-intro');
    handleRoute();
    quietRouted = true;

    splash.style.transition = 'opacity 2.5s ease-in-out';
    splash.style.opacity = '0';

    // Акт 2: строгая очередь — цитата, шапка, пункты оглавления
    quietLater(() => document.body.classList.add('quiet-quote'), 250);
    quietLater(() => document.body.classList.add('quiet-header'), 1050);
    quietLater(revealTocItems, 1850);

    // Страховочный таймер
    quietLater(() => finishQuiet(false), 12000);
  }

  function revealTocItems() {
    const items = container.querySelectorAll('.toc-item');
    items.forEach((item, i) => {
      item.style.transitionDelay = (i * 120) + 'ms';
    });
    document.body.classList.add('quiet-items');
    quietLater(() => finishQuiet(false), items.length * 120 + 1200);
  }

  /* Акт 3 / пропуск: страница в обычном состоянии */
  function finishQuiet(instant) {
    clearQuietTimers();
    clearTimeout(splashHintTimer);
    quietActive = false;

    document.body.classList.remove('quiet-intro', 'quiet-quote', 'quiet-header', 'quiet-items');
    container.querySelectorAll('.toc-item').forEach(item => {
      item.style.transitionDelay = '';
    });

    if (splash) {
      splash.classList.remove('hiding');
      splash.dataset.hiding = '';
      splash.style.display = 'none';
      splash.style.transition = '';
      splash.style.opacity = '1';
    }

    localStorage.setItem('zettel-visited', 'true');
    if (!quietRouted) {
      quietRouted = true;
      handleRoute();
    }
  }

  document.addEventListener('click', e => {
    // Пропуск: повторный клик в любой момент сцены — мгновенное оглавление
    if (quietActive) {
      finishQuiet(true);
      return;
    }
    if (!isSplashVisible()) return;
    if (splash.contains(e.target)) {
      if (reducedMotion) {
        finishQuiet(true);
      } else {
        startQuiet();
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (quietActive) return;
    if (!isSplashVisible()) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (reducedMotion) {
        finishQuiet(true);
      } else {
        startQuiet();
      }
    }
  });

  // При сворачивании вкладки сцена мгновенно завершается на оглавлении
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && quietActive) {
      finishQuiet(true);
    }
  });

  /* ---------- Resume dialog ---------- */
  function saveLastNote(id) {
    localStorage.setItem('zettel-last-note', id);
  }

  function showResumeDialog() {
    const savedId = localStorage.getItem('zettel-last-note');
    if (savedId && findNote(savedId)) {
      resumeId.textContent = savedId;
      resumeDialog.classList.add('open');
    } else {
      handleRoute();
    }
  }

  function renderContent(html) {
    container.classList.add('fade-out');
    setTimeout(() => {
      container.innerHTML = html;
      window.scrollTo(0, 0);
      container.style.transform = '';
      container.classList.remove('pull-release');
      container.classList.remove('fade-out');
      bindDynamicEvents();
      updateReadingProgress();
    }, 300);
  }

  function updateActiveNav(route) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.route === route) {
        item.classList.add('active');
      }
    });
  }

  /* ---------- Оглавление ---------- */
  function renderIndex(filterTag, searchQuery, filterDate) {
    currentNoteId = null;
    updateActiveNav('index');
    quoteWrapper.classList.remove('hidden');

    let filtered = notes;

    if (filterTag) {
      filtered = filtered.filter(n => n.tags.includes(filterTag));
    }

    if (filterDate) {
      filtered = filtered.filter(n => n.date === filterDate);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n => {
        const text = stripHtml(n.content).toLowerCase();
        return text.includes(q) || n.id.toLowerCase() === q;
      });
    }

    let html = '<div class="index-page">';
    html += '<h1 class="index-title">Оглавление</h1>';

    if (filterTag) {
      html += `<div class="tag-filter">Показаны заметки по тегу #${escapeHtml(filterTag)}. <a href="#">Показать все</a></div>`;
    }

    if (filterDate) {
      html += `<div class="tag-filter">Заметки за ${escapeHtml(filterDate)}. <a href="#">Показать все</a></div>`;
    }

    if (searchQuery && !filterTag) {
      html += `<div class="tag-filter">Результаты поиска: «${escapeHtml(searchQuery)}». <a href="#">Показать все</a></div>`;
    }

    if (filtered.length === 0) {
      html += '<p>Ничего не найдено.</p>';
    } else {
      const readMap = getReadMap();
      const lastNoteId = localStorage.getItem('zettel-last-note');
      html += '<ul class="toc-list">';
      filtered.forEach(note => {
        const tagsHtml = note.tags.map(tag =>
          `<a href="#tag/${encodeURIComponent(tag)}" class="toc-tag">#${escapeHtml(tag)}</a>`
        ).join(', ');

        const frac = readMap[note.id] || 0;
        const isRead = frac >= READ_THRESHOLD;
        const readLine = !isRead && frac > 0 && note.id === lastNoteId
          ? `<span class="toc-read-line" style="width:${Math.round(frac * 100)}%"></span>`
          : '';

        html += `
          <li class="toc-item${isRead ? ' read' : ''}" data-id="${note.id}">
            <span class="toc-number">${note.id}</span>
            <span class="toc-date">${note.date}</span>
            <span class="toc-preview">${escapeHtml(getPreview(note.content, 100))}</span>
            <span class="toc-tags">${tagsHtml}</span>
            ${readLine}
          </li>
        `;
      });
      html += '</ul>';
    }

    html += '</div>';
    renderContent(html);
  }

  /* ---------- Заметка ---------- */
  function renderNote(id) {
    const note = findNote(id);
    if (!note) {
      renderIndex();
      return;
    }

    currentNoteId = id;
    saveLastNote(id);
    updateActiveNav('note');
    quoteWrapper.classList.add('hidden');

    const body = processContent(note.content);

    const tagsHtml = note.tags.map(tag =>
      `<a href="#tag/${encodeURIComponent(tag)}" class="note-tag">#${escapeHtml(tag)}</a>`
    ).join(' ');

    let linksHtml = '';
    if (note.links.length > 0) {
      const links = note.links.map(lid => {
        const exists = findNote(lid);
        return exists
          ? `<a href="#${lid}" class="note-link">${lid}</a>`
          : `<span class="note-link">${lid}</span>`;
      }).join(' ');
      linksHtml = `<div class="note-links"><span class="note-links-label">Связи:</span>${links}</div>`;
    }

    let backlinksHtml = '';
    const back = backlinks[id] || [];
    if (back.length > 0) {
      const links = back.map(lid =>
        `<a href="#${lid}" class="backlink">${lid}</a>`
      ).join(' ');
      backlinksHtml = `<div class="note-backlinks"><span class="note-backlinks-label">Сюда ведут:</span>${links}</div>`;
    }

    const idx = getNoteIndex(id);
    const prevNote = idx > 0 ? notes[idx - 1] : null;
    const nextNote = idx < notes.length - 1 ? notes[idx + 1] : null;

    const prevHtml = prevNote
      ? `<a href="#${prevNote.id}">← ${prevNote.id}</a>`
      : '<a class="disabled">← Начало</a>';
    const nextHtml = nextNote
      ? `<a href="#${nextNote.id}">${nextNote.id} →</a>`
      : '<a class="disabled">Конец →</a>';

    const html = `
      <article class="note-page">
        <h1 class="note-number">${note.id}</h1>
        <div class="note-date">${note.date}</div>
        <div class="note-body">${body}</div>
        <div class="note-tags"><span class="note-tags-label">Теги:</span>${tagsHtml}</div>
        ${linksHtml}
        ${backlinksHtml}
        <div class="note-share">
          <button class="share-btn" aria-label="Скопировать ссылку на заметку">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Ссылка</span>
          </button>
          <span class="share-notice">Ссылка скопирована</span>
        </div>
      </article>
      <nav class="note-nav">
        <div class="note-progress"><div class="note-progress-fill"></div></div>
        <div class="note-nav-inner">
          <div class="note-nav-prev">${prevHtml}</div>
          <div class="note-nav-center">
            <a href="#">Оглавление</a>
            <button class="aa-toggle" aria-label="Настройки чтения">Aa</button>
          </div>
          <div class="note-nav-next">${nextHtml}</div>
        </div>
      </nav>
    `;

    renderContent(html);
  }

  function processContent(content) {
    // {{PHOTO:слово:файл.jpg}} → span.photo-link
    let html = content.replace(/\{\{PHOTO:([^:]+):([^}]+)\}\}/g,
      '<span class="photo-link" data-photo="$2">$1</span>');

    // Z-XXX → ссылка, если существует
    html = html.replace(/\b(Z-\d{3})\b/g, (match, id) => {
      return findNote(id) ? `<a href="#${id}" class="note-ref">${id}</a>` : match;
    });

    return html;
  }

  /* ---------- Теги ---------- */
  function renderTags() {
    currentNoteId = null;
    updateActiveNav('tags');
    quoteWrapper.classList.add('hidden');

    const tagCounts = {};
    notes.forEach(note => {
      note.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const sortedTags = Object.keys(tagCounts).sort((a, b) => a.localeCompare(b));

    let html = '<div class="tags-page">';
    html += '<h1 class="tags-title">Теги</h1>';
    html += '<ul class="tags-list">';
    sortedTags.forEach(tag => {
      html += `
        <li class="tag-item">
          <a href="#tag/${encodeURIComponent(tag)}">
            #${escapeHtml(tag)} <span class="tag-count">(${tagCounts[tag]})</span>
          </a>
        </li>
      `;
    });
    html += '</ul></div>';
    renderContent(html);
  }

  /* ---------- Календарь ---------- */
  const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTH_NAMES_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function pluralNotes(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'заметка';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'заметки';
    return 'заметок';
  }

  function buildCalendarMonth(y, m, counts, now, todayStr) {
    const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7; // неделя с понедельника
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let html = `<div class="cal-month"><div class="cal-month-name">${MONTH_NAMES[m]}</div><div class="cal-grid">`;
    for (let i = 0; i < firstWeekday; i++) {
      html += '<span class="cal-day blank"></span>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = String(d).padStart(2, '0') + '.'
        + String(m + 1).padStart(2, '0') + '.' + y;
      const count = counts[dateStr] || 0;
      const isFuture = new Date(y, m, d) > now;

      let cls = 'cal-day';
      if (count === 1) cls += ' filled';
      else if (count >= 2) cls += ' filled many';
      if (isFuture) cls += ' future';
      if (dateStr === todayStr) cls += ' today';

      const attrs = count > 0 && !isFuture
        ? ` data-date="${dateStr}" data-label="${d} ${MONTH_NAMES_GEN[m]} — ${count} ${pluralNotes(count)}"`
        : '';
      html += `<span class="${cls}"${attrs}></span>`;
    }
    html += '</div></div>';
    return html;
  }

  function renderCalendar() {
    currentNoteId = null;
    updateActiveNav('calendar');
    quoteWrapper.classList.add('hidden');

    const counts = {};
    notes.forEach(n => {
      counts[n.date] = (counts[n.date] || 0) + 1;
    });

    let firstYear = null;
    let firstMonth = null;
    notes.forEach(n => {
      const parts = n.date.split('.');
      const y = parseInt(parts[2], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (firstYear === null || y < firstYear || (y === firstYear && m < firstMonth)) {
        firstYear = y;
        firstMonth = m;
      }
    });

    const now = new Date();
    const todayStr = String(now.getDate()).padStart(2, '0') + '.'
      + String(now.getMonth() + 1).padStart(2, '0') + '.' + now.getFullYear();

    let html = '<div class="calendar-page"><h1 class="tags-title">Календарь</h1>';

    if (firstYear !== null) {
      let y = firstYear;
      let m = firstMonth;
      let yearOpen = false;
      while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
        if (!yearOpen) {
          html += `<div class="cal-year"><div class="cal-year-label">${y}</div><div class="cal-months">`;
          yearOpen = true;
        }
        html += buildCalendarMonth(y, m, counts, now, todayStr);
        m++;
        if (m > 11) {
          m = 0;
          y++;
          html += '</div></div>';
          yearOpen = false;
        }
      }
      if (yearOpen) {
        html += '</div></div>';
      }
    }

    html += '<div class="cal-tooltip"></div></div>';
    renderContent(html);
  }

  /* ---------- Случайная ---------- */
  function goRandom() {
    const idx = Math.floor(Math.random() * notes.length);
    window.location.hash = `#${notes[idx].id}`;
  }

  /* ---------- Поиск ---------- */
  function toggleSearch(forceState) {
    searchOpen = forceState !== undefined ? forceState : !searchOpen;
    if (searchOpen) {
      searchPanel.classList.add('open');
      setTimeout(() => searchInput.focus(), 50);
    } else {
      searchPanel.classList.remove('open');
      searchInput.value = '';
      const hash = parseHash();
      if (hash === '' || hash === '/') {
        renderIndex();
      } else if (hash.startsWith('tag/')) {
        renderIndex(decodeURIComponent(hash.replace('tag/', '')));
      }
    }
  }

  function handleSearch() {
    const query = searchInput.value.trim();
    const hash = parseHash();
    let filterTag = null;
    if (hash.startsWith('tag/')) {
      filterTag = decodeURIComponent(hash.replace('tag/', ''));
    }
    renderIndex(filterTag, query);
  }

  /* ---------- Лайтбокс ---------- */
  function openLightbox(photo) {
    lightboxImg.src = `assets/images/${photo}`;
    lightboxImg.style.display = 'block';
    lightboxError.classList.remove('visible');
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';

    lightboxImg.onerror = () => {
      lightboxImg.style.display = 'none';
      lightboxError.classList.add('visible');
    };
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightboxImg.src = '';
    document.body.style.overflow = '';
  }

  /* ---------- Навигация между заметками ---------- */
  function goToNote(delta) {
    if (!currentNoteId || isTransitioning) return;
    const idx = getNoteIndex(currentNoteId);
    const newIdx = idx + delta;
    if (newIdx >= 0 && newIdx < notes.length) {
      isTransitioning = true;
      window.location.hash = `#${notes[newIdx].id}`;
      setTimeout(() => {
        isTransitioning = false;
      }, 500);
    }
  }

  /* ---------- Копирование ссылки ---------- */
  function copyText(text, onOk) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onOk, () => fallbackCopyText(text, onOk));
    } else {
      fallbackCopyText(text, onOk);
    }
  }

  function fallbackCopyText(text, onOk) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) onOk();
    } catch (err) { /* буфер недоступен */ }
    document.body.removeChild(ta);
  }

  /* ---------- Динамические события ---------- */
  function bindDynamicEvents() {
    document.querySelectorAll('.toc-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.toc-tag')) return;
        window.location.hash = `#${item.dataset.id}`;
      });
    });

    document.querySelectorAll('.photo-link').forEach(link => {
      link.addEventListener('click', () => {
        openLightbox(link.dataset.photo);
      });
    });

    document.querySelectorAll('.aa-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleReaderSheet();
      });
    });

    document.querySelectorAll('.share-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = location.origin + location.pathname + '#' + currentNoteId;
        copyText(url, () => {
          const notice = btn.parentElement.querySelector('.share-notice');
          if (notice) {
            notice.classList.add('visible');
            setTimeout(() => notice.classList.remove('visible'), 2000);
          }
        });
      });
    });

    // Календарь: тултип и переход по дню
    const calTooltip = container.querySelector('.cal-tooltip');
    container.querySelectorAll('.cal-day[data-date]').forEach(day => {
      day.addEventListener('mouseenter', () => {
        if (!calTooltip) return;
        calTooltip.textContent = day.dataset.label;
        calTooltip.classList.add('visible');
        const rect = day.getBoundingClientRect();
        const tipRect = calTooltip.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tipRect.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
        calTooltip.style.left = left + 'px';
        calTooltip.style.top = (rect.top - tipRect.height - 8) + 'px';
      });
      day.addEventListener('mouseleave', () => {
        if (calTooltip) calTooltip.classList.remove('visible');
      });
      day.addEventListener('click', () => {
        window.location.hash = '#date/' + day.dataset.date;
      });
    });
  }

  /* ---------- Роутинг ---------- */
  function handleRoute() {
    const path = parseHash();

    if (path === '' || path === '/') {
      renderIndex();
    } else if (path === 'tags') {
      renderTags();
    } else if (path === 'calendar') {
      renderCalendar();
    } else if (/^date\/\d{2}\.\d{2}\.\d{4}$/.test(path)) {
      renderIndex(null, null, path.replace('date/', ''));
    } else if (path === 'random') {
      goRandom();
    } else if (path.startsWith('tag/')) {
      renderIndex(decodeURIComponent(path.replace('tag/', '')));
    } else if (/^Z-\d{3}$/.test(path)) {
      renderNote(path);
    } else {
      renderIndex();
    }
  }

  /* ---------- Глобальные события ---------- */
  window.addEventListener('hashchange', handleRoute);

  searchToggle.addEventListener('click', () => toggleSearch());
  searchClose.addEventListener('click', () => toggleSearch(false));
  searchInput.addEventListener('input', handleSearch);
  themeToggle.addEventListener('click', toggleTheme);

  // Блок брендинга — ссылка на оглавление с закрытием открытых панелей
  if (siteTitleLink) {
    siteTitleLink.addEventListener('click', () => {
      if (searchOpen) toggleSearch(false);
      if (isReaderSheetOpen()) toggleReaderSheet(false);
      siteTitleLink.blur();
    });
  }

  resumeYes.addEventListener('click', () => {
    const savedId = localStorage.getItem('zettel-last-note');
    resumeDialog.classList.remove('open');
    window.location.hash = `#${savedId}`;
  });

  resumeNo.addEventListener('click', () => {
    resumeDialog.classList.remove('open');
    location.hash = '';
    showSplash();
  });

  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== searchInput) {      e.preventDefault();
      toggleSearch(true);
      return;
    }

    if (e.key === 'Escape') {
      if (isReaderSheetOpen()) {
        toggleReaderSheet(false);
      } else if (lightbox.classList.contains('open')) {
        closeLightbox();
      } else if (searchOpen) {
        toggleSearch(false);
      }
      return;
    }

    if (currentNoteId && !searchOpen && document.activeElement !== searchInput) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToNote(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNote(1);
      }
    }
  });

  // Навигация колесом мыши у краёв страницы (с защитой от случайных срабатываний)
  window.addEventListener('wheel', e => {
    if (!currentNoteId || isTransitioning || isReaderSheetOpen()) return;

    const dir = e.deltaY > 0 ? 1 : (e.deltaY < 0 ? -1 : 0);
    if (dir === 0) return;

    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const atTop = window.scrollY <= 0;
    if (!((dir > 0 && atBottom) || (dir < 0 && atTop))) {
      wheelAcc = 0;
      return;
    }

    if (dir !== wheelDir) {
      wheelDir = dir;
      wheelAcc = 0;
    }
    wheelAcc += Math.abs(e.deltaY);

    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelAcc = 0;
    }, 400);

    // Требуем несколько «шагов» колеса у края, а не один
    if (wheelAcc >= 240) {
      wheelAcc = 0;
      e.preventDefault();
      goToNote(dir);
    }
  }, { passive: false });

  // Тактильный свайп с сопротивлением
  function releasePull() {
    container.classList.add('pull-release');
    container.style.transform = '';
    setTimeout(() => {
      container.classList.remove('pull-release');
    }, 320);
  }

  function showPullHint() {
    pullHint.classList.add('visible');
    clearTimeout(pullHintTimer);
    pullHintTimer = setTimeout(() => {
      pullHint.classList.remove('visible');
    }, 2000);
  }

  window.addEventListener('touchstart', e => {
    pullOffset = 0;
    pullMode = null;
    if (!currentNoteId || isTransitioning || isReaderSheetOpen()
        || lightbox.classList.contains('open')) {
      pullAtTop = false;
      pullAtBottom = false;
      return;
    }
    touchStartY = e.touches[0].clientY;
    pullAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    pullAtTop = window.scrollY <= 0;
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!currentNoteId || isTransitioning) return;

    const raw = touchStartY - e.touches[0].clientY; // > 0 — тянем вверх

    if (raw > 0 && pullAtBottom) {
      pullMode = 'next';
    } else if (raw < 0 && pullAtTop) {
      pullMode = 'prev';
    } else {
      pullMode = null;
    }

    if (!pullMode) {
      if (pullOffset > 0) {
        pullOffset = 0;
        releasePull();
      }
      return;
    }

    e.preventDefault();
    // Сопротивление ~0.25, потолок смещения 40px
    pullOffset = Math.min(40, Math.abs(raw) * 0.25);
    container.style.transform = `translateY(${pullMode === 'next' ? -pullOffset : pullOffset}px)`;
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (!pullMode || pullOffset <= 0) {
      pullMode = null;
      pullOffset = 0;
      return;
    }

    const offset = pullOffset;
    const delta = pullMode === 'next' ? 1 : -1;
    pullMode = null;
    pullOffset = 0;
    releasePull();

    if (offset >= 35) {
      goToNote(delta);
    } else if (offset >= 5) {
      const now = Date.now();
      if (now - lastPullHint < 2000) {
        goToNote(delta);
      } else {
        lastPullHint = now;
        showPullHint();
      }
    }
  }, { passive: true });

  // Лайтбокс: закрытие свайпом вниз
  let lightboxTouchStartY = 0;
  lightbox.addEventListener('touchstart', e => {
    lightboxTouchStartY = e.touches[0].clientY;
  }, { passive: true });

  lightbox.addEventListener('touchend', e => {
    const deltaY = e.changedTouches[0].clientY - lightboxTouchStartY;
    if (deltaY > 60) {
      closeLightbox();
    }
  }, { passive: true });

  // Лайтбокс: клик по оверлею или крестику
  lightbox.addEventListener('click', e => {
    if (e.target === lightbox || e.target === lightboxClose) {
      closeLightbox();
    }
  });

  // Автодописывание источника при копировании из текста заметки
  document.addEventListener('copy', e => {
    if (!currentNoteId || !e.clipboardData) return;
    const noteBody = container.querySelector('.note-body');
    const sel = window.getSelection();
    if (!noteBody || !sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const anchor = sel.anchorNode;
    const anchorEl = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
    if (!anchorEl || !noteBody.contains(anchorEl)) return;

    const url = location.origin + location.pathname + '#' + currentNoteId;
    e.clipboardData.setData('text/plain',
      sel.toString() + '\n\n— из «Цеттель». Читать: ' + url);
    e.preventDefault();
  });

  /* ---------- Старт ---------- */
  function boot() {
    resetSplashState();
    loadReaderState();
    applyReaderState();
    console.log('reducedMotion:', reducedMotion);

    const visited = localStorage.getItem('zettel-visited');
    const lastNote = localStorage.getItem('zettel-last-note');

    if (!visited) {
      setTheme('dark');
      showSplash();
    } else if (lastNote) {
      initTheme();
      showResumeDialog();
    } else {
      initTheme();
      handleRoute();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

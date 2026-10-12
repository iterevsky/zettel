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

  // Метка «новое»: дата прошлого визита (читается в boot до перезаписи)
  let prevVisitDate = null;

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

  function parseDateRu(str) {
    const parts = str.split('.');
    return new Date(+parts[2], +parts[1] - 1, +parts[0]);
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

  /* === SERVICE WORKER: офлайн === */
  if ('serviceWorker' in navigator) {
    /* когда активировался новый service worker — перезагрузить страницу один раз,
       чтобы читатель сразу получил свежие файлы */
    let swReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swReloaded) return;
      swReloaded = true;
      location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

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

  /* ---------- Ротация цитаты на главной ---------- */
  function rotateQuote() {
    if (typeof QUOTES === 'undefined' || !QUOTES.length) return;
    const quoteEl = document.querySelector('.site-quote');
    if (!quoteEl) return;

    const apply = () => {
      let idx = Math.floor(Math.random() * QUOTES.length);
      const prev = parseInt(quoteEl.dataset.qi !== undefined && quoteEl.dataset.qi !== ''
        ? quoteEl.dataset.qi : localStorage.getItem('zettel-last-quote') || '-1', 10);
      if (QUOTES.length > 1 && idx === prev) idx = (idx + 1) % QUOTES.length;
      const q = QUOTES[idx];
      if (!q || !findNote(q.id)) return;
      quoteEl.dataset.qi = String(idx);
      localStorage.setItem('zettel-last-quote', String(idx));
      quoteEl.innerHTML = '<span class="quote-rotated">' + escapeHtml(q.text) + '</span>';
      quoteEl.classList.add('quote-link');
    };

    if (quoteEl.querySelector('.quote-rotated')) {
      quoteEl.classList.add('quote-fading');
      setTimeout(() => {
        apply();
        quoteEl.classList.remove('quote-fading');
      }, reducedMotion ? 0 : 300);
    } else {
      apply();
    }

    if (!quoteEl.dataset.rotBound) {
      quoteEl.dataset.rotBound = '1';
      quoteEl.addEventListener('click', () => {
        const q = QUOTES[parseInt(quoteEl.dataset.qi, 10)];
        if (q && findNote(q.id)) {
          window.location.hash = '#' + q.id;
        }
      });
    }
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
        const isNew = prevVisitDate && parseDateRu(note.date) > prevVisitDate;
        const readLine = !isRead && frac > 0 && note.id === lastNoteId
          ? `<span class="toc-read-line" style="width:${Math.round(frac * 100)}%"></span>`
          : '';

        html += `
          <li class="toc-item${isRead ? ' read' : ''}${isNew ? ' toc-new' : ''}" data-id="${note.id}">
            <span class="toc-number">${note.id}</span>
            <span class="toc-date">${note.date}</span>
            <span class="toc-preview">${escapeHtml(getPreview(note.content, 100))}</span>
            <span class="toc-tags">${tagsHtml}</span>
            ${readLine}
          </li>
        `;
      });
      html += '</ul>';
      html += '<footer class="toc-colophon">' +
        '<a href="https://iterevsky.github.io/echo" target="_blank" rel="noopener">ЭХО — книга автора</a>' +
        '<span class="colophon-sep">·</span>' +
        '<a href="https://t.me/iterevsky" target="_blank" rel="noopener">Канал в Telegram</a>' +
        '</footer>';
    }

    html += '</div>';
    renderContent(html);

    if (!filterTag && !searchQuery && !filterDate) {
      rotateQuote();
    }
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
    requestNoteWakeLock();

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

  /* ---------- Экран не гаснет во время чтения ---------- */
  let noteWakeLock = null;

  async function requestNoteWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      noteWakeLock = await navigator.wakeLock.request('screen');
      noteWakeLock.addEventListener('release', () => { noteWakeLock = null; });
    } catch (err) {}
  }

  function releaseNoteWakeLock() {
    if (noteWakeLock) {
      noteWakeLock.release().catch(() => {});
      noteWakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (currentNoteId) requestNoteWakeLock();
    } else {
      releaseNoteWakeLock();
    }
  });

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

    if (!/^Z-\d{3}$/.test(path)) {
      releaseNoteWakeLock();
    }

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

    // Метки «новое» относительно прошлого визита: сначала читаем, потом пишем
    const prevRaw = localStorage.getItem('zettel-prev-visit');
    if (prevRaw) {
      const d = new Date(prevRaw);
      if (!isNaN(d)) prevVisitDate = d;
    }
    localStorage.setItem('zettel-prev-visit', new Date().toISOString());

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

  /* ============================================================
     ПОДЕЛИТЬСЯ ЦИТАТОЙ: плавающая кнопка у выделения -> canvas 1200x630
     ============================================================ */
  (function shareQuote() {
    let fab = null;
    let selTimer = null;
    let sharing = false;

    const FAB_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>';

    function getQuote() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      if (text.length < 12 || text.length > 600) return null;
      const node = sel.anchorNode;
      const el = node && (node.nodeType === 3 ? node.parentElement : node);
      if (!el || !el.closest('.note-body')) return null;
      return { text };
    }

    function hideFab() {
      if (fab) { fab.remove(); fab = null; }
    }

    function positionFab() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const rects = sel.getRangeAt(0).getClientRects();
      if (!rects.length) return;
      const first = rects[0];
      const last = rects[rects.length - 1];

      fab.style.visibility = 'hidden';
      fab.style.top = '0px';
      fab.style.left = '0px';
      const w = fab.offsetWidth;
      const h = fab.offsetHeight;
      fab.style.visibility = '';

      const gap = 10;
      const reserveBottom = 120; /* системная карточка браузера внизу экрана */
      let top = last.bottom + gap;
      if (top + h > window.innerHeight - reserveBottom) {
        top = first.top - h - gap; /* нет места снизу — над выделением */
      }
      if (top < 8) top = 8;

      let left = last.right - 48; /* круг 48px прижат к правому краю выделения */
      left = Math.min(left, window.innerWidth - w - 8);
      left = Math.max(left, 8);

      fab.style.top = top + 'px';
      fab.style.left = left + 'px';
    }

    function showFab() {
      if (!fab) {
        fab = document.createElement('div');
        fab.className = 'share-fab-wrap share-fab-in';
        fab.setAttribute('role', 'group');
        fab.setAttribute('aria-label', 'Поделиться цитатой');
        fab.innerHTML = '<span class="share-fab-label">Поделиться</span>' +
          '<button type="button" class="share-fab">' + FAB_ICON + '</button>';
        /* тап не сбрасывает выделение до генерации карточки;
           preventDefault на touchstart гасит синтезированный click,
           поэтому на тач-устройствах действие вызываем из touchend */
        fab.addEventListener('mousedown', (e) => e.preventDefault());
        fab.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        fab.addEventListener('touchend', (e) => { e.preventDefault(); share(); }, { passive: false });
        fab.addEventListener('click', share);
        document.body.appendChild(fab);
      }
      positionFab();
    }

    /* --- карточка «Окно»: фон — кроп обложки cover.jpg, скрим + виньетка, минимум типографики --- */
    /* Кроп из cover.jpg (848x1264): окно с закатным видом. Соотношение 740x394 ~= 1200x630. */
    const COVER_CROP = { sx: 60, sy: 300, sw: 740, sh: 394 };
    let coverImg = null;
    function loadCover() {
      return new Promise((res) => {
        if (coverImg) { res(coverImg); return; }
        const img = new Image();
        img.onload = () => { coverImg = img; res(img); };
        img.onerror = () => res(null); /* офлайн без кэша — сработает тёмный фолбэк ниже */
        img.src = 'assets/images/cover.jpg';
      });
    }

    function renderCard(quote, note) {
      return loadCover().then((img) => new Promise((resolve) => {
        const W = 1200, H = 630;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        ctx.textBaseline = 'top';

        function tracked(text, x, y, font, color, tr, alignRight) {
          ctx.font = font;
          ctx.fillStyle = color;
          const chars = [...text];
          const widths = chars.map((ch) => ctx.measureText(ch).width);
          const total = widths.reduce((a, b) => a + b, 0) + tr * (chars.length - 1);
          let cx = alignRight ? x - total : x;
          chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + tr; });
          return total;
        }

        /* фон: кроп обложки на всю карточку (фолбэк — тёплый тёмный градиент) */
        if (img) {
          ctx.drawImage(img, COVER_CROP.sx, COVER_CROP.sy, COVER_CROP.sw, COVER_CROP.sh, 0, 0, W, H);
        } else {
          const fb = ctx.createLinearGradient(0, 0, 0, H);
          fb.addColorStop(0, '#1a1410');
          fb.addColorStop(1, '#120d0a');
          ctx.fillStyle = fb;
          ctx.fillRect(0, 0, W, H);
        }

        /* затемнение: вертикальный скрим, сильнее к низу (под текст и колофон) */
        const scrim = ctx.createLinearGradient(0, 0, 0, H);
        scrim.addColorStop(0, 'rgba(10,7,5,0.36)');
        scrim.addColorStop(1, 'rgba(10,7,5,0.70)');
        ctx.fillStyle = scrim;
        ctx.fillRect(0, 0, W, H);

        /* виньетка по краям */
        const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, W * 0.62);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.42)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);

        /* шапка: янтарная риска + ЦЕТТЕЛЬ с разрядкой + номер заметки справа */
        ctx.fillStyle = '#e8a34d';
        ctx.fillRect(72, 64, 40, 3);
        tracked('ЦЕТТЕЛЬ', 128, 56, '19px "Old Standard TT", serif', '#e8decc', 7);
        tracked(note.id, W - 72, 56, '19px "Old Standard TT", serif', '#c4b8a4', 5, true);

        /* цитата: слева от x=130, адаптивный размер, максимум 4 строки с многоточием */
        function wrapAt(px) {
          ctx.font = px + 'px "Old Standard TT", serif';
          const lines = [];
          let line = '';
          quote.split(' ').forEach((w) => {
            const t = line ? line + ' ' + w : w;
            if (ctx.measureText(t).width > W - 260 && line) { lines.push(line); line = w; }
            else line = t;
          });
          if (line) lines.push(line);
          return lines;
        }
        let size = 50, lh = 66, y0 = 210;
        let lines = wrapAt(size);
        if (lines.length > 3) { size = 44; lh = 58; y0 = 200; lines = wrapAt(size); }
        if (lines.length > 4) {
          lines = lines.slice(0, 4);
          let lastLine = lines[3];
          while (lastLine.length && ctx.measureText(lastLine + ' …').width > W - 260) {
            lastLine = lastLine.slice(0, -1);
          }
          lines[3] = lastLine.trim() + ' …';
        }
        ctx.fillStyle = '#eee6d8';
        lines.forEach((l, i) => ctx.fillText(l, 130, y0 + i * lh));

        /* колофон: hairline, дата слева, рукописная подпись справа */
        ctx.fillStyle = '#6e6456';
        ctx.fillRect(72, H - 64, W - 144, 1);
        ctx.font = '17px "Old Standard TT", serif';
        ctx.fillStyle = '#b0a08c';
        ctx.fillText(note.date, 72, H - 50);
        ctx.font = '34px "Caveat", cursive';
        ctx.fillStyle = '#d6c4a8';
        const sig = 'Итеревский-Кочетов';
        ctx.fillText(sig, W - 72 - ctx.measureText(sig).width, H - 60);

        /* зерно */
        for (let i = 0; i < 2600; i++) {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
          ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
        }

        cv.toBlob((blob) => resolve(blob), 'image/png');
      }));
    }

    function noteLink(note) {
      return 'https://iterevsky.github.io/zettel/#' + note.id;
    }

    function shareCaption(text, note) {
      let teaser = text;
      if (teaser.length > 140) {
        teaser = teaser.slice(0, 140);
        teaser = teaser.slice(0, teaser.lastIndexOf(' ')) + '…';
      }
      return '«' + teaser + '»\n— Цеттель, ' + note.id + '. Читать: ' + noteLink(note);
    }

    async function share() {
      if (sharing) return;
      const q = getQuote();
      hideFab();
      if (!q) return;
      const note = findNote(currentNoteId);
      if (!note) return;
      sharing = true;
      try {
        await document.fonts.ready; /* шрифты карточки точно загружены */
        const blob = await renderCard(q.text, note);
        const file = new File([blob], 'zettel-quote.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text: shareCaption(q.text, note), title: 'Цеттель' });
          } catch (err) {
            if (err && err.name === 'AbortError') throw err; /* пользователь отменил — молчим */
            await navigator.share({ files: [file], title: 'Цеттель' }); /* комбо не поддержано — только файл */
          }
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'zettel-quote.png';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          try { await navigator.clipboard.writeText(shareCaption(q.text, note)); } catch (e) {}
        }
      } catch (err) {}
      sharing = false;
    }

    document.addEventListener('selectionchange', () => {
      clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        if (!currentNoteId) { hideFab(); return; }
        const q = getQuote();
        if (q) showFab(); else hideFab();
      }, 350);
    });

    window.addEventListener('scroll', hideFab, { passive: true });
    window.addEventListener('resize', hideFab);
    window.addEventListener('hashchange', hideFab);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideFab(); });

    /* открытие поиска, лайтбокса или настроек чтения прячет кнопку */
    document.addEventListener('click', (e) => {
      if (!fab) return;
      if (e.target.closest('.search-toggle, .search-panel, .photo-link, #lightbox, .aa-toggle, #reader-sheet, #reader-backdrop, #theme-toggle')) {
        hideFab();
      }
    }, true);
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

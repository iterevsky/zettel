(function () {
  'use strict';

  console.log('APP STARTED');
  console.log('notes:', typeof notes !== 'undefined' ? notes.length : 'undefined');
  console.log('splash:', document.getElementById('splash'));

  /* ---------- Состояние ---------- */
  let currentNoteId = null;
  let isTransitioning = false;
  let touchStartY = 0;
  let searchOpen = false;

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
  function initTheme() {
    const saved = localStorage.getItem('zettel-theme');
    document.body.dataset.theme = saved || '';
  }

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem('zettel-theme', theme);
  }

  function toggleTheme() {
    setTheme(document.body.dataset.theme === 'dark' ? '' : 'dark');
  }

  /* ---------- Splash screen ---------- */
  function onSplashClick(e) {
    if (e.type === 'touchstart') {
      e.preventDefault();
    }
    hideSplash();
  }

  function showSplash() {
    splash.classList.remove('hiding');
    splash.style.opacity = '1';
    splash.style.display = 'flex';
    splash.removeEventListener('click', onSplashClick);
    splash.removeEventListener('touchstart', onSplashClick);
    splash.addEventListener('click', onSplashClick);
    splash.addEventListener('touchstart', onSplashClick, { passive: false });
  }

  function hideSplash() {
    splash.classList.add('hiding');
    splash.removeEventListener('click', onSplashClick);
    splash.removeEventListener('touchstart', onSplashClick);
    setTimeout(() => {
      splash.style.display = 'none';
      localStorage.setItem('zettel-visited', 'true');
      handleRoute();
    }, 600);
  }

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
      container.classList.remove('fade-out');
      bindDynamicEvents();
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
  function renderIndex(filterTag, searchQuery) {
    currentNoteId = null;
    updateActiveNav('index');

    let filtered = notes;

    if (filterTag) {
      filtered = filtered.filter(n => n.tags.includes(filterTag));
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

    if (searchQuery && !filterTag) {
      html += `<div class="tag-filter">Результаты поиска: «${escapeHtml(searchQuery)}». <a href="#">Показать все</a></div>`;
    }

    if (filtered.length === 0) {
      html += '<p>Ничего не найдено.</p>';
    } else {
      html += '<ul class="toc-list">';
      filtered.forEach(note => {
        const tagsHtml = note.tags.map(tag =>
          `<a href="#tag/${encodeURIComponent(tag)}" class="toc-tag">#${escapeHtml(tag)}</a>`
        ).join(', ');

        html += `
          <li class="toc-item" data-id="${note.id}">
            <span class="toc-number">${note.id}</span>
            <span class="toc-date">${note.date}</span>
            <span class="toc-preview">${escapeHtml(getPreview(note.content, 100))}</span>
            <span class="toc-tags">${tagsHtml}</span>
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
      </article>
      <nav class="note-nav">
        <div class="note-nav-inner">
          <div class="note-nav-prev">${prevHtml}</div>
          <div class="note-nav-center"><a href="#">Оглавление</a></div>
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
  }

  /* ---------- Роутинг ---------- */
  function handleRoute() {
    const path = parseHash();

    if (path === '' || path === '/') {
      renderIndex();
    } else if (path === 'tags') {
      renderTags();
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

  resumeYes.addEventListener('click', () => {
    const savedId = localStorage.getItem('zettel-last-note');
    resumeDialog.classList.remove('open');
    window.location.hash = `#${savedId}`;
  });

  resumeNo.addEventListener('click', () => {
    resumeDialog.classList.remove('open');
    showSplash();
  });

  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      toggleSearch(true);
      return;
    }

    if (e.key === 'Escape') {
      if (lightbox.classList.contains('open')) {
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

  // Pull-up / pull-down на десктопе
  window.addEventListener('wheel', e => {
    if (!currentNoteId || isTransitioning) return;
    if (e.deltaY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 20) {
      e.preventDefault();
      goToNote(1);
    } else if (e.deltaY < 0 && window.scrollY <= 0) {
      e.preventDefault();
      goToNote(-1);
    }
  }, { passive: false });

  // Pull-up / pull-down на мобильном
  window.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!currentNoteId || isTransitioning) return;
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY;

    if (deltaY > 50 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 20) {
      e.preventDefault();
      goToNote(1);
    } else if (deltaY < -50 && window.scrollY <= 0) {
      e.preventDefault();
      goToNote(-1);
    }
  }, { passive: false });

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

  /* ---------- Старт ---------- */
  function boot() {
    if (!localStorage.getItem('zettel-visited')) {
      setTheme('dark');
      showSplash();
    } else {
      initTheme();
      showResumeDialog();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

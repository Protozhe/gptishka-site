(() => {
  const titleInput = document.querySelector('.note-title');
  const editor = document.querySelector('[data-note-editor]');
  const counter = document.querySelector('[data-note-counter]');
  const status = document.querySelector('[data-note-status]');
  const share = document.querySelector('[data-note-share]');
  const copyHeader = document.querySelector('[data-note-copy]');
  const copyRead = document.querySelector('[data-note-copy-read]');
  const copyEdit = document.querySelector('[data-note-copy-edit]');
  const newButton = document.querySelector('[data-note-new]');
  const toast = document.querySelector('[data-note-toast]');

  if (!titleInput || !editor || !status || !counter) return;

  const match = window.location.pathname.match(/^\/n\/([a-f0-9]{12})\/?$/i);
  let slug = match ? match[1].toLowerCase() : '';
  let editToken = new URLSearchParams(window.location.hash.slice(1)).get('edit') || '';
  let editable = !slug;
  let saveTimer = 0;
  let saving = false;
  let saveAgain = false;
  let dirty = false;
  let toastTimer = 0;

  function setStatus(text, state = '') {
    status.className = `note-status${state ? ` is-${state}` : ''}`;
    status.replaceChildren(document.createElement('i'), document.createTextNode(` ${text}`));
  }

  function updateCounter() {
    counter.textContent = `${editor.value.length.toLocaleString('ru-RU')} символов`;
  }

  function showToast(message) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  function publicUrl() {
    return `${window.location.origin}/n/${slug}`;
  }

  function editUrl() {
    return `${publicUrl()}#edit=${encodeURIComponent(editToken)}`;
  }

  function payload() {
    return { title: titleInput.value, content: editor.value };
  }

  function revealShareControls() {
    if (!slug) return;
    if (share) share.hidden = false;
    if (copyHeader) copyHeader.hidden = false;
    if (copyEdit) copyEdit.hidden = !editable || !editToken;
  }

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(message);
    } catch (_error) {
      window.prompt('Скопируйте ссылку:', value);
    }
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (editToken) headers['X-Note-Edit-Token'] = editToken;
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.message === 'string'
        ? data.message
        : (typeof data.error === 'string' ? data.error : 'Не удалось выполнить запрос');
      throw new Error(message);
    }
    return data;
  }

  function setEditable(value) {
    editable = Boolean(value);
    titleInput.readOnly = !editable;
    editor.readOnly = !editable;
    titleInput.placeholder = editable ? 'Название — необязательно' : '';
    if (!editable) {
      editor.placeholder = 'В этой заметке пока нет текста.';
    }
    titleInput.classList.toggle('is-empty-readonly', !editable && !titleInput.value.trim());
    revealShareControls();
  }

  async function saveNow() {
    window.clearTimeout(saveTimer);
    if (!editable || !dirty) return;
    if (saving) {
      saveAgain = true;
      return;
    }

    saving = true;
    dirty = false;
    setStatus('Сохраняем…', 'saving');

    try {
      if (!slug) {
        const created = await request('/api/public/notes', {
          method: 'POST',
          body: JSON.stringify(payload()),
        });
        slug = created.note.slug;
        editToken = created.editToken;
        window.history.replaceState(null, '', `/n/${slug}#edit=${encodeURIComponent(editToken)}`);
        revealShareControls();
      } else {
        await request(`/api/public/notes/${slug}`, {
          method: 'PUT',
          body: JSON.stringify(payload()),
        });
      }
      setStatus('Сохранено');
    } catch (error) {
      dirty = true;
      setStatus(error.message || 'Не удалось сохранить', 'error');
    } finally {
      saving = false;
      if (saveAgain) {
        saveAgain = false;
        saveNow();
      }
    }
  }

  function scheduleSave() {
    if (!editable) return;
    dirty = true;
    setStatus('Есть изменения', 'saving');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 650);
  }

  async function loadNote() {
    if (!slug) {
      setEditable(true);
      setStatus('Новая заметка');
      titleInput.focus();
      return;
    }

    setEditable(false);
    setStatus('Открываем…', 'saving');
    try {
      const note = await request(`/api/public/notes/${slug}`);
      titleInput.value = note.title || '';
      editor.value = note.content || '';
      setEditable(note.editable);
      setStatus(note.editable ? 'Можно редактировать' : 'Только чтение');
      updateCounter();
    } catch (error) {
      titleInput.value = 'Заметка не найдена';
      editor.value = error.message || 'Проверьте адрес или создайте новую заметку.';
      setEditable(false);
      setStatus('Ошибка загрузки', 'error');
      updateCounter();
    }
  }

  titleInput.addEventListener('input', () => {
    titleInput.classList.remove('is-empty-readonly');
    scheduleSave();
  });
  editor.addEventListener('input', () => {
    updateCounter();
    scheduleSave();
  });
  titleInput.addEventListener('blur', saveNow);
  editor.addEventListener('blur', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  newButton?.addEventListener('click', () => window.location.assign('/note'));
  copyHeader?.addEventListener('click', () => copyText(publicUrl(), 'Ссылка для чтения скопирована'));
  copyRead?.addEventListener('click', () => copyText(publicUrl(), 'Ссылка для чтения скопирована'));
  copyEdit?.addEventListener('click', () => copyText(editUrl(), 'Секретная ссылка скопирована'));

  updateCounter();
  loadNote();
})();

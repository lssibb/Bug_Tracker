import { loadBugs, saveBugs, searchBugs, escapeHtml as e, statuses, priorities } from './data.ts';
import type { Bug, Priority, Status } from './data.ts';
import bugIcon from './favicon.svg';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Не найден элемент страницы #app.');
const root: HTMLDivElement = app;
let storage: Storage | null;
try { storage = localStorage; } catch { storage = null; }
let bugs = loadBugs(storage);
let query = '';
let status = '';
let editingBugId: number | null = null;
let savedBugId: number | null = null;

const statusLabels: Record<Status, string> = {
  Open: 'Открыт',
  'In Progress': 'В работе',
  Fixed: 'Исправлен',
  Verified: 'Проверен',
  Closed: 'Закрыт',
  Reopened: 'Переоткрыт',
  Rejected: 'Отклонён',
};
const statusStyles: Record<Status, string> = {
  Open: 'neutral',
  'In Progress': 'working',
  Fixed: 'done',
  Verified: 'done',
  Closed: 'neutral',
  Reopened: 'reopened',
  Rejected: 'neutral',
};
const bugLink = '<a class="back-link" href="#/bugs"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H3m4-4L3 8l4 4"/></svg>К списку багов</a>';

function date(value: string): string {
  if (!value) return '<span class="muted">Не задан</span>';
  const formatted = new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU');
  return `<time datetime="${e(value)}">${e(formatted)}</time>`;
}

function badge(value: Status): string {
  return `<span class="status ${statusStyles[value]}">${statusLabels[value]}</span>`;
}

function options(values: readonly string[]): string {
  return values.map(value => `<option>${e(value)}</option>`).join('');
}

function editableOptions(values: readonly string[], selected: string, labels?: Record<string, string>): string {
  return values.map(value => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(labels?.[value] ?? value)}</option>`).join('');
}

function validDeadline(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function heading(title: string, action = ''): string {
  return `<div class="page-heading"><h1>${title}</h1>${action}</div>`;
}

function table(found: Bug[]): string {
  if (!found.length) {
    return `<div class="empty"><h2>${bugs.length ? 'Ничего не найдено' : 'Багов пока нет'}</h2>
      <p>${bugs.length ? 'Измените запрос или выберите другой статус.' : 'Добавьте первый баг проекта.'}</p></div>`;
  }

  return `<table class="bug-table" role="table" aria-label="Баги проекта">
    <thead role="rowgroup"><tr role="row">
      <th scope="col" role="columnheader">№</th><th scope="col" role="columnheader">Название</th>
      <th scope="col" role="columnheader">Статус</th><th scope="col" role="columnheader">Приоритет</th>
      <th scope="col" role="columnheader">Разработчик</th><th scope="col" role="columnheader">Срок</th>
    </tr></thead>
    <tbody role="rowgroup">${found.map(b => `<tr role="row">
      <td class="number" role="cell">#${b.id}</td>
      <th class="bug-title" scope="row" role="rowheader"><a href="#/bug/${b.id}">${e(b.title)}</a></th>
      <td class="bug-status" role="cell">${badge(b.status)}</td>
      <td class="bug-priority" role="cell"><span class="mobile-label" aria-hidden="true">Приоритет</span>${e(b.priority)}</td>
      <td class="bug-assignee" role="cell"><span class="mobile-label" aria-hidden="true">Разработчик</span>${b.assignee ? e(b.assignee) : '<span class="muted">Не назначен</span>'}</td>
      <td class="date" role="cell"><span class="mobile-label" aria-hidden="true">Срок</span>${date(b.deadline)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function list(): string {
  const found = searchBugs(bugs, query, status);
  return heading('Баги проекта', '<a class="button primary" href="#/new"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>Добавить баг</a>')
    + `<div class="filters">
        <div class="search-field">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4"/><path d="m10 10 3 3"/></svg>
          <input id="search" type="search" aria-label="Поиск багов" placeholder="Номер или название бага" value="${e(query)}">
        </div>
        <select id="status" aria-label="Статус"><option value="">Все статусы</option>${statuses.map(value => `<option value="${value}" ${value === status ? 'selected' : ''}>${statusLabels[value]}</option>`).join('')}</select>
      </div>
      <div id="bug-list">${table(found)}</div>
      <p id="result-count" class="table-caption" role="status">Показано ${found.length} из ${bugs.length}</p>`;
}

function updateList(): void {
  const found = searchBugs(bugs, query, status);
  const results = document.querySelector('#bug-list');
  const count = document.querySelector('#result-count');
  if (results) results.innerHTML = table(found);
  if (count) count.textContent = `Показано ${found.length} из ${bugs.length}`;
}

function detail(id: number): string {
  const b = bugs.find(item => item.id === id);
  if (!b) return bugLink + heading('Баг не найден');

  const editing = editingBugId === b.id;
  const developers = [...new Set(bugs.map(item => item.assignee).filter(Boolean))];
  const meta = editing
    ? `<form id="edit-bug-form" class="bug-meta-editor" data-bug-id="${b.id}">
        <label for="edit-status">Статус</label>
        <select id="edit-status" name="status" required>${editableOptions(statuses, b.status, statusLabels)}</select>
        <label for="edit-priority">Приоритет</label>
        <select id="edit-priority" name="priority" required>${editableOptions(priorities, b.priority)}</select>
        <label for="edit-assignee">Разработчик</label>
        <input id="edit-assignee" name="assignee" type="text" list="developer-options" maxlength="100" value="${e(b.assignee)}" placeholder="Не назначен">
        <datalist id="developer-options">${developers.map(name => `<option value="${e(name)}"></option>`).join('')}</datalist>
        <label for="edit-deadline">Дедлайн</label>
        <input id="edit-deadline" name="deadline" type="date" value="${e(b.deadline)}">
        <p id="edit-error" class="edit-error" role="alert"></p>
        <div class="edit-form-actions">
          <button class="button" type="button" data-action="cancel-edit">Отмена</button>
          <button class="button primary" type="submit">Сохранить</button>
        </div>
      </form>`
    : `<dl class="bug-meta">
        <div><dt>Статус</dt><dd>${badge(b.status)}</dd></div>
        <div><dt>Приоритет</dt><dd>${e(b.priority)}</dd></div>
        <div><dt>Разработчик</dt><dd>${b.assignee ? e(b.assignee) : '<span class="muted">Не назначен</span>'}</dd></div>
        <div><dt>Срок</dt><dd>${date(b.deadline)}</dd></div>
      </dl>`;

  return `${bugLink}${heading(`<span class="number">#${b.id}</span> ${e(b.title)}`)}
    <div class="detail-layout">
      <article class="bug-description">${section('Что происходит', b.description)}${section('Шаги воспроизведения', b.steps)}${section('Ожидаемый результат', b.expected)}</article>
      ${meta}
      ${editing ? '' : '<div class="detail-actions"><button class="button edit-trigger" type="button" data-action="edit-bug">ИЗМЕНИТЬ</button></div>'}
    </div>
    ${savedBugId === b.id && !editing ? '<p class="save-notice" role="status">Изменения сохранены.</p>' : ''}`;
}

function section(title: string, text: string): string {
  return `<section class="description-section"><h2>${title}</h2><p>${e(text)}</p></section>`;
}

function form(): string {
  return `${bugLink}${heading('Новый баг')}
    <form id="bug-form" class="bug-form"><p id="form-error" role="alert"></p>
      <label for="title">Название *</label><input id="title" name="title" required minlength="5" maxlength="150">
      <label for="description">Что происходит *</label><textarea id="description" name="description" required maxlength="3000"></textarea>
      <label for="steps">Шаги воспроизведения *</label><textarea id="steps" name="steps" required maxlength="3000" placeholder="Каждый шаг с новой строки"></textarea>
      <label for="expected">Ожидаемый результат *</label><textarea id="expected" name="expected" required maxlength="3000"></textarea>
      <label for="priority">Приоритет</label><select id="priority" name="priority">${options(priorities)}</select>
      <div class="form-actions"><a class="button" href="#/bugs">Отмена</a><button class="button primary" type="submit">Добавить баг</button></div>
    </form>`;
}
function render(): void {
  const path = location.hash.slice(2).split('/');
  const page = ['new', 'bug', 'releases', 'members'].includes(path[0]) ? path[0] : 'bugs';
  let content: string;
  if (page === 'new') content = form();
  else if (page === 'bug') content = detail(Number(path[1]));
  else if (page === 'releases') content = heading('Релизы') + '<table class="secondary-table" aria-label="Релизы"><thead><tr><th scope="col">Версия</th><th scope="col">Плановая дата</th><th scope="col">Статус</th></tr></thead><tbody><tr><td>v1.1</td><td><time datetime="2026-11-26">26.11.2026</time></td><td>Запланирован</td></tr></tbody></table>';
  else if (page === 'members') content = heading('Участники') + '<table class="secondary-table" aria-label="Участники"><thead><tr><th scope="col">Имя</th><th scope="col">Роль</th></tr></thead><tbody><tr><td>Анна</td><td>Lead</td></tr><tr><td>Олег</td><td>QA</td></tr><tr><td>Ильдар</td><td>Dev</td></tr></tbody></table>';
  else content = list();
  root.innerHTML = `<header class="site-header"><div class="page-width header-inner"><a class="brand" href="#/bugs"><img src="${bugIcon}" width="26" height="26" alt="">Трекер багов</a>
    <nav class="tabs" aria-label="Разделы проекта">
      ${[['bugs', 'Баги'], ['releases', 'Релизы'], ['members', 'Участники']].map(([key, title]) => `<a href="#/${key}" ${key === (['bug', 'new'].includes(page) ? 'bugs' : page) ? 'aria-current="page"' : ''}>${title}</a>`).join('')}
    </nav></div></header><main id="main" class="page-width content" tabindex="-1">${content}</main>`;
  const pageTitle = page === 'new' ? 'Новый баг' : page === 'releases' ? 'Релизы' : page === 'members' ? 'Участники' : 'Баги';
  document.title = `${pageTitle} · Трекер багов`;
}

document.addEventListener('input', event => {
  if (event.target instanceof HTMLInputElement && event.target.id === 'search') {
    query = event.target.value;
    updateList();
  }
});
document.addEventListener('change', event => {
  if (event.target instanceof HTMLSelectElement && event.target.id === 'status') {
    status = event.target.value;
    updateList();
  }
});
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    document.querySelector<HTMLElement>('#main')?.focus();
    return;
  }

  const action = event.target.closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
  if (action === 'edit-bug') {
    const id = Number(location.hash.match(/^#\/bug\/(\d+)$/)?.[1]);
    if (!bugs.some(b => b.id === id)) return;
    editingBugId = id;
    savedBugId = null;
    render();
    document.querySelector<HTMLSelectElement>('#edit-status')?.focus();
  } else if (action === 'cancel-edit') {
    editingBugId = null;
    render();
    document.querySelector<HTMLButtonElement>('[data-action="edit-bug"]')?.focus();
  }
});
document.addEventListener('submit', event => {
  if (!(event.target instanceof HTMLFormElement)) return;
  if (event.target.id === 'edit-bug-form') {
    event.preventDefault();
    const bugId = Number(event.target.dataset.bugId);
    const bug = bugs.find(item => item.id === bugId);
    if (!bug || editingBugId !== bugId) return;

    const values = new FormData(event.target);
    const field = (name: string): string => String(values.get(name) ?? '').trim();
    const newStatus = field('status');
    const newPriority = field('priority');
    const assignee = field('assignee');
    const deadline = field('deadline');
    const error = document.querySelector<HTMLParagraphElement>('#edit-error');

    if (!statuses.some(value => value === newStatus) || !priorities.some(value => value === newPriority)
      || assignee.length > 100 || !validDeadline(deadline)) {
      if (error) error.textContent = 'Проверьте статус, приоритет, разработчика и дату дедлайна.';
      return;
    }

    const updated: Bug = {
      ...bug,
      status: newStatus as Status,
      priority: newPriority as Priority,
      assignee,
      deadline,
    };
    const nextBugs = bugs.map(item => item.id === bugId ? updated : item);
    if (!saveBugs(storage, nextBugs)) {
      if (error) error.textContent = 'Не удалось сохранить изменения. Проверьте разрешение на локальное хранение.';
      return;
    }

    bugs = nextBugs;
    editingBugId = null;
    savedBugId = bugId;
    render();
    document.querySelector<HTMLButtonElement>('[data-action="edit-bug"]')?.focus();
    return;
  }

  if (event.target.id !== 'bug-form') return;
  event.preventDefault();
  const values = new FormData(event.target);
  const field = (name: string): string => String(values.get(name) || '').trim();
  const error = document.querySelector<HTMLParagraphElement>('#form-error');
  if (field('title').length < 5 || !field('description') || !field('steps') || !field('expected')) {
    if (error) error.textContent = 'Заполните обязательные поля. Название должно содержать не менее 5 символов.';
    return;
  }
  const priority = field('priority');
  if (!priorities.some(value => value === priority)) return;
  const added: Bug = { id: Math.max(0, ...bugs.map(b => b.id)) + 1, title: field('title'), description: field('description'), steps: field('steps'), expected: field('expected'), priority: priority as Priority, status: 'Open', assignee: '', deadline: '' };
  if (!saveBugs(storage, [...bugs, added])) {
    if (error) error.textContent = 'Браузер не разрешает сохранить данные. Разрешите локальное хранение и повторите попытку.';
    return;
  }
  bugs.push(added); query = ''; status = ''; location.hash = `/bug/${added.id}`;
});
window.addEventListener('hashchange', () => {
  editingBugId = null;
  savedBugId = null;
  render();
  window.scrollTo(0, 0);
  document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true });
});
if (!location.hash || location.hash === '#main') history.replaceState(null, '', '#/bugs');
render();

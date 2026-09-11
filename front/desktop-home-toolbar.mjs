const shell = document.querySelector('.site-nav-shell');
const app = document.getElementById('app');

if (shell && app) {
  const toolbar = document.createElement('div');
  toolbar.className = 'desktop-home-toolbar';
  toolbar.setAttribute('aria-label','Actions de la page Événements');
  const navigation = document.getElementById('navigation');
  shell.insertBefore(toolbar, navigation);

  function cloneControl(node) {
    return node ? node.cloneNode(true) : null;
  }

  function sync() {
    const title = app.querySelector(':scope > .page-title');
    const create = app.querySelector(':scope > .home-create-event');
    const filters = app.querySelector(':scope > .event-filter');
    const isEventsHome = !!title && title.textContent.trim().toUpperCase() === 'ÉVÉNEMENTS' && !!filters;

    shell.classList.toggle('is-events-home', isEventsHome);
    toolbar.replaceChildren();
    if (!isEventsHome) return;

    const label = document.createElement('strong');
    label.className = 'desktop-home-title';
    label.textContent = 'ÉVÉNEMENTS';
    toolbar.append(label);

    const createClone = cloneControl(create);
    if (createClone) {
      createClone.classList.add('desktop-home-create');
      toolbar.append(createClone);
    }

    const filterClone = cloneControl(filters);
    if (filterClone) {
      filterClone.classList.add('desktop-home-filter');
      toolbar.append(filterClone);
    }
  }

  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(app, {childList:true, subtree:true, attributes:true, attributeFilter:['aria-pressed']});
  sync();
}

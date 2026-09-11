const shell = document.querySelector('.site-nav-shell');
const app = document.getElementById('app');
const navigation = document.getElementById('navigation');
const media = matchMedia('(min-width: 761px)');

if (shell && app && navigation) {
  const toolbar = document.createElement('div');
  toolbar.className = 'desktop-home-toolbar';
  toolbar.setAttribute('aria-label','Actions principales');

  const center = document.createElement('div');
  center.className = 'desktop-nav-center';
  center.setAttribute('aria-label','Changer de simulateur');

  const right = document.createElement('div');
  right.className = 'desktop-nav-right';
  const rightControls = document.createElement('div');
  rightControls.className = 'desktop-nav-right-controls';
  right.append(rightControls);

  shell.insertBefore(toolbar, navigation);
  shell.insertBefore(center, navigation);
  shell.insertBefore(right, navigation);

  const accountBar = shell.querySelector(':scope > .account-bar');

  function cloneControl(node) {
    return node ? node.cloneNode(true) : null;
  }

  function restoreMobileAccount() {
    if (accountBar && accountBar.parentElement !== shell) shell.append(accountBar);
  }

  function sync() {
    const title = app.querySelector(':scope > .page-title');
    const create = app.querySelector(':scope > .home-create-event');
    const filters = app.querySelector(':scope > .event-filter');
    const isEventsHome = !!title && title.textContent.trim().toUpperCase() === 'ÉVÉNEMENTS' && !!filters;

    shell.classList.toggle('is-events-home', isEventsHome);
    toolbar.replaceChildren();
    center.replaceChildren();
    rightControls.replaceChildren();

    if (!media.matches) {
      restoreMobileAccount();
      return;
    }

    if (isEventsHome) {
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
    } else {
      const homeClone = cloneControl(navigation.querySelector('[data-action="home"]'));
      if (homeClone) toolbar.append(homeClone);
    }

    const switcher = navigation.querySelector('.nav-game-switcher');
    const switcherClone = cloneControl(switcher);
    if (switcherClone) center.append(switcherClone);

    const entriesClone = cloneControl(navigation.querySelector('[data-action="my-entries"]'));
    if (entriesClone) rightControls.append(entriesClone);

    if (accountBar) right.append(accountBar);
  }

  const appObserver = new MutationObserver(() => queueMicrotask(sync));
  appObserver.observe(app, {childList:true, subtree:true, attributes:true, attributeFilter:['aria-pressed']});

  const navObserver = new MutationObserver(() => queueMicrotask(sync));
  navObserver.observe(navigation, {childList:true, subtree:true});

  media.addEventListener?.('change', sync);
  sync();
}

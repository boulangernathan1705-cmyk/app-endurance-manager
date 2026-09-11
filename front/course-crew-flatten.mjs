const app = document.getElementById('app');
let queued = false;

function flattenCrewBuckets() {
  app?.querySelectorAll('.ux-course-crews-body').forEach(body => {
    if (body.dataset.singleCrewList === 'true') return;

    const buckets = [...body.querySelectorAll(':scope > .ux-crew-bucket')];
    if (!buckets.length) return;

    const crews = buckets.flatMap(bucket => [
      ...bucket.querySelectorAll(':scope > .ux-crew-bucket-body > .crew-pilot-accordion')
    ]);

    if (crews.length) {
      body.replaceChildren(...crews);
    } else {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Aucun équipage pour ce départ.';
      body.replaceChildren(empty);
    }

    body.dataset.singleCrewList = 'true';
  });
}

function scheduleFlatten() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    flattenCrewBuckets();
  });
}

if (app) {
  flattenCrewBuckets();
  new MutationObserver(scheduleFlatten).observe(app, {childList: true, subtree: true});
}

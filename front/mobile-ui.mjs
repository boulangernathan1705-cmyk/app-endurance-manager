const mobileQuery = window.matchMedia('(max-width: 760px)');

function applyLayoutMode() {
  const mobile = mobileQuery.matches;
  document.body.dataset.layout = mobile ? 'mobile' : 'desktop';
  document.documentElement.classList.toggle('is-mobile-layout', mobile);
  document.documentElement.classList.toggle('is-desktop-layout', !mobile);
}

applyLayoutMode();
mobileQuery.addEventListener?.('change', applyLayoutMode);

// Keep a stable hook for future phone-only interactions without coupling them to app.js.
window.FMTLayout = Object.freeze({
  isMobile: () => mobileQuery.matches,
  media: mobileQuery.media
});

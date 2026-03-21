/* ============================================================
   NŪFIK DESIGN SYSTEM — theme.js
   JS에서 CSS 변수를 참조하는 헬퍼 모듈입니다.
   원본 값은 theme.css에만 존재합니다.
   ============================================================ */

const getVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const theme = {
  /* ── Color ── */
  color: {
    bg:      () => getVar('--color-bg'),
    line:    () => getVar('--color-line'),
    txt:     () => getVar('--color-txt'),
    point:   () => getVar('--color-point'),
    accent:  () => getVar('--color-accent'),
  },

  /* ── Typography ── */
  font: {
    display: () => getVar('--font-display'),
    mono:    () => getVar('--font-mono'),
  },

  /* ── Spacing ── */
  spacing: {
    panelWidth:      () => getVar('--panel-width'),
    panelPaddingY:   () => getVar('--panel-padding-y'),
    navPaddingX:     () => getVar('--nav-padding-x'),
    navPaddingXMob:  () => getVar('--nav-padding-x-mob'),
    galleryInset:    () => getVar('--gallery-inset'),
  },

  /* ── Z-index ── */
  z: {
    gallery:   () => getVar('--z-gallery'),
    grid:      () => getVar('--z-grid'),
    center:    () => getVar('--z-center'),
    panel:     () => getVar('--z-panel'),
    nav:       () => getVar('--z-nav'),
    preloader: () => getVar('--z-preloader'),
  },

  /* ── Animation ── */
  ease: {
    snap:   () => getVar('--ease-snap'),
    out:    () => getVar('--ease-out'),
    in:     () => getVar('--ease-in'),
    spring: () => getVar('--ease-spring'),
  },
  dur: {
    fast:  () => getVar('--dur-fast'),
    mid:   () => getVar('--dur-mid'),
    slow:  () => getVar('--dur-slow'),
    intro: () => getVar('--dur-intro'),
  },

  /* ── Theme helpers ── */
  isDenimGray: () => document.body.classList.contains('theme-crimson'),
  toggle() {
    document.body.classList.toggle('theme-crimson');
  },
};

export default theme;

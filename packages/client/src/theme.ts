/** Keep presentation outside Lit's workflow state, including during pending work. */
export function followBrowserTheme() {
  let preference: MediaQueryList | undefined;
  try {
    preference = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    // Browsers without preference detection retain the light appearance.
  }
  const update = () => {
    const dark = preference?.matches ?? false;
    document.documentElement.classList.toggle('wa-dark', dark);
    document.documentElement.classList.toggle('wa-light', !dark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#101d17' : '#eff5ef');
  };
  update();
  preference?.addEventListener('change', update);
  return () => preference?.removeEventListener('change', update);
}

// This module runs before the application custom element is defined.
followBrowserTheme();

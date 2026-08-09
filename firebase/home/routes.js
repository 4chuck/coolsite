// Detect base path - if we're under /coolsite/, use it as base
const getBasePath = () => {
  const pathname = window.location.pathname;
  if (pathname.includes('/coolsite/')) {
    return '/coolsite';
  }
  return '';
};

const BASE_PATH = getBasePath();

export const ROUTES = {
  login: `${BASE_PATH}/login/fire-login.html`,
  signup: `${BASE_PATH}/login/fire-signup.html`,
  profile: `${BASE_PATH}/firebase/home/cyborg/fire-profile.html`,
  home: `${BASE_PATH}/index.html`,
  cyborgHome: `${BASE_PATH}/firebase/home/cyborg/index.html`,
  scaffoldHome: `${BASE_PATH}/firebase/home/Scaffold/index3.html`,
  scaffold4: `${BASE_PATH}/firebase/home/Scaffold/index4.html`,
  chess: `${BASE_PATH}/firebase/home/cyborg/chess-game/index.html`,
  aiChat: `${BASE_PATH}/firebase/home/main_ai3.html`,
  category: `${BASE_PATH}/firebase/home/cyborg/category.html`,
  quiz: `${BASE_PATH}/firebase/home/cyborg/quiz-cyborg.html`
};

export function redirectTo(routeName) {
  const url = ROUTES[routeName];
  if (url) {
    window.location.href = url;
  } else {
    console.error(`Route "${routeName}" not found.`);
  }
}

/**
 * Shows an alert and then redirects to a route.
 * @param {string} message - The message to show.
 * @param {string} routeName - The route to redirect to.
 * @param {number} delay - The delay in ms before redirecting (default 1500).
 */
export function redirectWithAlert(message, routeName, delay = 1500) {
  // Use existing calert if defined globally, otherwise fallback to console
  if (typeof window.calert === 'function') {
    window.calert(message);
  } else {
    console.log(`[Alert] ${message}`);
  }

  setTimeout(() => {
    redirectTo(routeName);
  }, delay);
}

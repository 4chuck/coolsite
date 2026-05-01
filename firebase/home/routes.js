export const ROUTES = {
  login: '/login/fire-login.html',
  signup: '/login/fire-signup.html',
  profile: '/firebase/home/cyborg/fire-profile.html',
  home: '/index.html',
  cyborgHome: '/firebase/home/cyborg/index.html',
  scaffoldHome: '/firebase/home/Scaffold/index3.html',
  scaffold4: '/firebase/home/Scaffold/index4.html',
  chess: '/firebase/home/cyborg/chess-game/index.html',
  aiChat: '/firebase/home/main_ai3.html',
  category: '/firebase/home/cyborg/category.html',
  quiz: '/firebase/home/cyborg/quiz-cyborg.html'
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

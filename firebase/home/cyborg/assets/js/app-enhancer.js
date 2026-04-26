(function () {
  "use strict";

  if (window.AppEnhancer) return;

  var SESSION_KEY = "app_user_session";
  var SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  var AppEnhancer = {
    SESSION_KEY: SESSION_KEY,
    SESSION_TTL_MS: SESSION_TTL_MS,
    authMode: "unknown",

    init: function () {
      this.authMode = this.detectAuthMode();
      this.validateSessionOnLoad();
      this.restoreUiStateFromSession();
      this.hookStorageSync();
      this.hookLogoutSync();
      this.hookFirebaseCompatIfAvailable();
      this.hookLegacyLocalStorageSignals();
    },

    detectAuthMode: function () {
      if (window.firebase && typeof window.firebase.auth === "function") {
        return "firebase-compat";
      }
      return "custom-or-modular";
    },

    readSession: function () {
      try {
        var raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
      } catch (e) {
        return null;
      }
    },

    writeSession: function (session) {
      if (!session || !session.uid) return;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (e) {
        /* no-op */
      }
      this.applyLoggedInUi(session);
    },

    clearSession: function () {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {
        /* no-op */
      }
      this.applyLoggedOutUi();
    },

    isExpired: function (session) {
      if (!session || !session.loginTime) return true;
      var loginTime = Number(session.loginTime);
      if (!Number.isFinite(loginTime)) return true;
      return Date.now() - loginTime > SESSION_TTL_MS;
    },

    validateSessionOnLoad: function () {
      var session = this.readSession();
      if (!session) {
        this.applyLoggedOutUi();
        return;
      }
      if (this.isExpired(session)) {
        this.clearSession();
        return;
      }
      this.applyLoggedInUi(session);
    },

    captureUser: function (userLike) {
      if (!userLike || !userLike.uid) return;
      var safeSession = {
        uid: userLike.uid || "",
        email: userLike.email || "",
        displayName: userLike.displayName || userLike.name || "",
        loginTime: Date.now()
      };
      this.writeSession(safeSession);
    },

    restoreUiStateFromSession: function () {
      var session = this.readSession();
      if (!session || this.isExpired(session)) return;

      // Best-effort UI restoration only (does not fake backend auth).
      var nameEl = document.getElementById("name");
      var emailEl = document.getElementById("email");
      if (nameEl && (!nameEl.textContent || /No Name/i.test(nameEl.textContent))) {
        nameEl.textContent = session.displayName || "Player";
      }
      if (emailEl && (!emailEl.textContent || /No Email/i.test(emailEl.textContent))) {
        emailEl.textContent = session.email || "Signed in";
      }
    },

    applyLoggedInUi: function (session) {
      document.documentElement.setAttribute("data-auth-state", "logged-in");
      document.body.classList.add("app-auth-logged-in");
      document.body.classList.remove("app-auth-logged-out");
      if (session && session.uid) {
        document.body.setAttribute("data-auth-uid", session.uid);
      }
    },

    applyLoggedOutUi: function () {
      document.documentElement.setAttribute("data-auth-state", "logged-out");
      document.body.classList.add("app-auth-logged-out");
      document.body.classList.remove("app-auth-logged-in");
      document.body.removeAttribute("data-auth-uid");
    },

    hookFirebaseCompatIfAvailable: function () {
      if (!(window.firebase && typeof window.firebase.auth === "function")) return;
      try {
        var auth = window.firebase.auth();
        var self = this;
        auth.onAuthStateChanged(function (user) {
          if (user) {
            self.captureUser({
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || ""
            });
          } else {
            self.clearSession();
          }
        });
      } catch (e) {
        /* no-op */
      }
    },

    hookLegacyLocalStorageSignals: function () {
      // Existing pages set these keys; use them as safe login hints.
      var self = this;
      var originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        originalSetItem.apply(this, arguments);
        if (this !== localStorage) return;

        if (key === "userUID" || key === "name" || key === "email") {
          var uid = localStorage.getItem("userUID");
          if (!uid) return;
          self.captureUser({
            uid: uid,
            email: localStorage.getItem("email") || "",
            displayName: localStorage.getItem("name") || ""
          });
        }
      };
    },

    hookLogoutSync: function () {
      var self = this;
      document.addEventListener("click", function (event) {
        var target = event.target;
        if (!target) return;
        var logoutBtn = target.closest("#logout-btn");
        if (logoutBtn) {
          self.clearSession();
        }
      });
    },

    hookStorageSync: function () {
      window.addEventListener("storage", function (e) {
        if (e.key === SESSION_KEY) {
          location.reload();
        }
      });
    }
  };

  window.AppEnhancer = AppEnhancer;
  window.AppEnhancer.init();
})();

// log.js - cleaned up. Do NOT store passwords in localStorage.

function storeEmailOnly() {
  // if you want "remember email" checkbox you can store just the email
  var email = document.getElementById('email');
  if (email && email.value.length > 0) {
    localStorage.setItem('rememberedEmail', email.value);
  }
}

function loadRememberedEmail() {
  var r = localStorage.getItem('rememberedEmail');
  if (r) {
    var emailEl = document.getElementById('email');
    if (emailEl) emailEl.value = r;
  }
}

// call on load
document.addEventListener('DOMContentLoaded', loadRememberedEmail);

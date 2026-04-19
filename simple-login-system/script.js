const loginForm = document.getElementById("loginForm");
const roleInput = document.getElementById("role");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");

// Only one admin account is allowed in this app.
// To change admin, update these hardcoded values.
const ADMIN_USERNAME = "DIVYA";
const ADMIN_PASSWORD = "admin123";

loginForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const role = roleInput.value;
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    message.textContent = "Please enter username and password";
    return;
  }

  if (role === "admin") {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      localStorage.setItem("loggedInRole", "admin");
      localStorage.setItem("loggedInUser", username);
      window.location.href = "./admin-dashboard.html";
      return;
    }

    message.textContent = "Invalid Admin Credentials";
    return;
  }

  // Student login: multiple students can login with basic validation.
  localStorage.setItem("loggedInRole", "student");
  localStorage.setItem("loggedInUser", username);
  window.location.href = "./student-dashboard.html";
});

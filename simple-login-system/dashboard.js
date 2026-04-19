const welcomeText = document.getElementById("welcomeText");
const logoutBtn = document.getElementById("logoutBtn");

const role = localStorage.getItem("loggedInRole");
const username = localStorage.getItem("loggedInUser");
const page = window.location.pathname;

const isAdminPage = page.endsWith("admin-dashboard.html");
const isStudentPage = page.endsWith("student-dashboard.html");

// Protect dashboard pages from direct opening without valid login.
if (isAdminPage && role !== "admin") {
  window.location.href = "./login.html";
}

if (isStudentPage && role !== "student") {
  window.location.href = "./login.html";
}

if (welcomeText) {
  welcomeText.textContent = `Welcome, ${username || "User"}!`;
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    localStorage.removeItem("loggedInRole");
    localStorage.removeItem("loggedInUser");
    window.location.href = "./login.html";
  });
}

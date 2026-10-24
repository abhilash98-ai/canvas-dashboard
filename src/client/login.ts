import { ApiError, fetchCurrentUser, requestJson } from "./api.js";

const form = document.querySelector<HTMLFormElement>("#login-form")!;
const feedUrlInput = document.querySelector<HTMLInputElement>("#feed-url")!;
const errorLine = document.querySelector<HTMLParagraphElement>("#login-error")!;
const loginButton = document.querySelector<HTMLButtonElement>("#login-button")!;

function showError(message: string): void {
  errorLine.textContent = message;
  feedUrlInput.setAttribute("aria-invalid", message ? "true" : "false");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedUrl = feedUrlInput.value.trim();
  if (!feedUrl) {
    showError("Paste your Canvas calendar link first.");
    feedUrlInput.focus();
    return;
  }

  showError("");
  loginButton.disabled = true;
  loginButton.textContent = "Checking with Canvas…";
  try {
    await requestJson("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedUrl }),
    });
    window.location.replace("/");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(
      error instanceof ApiError && error.status === 401
        ? `${message} Check that you copied the whole link.`
        : message,
    );
    loginButton.disabled = false;
    loginButton.textContent = "Log in";
    feedUrlInput.select();
  }
});

// Already logged in? Skip straight to the dashboard.
fetchCurrentUser().then(
  () => window.location.replace("/"),
  () => feedUrlInput.focus(),
);

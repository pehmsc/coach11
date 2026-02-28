const IOS_INSTALL_DISMISSED_KEY = "coach11:pwa:ios-install-dismissed";
const IOS_INSTALL_AFTER_LOGIN_KEY = "coach11:pwa:ios-install-after-login";

export function isIOSInstallDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(IOS_INSTALL_DISMISSED_KEY) === "1";
}

export function dismissIOSInstallPromptPermanently() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IOS_INSTALL_DISMISSED_KEY, "1");
}

export function markIOSInstallPromptAfterLogin() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(IOS_INSTALL_AFTER_LOGIN_KEY, "1");
}

export function consumeIOSInstallPromptAfterLogin() {
  if (typeof window === "undefined") return false;

  const shouldPrompt =
    window.sessionStorage.getItem(IOS_INSTALL_AFTER_LOGIN_KEY) === "1";
  if (shouldPrompt) {
    window.sessionStorage.removeItem(IOS_INSTALL_AFTER_LOGIN_KEY);
  }

  return shouldPrompt;
}

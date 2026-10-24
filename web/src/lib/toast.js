// A short message at the bottom of the screen, from anywhere in the app.
export function toast(text) {
  window.dispatchEvent(new CustomEvent('mealtime-toast', { detail: text }))
}

// Streaming apps on phones ignore search links (the Netflix app opens on its
// home screen), so tapping Open also copies the title, ready to paste into
// the app's own search.
export function copyTitleFor(name, platformLabel) {
  try {
    navigator.clipboard?.writeText(name).then(
      () => toast(`Copied "${name}". Paste it into ${platformLabel}'s search if it opens on the home screen.`),
      () => {}, // clipboard not allowed: the link still opens
    )
  } catch {
    // no clipboard: nothing to do
  }
}

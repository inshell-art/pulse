const guide = document.getElementById("agent-guide");
const prompt = document.getElementById("agent-prompt");
const copy = document.getElementById("copy-agent-prompt");
const status = document.getElementById("agent-copy-status");
let loading = false;

guide.addEventListener("toggle", async () => {
  if (!guide.open || prompt.value || loading) return;
  loading = true;
  try {
    const response = await fetch("/docs/agent-prompt.txt");
    if (!response.ok) throw new Error("Prompt unavailable");
    const text = await response.text();
    // The local preview must point at its own unpublished index.
    prompt.value = text.replace("https://pulse.inshell.art/docs/agent-index.json",
      new URL("/docs/agent-index.json", window.location.origin).href);
    copy.disabled = false;
    status.textContent = window.location.origin === "https://pulse.inshell.art" ? "" :
      "Preview: the prompt uses this local address.";
  } catch {
    status.textContent = "Couldn't load the prompt. Close and reopen to try again.";
  } finally { loading = false; }
});

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(prompt.value);
    status.textContent = "Copied. Paste it into your agent.";
  } catch {
    prompt.focus();
    prompt.select();
    status.textContent = "Select and copy the prompt below.";
  }
});

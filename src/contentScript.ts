(() => {
  const getSubject = (): string | null => {
    const candidates = [
      document.querySelector("h2.hP"),
      document.querySelector("h2[tabindex='-1']"),
    ];
    for (const el of candidates) {
      const text = el?.textContent?.trim();
      if (text) return text;
    }
    return null;
  };

  const subject = getSubject();
  if (subject) {
    chrome.runtime.sendMessage({ action: "subjectFound", subject });
  } else {
    console.warn("❌ Subject not found.");
  }
})();

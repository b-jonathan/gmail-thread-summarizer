document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("summarizeBtn") as HTMLButtonElement;
  const loading = document.getElementById("loading")!;
  const summaryDiv = document.getElementById("summary")!;

  button.addEventListener("click", () => {
    loading.style.display = "block";
    summaryDiv.textContent = "";

    chrome.runtime.sendMessage({ action: "summarizeThread" }, (response) => {
      loading.style.display = "none";
      summaryDiv.textContent = response?.summary || "No summary received.";
    });
  });
});

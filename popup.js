document.addEventListener("DOMContentLoaded", () => {
  const saveButton = document.getElementById("saveEmail");
  const emailInput = document.getElementById("vendorEmail");

  saveButton.addEventListener("click", () => {
    const email = emailInput.value.trim();

    if (!email || !email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }

    chrome.storage.local.set({ vendorEmail: email }, () => {
      alert("Email saved!");

      // 🔄 Send message to background script to begin tracking
      chrome.runtime.sendMessage({ action: "trackVendorEmail", email });
    });
  });

  chrome.storage.local.get("vendorEmail", (result) => {
    if (result.vendorEmail) {
      emailInput.value = result.vendorEmail;
    }
  });
});

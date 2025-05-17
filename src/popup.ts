document.addEventListener("DOMContentLoaded", () => {
  const saveButton = document.getElementById("saveEmail") as HTMLButtonElement;
  const emailInput = document.getElementById("vendorEmail") as HTMLInputElement;

  saveButton.addEventListener("click", () => {
    const email = emailInput.value.trim();

    if (!email || !email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }

    // Save email to storage
    chrome.storage.local.set({ vendorEmail: email }, () => {
      // 🔥 Trigger background process
      chrome.runtime.sendMessage(
        { action: "trackVendorEmail", email },
        (response) => {
          console.log("here");
          console.log(response);
          if (chrome.runtime.lastError) {
            console.error(
              "❌ Error sending message:",
              chrome.runtime.lastError.message
            );
            return;
          }
          if (response?.summary) {
            alert("test");
            console.log("📝 Summary received:", response.summary);
            console.log("Summary:\n\n" + response.summary);
          }
        }
      );
    });
  });

  // Optional: preload saved email on load
  chrome.storage.local.get("vendorEmail", (result) => {
    if (result.vendorEmail) {
      emailInput.value = result.vendorEmail;
    }
  });
});

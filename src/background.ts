chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "trackVendorEmail" && message.email) {
    console.log("Starting tracking for:", message.email);
    runGmailQuery(message.email);
  }
});

function runGmailQuery(vendorEmail: string) {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError || !token) {
      console.error("Auth error:", chrome.runtime.lastError);
      return;
    }

    fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${vendorEmail}&maxResults=5`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
      .then((res) => res.json())
      .then((data) => {
        const messageIds = data.messages?.map((m: any) => m.id) ?? [];
        return Promise.all(
          messageIds.map((id: string) =>
            fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            ).then((res) => res.json())
          )
        );
      })
      .then((messages) => {
        messages.forEach((msg: any) => {
          const subject =
            msg.payload.headers.find((h: any) => h.name === "Subject")?.value ??
            "No subject";
          console.log(`Subject: ${subject}\nSnippet: ${msg.snippet}\n---`);
        });
      })
      .catch((err) => console.error("Fetch failed:", err));
  });
}

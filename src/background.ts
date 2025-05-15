type GroqMessage = {
  role: "user" | "system" | "assistant";
  content: string;
};

type ThreadSummary = {
  subject: string;
  snippet: string;
};

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "trackVendorEmail" && message.email) {
    console.log("Starting tracking for:", message.email);

    const threadSummaries = await runGmailQuery(message.email);
    console.log(threadSummaries);
    const apiKey = "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";

    if (!apiKey) {
      console.warn("No Groq API key found in storage.");
      return;
    }

    summarizeWithGroq(threadSummaries, apiKey, (summary: string) => {
      console.log("💡 Summary from Groq:", summary);

      // ✅ Store it for later use (e.g., by popup)
      chrome.storage.local.set({ lastSummary: summary });

      // ✅ Optionally, respond immediately to the sender
      sendResponse({ summary });
    });

    // Required if you plan to respond asynchronously
    return true;
  }
});

async function summarizeWithGroq(
  threadSummaries: ThreadSummary[],
  apiKey: string,
  callback?: (summary: string) => void
): Promise<void> {
  const model = "llama3-70b-8192";
  const formattedThread = threadSummaries
    .map(
      (entry, index) =>
        `Email ${index + 1}:\nSubject: ${entry.subject}\nSnippet: ${
          entry.snippet
        }`
    )
    .join("\n\n");

  const prompt = `Summarize the following email thread:\n\n${formattedThread}`;

  const messages: GroqMessage[] = [
    {
      role: "system",
      content:
        "You are an assistant that summarizes email threads clearly and concisely.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.4,
        }),
      }
    );

    const data = await response.json();

    const summary =
      data.choices?.[0]?.message?.content ?? "No summary returned.";

    console.log("📝 LLM Summary:\n", summary);

    if (callback) callback(summary);
  } catch (error) {
    console.error("Groq API call failed:", error);
    if (callback) callback("Failed to generate summary.");
  }
}

async function runGmailQuery(vendorEmail: string): Promise<ThreadSummary[]> {
  try {
    const token = await new Promise<string | void>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError?.message || "Token fetch failed");
        } else {
          console.log(resolve(token as string));
        }
      });
    });
    console.log(token);
    const messageListRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:${vendorEmail}&maxResults=5`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const messageListData = await messageListRes.json();
    const messageIds: string[] =
      messageListData.messages?.map((m: any) => m.id) ?? [];
    const messages = await Promise.all(
      messageIds.map((id) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        ).then((res) => res.json())
      )
    );
    const threadSummaries: ThreadSummary[] = messages.map((msg: any) => {
      const subject =
        msg.payload.headers.find((h: any) => h.name === "Subject")?.value ??
        "No subject";
      const snippet = msg.snippet ?? "";
      return { subject, snippet };
    });

    console.log("✅ Thread summaries:", threadSummaries);
    return threadSummaries;
  } catch (err) {
    console.error("❌ runGmailQuery error:", err);
    return [];
  }
}

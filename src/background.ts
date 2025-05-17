type GroqMessage = {
  role: "user" | "system" | "assistant";
  content: string;
};

type ThreadSummary = {
  subject: string;
  body: string;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "trackVendorEmail" && message.email) {
    console.log("📩 Received message:", message);

    // ✅ Use an IIFE to preserve the port
    (async () => {
      try {
        const threadSummaries = await runGmailQuery(message.email);
        const apiKey = import.meta.env.VITE_GROQ_API_KEY;

        if (!apiKey) {
          sendResponse({ summary: "No API key found." });
          return;
        }

        const summary = await summarizeWithGroq(threadSummaries, apiKey);
        console.log("✅ Sending summary response");
        sendResponse({ summary: summary }); // ✅ MUST call this
      } catch (err) {
        console.error("❌ Error:", err);
        sendResponse({ summary: "Error generating summary." });
      }
    })();

    return true; // ✅ Keeps the port open
  }
});

async function summarizeWithGroq(
  threadSummaries: ThreadSummary[],
  apiKey: string
): Promise<string> {
  const model = "llama3-70b-8192";
  const formattedThread = threadSummaries
    .map(
      (entry, index) =>
        `Email ${index + 1}:\nSubject: ${entry.subject}\nBody: ${entry.body}`
    )
    .join("\n\n");

  const prompt = `Summarize the following email thread:\n\n${formattedThread}`;

  const messages: GroqMessage[] = [
    {
      role: "system",
      content: `You are an assistant that extracts structured information from email threads.
  
  Your job is to return a clear and concise summary in the following list format of the most recent updates regarding each of these bullet points:
  - **Client Name**: (Extracted from email signature or greeting. If not found, write "Not found")
  - **Date**: (Any mention of the date for the event or meeting. If not found, write "Not found")
  - **Time**: (Time of day, including AM/PM if available. If not found, write "Not found")
  - **Location**: (Physical address or venue if mentioned. If not found, write "Not found")
  - **List of Items Required**: (Bullet list of any requested or discussed items, also list the prices next to the items. If not found, write "Not found")
  - **Special Notes**: (Any special mentions specific to the client, If not found, write "Not found")
  Be concise and only include these fields. Do not add explanations or filler text.`,
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

    //console.log("📝 LLM Summary:\n", summary);

    return summary;
  } catch (error) {
    console.error("Groq API call failed:", error);
    return "Failed to generate summary.";
  }
}

async function runGmailQuery(vendorEmail: string): Promise<ThreadSummary[]> {
  try {
    const token = await new Promise<string | void>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError?.message || "Token fetch failed");
        } else {
          resolve(token as string);
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
      //const snippet = msg.snippet ?? "";
      // Get the body from the payload
      let body = "";

      if (msg.payload.parts && Array.isArray(msg.payload.parts)) {
        // Multipart email — try to find the 'text/plain' part first
        const plainPart = msg.payload.parts.find(
          (part: any) => part.mimeType === "text/plain"
        );

        if (plainPart?.body?.data) {
          body = atob(
            plainPart.body.data.replace(/-/g, "+").replace(/_/g, "/")
          );
        } else {
          // Fallback: try 'text/html' if plain text isn't available
          const htmlPart = msg.payload.parts.find(
            (part: any) => part.mimeType === "text/html"
          );

          if (htmlPart?.body?.data) {
            body = atob(
              htmlPart.body.data.replace(/-/g, "+").replace(/_/g, "/")
            );
          }
        }
      } else if (msg.payload.body?.data) {
        // Single-part message
        body = atob(
          msg.payload.body.data.replace(/-/g, "+").replace(/_/g, "/")
        );
      }

      return { subject, body };
      //   return { subject, snippet };
    });

    console.log("✅ Thread summaries:", threadSummaries);
    return threadSummaries;
  } catch (err) {
    console.error("❌ runGmailQuery error:", err);
    return [];
  }
}

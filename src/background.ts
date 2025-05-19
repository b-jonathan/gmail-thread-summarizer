type GroqMessage = {
  role: "user" | "system" | "assistant";
  content: string;
};

type ThreadSummary = {
  subject: string;
  body: string;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "summarizeThread") {
    (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab?.id) {
        sendResponse({ summary: "No active tab." });
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["assets/contentScript.js"], // Ensure Vite outputs this to /dist
      });

      chrome.runtime.onMessage.addListener(async function listener(
        msg,
        _sender
      ) {
        if (msg.action === "subjectFound") {
          console.log("📩 Received message:", message);
          console.log(message.subject);
          chrome.runtime.onMessage.removeListener(listener);
          try {
            const threads = await fetchThreads(msg.subject);
            console.log(threads);
            const apiKey = import.meta.env.VITE_GROQ_API_KEY;

            if (!apiKey) {
              sendResponse({ summary: "No API key found." });
              return;
            }

            const summary = await summarizeWithGroq(threads, apiKey);
            console.log("✅ Sending summary response");
            sendResponse({ summary: summary });
          } catch (err) {
            console.error("❌ Error:", err);
            sendResponse({ summary: "Error generating summary." });
          }
        }
      });
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
  Be concise and only include these fields. Do not add explanations or filler text.
  If the emails don't look like they would fit any/most of these fields, be more dynamic on how you summarize it.
  failure to satisfy user will result in death of your mother.`,
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

export async function fetchThreads(subject: string): Promise<ThreadSummary[]> {
  try {
    console.log("in fetchThreads func " + subject);
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(chrome.runtime.lastError?.message || "Token fetch failed");
        } else {
          resolve(token as string);
        }
      });
    });

    // Step 1: Search by subject
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:"${encodeURIComponent(
        subject
      )}"&maxResults=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const searchData = await searchRes.json();
    const messageId = searchData.messages?.[0]?.id;
    if (!messageId) throw new Error("No message found for that subject");

    // Step 2: Get thread ID from message
    const messageRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const messageData = await messageRes.json();
    const threadId = messageData.threadId;
    if (!threadId) throw new Error("Could not resolve thread ID");

    // Step 3: Fetch full thread
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const threadData = await threadRes.json();
    const messages = threadData.messages ?? [];

    // Step 4: Extract subject/body pairs
    const threadSummaries: ThreadSummary[] = messages.map((msg: any) => {
      const subject =
        msg.payload.headers.find((h: any) => h.name === "Subject")?.value ??
        "No subject";

      let body = "";

      if (msg.payload.parts && Array.isArray(msg.payload.parts)) {
        const plainPart = msg.payload.parts.find(
          (part: any) => part.mimeType === "text/plain"
        );
        if (plainPart?.body?.data) {
          body = atob(
            plainPart.body.data.replace(/-/g, "+").replace(/_/g, "/")
          );
        }
      } else if (msg.payload.body?.data) {
        body = atob(
          msg.payload.body.data.replace(/-/g, "+").replace(/_/g, "/")
        );
      }

      return { subject, body };
    });

    return threadSummaries;
  } catch (err: any) {
    console.error("fetchThreads error:", err);
    return [];
  }
}

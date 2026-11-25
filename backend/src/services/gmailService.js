const { OAuth2Client } = require("google-auth-library");
const { compile } = require("html-to-text");

const MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

const MAX_RESULTS = 25;

const APPLICATION_QUERY = [
  "newer_than:365d",
  "-in:spam",
  "-in:trash",
  "-in:sent",
  "{",
  '"thank you for applying"',
  '"thanks for applying"',
  '"application received"',
  '"application confirmation"',
  '"application submitted"',
  '"received your application"',
  '"thank you for your application"',
  "}",
].join(" ");

const convertHtmlToText = compile({
  wordwrap: false,
  decodeEntities: true,

  selectors: [
    {
      selector: "a",
      options: {
        ignoreHref: true,
      },
    },
    {
      selector: "img",
      format: "skip",
    },
    {
      selector: "script",
      format: "skip",
    },
    {
      selector: "style",
      format: "skip",
    },
    {
      selector: "noscript",
      format: "skip",
    },
    {
      selector: "p",
      options: {
        leadingLineBreaks: 1,
        trailingLineBreaks: 1,
      },
    },
  ],
});

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function getClient(req) {
  const tokens = req.session.googleGmail;

  if (!tokens?.access_token) {
    const error = new Error("Connect Gmail first.");
    error.code = "GMAIL_NOT_CONNECTED";
    throw error;
  }

  const client = new OAuth2Client(
    process.env.GOOGLE_GMAIL_CLIENT_ID,
    process.env.GOOGLE_GMAIL_CLIENT_SECRET,
    process.env.GOOGLE_GMAIL_REDIRECT_URI,
  );

  client.setCredentials(tokens);

  return client;
}

async function gmailRequest(req, options) {
  const client = getClient(req);

  try {
    return await client.request(options);
  } finally {
    // Preserve refreshed credentials in the server-side session.
    req.session.googleGmail = {
      ...req.session.googleGmail,
      ...client.credentials,
    };

    await saveSession(req);
  }
}

function getHeader(headers, name) {
  return (
    headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())
      ?.value || ""
  );
}

function decodeBody(data) {
  if (!data) return "";

  return Buffer.from(data, "base64url").toString("utf8");
}

function extractPlainText(payload) {
  if (!payload) return "";

  // Ignore attachments.
  if (payload.filename) return "";

  if (payload.mimeType === "text/plain") {
    return decodeBody(payload.body?.data);
  }

  return (payload.parts || []).map(extractPlainText).filter(Boolean).join("\n");
}

function extractHtmlText(payload) {
  if (!payload) return "";

  // Ignore attachments.
  if (payload.filename) return "";

  if (payload.mimeType === "text/html") {
    const html = decodeBody(payload.body?.data);

    if (!html.trim()) return "";

    return convertHtmlToText(html).trim();
  }

  return (payload.parts || []).map(extractHtmlText).filter(Boolean).join("\n");
}

function extractEmailBody(payload, snippet = "") {
  // 1. Prefer full plain-text content.
  const plainText = extractPlainText(payload).trim();

  if (plainText) {
    return {
      body: plainText,
      bodySource: "plain_text",
    };
  }

  // 2. Convert HTML when plain text is unavailable.
  const htmlText = extractHtmlText(payload).trim();

  if (htmlText) {
    return {
      body: htmlText,
      bodySource: "html",
    };
  }

  // 3. Use the Gmail snippet as the final fallback.
  if (typeof snippet === "string" && snippet.trim()) {
    return {
      body: snippet,
      bodySource: "snippet",
    };
  }

  // 4. No usable email content.
  return {
    body: "",
    bodySource: null,
  };
}

function normalizeMessage(message) {
  const headers = message.payload?.headers || [];

  const timestamp = Number(message.internalDate);

  const { body, bodySource } = extractEmailBody(
    message.payload,
    message.snippet,
  );

  return {
    messageId: message.id,
    threadId: message.threadId,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),

    receivedAt:
      Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toISOString()
        : null,

    snippet: message.snippet || "",
    body,
    bodySource,
  };
}

async function getApplicationEmailById(req, messageId) {
  if (
    typeof messageId !== "string" ||
    !messageId.trim() ||
    messageId.length > 255
  ) {
    const error = new Error("Invalid Gmail message ID.");
    error.code = "INVALID_GMAIL_MESSAGE_ID";
    throw error;
  }

  const response = await gmailRequest(req, {
    url: `${MESSAGES_URL}/${encodeURIComponent(messageId.trim())}`,
    method: "GET",
    params: {
      format: "full",
    },
  });

  return normalizeMessage(response.data);
}

async function listApplicationEmails(req) {
  const response = await gmailRequest(req, {
    url: MESSAGES_URL,
    method: "GET",
    params: {
      q: APPLICATION_QUERY,
      maxResults: MAX_RESULTS,
      includeSpamTrash: false,
    },
  });

  const messages = response.data.messages || [];

  const emails = [];

  for (const message of messages) {
    const email = await getApplicationEmailById(req, message.id);

    emails.push(email);
  }

  return {
    emails,
    hasMore: Boolean(response.data.nextPageToken),
  };
}

module.exports = {
  listApplicationEmails,
  getApplicationEmailById,
};

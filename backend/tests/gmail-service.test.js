const test = require("node:test");
const assert = require("node:assert/strict");

const { OAuth2Client } = require("google-auth-library");

const { getApplicationEmailById } = require("../src/services/gmailService");

const {
  extractJobTitle,
  parseApplicationEmail,
} = require("../src/services/emailParser");

// --------------------------------------------------
// Test helpers
// --------------------------------------------------

function encodeBody(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function createTextPart(value, filename = "") {
  return {
    mimeType: "text/plain",
    filename,
    body: {
      data: encodeBody(value),
    },
  };
}

function createHtmlPart(value, filename = "") {
  return {
    mimeType: "text/html",
    filename,
    body: {
      data: encodeBody(value),
    },
  };
}

function createMultipart(parts, mimeType = "multipart/alternative") {
  return {
    mimeType,
    parts,
  };
}

function createMessage({
  payload,
  snippet = "",
  subject = "Application Received",
} = {}) {
  return {
    id: "message-001",
    threadId: "thread-001",
    internalDate: String(Date.parse("2026-06-15T12:00:00Z")),
    snippet,

    ...(payload
      ? {
          payload: {
            ...payload,
            headers: [
              {
                name: "Subject",
                value: subject,
              },
              {
                name: "From",
                value: "careers@example.com",
              },
            ],
          },
        }
      : {}),
  };
}

function createRequest() {
  return {
    session: {
      googleGmail: {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expiry_date: Date.now() + 3600000,
      },

      save(callback) {
        callback(null);
      },
    },
  };
}

async function retrieveMessage(t, message) {
  t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    assert.equal(options.method, "GET");

    assert.ok(options.url.endsWith("/messages/message-001"));

    assert.equal(options.params.format, "full");

    return {
      data: message,
    };
  });

  return getApplicationEmailById(createRequest(), "message-001");
}

// --------------------------------------------------
// Plain text and HTML extraction
// --------------------------------------------------

test("Extracts full plain-text email content", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createTextPart(
        "Thank you for applying.\nPosition: Software Engineer",
      ),
      snippet: "Short preview",
    }),
  );

  assert.equal(
    email.body,
    "Thank you for applying.\nPosition: Software Engineer",
  );
});

test("Extracts full HTML-only email content", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createHtmlPart(`
        <p>Thank you for applying.</p>
        <p>Position: Software Engineer</p>
      `),
      snippet: "Short preview",
    }),
  );

  assert.match(email.body, /Thank you for applying\./);

  assert.match(email.body, /Position: Software Engineer/);

  assert.ok(!email.body.includes("<p>"));
});

test("Decodes HTML entities in email content", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createHtmlPart(`
        <p>Research &amp; Development</p>
        <p>Software&nbsp;Engineer</p>
      `),
    }),
  );

  assert.match(email.body, /Research & Development/);

  assert.match(email.body, /Software\s+Engineer/);

  assert.ok(!email.body.includes("&amp;"));
  assert.ok(!email.body.includes("&nbsp;"));
});

test("Preserves line breaks between labeled fields", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createHtmlPart(`
        <p>Company: Example Company</p>
        <p>Position: Software Engineer</p>
      `),
    }),
  );

  assert.match(
    email.body,
    /Company: Example Company\s*\n\s*Position: Software Engineer/,
  );
});

// --------------------------------------------------
// HTML content safety
// --------------------------------------------------

test("Preserves link text without exposing tracking URLs", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createHtmlPart(`
        <p>
          <a href="https://example.com/tracking?id=123">
            View application
          </a>
        </p>
      `),
    }),
  );

  assert.match(email.body, /View application/);

  assert.ok(!email.body.includes("https://"));
  assert.ok(!email.body.includes("tracking?id"));
});

test("Ignores images and tracking pixel content", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createHtmlPart(`
        <p>Application received.</p>
        <img
          src="https://example.com/tracking.png"
          alt="TRACKING_PIXEL_MARKER"
        />
      `),
    }),
  );

  assert.match(email.body, /Application received/);

  assert.ok(!email.body.includes("TRACKING_PIXEL_MARKER"));

  assert.ok(!email.body.includes("tracking.png"));
});

test("Ignores script and style content", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createHtmlPart(`
        <html>
          <head>
            <style>
              .STYLE_MARKER { color: red; }
            </style>
          </head>

          <body>
            <p>Application received.</p>

            <script>
              const SCRIPT_MARKER = true;
            </script>

            <noscript>
              NOSCRIPT_MARKER
            </noscript>
          </body>
        </html>
      `),
    }),
  );

  assert.match(email.body, /Application received/);

  assert.ok(!email.body.includes("STYLE_MARKER"));
  assert.ok(!email.body.includes("SCRIPT_MARKER"));
  assert.ok(!email.body.includes("NOSCRIPT_MARKER"));
});

// --------------------------------------------------
// MIME structure and source priority
// --------------------------------------------------

test("Prefers plain text when both plain text and HTML exist", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart([
        createTextPart("PLAIN_TEXT_CONTENT"),
        createHtmlPart("<p>HTML_CONTENT</p>"),
      ]),
    }),
  );

  assert.equal(email.body, "PLAIN_TEXT_CONTENT");

  assert.ok(!email.body.includes("HTML_CONTENT"));
});

test("Falls back to HTML when plain text is empty", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart([
        createTextPart("   \n   "),
        createHtmlPart("<p>HTML_FALLBACK</p>"),
      ]),
    }),
  );

  assert.equal(email.body, "HTML_FALLBACK");
});

test("Extracts HTML from nested multipart messages", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart(
        [
          createMultipart([
            createTextPart(""),
            createHtmlPart("<p>Position: Backend Engineer</p>"),
          ]),
        ],
        "multipart/mixed",
      ),
    }),
  );

  assert.match(email.body, /Position: Backend Engineer/);
});

// --------------------------------------------------
// Attachment exclusion
// --------------------------------------------------

test("Ignores plain-text attachments", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart(
        [
          createTextPart("PRIVATE_ATTACHMENT_CONTENT", "notes.txt"),

          createTextPart("Actual application confirmation."),
        ],
        "multipart/mixed",
      ),
    }),
  );

  assert.equal(email.body, "Actual application confirmation.");

  assert.ok(!email.body.includes("PRIVATE_ATTACHMENT_CONTENT"));
});

test("Ignores HTML attachments", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart(
        [
          createHtmlPart("<p>HTML_ATTACHMENT_CONTENT</p>", "attachment.html"),

          createHtmlPart("<p>Actual application confirmation.</p>"),
        ],
        "multipart/mixed",
      ),
    }),
  );

  assert.equal(email.body, "Actual application confirmation.");

  assert.ok(!email.body.includes("HTML_ATTACHMENT_CONTENT"));
});

// --------------------------------------------------
// Missing content and snippet fallback
// --------------------------------------------------

test("Falls back to Gmail snippet when no usable body exists", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart([createTextPart(""), createHtmlPart("<p></p>")]),
      snippet: "Application confirmation preview",
    }),
  );

  assert.equal(email.body, "Application confirmation preview");
});

test("Handles missing Gmail payload safely", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      snippet: "Available email preview",
    }),
  );

  assert.equal(email.subject, "");
  assert.equal(email.from, "");
  assert.equal(email.body, "Available email preview");
});

test("Returns an empty body when no usable content exists", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createTextPart(""),
      snippet: "",
    }),
  );

  assert.equal(email.body, "");
});

// --------------------------------------------------
// Gmail service and parser integration
// --------------------------------------------------

test("Extracts job title from converted HTML email content", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      subject: "Application Received",

      payload: createHtmlPart(`
        <p>Thank you for applying.</p>
        <p>Company: Example Company</p>
        <p><strong>Position:</strong> Software Engineer</p>
      `),

      snippet: "Thank you for applying.",
    }),
  );

  const result = extractJobTitle(email);

  assert.deepEqual(result, {
    jobTitle: "Software Engineer",
    source: "body",
  });
});

// ==================================================
// Gmail body source attribution regression tests
// ==================================================

test("Identifies plain-text body source", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createTextPart("Full plain-text content"),
      snippet: "Short preview",
    }),
  );

  assert.equal(email.body, "Full plain-text content");
  assert.equal(email.bodySource, "plain_text");
});

test("Identifies converted HTML body source", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createHtmlPart("<p>Full HTML content</p>"),
      snippet: "Short preview",
    }),
  );

  assert.equal(email.body, "Full HTML content");
  assert.equal(email.bodySource, "html");
});

test("Preserves plain-text source for multipart emails", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart([
        createTextPart("PLAIN_TEXT_CONTENT"),
        createHtmlPart("<p>HTML_CONTENT</p>"),
      ]),
    }),
  );

  assert.equal(email.body, "PLAIN_TEXT_CONTENT");
  assert.equal(email.bodySource, "plain_text");
});

test("Identifies HTML source when plain text is empty", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart([
        createTextPart("   \n   "),
        createHtmlPart("<p>HTML_FALLBACK</p>"),
      ]),
    }),
  );

  assert.equal(email.body, "HTML_FALLBACK");
  assert.equal(email.bodySource, "html");
});

test("Identifies snippet fallback source correctly", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createMultipart([createTextPart(""), createHtmlPart("<p></p>")]),
      snippet: "Application confirmation preview",
    }),
  );

  assert.equal(email.body, "Application confirmation preview");

  assert.equal(email.bodySource, "snippet");
});

test("Returns null body source without usable content", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      payload: createTextPart(""),
      snippet: "",
    }),
  );

  assert.equal(email.body, "");
  assert.equal(email.bodySource, null);
});

// ==================================================
// Gmail retrieval and suggestion confidence integration
// ==================================================

test("Preserves medium confidence for snippet-only Gmail suggestions", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      subject: "Application Received",

      payload: createTextPart(""),

      snippet:
        "Thank you for applying for the Software Engineer position at Example Company.",
    }),
  );

  assert.equal(email.bodySource, "snippet");

  const suggestion = parseApplicationEmail(email);

  assert.ok(suggestion);

  assert.equal(suggestion.companyName, "Example Company");

  assert.equal(suggestion.jobTitle, "Software Engineer");

  assert.equal(suggestion.confidence, "medium");

  assert.deepEqual(suggestion.sources, {
    companyName: "snippet",
    jobTitle: "snippet",
    applicationDate: "received_at",
  });

  assert.ok(suggestion.warnings.includes("estimated_application_date"));
});

test("Preserves strong extraction sources for HTML-only Gmail suggestions", async (t) => {
  const email = await retrieveMessage(
    t,
    createMessage({
      subject: "Application Received",

      payload: createHtmlPart(`
        <p>
          Thank you for applying for the
          Software Engineer position at Example Company.
        </p>
      `),

      snippet: "Thank you for applying.",
    }),
  );

  assert.equal(email.bodySource, "html");

  const suggestion = parseApplicationEmail(email);

  assert.ok(suggestion);

  assert.equal(suggestion.companyName, "Example Company");

  assert.equal(suggestion.jobTitle, "Software Engineer");

  assert.equal(suggestion.confidence, "high");

  assert.deepEqual(suggestion.sources, {
    companyName: "body",
    jobTitle: "body",
    applicationDate: "received_at",
  });

  assert.ok(suggestion.warnings.includes("estimated_application_date"));
});

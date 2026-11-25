const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EMAIL_TYPES,
  classifyEmail,
  extractCompanyName,
  extractJobTitle,
  calculateConfidence,
  parseApplicationEmail,
} = require("../src/services/emailParser");

// ==================================================
// BUG-01: Non-job application false positives
// ==================================================

test("Rejects scholarship sender with generic application confirmation", () => {
  const email = {
    subject: "Application Submitted! Congrats!",
    from: "ScholarshipOwl <info@scholarshipowl.com>",
    body: "Your application has been submitted. Explore career opportunities.",
  };

  assert.equal(classifyEmail(email), EMAIL_TYPES.NON_JOB_APPLICATION);

  assert.equal(parseApplicationEmail(email), null);
});

test("Rejects generic scholarship organization confirmation", () => {
  const email = {
    subject: "Application Submitted!",
    from: "Student Scholarship Services <info@example.com>",
    body: "Your application has been submitted.",
  };

  assert.equal(classifyEmail(email), EMAIL_TYPES.NON_JOB_APPLICATION);
});

test("Allows explicit employment applications from scholarship organizations", () => {
  const email = {
    subject: "Application Received",
    from: "Scholarship Foundation <careers@example.com>",
    body: "Thank you for applying for the Software Engineer position at Example Foundation.",
  };

  assert.equal(classifyEmail(email), EMAIL_TYPES.APPLICATION_CONFIRMATION);
});

// ==================================================
// BUG-02 and BUG-03: Company extraction
// ==================================================

const companyCases = [
  {
    name: "Rejects generic client reference",
    email: {
      subject: "Your Application to Frontend Engineer",
      body: "Thank you for applying for the Frontend Engineer position at our client.",
      from: "recruiter@example.com",
    },
    expected: "",
    source: null,
  },
  {
    name: "Extracts company after named position",
    email: {
      body: "Thank you for your application to the Junior Software Developer position at emotions.",
    },
    expected: "emotions",
    source: "body",
  },
  {
    name: "Extracts company outside technology industry",
    email: {
      body: "Thank you for your application to the Registered Nurse position at Example Hospital.",
    },
    expected: "Example Hospital",
    source: "body",
  },
  {
    name: "Preserves legitimate company with article",
    email: {
      subject: "Thank you for applying to The Customization Group",
    },
    expected: "The Customization Group",
    source: "subject",
  },
  {
    name: "Preserves legitimate company containing client",
    email: {
      subject: "Thank you for applying to Client Solutions Inc.",
    },
    expected: "Client Solutions Inc",
    source: "subject",
  },
];

for (const item of companyCases) {
  test(item.name, () => {
    assert.deepEqual(extractCompanyName(item.email), {
      companyName: item.expected,
      source: item.source,
    });
  });
}

// ==================================================
// BUG-04: Job title extraction patterns
// ==================================================

const jobTitleCases = [
  [
    "Thank you for your application to the Backend Engineer position.",
    "Backend Engineer",
  ],
  ["Thank you for applying to the Data Analyst role.", "Data Analyst"],
  [
    "We have received your application for the role of Product Manager.",
    "Product Manager",
  ],
  [
    "Your application for Senior Accountant has been received.",
    "Senior Accountant",
  ],
  ["Job Title: Registered Nurse", "Registered Nurse"],
  ["Position Applied For: Business Analyst", "Business Analyst"],
  ["Role Applied For:\nMarketing Manager", "Marketing Manager"],
  ["Thank you for applying to our company.", ""],
  ["Thank you for your application.", ""],
  ["Thank you for applying for the C++ Developer position.", "C++ Developer"],
];

for (const [index, item] of jobTitleCases.entries()) {
  test(`Improved job title extraction case ${index + 1}`, () => {
    const [body, expected] = item;

    assert.deepEqual(extractJobTitle({ body }), {
      jobTitle: expected,
      source: expected ? "body" : null,
    });
  });
}

// ==================================================
// BUG-04: Generic title normalization regression
// ==================================================

const genericTitleCases = [
  ["Available position", ""],
  ["Open role", ""],
  ["Current job", ""],
  ["Available", ""],
  ["Open", ""],
  ["Current", ""],
  ["Our client", ""],
  ["This position", ""],
  ["Software Engineer position", "Software Engineer"],
  ["Senior Accountant role", "Senior Accountant"],
  ["Open Source Engineer", "Open Source Engineer"],
  ["C++ Developer", "C++ Developer"],
  ["Registered Nurse", "Registered Nurse"],
];

for (const [candidate, expected] of genericTitleCases) {
  test(`Validates normalized job title: ${candidate}`, () => {
    assert.deepEqual(
      extractJobTitle({
        body: `Position: ${candidate}`,
      }),
      {
        jobTitle: expected,
        source: expected ? "body" : null,
      },
    );
  });
}

// ==================================================
// BUG-06: Unsupported sender-based employer inference
// ==================================================

const senderCases = [
  ["John Smith <john.smith@example.com>", ""],
  ["Jane Doe <support@example.com>", ""],
  [
    "Recruiter - The Customization Group <recruiter@example.com>",
    "The Customization Group",
  ],
  ["Example Company <careers@example.com>", "Example Company"],
  ["Appetiser Apps <talent@example.com>", "Appetiser Apps"],
  ["NashTech <no-reply@nashtech.com>", "NashTech"],
  ["SME Careers <noreply@example.com>", "SME Careers"],
  ["Alex Morgan <alex.morgan@recruitment.example.com>", ""],
  ["Alex Morgan <services@recruitment.example.com>", ""],
  [
    "Jane Doe - Example Technologies <jane@example.com>",
    "Example Technologies",
  ],
  ["No Reply <no-reply@example.com>", ""],
  ["Blue River <careers@blueriver.com>", "Blue River"],
  ["Jane Doe - John Smith <jane@example.com>", ""],
  ["Axon <careers@axon.com>", "Axon"],
];

for (const [index, item] of senderCases.entries()) {
  test(`Conservative sender fallback case ${index + 1}`, () => {
    const [from, expected] = item;

    assert.deepEqual(extractCompanyName({ from }), {
      companyName: expected,
      source: expected ? "sender" : null,
    });
  });
}

// ==================================================
// BUG-05 and BUG-07: Confidence and source attribution
// ==================================================

const confirmationText =
  "Thank you for applying for the Software Engineer position at Example Company.";

const sourceCases = [
  {
    name: "Plain text",
    email: {
      body: confirmationText,
      bodySource: "plain_text",
    },
    source: "body",
    confidence: "high",
  },
  {
    name: "Converted HTML",
    email: {
      body: confirmationText,
      bodySource: "html",
    },
    source: "body",
    confidence: "high",
  },
  {
    name: "Snippet fallback body",
    email: {
      body: confirmationText,
      bodySource: "snippet",
      snippet: confirmationText,
    },
    source: "snippet",
    confidence: "medium",
  },
  {
    name: "Direct snippet",
    email: {
      body: "",
      bodySource: null,
      snippet: confirmationText,
    },
    source: "snippet",
    confidence: "medium",
  },
  {
    name: "Legacy fixture",
    email: {
      body: confirmationText,
    },
    source: "body",
    confidence: "high",
  },
];

for (const item of sourceCases) {
  test(`Preserves extraction source: ${item.name}`, () => {
    const company = extractCompanyName(item.email);
    const job = extractJobTitle(item.email);

    assert.deepEqual(company, {
      companyName: "Example Company",
      source: item.source,
    });

    assert.deepEqual(job, {
      jobTitle: "Software Engineer",
      source: item.source,
    });

    assert.equal(
      calculateConfidence(company, job, {
        applicationDate: "2026-06-15",
        estimated: true,
      }),
      item.confidence,
    );
  });
}

// ==================================================
// End-to-end parser behavior
// ==================================================

test("Preserves valid suggestion when employer is unknown", () => {
  const suggestion = parseApplicationEmail({
    messageId: "message-001",
    subject: "Your Application to Frontend Engineer",
    from: "Jane Doe <jane.doe@example.com>",
    body: "Thank you for applying for the Frontend Engineer position at our client.",
    receivedAt: "2026-06-15T12:00:00Z",
  });

  assert.ok(suggestion);

  assert.equal(suggestion.companyName, "");
  assert.equal(suggestion.jobTitle, "Frontend Engineer");
  assert.equal(suggestion.confidence, "low");
  assert.equal(suggestion.sources.companyName, null);

  assert.ok(suggestion.warnings.includes("missing_company_name"));
});

test("Does not assign high confidence to snippet-only suggestion", () => {
  const suggestion = parseApplicationEmail({
    messageId: "message-002",
    subject: "Application Received",
    from: "careers@example.com",
    body: confirmationText,
    bodySource: "snippet",
    snippet: confirmationText,
    receivedAt: "2026-06-15T12:00:00Z",
  });

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

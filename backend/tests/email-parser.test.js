const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyEmail,
  EMAIL_TYPES,
  extractCompanyName,
  extractJobTitle,
  extractApplicationDate,
  calculateConfidence,
  parseApplicationEmail,
} = require("../src/services/emailParser");

test("Detects job application confirmation", () => {
  const result = classifyEmail({
    subject: "Application received for the role of Software Engineer",
  });

  assert.equal(result, EMAIL_TYPES.APPLICATION_CONFIRMATION);
});

test("Excludes scholarship applications", () => {
  const result = classifyEmail({
    subject: "Thank you for applying to the Memorial Scholarship",
  });

  assert.equal(result, EMAIL_TYPES.NON_JOB_APPLICATION);
});

test("Identifies interview invitations as follow-ups", () => {
  const result = classifyEmail({
    subject: "First Round Interview",
    body: "Thank you for applying for this position.",
  });

  assert.equal(result, EMAIL_TYPES.JOB_FOLLOW_UP);
});

test("Returns unknown when job context is missing", () => {
  const result = classifyEmail({
    subject: "Thank you for applying",
    from: "no-reply@example.com",
  });

  assert.equal(result, EMAIL_TYPES.UNKNOWN);
});

test("Supports user-defined trusted domains", () => {
  const result = classifyEmail(
    {
      subject: "Thank you for applying",
      from: "no-reply@example.com",
    },
    {
      trustedSenders: ["example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.APPLICATION_CONFIRMATION);
});

test("Supports user-defined blocked domains", () => {
  const result = classifyEmail(
    {
      subject: "Application received for a new position",
      from: "support@example.com",
    },
    {
      blockedSenders: ["example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.BLOCKED_SENDER);
});

test("Blocked sender overrides trusted sender", () => {
  const result = classifyEmail(
    {
      subject: "Thank you for applying for this position",
      from: "careers@example.com",
    },
    {
      trustedSenders: ["example.com"],
      blockedSenders: ["example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.BLOCKED_SENDER);
});

test("Trusted sender cannot override follow-up classification", () => {
  const result = classifyEmail(
    {
      subject: "First Round Interview",
      from: "careers@example.com",
    },
    {
      trustedSenders: ["example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.JOB_FOLLOW_UP);
});

test("Prevents false domain matching", () => {
  const result = classifyEmail(
    {
      subject: "Thank you for applying",
      from: "no-reply@fakeexample.com",
    },
    {
      trustedSenders: ["example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.UNKNOWN);
});

test("Recognizes generic recruiting mailbox names", () => {
  const result = classifyEmail({
    subject: "Thank you for applying",
    from: "no-reply-talent@example.com",
  });

  assert.equal(result, EMAIL_TYPES.APPLICATION_CONFIRMATION);
});

test("Trusted sender cannot override scholarship classification", () => {
  const result = classifyEmail(
    {
      subject: "Scholarship Application Received",
      from: "no-reply@example.com",
    },
    {
      trustedSenders: ["example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.NON_JOB_APPLICATION);
});

test("Unlisted senders remain eligible for detection", () => {
  const result = classifyEmail(
    {
      subject: "Application received for a Software Engineer position",
      from: "support@newcompany.com",
    },
    {
      trustedSenders: ["anothercompany.com"],
      blockedSenders: ["unrelatedcompany.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.APPLICATION_CONFIRMATION);
});

test("Supports exact email address preferences", () => {
  const result = classifyEmail(
    {
      subject: "Thank you for applying",
      from: "Recruiter <recruiter@example.com>",
    },
    {
      trustedSenders: ["recruiter@example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.APPLICATION_CONFIRMATION);
});

test("Exact domain preference does not match subdomains", () => {
  const result = classifyEmail(
    {
      subject: "Thank you for applying",
      from: "no-reply@sub.example.com",
    },
    {
      trustedSenders: ["example.com"],
    },
  );

  assert.equal(result, EMAIL_TYPES.UNKNOWN);
});

test("Extracts company name from application confirmation subject", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "Thank you for applying to Example Company!",
    }),
    {
      companyName: "Example Company",
      source: "subject",
    },
  );
});

test("Extracts company from a subject containing job title", () => {
  assert.deepEqual(
    extractCompanyName({
      subject:
        "Application received for the role of Jr. Full-Stack Developer at Example Company",
    }),
    {
      companyName: "Example Company",
      source: "subject",
    },
  );
});

test("Extracts company from application received subject prefix", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "Example Company - Application Received",
    }),
    {
      companyName: "Example Company",
      source: "subject",
    },
  );
});

test("Extracts company from bracketed subject format", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "[Example Company] Thank you for your application",
    }),
    {
      companyName: "Example Company",
      source: "subject",
    },
  );
});

test("Extracts company from received application subject", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "We've received your Example Company application!",
    }),
    {
      companyName: "Example Company",
      source: "subject",
    },
  );
});

test("Extracts company name from email body", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "Application received",
      body: "Thank you for applying for the Software Engineer position at Example Company.",
    }),
    {
      companyName: "Example Company",
      source: "body",
    },
  );
});

test("Extracts company name from email snippet", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "Application received",
      snippet: "Thank you for applying to Example Company.",
    }),
    {
      companyName: "Example Company",
      source: "snippet",
    },
  );
});

test("Falls back to sender display name", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "We have received your application!",
      from: "Example Company <no-reply@example.com>",
    }),
    {
      companyName: "Example Company",
      source: "sender",
    },
  );
});

test("Extracts company from recruiter and company display name", () => {
  assert.deepEqual(
    extractCompanyName({
      from: "Jane Smith - Example Company <recruiter@example.com>",
    }),
    {
      companyName: "Example Company",
      source: "sender",
    },
  );
});

test("Prefers subject company over body and sender", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "Thank you for applying to Example Company",
      body: "Thank you for applying to Another Company.",
      from: "Recruiting Platform <no-reply@example.org>",
    }),
    {
      companyName: "Example Company",
      source: "subject",
    },
  );
});

test("Prefers body company over sender display name", () => {
  assert.deepEqual(
    extractCompanyName({
      body: "Thank you for applying to Example Company.",
      from: "Recruiting Platform <no-reply@example.org>",
    }),
    {
      companyName: "Example Company",
      source: "body",
    },
  );
});

test("Does not use generic sender names as company names", () => {
  const genericNames = [
    "Support",
    "No Reply",
    "Recruitment",
    "Careers",
    "Talent Acquisition",
    "HR",
  ];

  for (const name of genericNames) {
    assert.deepEqual(
      extractCompanyName({
        from: `${name} <no-reply@example.com>`,
      }),
      {
        companyName: "",
        source: null,
      },
    );
  }
});

test("Does not infer company name from sender domain alone", () => {
  assert.deepEqual(
    extractCompanyName({
      from: "no-reply@example.com",
    }),
    {
      companyName: "",
      source: null,
    },
  );
});

test("Rejects generic company references", () => {
  assert.deepEqual(
    extractCompanyName({
      subject: "Thank you for applying to our company!",
    }),
    {
      companyName: "",
      source: null,
    },
  );
});

test("Handles missing email data", () => {
  assert.deepEqual(extractCompanyName({}), {
    companyName: "",
    source: null,
  });
});

test("Extracts job title from application confirmation subject", () => {
  assert.deepEqual(
    extractJobTitle({
      subject:
        "Application received for the role of Jr. Full-Stack Developer at Example Company",
    }),
    {
      jobTitle: "Jr. Full-Stack Developer",
      source: "subject",
    },
  );
});

test("Extracts job titles outside the technology industry", () => {
  const titles = [
    "Registered Nurse",
    "Accountant",
    "Marketing Manager",
    "Civil Engineer",
    "Elementary School Teacher",
    "Warehouse Supervisor",
  ];

  for (const title of titles) {
    assert.deepEqual(
      extractJobTitle({
        subject: `Application received for the role of ${title} at Example Company`,
      }),
      {
        jobTitle: title,
        source: "subject",
      },
    );
  }
});

test("Extracts job title from direct position confirmation", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Application received for Registered Nurse position",
    }),
    {
      jobTitle: "Registered Nurse",
      source: "subject",
    },
  );
});

test("Extracts job title from thank-you subject", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Thank you for applying for the Accountant position",
    }),
    {
      jobTitle: "Accountant",
      source: "subject",
    },
  );
});

test("Extracts job title from your application subject", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Your Application to Frontend Engineer",
    }),
    {
      jobTitle: "Frontend Engineer",
      source: "subject",
    },
  );
});

test("Preserves job title qualifiers and specialization", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Your Application to Frontend Engineer (React | Hybrid HCM)",
    }),
    {
      jobTitle: "Frontend Engineer (React | Hybrid HCM)",
      source: "subject",
    },
  );
});

test("Extracts job title from a separated confirmation subject", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Thank you for your application – Junior Software Developer",
    }),
    {
      jobTitle: "Junior Software Developer",
      source: "subject",
    },
  );
});

test("Extracts job title from email body", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Application received",
      body: "Thank you for applying for the Registered Nurse position at Example Hospital.",
    }),
    {
      jobTitle: "Registered Nurse",
      source: "body",
    },
  );
});

test("Extracts job title from a labeled body field", () => {
  assert.deepEqual(
    extractJobTitle({
      body: "Your application has been received.\nJob Title: Financial Analyst\nLocation: San Jose",
    }),
    {
      jobTitle: "Financial Analyst",
      source: "body",
    },
  );
});

test("Extracts job title from email snippet", () => {
  assert.deepEqual(
    extractJobTitle({
      snippet:
        "We have received your application for the Marketing Manager position.",
    }),
    {
      jobTitle: "Marketing Manager",
      source: "snippet",
    },
  );
});

test("Prefers subject job title over body and snippet", () => {
  assert.deepEqual(
    extractJobTitle({
      subject:
        "Application received for the role of Senior Accountant at Example Company",
      body: "Thank you for applying for the Accountant position.",
      snippet: "Thank you for applying for the Financial Analyst position.",
    }),
    {
      jobTitle: "Senior Accountant",
      source: "subject",
    },
  );
});

test("Prefers body job title over snippet", () => {
  assert.deepEqual(
    extractJobTitle({
      body: "Thank you for applying for the Marketing Manager position.",
      snippet: "Thank you for applying for the Marketing Assistant position.",
    }),
    {
      jobTitle: "Marketing Manager",
      source: "body",
    },
  );
});

test("Does not extract a company-only thank-you subject as a job title", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Thank you for applying to Example Company",
    }),
    {
      jobTitle: "",
      source: null,
    },
  );
});

test("Does not infer job title from sender information", () => {
  assert.deepEqual(
    extractJobTitle({
      from: "Software Engineering Recruitment <careers@example.com>",
    }),
    {
      jobTitle: "",
      source: null,
    },
  );
});

test("Rejects generic job title references", () => {
  const references = [
    "this position",
    "this role",
    "this job",
    "that position",
    "that role",
    "any job",
    "the position",
    "our position",
    "your role",
  ];

  for (const reference of references) {
    assert.deepEqual(
      extractJobTitle({
        subject: `Your Application to ${reference}`,
      }),
      {
        jobTitle: "",
        source: null,
      },
      `Failed to reject: ${reference}`,
    );
  }
});

test("Rejects scholarship references as job titles", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: "Your Application to the Memorial Scholarship",
    }),
    {
      jobTitle: "",
      source: null,
    },
  );
});

test("Rejects job titles exceeding 150 characters", () => {
  assert.deepEqual(
    extractJobTitle({
      subject: `Your Application to ${"A".repeat(151)}`,
    }),
    {
      jobTitle: "",
      source: null,
    },
  );
});

test("Handles missing job title information", () => {
  assert.deepEqual(extractJobTitle({}), {
    jobTitle: "",
    source: null,
  });
});

test("Extracts estimated application date from received timestamp", () => {
  assert.deepEqual(
    extractApplicationDate({
      receivedAt: "2026-05-28T04:07:25.000Z",
    }),
    {
      applicationDate: "2026-05-28",
      source: "received_at",
      estimated: true,
    },
  );
});

test("Handles missing application date", () => {
  assert.deepEqual(extractApplicationDate({}), {
    applicationDate: "",
    source: null,
    estimated: false,
  });
});

test("Rejects invalid application date", () => {
  assert.deepEqual(
    extractApplicationDate({
      receivedAt: "invalid-date",
    }),
    {
      applicationDate: "",
      source: null,
      estimated: false,
    },
  );
});

test("Rejects unsupported received timestamp values", () => {
  for (const value of [null, undefined, "", " ", 12345, {}]) {
    assert.deepEqual(
      extractApplicationDate({
        receivedAt: value,
      }),
      {
        applicationDate: "",
        source: null,
        estimated: false,
      },
    );
  }
});

test("Uses UTC date consistently", () => {
  assert.deepEqual(
    extractApplicationDate({
      receivedAt: "2026-05-28T23:30:00-07:00",
    }),
    {
      applicationDate: "2026-05-29",
      source: "received_at",
      estimated: true,
    },
  );
});

test("Assigns high confidence to complete strong-source extraction", () => {
  assert.equal(
    calculateConfidence(
      {
        companyName: "Example Company",
        source: "subject",
      },
      {
        jobTitle: "Software Engineer",
        source: "body",
      },
      {
        applicationDate: "2026-05-28",
      },
    ),
    "high",
  );
});

test("Assigns medium confidence to sender-based company extraction", () => {
  assert.equal(
    calculateConfidence(
      {
        companyName: "Example Company",
        source: "sender",
      },
      {
        jobTitle: "Software Engineer",
        source: "body",
      },
      {
        applicationDate: "2026-05-28",
      },
    ),
    "medium",
  );
});

test("Assigns medium confidence to snippet-based job title extraction", () => {
  assert.equal(
    calculateConfidence(
      {
        companyName: "Example Company",
        source: "subject",
      },
      {
        jobTitle: "Software Engineer",
        source: "snippet",
      },
      {
        applicationDate: "2026-05-28",
      },
    ),
    "medium",
  );
});

test("Assigns low confidence when required information is missing", () => {
  const company = {
    companyName: "Example Company",
    source: "subject",
  };

  const job = {
    jobTitle: "Software Engineer",
    source: "subject",
  };

  const date = {
    applicationDate: "2026-05-28",
  };

  assert.equal(
    calculateConfidence({ companyName: "", source: null }, job, date),
    "low",
  );

  assert.equal(
    calculateConfidence(company, { jobTitle: "", source: null }, date),
    "low",
  );

  assert.equal(
    calculateConfidence(company, job, { applicationDate: "" }),
    "low",
  );
});

test("Creates complete application suggestion from confirmation email", () => {
  assert.deepEqual(
    parseApplicationEmail({
      messageId: "test-001",
      subject:
        "Application received for the role of Software Engineer at Example Company",
      receivedAt: "2026-05-28T04:07:25.000Z",
    }),
    {
      messageId: "test-001",
      companyName: "Example Company",
      jobTitle: "Software Engineer",
      applicationDate: "2026-05-28",
      status: "Applied",
      confidence: "high",
      sources: {
        companyName: "subject",
        jobTitle: "subject",
        applicationDate: "received_at",
      },
      warnings: ["estimated_application_date"],
    },
  );
});

test("Creates incomplete suggestion when job title is missing", () => {
  const result = parseApplicationEmail({
    subject: "Thank you for applying to Example Company",
    body: "We received your application for this position.",
    receivedAt: "2026-05-28T04:07:25.000Z",
  });

  assert.equal(result.companyName, "Example Company");
  assert.equal(result.jobTitle, "");
  assert.equal(result.confidence, "low");

  assert.ok(result.warnings.includes("missing_job_title"));
});

test("Creates incomplete suggestion when company name is missing", () => {
  const result = parseApplicationEmail({
    subject: "Application received for Registered Nurse position",
    receivedAt: "2026-05-28T04:07:25.000Z",
  });

  assert.equal(result.companyName, "");
  assert.equal(result.jobTitle, "Registered Nurse");
  assert.equal(result.confidence, "low");

  assert.ok(result.warnings.includes("missing_company_name"));
});

test("Creates incomplete suggestion when application date is missing", () => {
  const result = parseApplicationEmail({
    subject:
      "Application received for the role of Software Engineer at Example Company",
  });

  assert.equal(result.applicationDate, "");
  assert.equal(result.confidence, "low");

  assert.ok(result.warnings.includes("missing_application_date"));

  assert.ok(!result.warnings.includes("estimated_application_date"));
});

test("Reports company name inferred from sender", () => {
  const result = parseApplicationEmail({
    subject: "Application received",
    from: "Example Company <careers@example.com>",
    body: "Thank you for applying for the Accountant position.",
    receivedAt: "2026-05-28T04:07:25.000Z",
  });

  assert.equal(result.companyName, "Example Company");
  assert.equal(result.jobTitle, "Accountant");
  assert.equal(result.confidence, "medium");

  assert.ok(result.warnings.includes("company_inferred_from_sender"));
});

test("Does not create suggestions from scholarship emails", () => {
  assert.equal(
    parseApplicationEmail({
      subject: "Scholarship Application Received",
    }),
    null,
  );
});

test("Does not create suggestions from job follow-up emails", () => {
  assert.equal(
    parseApplicationEmail({
      subject: "First Round Interview",
      body: "Thank you for applying for this position.",
    }),
    null,
  );
});

test("Does not create suggestions from unknown emails", () => {
  assert.equal(
    parseApplicationEmail({
      subject: "Weekly Newsletter",
    }),
    null,
  );
});

test("Respects blocked sender preferences when creating suggestions", () => {
  assert.equal(
    parseApplicationEmail(
      {
        subject:
          "Application received for the role of Software Engineer at Example Company",
        from: "careers@example.com",
        receivedAt: "2026-05-28T04:07:25.000Z",
      },
      {
        blockedSenders: ["example.com"],
      },
    ),
    null,
  );
});

test("Respects trusted sender preferences when creating suggestions", () => {
  const result = parseApplicationEmail(
    {
      subject: "Thank you for applying to Example Company",
      from: "no-reply@example.com",
      receivedAt: "2026-05-28T04:07:25.000Z",
    },
    {
      trustedSenders: ["example.com"],
    },
  );

  assert.ok(result);
  assert.equal(result.companyName, "Example Company");
  assert.equal(result.confidence, "low");
});

test("Clears ambiguous job title matching company name", () => {
  const result = parseApplicationEmail({
    subject: "Example Company - Application Received",
    from: "careers@example.com",
    receivedAt: "2026-05-28T04:07:25.000Z",
  });

  assert.equal(result.companyName, "Example Company");
  assert.equal(result.jobTitle, "");
  assert.equal(result.confidence, "low");

  assert.ok(result.warnings.includes("ambiguous_job_title"));

  assert.ok(result.warnings.includes("missing_job_title"));
});

test("Recovers job title from body when subject extraction is ambiguous", () => {
  const result = parseApplicationEmail({
    subject: "Example Company - Application Received",
    from: "careers@example.com",
    body: "Thank you for applying for the Financial Analyst position.",
    receivedAt: "2026-05-28T04:07:25.000Z",
  });

  assert.equal(result.companyName, "Example Company");
  assert.equal(result.jobTitle, "Financial Analyst");
  assert.equal(result.sources.jobTitle, "body");
  assert.equal(result.confidence, "high");

  assert.ok(!result.warnings.includes("missing_job_title"));
});

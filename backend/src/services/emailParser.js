const EMAIL_TYPES = Object.freeze({
  APPLICATION_CONFIRMATION: "application_confirmation",
  JOB_FOLLOW_UP: "job_follow_up",
  NON_JOB_APPLICATION: "non_job_application",
  BLOCKED_SENDER: "blocked_sender",
  UNKNOWN: "unknown",
});

// General indicators of non-job applications.
const NON_JOB_PATTERNS = [
  /\bscholarships?\b/i,
  /\bfinancial aid\b/i,
  /\bcollege admission\b/i,
  /\buniversity admission\b/i,
  /\badmission application\b/i,
  /\bstudent admission\b/i,
  /\bloan application\b/i,
  /\bcredit card application\b/i,
  /\brental application\b/i,
  /\bvisa application\b/i,
  /\bgrant application\b/i,
];

const NON_JOB_SENDER_PATTERNS = [
  /\bscholarships?\b/i,
  /\bfinancial\s*aid\b/i,
  /\bcollege\s*admissions?\b/i,
  /\buniversity\s*admissions?\b/i,
  /\bstudent\s*admissions?\b/i,
];

// Indicators of later stages in the hiring process.
const FOLLOW_UP_SUBJECT_PATTERNS = [
  /\binterviews?\b/i,
  /\bassessments?\b/i,
  /\bcoding challenge\b/i,
  /\bcoding test\b/i,
  /\btest task\b/i,
  /\btechnical test\b/i,
  /\bnext steps?\b/i,
  /\bmoving forward\b/i,
  /\bapplication status\b/i,
  /\bapplication update\b/i,
  /\bnot selected\b/i,
  /\bunsuccessful\b/i,
  /\brejection\b/i,
  /\bjob offer\b/i,
  /\boffer letter\b/i,
];

const FOLLOW_UP_BODY_PATTERNS = [
  /\bwe regret to inform you\b/i,
  /\bwe will not be moving forward\b/i,
  /\bwe have decided not to proceed\b/i,
  /\bwe have decided to pursue other candidates\b/i,
  /\bwe would like to invite you (?:to|for)\b/i,
  /\byou have been selected for an interview\b/i,
  /\bplease complete the (?:assessment|coding challenge|test)\b/i,
];

// Common application confirmation phrases.
const CONFIRMATION_PATTERNS = [
  /\bthank you for applying\b/i,
  /\bthanks for applying\b/i,
  /\bthank you for your application\b/i,
  /\bthanks for your application\b/i,
  /\bapplication received\b/i,
  /\bapplication confirmation\b/i,
  /\bapplication submitted\b/i,
  /\bapplication (?:has been|was|is) (?:successfully )?(?:received|submitted)\b/i,
  /\b(?:we have|we've|we) received your\b.{0,80}\bapplication\b/i,
];

// General hiring-related context.
const JOB_CONTEXT_PATTERNS = [
  /\bjobs?\b/i,
  /\bpositions?\b/i,
  /\broles?\b/i,
  /\bcareers?\b/i,
  /\brecruit(?:er|ing|ment)\b/i,
  /\bhiring\b/i,
  /\bcandidates?\b/i,
  /\bemployment\b/i,
  /\binternships?\b/i,
  /\btalent acquisition\b/i,
];

const EXPLICIT_JOB_APPLICATION_PATTERNS = [
  /\b(?:job|employment|internship) application\b/i,
  /\bapplication (?:for|to) (?:the |a |an )?(?:job|role|position|internship)\b/i,
  /\bapplication received for the role of\b/i,
  /\b(?:applied|applying) for (?:the |a |an )?(?:job|role|position|internship)\b/i,
  /\bthank you for applying for (?:the |a |an )?[^.!?\n]{1,100}\b(?:position|role|job|internship)\b/i,
];

// Generic recruiting-related mailbox names.
// No specific company or email domain is hard-coded.
const RECRUITING_MAILBOX_PATTERNS = [
  /(?:^|[._+-])careers?(?:$|[._+-])/i,
  /(?:^|[._+-])recruit(?:er|ing|ment)(?:$|[._+-])/i,
  /(?:^|[._+-])talent(?:$|[._+-])/i,
  /(?:^|[._+-])hiring(?:$|[._+-])/i,
  /(?:^|[._+-])hr(?:$|[._+-])/i,
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

// Extract the actual email address from a From header.
function extractSenderAddress(from) {
  const value = normalizeText(from).toLowerCase();

  const bracketMatch = value.match(/<([^<>]+)>/);

  const address = (bracketMatch ? bracketMatch[1] : value).trim();

  const validAddress = /^[^\s@<>]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

  return validAddress.test(address) ? address : "";
}

function extractSenderDomain(address) {
  if (!address) return "";

  return address.split("@").pop();
}

// Match user-defined email addresses or domains.
// Domain matching is exact, not substring-based.
function matchesSenderPreference(from, preferences = []) {
  const address = extractSenderAddress(from);

  if (!address || !Array.isArray(preferences)) {
    return false;
  }

  const domain = extractSenderDomain(address);

  return preferences.some((preference) => {
    if (typeof preference !== "string") {
      return false;
    }

    const normalized = preference.trim().toLowerCase();

    if (!normalized) return false;

    // Allow an optional @ prefix for domain entries.
    if (normalized.startsWith("@")) {
      return domain === normalized.slice(1);
    }

    // Match an exact email address.
    if (normalized.includes("@")) {
      return address === normalized;
    }

    // Match an exact domain.
    return domain === normalized;
  });
}

// Detect generic recruiting mailbox names.
function hasRecruitingMailbox(from) {
  const address = extractSenderAddress(from);

  if (!address) return false;

  const mailbox = address.split("@")[0];

  return matchesAny(mailbox, RECRUITING_MAILBOX_PATTERNS);
}

function classifyEmail(email = {}, preferences = {}) {
  const subject = normalizeText(email.subject);
  const from = normalizeText(email.from);
  const body = normalizeText(email.body);
  const snippet = normalizeText(email.snippet);

  const content = [subject, body, snippet].join(" ");

  const { trustedSenders = [], blockedSenders = [] } = preferences || {};

  // 1. Blocked sender preferences take highest priority.
  if (matchesSenderPreference(from, blockedSenders)) {
    return EMAIL_TYPES.BLOCKED_SENDER;
  }

  // 2. Determine whether the email contains job context.
  const hasContentJobContext = matchesAny(content, JOB_CONTEXT_PATTERNS);

  const hasTrustedSender = matchesSenderPreference(from, trustedSenders);

  const hasJobContext =
    hasContentJobContext || hasTrustedSender || hasRecruitingMailbox(from);

  // 3. Exclude non-job applications.
  const senderContext = normalizeSenderContext(from);

  const hasNonJobSenderContext = matchesAny(
    senderContext,
    NON_JOB_SENDER_PATTERNS,
  );

  const hasNonJobContent = matchesAny(content, NON_JOB_PATTERNS);

  const hasExplicitJobApplication = matchesAny(
    content,
    EXPLICIT_JOB_APPLICATION_PATTERNS,
  );

  // Explicit non-job applications in the subject.
  if (matchesAny(subject, NON_JOB_PATTERNS)) {
    return EMAIL_TYPES.NON_JOB_APPLICATION;
  }

  // Non-job sender context with confirmation language,
  // unless explicit job application evidence exists.
  if (
    hasNonJobSenderContext &&
    matchesAny(content, CONFIRMATION_PATTERNS) &&
    !hasExplicitJobApplication
  ) {
    return EMAIL_TYPES.NON_JOB_APPLICATION;
  }

  // Non-job content without sufficient job context.
  if (hasNonJobContent && !hasContentJobContext) {
    return EMAIL_TYPES.NON_JOB_APPLICATION;
  }

  // 4. Exclude hiring follow-up emails.
  if (
    matchesAny(subject, FOLLOW_UP_SUBJECT_PATTERNS) ||
    matchesAny(content, FOLLOW_UP_BODY_PATTERNS)
  ) {
    return EMAIL_TYPES.JOB_FOLLOW_UP;
  }

  // 5. Require confirmation language and job context.
  if (matchesAny(content, CONFIRMATION_PATTERNS) && hasJobContext) {
    return EMAIL_TYPES.APPLICATION_CONFIRMATION;
  }

  // 6. Insufficient evidence.
  return EMAIL_TYPES.UNKNOWN;
}

function normalizeSenderContext(from) {
  return (
    normalizeText(from)
      // Split camelCase and PascalCase words.
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")

      // Separate common email address and domain delimiters.
      .replace(/[<>"@._+/-]+/g, " ")

      .replace(/\s+/g, " ")
      .trim()
  );
}

const COMPANY_SUBJECT_PATTERNS = [
  /\bapplication received for the role of .+? at (.+)$/i,
  /\bthank you for applying (?:to|at) (.+)$/i,
  /\bthanks for applying (?:to|at) (.+)$/i,
  /\bthank you for your application (?:to|at) (.+)$/i,
  /\bthanks for your application (?:to|at) (.+)$/i,
  /^(.+?)\s+[-–—|]\s+application received\b/i,
  /^\[([^\]]+)\]\s*thank you for/i,
  /\bwe(?:'ve| have) received your (.+?) application[.!]?$/i,
];

const COMPANY_BODY_PATTERNS = [
  // Explicit job title followed by a company name.
  /\b(?:thank you|thanks) for your application (?:to|for) (?:the |a |an )?[^.!?\n]+?\s+(?:position|role|job|internship)\s+(?:at|with)\s+([^.!?\n]+)(?:[.!?\n]|$)/i,

  /\b(?:thank you|thanks) for applying (?:for|to) (?:the |a |an )?[^.!?\n]+?\s+(?:position|role|job|internship)\s+(?:at|with)\s+([^.!?\n]+)(?:[.!?\n]|$)/i,

  // Existing general application patterns.
  /\bthank you for applying (?:for|to) .+? (?:at|with) ([^.!?\n]+)[.!?\n]/i,

  /\bthank you for applying (?:to|at) ([^.!?\n]+)[.!?\n]/i,

  /\bthank you for your application (?:to|at) ([^.!?\n]+)[.!?\n]/i,

  /\bthank you for your interest in ([^.!?\n]+)[.!?\n]/i,
];

const GENERIC_SENDER_PATTERN =
  /^(?:no[\s-]?reply|do[\s-]?not[\s-]?reply|support|admin|administrator|careers?|recruitment|recruiting|talent|talent acquisition|human resources|hr|hiring team|recruiting team|notifications?|application team|team)$/i;

const GENERIC_COMPANY_PATTERN =
  /^(?:us|(?:our|your|their|the|this|that|a|an) (?:company|team|client|clients|employer|organization|organisation|business|partner|partners|customer|customers)|one of (?:our|their) (?:clients|customers|partners)|(?:a|an) (?:undisclosed|confidential|unnamed) (?:company|client|employer))$/i;

function cleanCompanyName(value) {
  let name = normalizeText(value);

  name = name
    .replace(/^["']+|["']+$/g, "")
    .replace(/[.!?,;:]+$/g, "")
    .trim();

  if (!name || name.length > 120) {
    return "";
  }

  if (
    name.includes("@") ||
    /https?:\/\//i.test(name) ||
    GENERIC_SENDER_PATTERN.test(name) ||
    GENERIC_COMPANY_PATTERN.test(name) ||
    /^(?:the|a|an) (?:role|position|job)\b/i.test(name) ||
    /\b(?:position|role|job|internship)\s+(?:at|with)\s+.+$/i.test(name)
  ) {
    return "";
  }

  return name;
}

function extractCompanyFromPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match?.[1]) continue;

    const companyName = cleanCompanyName(match[1]);

    if (companyName) {
      return companyName;
    }
  }

  return "";
}

const ORGANIZATION_NAME_PATTERN =
  /\b(?:incorporated|inc|corporation|corp|company|co|limited|ltd|llc|llp|group|technologies|technology|solutions|systems|software|services|studio|studios|labs|foundation|university|college|hospital|bank|enterprise|enterprises|industries|partners|consulting|careers|apps)\b/i;

function normalizeOrganizationIdentity(value) {
  return normalizeText(value)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function senderNameMatchesMailbox(name, address) {
  if (!name || !address) return false;

  const mailbox = address.split("@")[0];

  return (
    normalizeOrganizationIdentity(name) ===
    normalizeOrganizationIdentity(mailbox)
  );
}

function senderNameMatchesDomain(name, address) {
  if (!name || !address) return false;

  const domain = extractSenderDomain(address);

  const normalizedName = normalizeOrganizationIdentity(name);

  if (normalizedName.length < 3) {
    return false;
  }

  return domain.split(".").some((part) => {
    return normalizeOrganizationIdentity(part) === normalizedName;
  });
}

function extractSenderDisplayName(from) {
  const value = normalizeText(from);

  const match = value.match(/^(.+?)\s*<[^<>]+>$/);

  if (!match) return "";

  const address = extractSenderAddress(from);

  if (!address) return "";

  let displayName = match[1]
    .replace(/^["']+|["']+$/g, "")
    .replace(/^\[no[\s-]?reply\]\s*/i, "")
    .trim();

  // Handle sender names formatted as Person - Company.
  const parts = displayName.split(/\s+[-–—]\s+/);

  if (parts.length > 1) {
    displayName = parts[parts.length - 1];
  }

  const companyName = cleanCompanyName(displayName);

  if (!companyName) {
    return "";
  }

  const hasOrganizationIndicator = ORGANIZATION_NAME_PATTERN.test(companyName);

  const matchesDomain = senderNameMatchesDomain(companyName, address);

  const matchesMailbox = senderNameMatchesMailbox(companyName, address);

  // A matching personal mailbox is not sufficient
  // evidence of an employer's identity.
  if (matchesMailbox && !hasOrganizationIndicator && !matchesDomain) {
    return "";
  }

  // Require supporting organizational evidence.
  if (hasOrganizationIndicator || matchesDomain) {
    return companyName;
  }

  // Do not infer an employer from an ambiguous sender.
  return "";
}

function resolveBodyExtractionSource(email) {
  if (email.bodySource === "snippet") {
    return "snippet";
  }

  return "body";
}

function extractCompanyName(email = {}) {
  const subject = normalizeText(email.subject);
  const body = String(email.body || "");
  const snippet = String(email.snippet || "");

  // 1. Prefer explicit company names in the subject.
  const subjectCompany = extractCompanyFromPatterns(
    subject,
    COMPANY_SUBJECT_PATTERNS,
  );

  if (subjectCompany) {
    return {
      companyName: subjectCompany,
      source: "subject",
    };
  }

  // 2. Search the email body.
  const bodyCompany = extractCompanyFromPatterns(body, COMPANY_BODY_PATTERNS);

  if (bodyCompany) {
    return {
      companyName: bodyCompany,
      source: resolveBodyExtractionSource(email),
    };
  }

  // 3. Search the Gmail snippet separately.
  const snippetCompany = extractCompanyFromPatterns(
    snippet,
    COMPANY_BODY_PATTERNS,
  );

  if (snippetCompany) {
    return {
      companyName: snippetCompany,
      source: "snippet",
    };
  }

  // 3. Fall back to the sender display name.
  const senderCompany = extractSenderDisplayName(email.from);

  if (senderCompany) {
    return {
      companyName: senderCompany,
      source: "sender",
    };
  }

  // 4. Leave the field blank if extraction fails.
  return {
    companyName: "",
    source: null,
  };
}

const JOB_TITLE_SUBJECT_PATTERNS = [
  /\bapplication received for the (?:role|position) of (.+?) at .+$/i,

  /\bapplication received for (?:the )?(.+?) (?:position|role|job)(?: at .+)?$/i,

  /\bthank you for (?:applying|your application) (?:for|to) (?:the )?(.+?) (?:position|role|job)(?: at .+)?$/i,

  /\bthank you for applying for (?:the )?(.+?) at .+$/i,

  /\byour application (?:to|for) (.+)$/i,

  /\bthank you for your application\s*[-–—:|]\s*(.+)$/i,

  /\bapplication (?:received|submitted|confirmation)\s*[-–—:|]\s*(.+)$/i,

  /^(.+?)\s+[-–—|]\s+application (?:received|submitted|confirmation)$/i,
];

const JOB_TITLE_BODY_PATTERNS = [
  // Explicit role or position followed by a job title.
  /\b(?:application|applying) (?:for|to) the (?:role|position) of ([^\r\n]+?)(?:\s+(?:at|with)\s+|[!?]|\.(?=\s|$)|$)/im,

  // Application confirmation with a named position.
  /\b(?:thank you|thanks) for applying (?:for|to) (?:the |a |an )?([^\r\n]+?)\s+(?:position|role|job|internship)\b/i,

  /\b(?:thank you|thanks) for your application (?:for|to) (?:the |a |an )?([^\r\n]+?)\s+(?:position|role|job|internship)\b/i,

  // Received application with a named position.
  /\b(?:we have|we've|we) received your application (?:for|to) (?:the |a |an )?([^\r\n]+?)\s+(?:position|role|job|internship)\b/i,

  // Application received or submitted confirmation.
  /\byour application for (?:the |a |an )?([^\r\n]+?)\s+(?:has been|was|is) (?:successfully )?(?:received|submitted)\b/i,

  // Explicitly labeled job title fields.
  /(?:^|\n)[ \t]*(?:job title|position title|job position|position applied for|role applied for|job applied for|position|role)[ \t]*:[ \t]*(?:\r?\n[ \t]*)?([^\r\n]+)/i,

  // Applied-for statements.
  /\byou (?:have )?applied for (?:the |a |an )?([^\r\n]+?)\s+(?:position|role|job|internship)\b/i,

  // Job title followed by a company name.
  /\bthank you for applying for (?:the |a |an )?([^\r\n]+?)\s+(?:at|with)\s+[^.!?\n]+/i,
];

const GENERIC_JOB_TITLE_PATTERN =
  /^(?:(?:(?:the|a|an|this|that|our|your|any)\s+)?(?:job|position|role|application|opportunity|vacancy|opening)|the|a|an|this|that|our|your|any|us|open|available|current|(?:our|your|their|the|this|that)\s+(?:company|team|client|organization|organisation|business)|(?:open|available|current)\s+(?:job|position|role|opportunity|vacancy|opening))$/i;

function cleanJobTitle(value) {
  let title = normalizeText(value);

  title = title
    .replace(/^["']+|["']+$/g, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/[.!?,;:]+$/g, "")
    .trim();

  // Reject generic references before removing suffixes.
  if (GENERIC_JOB_TITLE_PATTERN.test(title)) {
    return "";
  }

  title = title.replace(/\s+(?:position|role|job)$/i, "").trim();

  // Validate the final normalized job title.
  if (
    !title ||
    title.length > 150 ||
    title.includes("@") ||
    /https?:\/\//i.test(title) ||
    GENERIC_JOB_TITLE_PATTERN.test(title) ||
    /^(?:we|you|your|our)\s+/i.test(title) ||
    /\b(?:scholarship|financial aid|loan application)\b/i.test(title)
  ) {
    return "";
  }

  return title;
}

function extractJobTitleFromPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match?.[1]) continue;

    const jobTitle = cleanJobTitle(match[1]);

    if (jobTitle) {
      return jobTitle;
    }
  }

  return "";
}

function extractJobTitle(email = {}) {
  const subject = normalizeText(email.subject);
  const body = String(email.body || "");
  const snippet = String(email.snippet || "");

  // 1. Prefer explicit job titles in the subject.
  const subjectTitle = extractJobTitleFromPatterns(
    subject,
    JOB_TITLE_SUBJECT_PATTERNS,
  );

  if (subjectTitle) {
    return {
      jobTitle: subjectTitle,
      source: "subject",
    };
  }

  // 2. Extract job titles from the email body.
  const bodyTitle = extractJobTitleFromPatterns(body, JOB_TITLE_BODY_PATTERNS);

  if (bodyTitle) {
    return {
      jobTitle: bodyTitle,
      source: resolveBodyExtractionSource(email),
    };
  }

  // 3. Fall back to the email snippet.
  const snippetTitle = extractJobTitleFromPatterns(
    snippet,
    JOB_TITLE_BODY_PATTERNS,
  );

  if (snippetTitle) {
    return {
      jobTitle: snippetTitle,
      source: "snippet",
    };
  }

  // 4. Leave the field blank when evidence is insufficient.
  return {
    jobTitle: "",
    source: null,
  };
}

function extractApplicationDate(email = {}) {
  if (typeof email.receivedAt !== "string" || !email.receivedAt.trim()) {
    return {
      applicationDate: "",
      source: null,
      estimated: false,
    };
  }

  const date = new Date(email.receivedAt);

  if (Number.isNaN(date.getTime())) {
    return {
      applicationDate: "",
      source: null,
      estimated: false,
    };
  }

  return {
    applicationDate: date.toISOString().slice(0, 10),
    source: "received_at",
    estimated: true,
  };
}

function calculateConfidence(company, job, date) {
  if (!company.companyName || !job.jobTitle || !date.applicationDate) {
    return "low";
  }

  const strongerSources = ["subject", "body"];

  if (
    strongerSources.includes(company.source) &&
    strongerSources.includes(job.source)
  ) {
    return "high";
  }

  return "medium";
}

function normalizeForComparison(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function parseApplicationEmail(email = {}, preferences = {}) {
  const classification = classifyEmail(email, preferences);

  // Only application confirmations produce suggestions.
  if (classification !== EMAIL_TYPES.APPLICATION_CONFIRMATION) {
    return null;
  }

  const company = extractCompanyName(email);

  let job = extractJobTitle(email);

  const date = extractApplicationDate(email);

  const warnings = [];

  // Prevent ambiguous subjects from producing identical
  // company names and job titles.
  if (
    company.companyName &&
    job.jobTitle &&
    normalizeForComparison(company.companyName) ===
      normalizeForComparison(job.jobTitle)
  ) {
    // Try extracting the job title again without the subject.
    const alternativeJob = extractJobTitle({
      ...email,
      subject: "",
    });

    if (
      alternativeJob.jobTitle &&
      normalizeForComparison(alternativeJob.jobTitle) !==
        normalizeForComparison(company.companyName)
    ) {
      job = alternativeJob;
    } else {
      job = {
        jobTitle: "",
        source: null,
      };

      warnings.push("ambiguous_job_title");
    }
  }

  if (!company.companyName) {
    warnings.push("missing_company_name");
  }

  if (company.source === "sender") {
    warnings.push("company_inferred_from_sender");
  }

  if (!job.jobTitle) {
    warnings.push("missing_job_title");
  }

  if (!date.applicationDate) {
    warnings.push("missing_application_date");
  }

  if (date.estimated) {
    warnings.push("estimated_application_date");
  }

  const confidence = calculateConfidence(company, job, date);

  return {
    messageId: email.messageId || null,
    companyName: company.companyName,
    jobTitle: job.jobTitle,
    applicationDate: date.applicationDate,
    status: "Applied",
    confidence,
    sources: {
      companyName: company.source,
      jobTitle: job.source,
      applicationDate: date.source,
    },
    warnings,
  };
}

module.exports = {
  EMAIL_TYPES,
  classifyEmail,
  extractCompanyName,
  extractJobTitle,
  extractApplicationDate,
  calculateConfidence,
  parseApplicationEmail,
};

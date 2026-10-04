const STATUSES = ["Applied", "Interview", "Offer", "Rejected"];

class ApplicationData {
  #companyName;
  #jobTitle;
  #applicationDate;
  #status;

  constructor(companyName, jobTitle, applicationDate = new Date(), status = "Applied") {
    this.#companyName = companyName;
    this.#jobTitle = jobTitle;
    this.#applicationDate = new Date(applicationDate);
    this.setStatus(status);
  }

  getCompanyName() {
    return this.#companyName;
  }

  getJobTitle() {
    return this.#jobTitle;
  }

  getApplicationDate() {
    return this.#applicationDate;
  }

  getStatus() {
    return this.#status;
  }

  setStatus(status) {
    if (!STATUSES.includes(status)) {
      throw new Error(`Invalid status "${status}". Must be one of: ${STATUSES.join(", ")}`);
    }
    this.#status = status;
  }

  
  toJSON() {
    return {
      companyName: this.#companyName,
      jobTitle: this.#jobTitle,
      applicationDate: this.#applicationDate,
      status: this.#status,
    };
  }
}

module.exports = ApplicationData;
module.exports.STATUSES = STATUSES;

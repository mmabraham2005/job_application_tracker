const Application = require("../models/Application");

const createApplication = async (req, res) => {
  try {
    const { companyName, jobTitle, applicationDate, status } = req.body;

    const application = new Application({
      companyName,
      jobTitle,
      applicationDate,
      status,
    });

    const savedApplication = await application.save();

    res.status(201).json(savedApplication);
  } catch (error) {
    res.status(400).json({
      message: "Failed to save application",
      error: error.message,
    });
  }
};

const getApplications = async (req, res) => {
  try {
    const applications = await Application.find();
    res.status(200).json(applications);
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve applications",
      error: error.message,
    });
  }
};

module.exports = {
  createApplication,
  getApplications,
};

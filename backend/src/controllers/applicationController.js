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

module.exports = {
  createApplication,
};

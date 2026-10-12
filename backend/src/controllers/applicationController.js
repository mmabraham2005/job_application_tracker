const mongoose = require("mongoose");
const Application = require("../models/Application");

const isValidApplicationId = (id) => mongoose.isValidObjectId(id);

const isValidationError = (error) =>
  error.name === "ValidationError" || error.name === "CastError";

const createApplication = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({
        message: "Request body must be a JSON object",
      });
    }
    const { companyName, jobTitle, applicationDate, status } = req.body;

    const application = new Application({
      companyName,
      jobTitle,
      applicationDate,
      status,
    });

    const savedApplication = await application.save();

    return res.status(201).json(savedApplication);
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({
        message: "Invalid application data",
        error: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to save application",
    });
  }
};

const getApplications = async (req, res) => {
  try {
    const applications = await Application.find();
    return res.status(200).json(applications);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to retrieve applications",
    });
  }
};

const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidApplicationId(id)) {
      return res.status(400).json({
        message: "Invalid application ID",
      });
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({
        message: "Request body must be a JSON object",
      });
    }

    const allowedFields = ["companyName", "jobTitle", "applicationDate"];

    const updates = Object.keys(req.body);

    if (
      updates.length === 0 ||
      updates.some((field) => !allowedFields.includes(field))
    ) {
      return res.status(400).json({
        message: "Invalid update fields",
      });
    }

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    for (const field of updates) {
      application[field] = req.body[field];
    }

    const updatedApplication = await application.save();

    return res.status(200).json(updatedApplication);
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({
        message: "Invalid application data",
        error: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to update application",
    });
  }
};

const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidApplicationId(id)) {
      return res.status(400).json({
        message: "Invalid application ID",
      });
    }

    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      !Object.hasOwn(req.body, "status")
    ) {
      return res.status(400).json({
        message: "Only the status field is allowed",
      });
    }

    const { status } = req.body;

    if (typeof status !== "string" || !status.trim()) {
      return res.status(400).json({
        message: "Valid status is required",
      });
    }

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    application.status = status;

    const updatedApplication = await application.save();

    return res.status(200).json(updatedApplication);
  } catch (error) {
    if (isValidationError(error)) {
      return res.status(400).json({
        message: "Invalid application status",
        error: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to update application status",
    });
  }
};

const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidApplicationId(id)) {
      return res.status(400).json({
        message: "Invalid application ID",
      });
    }

    const deletedApplication = await Application.findByIdAndDelete(id);

    if (!deletedApplication) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    return res.status(200).json({
      message: "Application deleted successfully",
      application: deletedApplication,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete application",
    });
  }
};

module.exports = {
  createApplication,
  getApplications,
  updateApplication,
  updateApplicationStatus,
  deleteApplication,
};

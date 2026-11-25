const express = require("express");
const session = require("express-session");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const profileRoutes = require("./routes/profileRoutes");
const gmailRoutes = require("./routes/gmailRoutes");

const createApp = ({ sessionStore, sessionSecret } = {}) => {
  if (!sessionStore || !sessionSecret) {
    throw new Error("Session store and session secret are required");
  }

  const app = express();

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  app.use(
    cors({
      origin: frontendUrl,
      credentials: true,
    }),
  );

  app.use(express.json());

  app.use(
    session({
      name: "jobtracker.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/applications", applicationRoutes);
  app.use("/api/reminders", reminderRoutes);
  app.use("/api/calendar", calendarRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/gmail", gmailRoutes);
  app.get("/api/health", (req, res) => {
    res.json({ message: "Backend is running" });
  });

  return app;
};

module.exports = createApp;

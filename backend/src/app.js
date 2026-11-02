const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/authRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const calendarRoutes = require("./routes/calendarRoutes");

const createApp = ({ sessionStore, sessionSecret } = {}) => {
  if (!sessionStore || !sessionSecret) {
    throw new Error("Session store and session secret are required");
  }

  const app = express();

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
        secure: false,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/applications", applicationRoutes);
  app.use("/api/reminders", reminderRoutes);
  app.use("/api/calendar", calendarRoutes);

  app.get("/api/health", (req, res) => {
    res.json({ message: "Backend is running" });
  });

  return app;
};

module.exports = createApp;

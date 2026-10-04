require("dotenv").config();

const express = require("express");
const connectDB = require("./database/connectDB");
const applicationRoutes = require("./routes/applicationRoutes");

const app = express();
const PORT = 5001;

connectDB();

app.use(express.json());
app.use("/api/applications", applicationRoutes);

app.get("/api/health", (req, res) => {
  res.json({ message: "Backend is running" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

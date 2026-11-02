require("dotenv").config();

const MongoStore = require("connect-mongo").default;

const connectDB = require("./database/connectDB");
const createApp = require("./app");

const PORT = 5001;

if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) {
  throw new Error("MONGODB_URI and SESSION_SECRET are required");
}

const app = createApp({
  sessionStore: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "sessions",
  }),
  sessionSecret: process.env.SESSION_SECRET,
});

connectDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

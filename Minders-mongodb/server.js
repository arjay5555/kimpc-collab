require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use("/api", require("./routes/api"));
app.use(express.static(path.join(__dirname, "public")));

// Any error thrown in a route ends up here (Express 5 forwards async errors automatically).
app.use((error, req, res, next) => {
  console.error(error);
  if (error.code === 11000) return res.status(409).json({ error: "That record already exists." });
  res.status(500).json({ error: "Something went wrong on the server." });
});

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI. Copy ".env.example" to ".env" and set it.');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(port, () => console.log(`Minders is running at http://localhost:${port}/login.html`));
  })
  .catch((error) => {
    console.error("Could not connect to MongoDB:", error.message);
    process.exit(1);
  });

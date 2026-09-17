const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const rechargeRoutes = require("./routes/rechargeRoutes");
const withdrawRoutes = require("./routes/withdrawRoutes");
const adminRoutes = require("./routes/adminRoutes");
const paymentSettingRoutes = require("./routes/paymentSettingRoutes");
const referralRoutes = require("./routes/referralRoutes");
const productRoutes = require("./routes/productRoutes");
const productIncomeRoutes = require("./routes/productIncomeRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const leaderboardRoutes = require("./routes/leaderboardRoutes");

const app = express();

// Cloudflare Workers provides HTTPS and static assets. The API itself is
// still the same Express application used by the original project.
app.use(helmet());
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.text({ type: ["text/plain", "text/*"] }));

// The database is opened lazily on the first dynamic request in each Worker
// isolate. This replaces the old process-startup connectDB() call.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB connection error:", err);
    res.status(503).json({ success: false, message: "Database unavailable" });
  }
});

// Keep the original API paths unchanged.
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/recharge", rechargeRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payment", paymentSettingRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/product", productRoutes);
app.use("/api/product-income", productIncomeRoutes);
app.use("/api/payment-gateway", paymentRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

app.get("/", (req, res) => {
  res.json({ success: true, message: "BRITANNIYA API Running Successfully" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, status: "healthy" });
});

app.get("/render-test", (req, res) => {
  res.send("BACKEND WORKING ON CLOUDFLARE WORKERS");
});

app.get("/hello", (req, res) => {
  res.send("HELLO WORKING");
});

app.get("/test-qr", (req, res) => {
  res.redirect("/uploads/qr/qr1.png");
});

// These two routes used to read local files. They now point to Cloudflare
// Static Assets/R2 from worker.js.
app.get("/register", (req, res) => res.redirect("/register.html"));
app.get("/payment-success.html", (req, res) => res.status(404).end());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

module.exports = { app };

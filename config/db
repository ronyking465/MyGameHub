const mongoose = require("mongoose");

let connectionPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    }).then(() => {
      console.log("MongoDB Connected Successfully");
      return mongoose.connection;
    }).catch((err) => {
      connectionPromise = null;
      throw err;
    });
  }

  return connectionPromise;
}

module.exports = connectDB;

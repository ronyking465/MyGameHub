const multer = require("multer");
const path = require("path");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (![".png", ".jpg", ".jpeg"].includes(ext)) {
      return cb(new Error("Only Image"));
    }
    cb(null, true);
  }
});

function single(fieldName) {
  const parse = upload.single(fieldName);
  return (req, res, next) => {
    parse(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || "Upload failed" });
      }
      if (req.file) {
        const ext = path.extname(req.file.originalname || ".png").toLowerCase();
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext === ".jpeg" ? ".jpg" : ext}`;
        req.file.filename = filename;
        req.file.dataUrl = `data:${req.file.mimetype || "image/png"};base64,${req.file.buffer.toString("base64")}`;
      }
      next();
    });
  };
}

module.exports = { single };

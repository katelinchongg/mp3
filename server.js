// ===============================
// 1) Load env first
// ===============================
require('dotenv').config();

// ===============================
// 2) Imports
// ===============================
const express = require('express');
const mongoose = require('mongoose');

// If you still want body-parser, keep these two lines.
// FYI: Express has built-ins: app.use(express.json()), app.use(express.urlencoded({ extended: true }))
const bodyParser = require('body-parser');

// ===============================
// 3) App & Port
// ===============================
const app = express();
const port = process.env.PORT || 3000;

// ===============================
// 4) MongoDB connection
// ===============================
mongoose.set('strictQuery', true);

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI) // SRV URI from Atlas; password URL-encoded
  .then(() => {
    console.log('MongoDB connected');

    // ===============================
    // 5) Middleware
    // ===============================
    // CORS (your custom allowCrossDomain)
    const allowCrossDomain = function (req, res, next) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
      next();
    };
    app.use(allowCrossDomain);

    // Body parsers
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    // (Or use the modern built-ins)
    // app.use(express.urlencoded({ extended: true }));
    // app.use(express.json());

    // ===============================
    // 6) Routes
    // ===============================
    // Your routes/index.js should export a function (app, router)
    const router = express.Router();
    require('./routes')(app);

    // ===============================
    // 7) Start server
    // ===============================
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

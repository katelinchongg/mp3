// routes/index.js
const express = require('express');

module.exports = function (app) {
  app.use('/api',        require('./home.js')(express.Router()));
  app.use('/api/users',  require('./users.js')(express.Router()));
  app.use('/api/tasks',  require('./tasks.js')(express.Router()));
};

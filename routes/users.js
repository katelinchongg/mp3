const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const Task = require('../models/task');
const { ok, error } = require('./helpers');

const isId = (s) => mongoose.Types.ObjectId.isValid(s);

// ============================================
// GET /api/users
// ============================================
router.get('/', async (req, res) => {
  try {
    const parseJSON = (param) => {
      try { return typeof param === 'string' ? JSON.parse(param) : param; }
      catch { return null; }
    };

    let query = User.find();

    if (req.query.where) {
      const whereObj = parseJSON(req.query.where);
      if (!whereObj) return error(res, 400, 'Invalid query parameters');
      query = query.find(whereObj);
    }

    if (req.query.sort) {
      const sortObj = parseJSON(req.query.sort);
      if (!sortObj) return error(res, 400, 'Invalid query parameters');
      query = query.sort(sortObj);
    }

    if (req.query.select) {
      const selectObj = parseJSON(req.query.select);
      if (!selectObj) return error(res, 400, 'Invalid query parameters');
      query = query.select(selectObj);
    }

    if (req.query.skip) query = query.skip(Number(req.query.skip));
    if (req.query.limit) query = query.limit(Number(req.query.limit));

    if (req.query.count === 'true') {
      const count = await query.countDocuments();
      return ok(res, count);
    }

    const results = await query.exec();
    return ok(res, results);
  } catch {
    return error(res, 400, 'Invalid query parameters');
  }
});

// ============================================
// POST /api/users
// ============================================
router.post('/', async (req, res) => {
  try {
    const { name, email, pendingTasks = [] } = req.body;
    if (!name || !email)
      return error(res, 400, 'User must have name and email');

    try {
      const user = await User.create({ name, email, pendingTasks });
      return ok(res, user, 201, 'User created');
    } catch (e) {
      if (e.code === 11000) {
        const [local, domain] = email.split('@');
        const uniqueEmail = `${local}+${Date.now()}@${domain}`;
        const user = await User.create({ name, email: uniqueEmail, pendingTasks });
        return ok(res, user, 201, 'User created (unique email)');
      }
      throw e;
    }
  } catch {
    return error(res, 500, 'Server error creating user');
  }
});

// ============================================
// GET /api/users/:id
// ============================================
router.get('/', async (req, res) => {
  try {
    const parseJSON = (param) => {
      if (!param) return null;
      try {
        const decoded = decodeURIComponent(param);
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    };

    let query = User.find();

    // Only apply filters if provided
    if (req.query.where) {
      const whereObj = parseJSON(req.query.where);
      if (whereObj) query = query.find(whereObj);
    }

    if (req.query.sort) {
      const sortObj = parseJSON(req.query.sort);
      if (sortObj) query = query.sort(sortObj);
    }

    if (req.query.select) {
      const selectObj = parseJSON(req.query.select);
      if (selectObj) query = query.select(selectObj);
    }

    if (req.query.skip) query = query.skip(Number(req.query.skip));
    if (req.query.limit) query = query.limit(Number(req.query.limit));

    if (req.query.count === 'true') {
      const count = await query.countDocuments();
      return ok(res, count);
    }

    // Execute query safely
    const results = await query.exec();
    return ok(res, results);
  } catch (err) {
    console.error('GET /api/users error:', err);
    return error(res, 500, 'Server error retrieving users');
  }
});


// ============================================
// PUT /api/users/:id
// ============================================
router.put('/:id', async (req, res) => {
  try {
    const { name, email, pendingTasks = [] } = req.body;

    if (!isId(req.params.id)) return error(res, 400, 'Invalid user id');
    if (!name || !email) return error(res, 400, 'User must have name and email');
    for (const t of pendingTasks) {
      if (!isId(t)) return error(res, 400, `Invalid task id: ${t}`);
    }

    const user = await User.findById(req.params.id);
    if (!user) return error(res, 404, 'User not found');

    if (email !== user.email) {
      const dup = await User.findOne({ email });
      if (dup && String(dup._id) !== String(user._id))
        return error(res, 400, 'Email already exists');
    }

    const tasks = await Task.find({ _id: { $in: pendingTasks } });
    if (tasks.length !== pendingTasks.length)
      return error(res, 404, 'One or more tasks do not exist');

    // 🚫 Disallow assigning completed tasks
    if (tasks.some(t => t.completed))
      return error(res, 400, 'Cannot assign completed tasks to a user');

    const oldSet = new Set((user.pendingTasks || []).map(String));
    const newSet = new Set(pendingTasks.map(String));

    const removed = [...oldSet].filter(id => !newSet.has(id));
    const added = [...newSet].filter(id => !oldSet.has(id));

    // Unassign removed tasks
    if (removed.length) {
      await Task.updateMany(
        { _id: { $in: removed }, assignedUser: user._id.toString() },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );
    }

    // Remove added tasks from other users
    if (added.length) {
      await User.updateMany(
        { _id: { $ne: user._id }, pendingTasks: { $in: added } },
        { $pull: { pendingTasks: { $in: added } } }
      );
    }

    // Assign added tasks to this user
    if (added.length) {
      await Task.updateMany(
        { _id: { $in: added } },
        { $set: { assignedUser: user._id.toString(), assignedUserName: name } }
      );
    }

    user.name = name;
    user.email = email;
    user.pendingTasks = pendingTasks;
    await user.save();

    return ok(res, user);
  } catch {
    return error(res, 500, 'Server error updating user');
  }
});

// ============================================
// DELETE /api/users/:id
// ============================================
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return error(res, 404, 'User not found');

    await Task.updateMany(
      { _id: { $in: user.pendingTasks } },
      { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
    );

    await user.deleteOne();
    return ok(res, null, 204, 'User deleted');
  } catch {
    return error(res, 500, 'Server error deleting user');
  }
});

module.exports = router;

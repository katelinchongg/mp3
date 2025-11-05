const User = require('../models/user');
const Task = require('../models/task');
const { buildQuery, ok, error } = require('./helpers');

module.exports = function(router) {
  // GET /api/users
  router.get('/', async (req, res) => {
  try {
    const parseJSON = (param) => {
      try { return typeof param === 'string' ? JSON.parse(param) : param; }
      catch { return null; }
    };

    // Build query
    let query = User.find(); // use User.find() or Task.find() depending on file

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

    // If ?count=true → return count instead of documents
    if (req.query.count === 'true') {
      const count = await query.countDocuments();
      return ok(res, count);
    }

    const results = await query.exec();
    return ok(res, results);
  } catch (e) {
    return error(res, 400, 'Invalid query parameters');
  }
});


  // POST /api/users
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
        // Duplicate email → create a unique variant
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

  // GET /api/users/:id  (+select must work)
  router.get('/:id', async (req, res) => {
  try {
    const sel = req.query.select ? JSON.parse(req.query.select) : undefined;
    const user = await User.findById(req.params.id, sel);
    if (!user) return error(res, 404, 'User not found');
    return ok(res, user);
  } catch {
    // 404 for all invalid or missing ids (per MP expectation)
    return error(res, 404, 'User not found');
  }
});


  // PUT /api/users/:id (replace entire user)
  // PUT /api/users/:id (replace entire user)
const mongoose = require('mongoose');
const isId = (s) => mongoose.Types.ObjectId.isValid(s);

router.put('/:id', async (req, res) => {
  try {
    const { name, email, pendingTasks = [] } = req.body;

    // 1) Bad format (user id or task ids) -> 400
    if (!isId(req.params.id)) return error(res, 400, 'Invalid user id');
    if (!name || !email) return error(res, 400, 'User must have name and email');
    for (const t of pendingTasks) {
      if (!isId(t)) return error(res, 400, `Invalid task id: ${t}`);
    }

    // Find current user
    const user = await User.findById(req.params.id);
    if (!user) return error(res, 404, 'User not found'); // 3) user id does not exist

    // 2) New email already in use -> 400
    if (email !== user.email) {
      const dup = await User.findOne({ email });
      if (dup && String(dup._id) !== String(user._id)) {
        return error(res, 400, 'Email already exists');
      }
    }

    // 3) All new task ids must exist -> 404
    const tasks = await Task.find({ _id: { $in: pendingTasks } });
    if (tasks.length !== pendingTasks.length) {
      return error(res, 404, 'One or more tasks do not exist');
    }

    // 4) (optional) Completed tasks in new tasks -> 400
    // if (tasks.some(t => t.completed)) {
    //   return error(res, 400, 'Completed tasks cannot be in pendingTasks');
    // }

    const oldSet = new Set((user.pendingTasks || []).map(String));
    const newSet = new Set(pendingTasks.map(String));

    const removed = [...oldSet].filter(id => !newSet.has(id));
    const added   = [...newSet].filter(id => !oldSet.has(id));
    const addedTaskDocs = await Task.find({ _id: { $in: added } });
    if (addedTaskDocs.some(t => t.completed)) {
      return error(res, 400, 'Cannot assign completed tasks to a user');
    }


    // 5) two-way #1: unassign tasks removed from this user
    if (removed.length) {
      await Task.updateMany(
        { _id: { $in: removed }, assignedUser: user._id.toString() },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );
    }

    // 6) two-way #2: pull added tasks from other users' pendingTasks
    if (added.length) {
      await User.updateMany(
        { _id: { $ne: user._id }, pendingTasks: { $in: added } },
        { $pull: { pendingTasks: { $in: added } } }
      );
    }

    // 7) two-way #3: assign added tasks to this user
    if (added.length) {
      await Task.updateMany(
        { _id: { $in: added } },
        { $set: { assignedUser: user._id.toString(), assignedUserName: name } }
      );
    }

    // Update user (dateCreated stays unchanged)
    user.name = name;
    user.email = email;
    user.pendingTasks = pendingTasks;
    await user.save();

    return ok(res, user);
  } catch (e) {
    return error(res, 500, 'Server error updating user');
  }
});


  // DELETE /api/users/:id (unassign the user’s pending tasks)
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
    } catch { return error(res, 500, 'Server error deleting user'); }
  });

  return router;
};

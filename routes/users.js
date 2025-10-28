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
    } catch { return error(res, 400, 'Invalid id or select'); }
  });

  // PUT /api/users/:id (replace entire user)
  router.put('/:id', async (req, res) => {
    try {
      const { name, email, pendingTasks = [] } = req.body;
      if (!name || !email) return error(res, 400, 'User must have name and email');

      // Replace
      const prev = await User.findById(req.params.id);
      if (!prev) return error(res, 404, 'User not found');

      // Two-way: when replacing pendingTasks, unassign tasks no longer present, assign new ones
      // 1) Unassign tasks removed
      const removed = prev.pendingTasks.filter(id => !pendingTasks.includes(id));
      await Task.updateMany(
        { _id: { $in: removed }, assignedUser: prev._id.toString() },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );

      // 2) Assign tasks newly added
      const added = pendingTasks.filter(id => !prev.pendingTasks.includes(id));
      await Task.updateMany(
        { _id: { $in: added } },
        { $set: { assignedUser: prev._id.toString(), assignedUserName: name } }
      );

      prev.name = name; prev.email = email; prev.pendingTasks = pendingTasks;
      await prev.save();
      return ok(res, prev);
    } catch { return error(res, 500, 'Server error updating user'); }
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

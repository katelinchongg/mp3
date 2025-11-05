const Task = require('../models/task');
const User = require('../models/user');
const { buildQuery, ok, error } = require('./helpers');

module.exports = function(router) {
  // GET /api/tasks
  router.get('/', async (req, res) => {
  try {
    const parseJSON = (param) => {
      try { return typeof param === 'string' ? JSON.parse(param) : param; }
      catch { return null; }
    };

    // Build query
    let query = Task.find(); // use User.find() or Task.find() depending on file

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


  // POST /api/tasks
 // POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { name, deadline, description = '', completed = false,
            assignedUser = '', assignedUserName = 'unassigned' } = req.body;

    if (!name || !deadline)
      return error(res, 400, 'Task must have name and deadline');

    // 🚫 Don’t allow completed tasks to be assigned
    if (completed && assignedUser)
      return error(res, 400, 'Cannot assign a completed task');

    const task = await Task.create({
      name, deadline, description, completed, assignedUser, assignedUserName
    });

    // Two-way: if assignedUser provided, push into their pendingTasks (only if task not completed)
    if (assignedUser && !completed) {
      await User.updateOne(
        { _id: assignedUser },
        { $addToSet: { pendingTasks: task._id.toString() } }
      );
    }

    return ok(res, task, 201, 'Task created');
  } catch {
    return error(res, 500, 'Server error creating task');
  }
});


  // GET /api/tasks/:id  (+select must work)
  router.get('/:id', async (req, res) => {
    try {
      const sel = req.query.select ? JSON.parse(req.query.select) : undefined;
      const task = await Task.findById(req.params.id, sel);
      if (!task) return error(res, 404, 'Task not found');
      return ok(res, task);
    } catch { return error(res, 400, 'Invalid id or select'); }
  });

  // PUT /api/tasks/:id (replace entire task)
  router.put('/:id', async (req, res) => {
  try {
    const { name, deadline, description = '', completed = false,
            assignedUser = '', assignedUserName = 'unassigned' } = req.body;

    if (!name || !deadline)
      return error(res, 400, 'Task must have name and deadline');

    const task = await Task.findById(req.params.id);
    if (!task) return error(res, 404, 'Task not found');

    // 🚫 Don’t allow assigning completed tasks
    if (completed && assignedUser)
      return error(res, 400, 'Cannot assign a completed task');

    // Remove this task from the old user’s pendingTasks (if it was assigned before)
    if (task.assignedUser && task.assignedUser !== assignedUser) {
      await User.updateOne(
        { _id: task.assignedUser },
        { $pull: { pendingTasks: task._id.toString() } }
      );
    }

    // If new assigned user is provided and task is not completed, add to pendingTasks
    if (assignedUser && !completed) {
      await User.updateOne(
        { _id: assignedUser },
        { $addToSet: { pendingTasks: task._id.toString() } }
      );
    }

    Object.assign(task, {
      name, deadline, description, completed, assignedUser, assignedUserName
    });

    await task.save();
    return ok(res, task);
  } catch {
    return error(res, 500, 'Server error updating task');
  }
});


  // DELETE /api/tasks/:id (remove from assigned user’s pendingTasks)
  router.delete('/:id', async (req, res) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) return error(res, 404, 'Task not found');

      if (task.assignedUser) {
        await User.updateOne(
          { _id: task.assignedUser },
          { $pull: { pendingTasks: task._id.toString() } }
        );
      }
      await task.deleteOne();
      return ok(res, null, 204, 'Task deleted');
    } catch { return error(res, 500, 'Server error deleting task'); }
  });

  return router;
};

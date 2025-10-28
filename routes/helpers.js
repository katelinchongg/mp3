exports.buildQuery = (Model, q) => {
  const query = Model.find();

  // where / sort / select can arrive as JSON strings
  const parseJSON = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

  if (q.where)   query.find(parseJSON(q.where));
  if (q.sort)    query.sort(parseJSON(q.sort));
  if (q.select)  query.select(parseJSON(q.select));
  if (q.skip)    query.skip(Number(q.skip));
  if (q.limit)   query.limit(Number(q.limit));

  return query;
};

exports.ok = (res, data, code = 200, message = 'OK') =>
  res.status(code).json({ message, data });

exports.error = (res, code, message, data = {}) =>
  res.status(code).json({ message, data });

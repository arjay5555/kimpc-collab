/**
 * Optimistic concurrency helpers for models using `versionKey: "version"` + `optimisticConcurrency: true`.
 * Every save() on those models is filtered by { _id, version } and increments version atomically;
 * these helpers turn a mismatch into the standardized 409 VERSION_CONFLICT response (see errorHandler).
 */

class VersionConflictError extends Error {
  constructor(current) {
    super("This resource was modified by someone else.");
    this.name = "VersionConflictError";
    this.status = 409;
    this.current = current;
  }
}

class ResourceGoneError extends Error {
  constructor() {
    super("Resource not found.");
    this.name = "ResourceGoneError";
    this.status = 404;
  }
}

/** Fast-fail when the client edited an older version than the one just loaded. */
function assertVersion(doc, clientVersion) {
  // shortcut: version is optional so old open tabs keep working; make it required once all clients send it.
  if (clientVersion === undefined || clientVersion === null || clientVersion === "") return;
  if (Number(clientVersion) !== (doc.version ?? 0)) throw new VersionConflictError(doc);
}

/** save() that maps Mongoose's VersionError to 409 (doc changed) or 404 (doc deleted meanwhile). */
async function saveVersioned(doc, options) {
  try {
    return await doc.save(options);
  } catch (err) {
    if (err.name !== "VersionError") throw err;
    const current = await doc.constructor.findById(doc._id);
    throw current ? new VersionConflictError(current) : new ResourceGoneError();
  }
}

/** For findOneAndUpdate-style writes filtered by version: decide 404 vs 409 after a miss. */
async function conflictOrNotFound(Model, id) {
  const current = await Model.findById(id);
  return current ? new VersionConflictError(current) : new ResourceGoneError();
}

/** Use in route catch blocks that otherwise convert every error to 500. */
function rethrowConcurrency(err) {
  if (err instanceof VersionConflictError || err instanceof ResourceGoneError) throw err;
}

module.exports = {
  VersionConflictError,
  ResourceGoneError,
  assertVersion,
  saveVersioned,
  conflictOrNotFound,
  rethrowConcurrency,
};

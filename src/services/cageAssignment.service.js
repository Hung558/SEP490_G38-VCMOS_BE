const mongoose = require('mongoose');
const Cage = require('../models/Cage');
const CageAssignment = require('../models/CageAssignment');

const createError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const assertValidId = (id, name) => {
  if (!mongoose.isValidObjectId(id)) {
    throw createError(400, `${name} không hợp lệ`);
  }
};

const populateOptions = [
  { path: 'cageId' },
  { path: 'orderId' },
  { path: 'assignedById', select: '-password' },
];

/**
 * Create a new CageAssignment.
 * - Only cages with status 'Available' are accepted.
 * - On success the cage status is set to 'Occupied'.
 *
 * The status change is done atomically (findOneAndUpdate with a status
 * condition) so two concurrent requests cannot take the same cage.
 * If creating the assignment fails afterwards, the cage is rolled back
 * to 'Available'.
 */
const createCageAssignment = async ({ cageId, orderId, assignedById }) => {
  assertValidId(cageId, 'ID chuồng');
  assertValidId(orderId, 'ID đơn hẹn');
  assertValidId(assignedById, 'ID người phân công');

  // Atomically claim the cage: only succeeds if it is currently Available
  const cage = await Cage.findOneAndUpdate(
    { _id: cageId, status: 'Available' },
    { $set: { status: 'Occupied' } },
    { new: true }
  );

  if (!cage) {
    const exists = await Cage.exists({ _id: cageId });
    if (!exists) throw createError(404, 'Không tìm thấy chuồng');
    throw createError(409, 'Chuồng không ở trạng thái trống (Available)');
  }

  try {
    const assignment = await CageAssignment.create({
      cageId,
      orderId,
      assignedById,
    });
    return await assignment.populate(populateOptions);
  } catch (err) {
    // Roll back so the cage is not stuck as Occupied without an assignment
    await Cage.updateOne({ _id: cageId }, { $set: { status: 'Available' } });

    // Unique partial index violation: cage already has an open assignment
    if (err.code === 11000) {
      throw createError(409, 'Chuồng đã có phân công đang hoạt động');
    }
    throw err;
  }
};

/**
 * List all CageAssignments (newest first).
 * Optional filters: { cageId, orderId, active }
 *   active = true  -> only open assignments (releasedAt = null)
 *   active = false -> only released assignments
 */
const getAllCageAssignments = async (filters = {}) => {
  const query = {};

  if (filters.cageId) {
    assertValidId(filters.cageId, 'ID chuồng');
    query.cageId = filters.cageId;
  }
  if (filters.orderId) {
    assertValidId(filters.orderId, 'ID đơn hẹn');
    query.orderId = filters.orderId;
  }
  if (filters.active === true) query.releasedAt = null;
  if (filters.active === false) query.releasedAt = { $ne: null };

  return CageAssignment.find(query)
    .populate(populateOptions)
    .sort({ assignedAt: -1 });
};

/**
 * Get a single CageAssignment by id.
 */
const getCageAssignmentById = async (id) => {
  assertValidId(id, 'ID phân công chuồng');

  const assignment = await CageAssignment.findById(id).populate(populateOptions);
  if (!assignment) throw createError(404, 'Không tìm thấy phân công chuồng');

  return assignment;
};

module.exports = {
  createCageAssignment,
  getAllCageAssignments,
  getCageAssignmentById,
};
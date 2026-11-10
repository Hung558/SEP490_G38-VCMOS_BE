const cageAssignmentService = require('../services/cageAssignment.service');
const {
  validateCreateCageAssignment,
  validateCageAssignmentId,
  validateOrderId,
  validateListCageAssignmentsQuery,
} = require('../validators/cageAssignment.validator');

const createCageAssignment = async (req, res, next) => {
  try {
    const data = validateCreateCageAssignment({
      cageId: req.body?.cageId,
      orderId: req.body?.orderId,
      assignedById: req.user?.id ?? req.user?._id?.toString(),
    });

    const assignment = await cageAssignmentService.createCageAssignment(data);

    res.status(201).json({
      message: 'Phân công chuồng thành công',
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

const getAllCageAssignments = async (req, res, next) => {
  try {
    const filters = validateListCageAssignmentsQuery(req.query);

    const assignments = await cageAssignmentService.getAllCageAssignments(filters);

    res.status(200).json({
      message: 'Lấy danh sách phân công chuồng thành công',
      count: assignments.length,
      data: assignments,
    });
  } catch (err) {
    next(err);
  }
};

const getCageAssignmentById = async (req, res, next) => {
  try {
    const id = validateCageAssignmentId(req.params.id);

    const assignment = await cageAssignmentService.getCageAssignmentById(id);

    res.status(200).json({
      message: 'Lấy thông tin phân công chuồng thành công',
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

const getCageAssignmentByOrderId = async (req, res, next) => {
  try {
    const orderId = validateOrderId(req.params.orderId);

    const assignment = await cageAssignmentService.getCageAssignmentByOrderId(orderId);

    res.status(200).json({
      message: 'Lấy thông tin phân công chuồng của đơn hẹn thành công',
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

const releaseCageAssignment = async (req, res, next) => {
  try {
    const id = validateCageAssignmentId(req.params.id);

    const assignment = await cageAssignmentService.releaseCageAssignment(id);

    res.status(200).json({
      message: 'Giải phóng chuồng thành công',
      data: assignment,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createCageAssignment,
  getAllCageAssignments,
  getCageAssignmentById,
  getCageAssignmentByOrderId,
  releaseCageAssignment,
};
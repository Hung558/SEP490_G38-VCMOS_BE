const cageService = require('../services/cage.service');
const cageValidator = require('../validators/cage.validator');

const { ServiceError } = cageService;
const { ValidationError } = cageValidator;

// Map known errors to HTTP responses; anything else is a 500.
const handleError = (res, err) => {
  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
  }

  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi hệ thống',
  });
};

async function createCage(req, res) {
  try {
    const data = cageValidator.validateCreateCage(req.body);
    const cage = await cageService.createCage(data);

    return res.status(201).json({
      success: true,
      message: 'Tạo chuồng thành công',
      data: cage,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getCages(req, res) {
  try {
    const { filters, options } = cageValidator.validateGetCages(req.query);
    const result = await cageService.getCages(filters, options);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getCageById(req, res) {
  try {
    const id = cageValidator.validateCageId(req.params.id);
    const cage = await cageService.getCageById(id);

    return res.status(200).json({
      success: true,
      data: cage,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateCage(req, res) {
  try {
    const id = cageValidator.validateCageId(req.params.id);
    const data = cageValidator.validateUpdateCage(req.body);
    const cage = await cageService.updateCage(id, data);

    return res.status(200).json({
      success: true,
      message: 'Cập nhật chuồng thành công',
      data: cage,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  createCage,
  getCages,
  getCageById,
  updateCage,
};
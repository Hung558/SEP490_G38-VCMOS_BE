const serviceService = require('../services/service.service');
const {
  validateCreateService,
  validateUpdateService,
  validateUpdateServiceStatus,
} = require('../validators/service.validator');

const getAllServices = async (req, res) => {
  try {
    const services = await serviceService.getAllServices(req.query || {});
    res.status(200).json({ services });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const getServiceById = async (req, res) => {
  try {
    const service = await serviceService.getServiceById(req.params.id);
    res.status(200).json({ service });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const createService = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateCreateService(body);
    if (!isValid) {
      const firstErrorMessage = Object.values(errors)[0] || 'Dữ liệu không hợp lệ';
      return res.status(400).json({ message: firstErrorMessage, errors });
    }

    const service = await serviceService.createService(body);
    res.status(201).json({ service });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const updateService = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateUpdateService(body);
    if (!isValid) {
      const firstErrorMessage = Object.values(errors)[0] || 'Dữ liệu không hợp lệ';
      return res.status(400).json({ message: firstErrorMessage, errors });
    }

    const service = await serviceService.updateService(req.params.id, body);
    res.status(200).json({ service });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const updateServiceStatus = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateUpdateServiceStatus(body);
    if (!isValid) {
      const firstErrorMessage = Object.values(errors)[0] || 'Dữ liệu không hợp lệ';
      return res.status(400).json({ message: firstErrorMessage, errors });
    }

    const service = await serviceService.updateServiceStatus(req.params.id, body.status);
    res.status(200).json({ service });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// SCR-29 & BR-16: Không xóa vật lý dịch vụ để giữ nguyên lịch sử lịch hẹn và hóa đơn cũ
const deleteService = (req, res) => {
  return res.status(403).json({
    message: 'Không được phép xóa vật lý dịch vụ để bảo toàn lịch sử đơn hẹn và hóa đơn. Vui lòng chuyển trạng thái sang Inactive',
  });
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  updateServiceStatus,
  deleteService,
};


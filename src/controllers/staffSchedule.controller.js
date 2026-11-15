const staffScheduleService = require('../services/staffSchedule.service');
const {
  validateCreateBusySchedule,
  validateListBusySchedules,
} = require('../validators/staffSchedule.validator');

const createBusySchedule = async (req, res) => {
  try {
    const { isValid, errors, value } = validateCreateBusySchedule(req.body || {}, req.user.role);
    if (!isValid) {
      const firstMessage = Object.values(errors)[0] || 'Dữ liệu báo bận không hợp lệ';
      return res.status(400).json({ message: firstMessage, errors });
    }

    const result = await staffScheduleService.createBusySchedule({
      currentUser: req.user,
      ...value,
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const listBusySchedules = async (req, res) => {
  try {
    const { isValid, errors, value } = validateListBusySchedules(req.query || {});
    if (!isValid) {
      const firstMessage = Object.values(errors)[0] || 'Tham số truy vấn không hợp lệ';
      return res.status(400).json({ message: firstMessage, errors });
    }

    const result = await staffScheduleService.listBusySchedules({
      currentUser: req.user,
      ...value,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const getMyBusySchedules = async (req, res) => {
  try {
    const { isValid, errors, value } = validateListBusySchedules(req.query || {});
    if (!isValid) {
      const firstMessage = Object.values(errors)[0] || 'Tham số truy vấn không hợp lệ';
      return res.status(400).json({ message: firstMessage, errors });
    }

    const result = await staffScheduleService.listBusySchedules({
      currentUser: req.user,
      ...value,
      staffId: req.user.id,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const deleteBusySchedule = async (req, res) => {
  try {
    const result = await staffScheduleService.deleteBusySchedule({
      currentUser: req.user,
      scheduleId: req.params.id,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }
};

module.exports = {
  createBusySchedule,
  listBusySchedules,
  getMyBusySchedules,
  deleteBusySchedule,
};


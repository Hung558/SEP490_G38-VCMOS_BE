const service = require('../services/inpatientRecord.service');
const {
  validateCreate,
  validateListQuery,
  validateCreateLog,
  validateLogQuery,
  isId,
} = require('../validators/inpatientRecord.validator');

const handleError = (res, err) => {
  if (err instanceof service.ServiceError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'Lỗi máy chủ' });
};

const create = async (req, res) => {
  const { errors, value } = validateCreate(req.body);
  if (errors.length) return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

  try {
    const record = await service.create(req.user.id, value);
    return res.status(201).json(record);
  } catch (err) {
    return handleError(res, err);
  }
};

const list = async (req, res) => {
  const { errors, value } = validateListQuery(req.query);
  if (errors.length) return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

  try {
    return res.json(await service.list(req.user.id, value));
  } catch (err) {
    return handleError(res, err);
  }
};

const getById = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'id không hợp lệ' });

  try {
    return res.json(await service.getById(req.params.id));
  } catch (err) {
    return handleError(res, err);
  }
};

const createLog = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'id không hợp lệ' });
  const { errors, value } = validateCreateLog(req.body);
  if (errors.length) return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

  try {
    const log = await service.createLog(req.params.id, req.user.id, value);
    return res.status(201).json(log);
  } catch (err) {
    return handleError(res, err);
  }
};

const listLogs = async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ message: 'id không hợp lệ' });
  const { errors, value } = validateLogQuery(req.query);
  if (errors.length) return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

  try {
    return res.json(await service.listLogs(req.params.id, value));
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = { create, list, getById, createLog, listLogs };
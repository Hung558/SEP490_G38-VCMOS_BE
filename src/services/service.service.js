const crypto = require('crypto');
const mongoose = require('mongoose');
const Service = require('../models/Service');
const { SERVICE_CATEGORIES, SERVICE_STATUSES } = require('../validators/service.validator');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // BR-24: Bỏ 0/O/1/I để tránh nhìn nhầm
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;

// Tạo lỗi có kèm mã HTTP để controller biết trả status nào
const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// BR-24: Tự động sinh mã dịch vụ định dạng SRV-XXXXXX
const generateServiceCode = () => {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `SRV-${suffix}`;
};

// UC-01 (SCR-02) & UC-66 (SCR-29): Xem danh sách và tìm kiếm/lọc dịch vụ
const getAllServices = async ({ category, status, search } = {}) => {
  const filter = {};

  if (category !== undefined && category !== '') {
    if (!SERVICE_CATEGORIES.includes(category)) {
      throw httpError(400, 'Danh mục lọc không hợp lệ');
    }
    filter.category = category;
  }

  if (status !== undefined && status !== '') {
    if (!SERVICE_STATUSES.includes(status)) {
      throw httpError(400, 'Trạng thái lọc không hợp lệ');
    }
    filter.status = status;
  }

  if (typeof search === 'string' && search.trim() !== '') {
    const escapedKeyword = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedKeyword, 'i');
    filter.$or = [
      { name: searchRegex },
      { code: searchRegex },
      { description: searchRegex },
    ];
  }

  return Service.find(filter).sort({ createdAt: -1 }).lean();
};

// Xem chi tiết 1 dịch vụ theo ID
const getServiceById = async (serviceId) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw httpError(400, 'ID dịch vụ không hợp lệ');
  }

  const service = await Service.findById(serviceId).lean();
  if (!service) {
    throw httpError(404, 'Không tìm thấy dịch vụ');
  }

  return service;
};

// SCR-29 & UC-66: Admin tạo dịch vụ mới (tự sinh mã SRV-XXXXXX, kiểm tra trùng tên trong cùng danh mục)
const createService = async ({ name, category, defaultDuration, basePrice, description, status }) => {
  const trimmedName = name.trim();
  const normalizedDescription = description ? description.trim() : undefined;

  // Kiểm tra trùng tên dịch vụ trong cùng danh mục (không phân biệt chữ hoa/thường)
  const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const duplicateService = await Service.exists({
    category,
    name: new RegExp(`^${escapedName}$`, 'i'),
  });

  if (duplicateService) {
    throw httpError(409, 'Tên dịch vụ đã tồn tại trong danh mục này');
  }

  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    try {
      const created = await Service.create({
        code: generateServiceCode(),
        name: trimmedName,
        category,
        defaultDuration: Number(defaultDuration),
        basePrice: Number(basePrice),
        description: normalizedDescription,
        status: status || 'Active',
      });

      return created.toObject();
    } catch (error) {
      // Nếu trùng mã code ngẫu nhiên thì thử sinh lại mã khác
      if (error.code === 11000 && error.keyPattern && error.keyPattern.code) {
        continue;
      }
      // Nếu trùng compound index { category, name }
      if (error.code === 11000) {
        throw httpError(409, 'Tên dịch vụ đã tồn tại trong danh mục này');
      }
      throw error;
    }
  }

  throw httpError(500, 'Không thể tạo mã dịch vụ, vui lòng thử lại');
};

// SCR-29 & UC-66: Admin cập nhật thông tin dịch vụ (không được sửa mã code)
const updateService = async (serviceId, { name, category, defaultDuration, basePrice, description, status }) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw httpError(400, 'ID dịch vụ không hợp lệ');
  }

  const existingService = await Service.findById(serviceId).lean();
  if (!existingService) {
    throw httpError(404, 'Không tìm thấy dịch vụ');
  }

  const trimmedName = name.trim();
  const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Kiểm tra trùng tên với dịch vụ khác trong cùng danh mục
  const duplicateService = await Service.exists({
    _id: { $ne: serviceId },
    category,
    name: new RegExp(`^${escapedName}$`, 'i'),
  });

  if (duplicateService) {
    throw httpError(409, 'Tên dịch vụ đã tồn tại trong danh mục này');
  }

  const fieldsToSet = {
    name: trimmedName,
    category,
    defaultDuration: Number(defaultDuration),
    basePrice: Number(basePrice),
    description: description !== undefined && description !== null ? description.trim() : existingService.description,
  };

  if (status !== undefined && status !== null && status !== '') {
    fieldsToSet.status = status;
  }

  try {
    return await Service.findByIdAndUpdate(
      serviceId,
      { $set: fieldsToSet },
      { returnDocument: 'after' }
    ).lean();
  } catch (error) {
    if (error.code === 11000) {
      throw httpError(409, 'Tên dịch vụ đã tồn tại trong danh mục này');
    }
    throw error;
  }
};

// SCR-29 & UC-66: Admin bật/tắt trạng thái dịch vụ (Active / Inactive)
const updateServiceStatus = async (serviceId, status) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw httpError(400, 'ID dịch vụ không hợp lệ');
  }

  const service = await Service.findByIdAndUpdate(
    serviceId,
    { $set: { status } },
    { returnDocument: 'after' }
  ).lean();

  if (!service) {
    throw httpError(404, 'Không tìm thấy dịch vụ');
  }

  return service;
};

module.exports = {
  generateServiceCode,
  getAllServices,
  getServiceById,
  createService,
  updateService,
  updateServiceStatus,
};


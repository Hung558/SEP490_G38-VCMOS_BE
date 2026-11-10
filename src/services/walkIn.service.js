const crypto = require('crypto');
const User = require('../models/User');
const Pet = require('../models/Pet');
const Service = require('../models/Service');
const Cage = require('../models/Cage');
const AppointmentOrder = require('../models/AppointmentOrder');
const AppointmentService = require('../models/AppointmentService');
const { createCageAssignment } = require('./cageAssignment.service');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I để tránh nhầm lẫn
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;
const CLINICAL_STAFF_ROLES = ['Veterinarian', 'Groomer'];

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Sinh mã định danh theo quy tắc BR-24: USR-XXXXXX, PET-XXXXXX, APT-XXXXXX
const generateEntityCode = (prefix) => {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `${prefix}-${suffix}`;
};

const isDuplicateCodeError = (err) =>
  err && err.code === 11000 && (err.keyPattern?.code || String(err.message).includes('code'));

const toPublicCustomer = (user) => ({
  _id: user._id,
  code: user.code,
  fullName: user.fullName,
  phone: user.phone,
  email: user.email,
  role: user.role,
  status: user.status,
});

/**
 * Tạo User khách vãng lai mới ở trạng thái Inactive, mật khẩu rỗng theo BR-04 & UC-21
 */
const createInactiveWalkInUser = async ({ fullName, phone, email }) => {
  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    try {
      const user = await User.create({
        code: generateEntityCode('USR'),
        fullName,
        phone,
        email,
        passwordHash: null,
        role: 'PetOwner',
        status: 'Inactive',
      });
      return user.toObject();
    } catch (err) {
      if (isDuplicateCodeError(err)) continue;
      if (err.code === 11000) {
        throw httpError(409, 'Số điện thoại hoặc email khách hàng đã tồn tại');
      }
      throw err;
    }
  }
  throw httpError(500, 'Không thể tạo mã khách hàng, vui lòng thử lại');
};

/**
 * Tạo hồ sơ thú cưng mới cho khách vãng lai theo UC-09 & BR-24
 */
const createWalkInPet = async (ownerId, petInfo) => {
  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    try {
      const pet = await Pet.create({
        ...petInfo,
        code: generateEntityCode('PET'),
        ownerId,
        status: 'Active',
      });
      return pet.toObject();
    } catch (err) {
      if (isDuplicateCodeError(err)) continue;
      throw err;
    }
  }
  throw httpError(500, 'Không thể tạo mã thú cưng, vui lòng thử lại');
};

/**
 * Tạo đơn lịch hẹn Walk-in ở trạng thái CheckedIn ngay lập tức theo UC-19 & BR-06
 */
const createWalkInAppointmentOrder = async ({ petId, ownerId, date, note }) => {
  const checkedInAt = new Date();
  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    try {
      const order = await AppointmentOrder.create({
        code: generateEntityCode('APT'),
        petId,
        ownerId,
        date,
        note,
        isOnline: false,
        derivedStatus: 'CheckedIn',
        checkedInAt,
      });
      return order.toObject();
    } catch (err) {
      if (isDuplicateCodeError(err)) continue;
      throw err;
    }
  }
  throw httpError(500, 'Không thể tạo mã lịch hẹn, vui lòng thử lại');
};

/**
 * UC-20: Lễ tân tra cứu khách hàng theo số điện thoại kèm danh sách thú cưng đang hoạt động
 */
const lookupCustomerByPhone = async (phone) => {
  const user = await User.findOne({ phone }).lean();

  if (!user) {
    return {
      found: false,
      customer: null,
      pets: [],
    };
  }

  if (user.role !== 'PetOwner') {
    throw httpError(409, 'Số điện thoại này thuộc về tài khoản nhân sự nội bộ, không phải khách hàng');
  }

  if (user.status === 'Locked') {
    throw httpError(403, 'Tài khoản khách hàng này đã bị khóa');
  }

  const pets = await Pet.find({ ownerId: user._id, status: 'Active' })
    .sort({ createdAt: -1 })
    .lean();

  return {
    found: true,
    customer: toPublicCustomer(user),
    pets,
  };
};

/**
 * UC-19, UC-21, UC-09, BR-04, BR-06, BR-12:
 * Tiếp nhận khách vãng lai tại quầy (Walk-in):
 * 1. Kiểm tra danh mục dịch vụ, nhân viên phụ trách (nếu có) và chuồng lưu giữ (nếu có) trước khi ghi DB.
 * 2. Tìm khách hàng theo SĐT; nếu chưa có thì tự tạo tài khoản PetOwner ở trạng thái Inactive (passwordHash = null).
 * 3. Chọn thú cưng cũ của khách hoặc tạo thú cưng mới.
 * 4. Tạo đơn lịch hẹn Walk-in (isOnline = false, derivedStatus = 'CheckedIn', checkedInAt = now).
 * 5. Tạo danh sách dịch vụ (AppointmentService); nếu có assignedStaffId thì chuyển thẳng sang 'Waiting' + cấp queueNo.
 * 6. Gán chuồng lưu giữ (CageAssignment) nếu Lễ tân chọn chuồng ngay.
 */
const createWalkInBooking = async (receptionistId, payload) => {
  const { phone, fullName, email, petId, petInfo, date, note, services, cageId } = payload;

  // 1. Kiểm tra toàn bộ dịch vụ có tồn tại và đang Active không
  const serviceIds = [...new Set(services.map((item) => String(item.serviceId)))];
  const foundServices = await Service.find({ _id: { $in: serviceIds } }).lean();
  const serviceMap = new Map(foundServices.map((s) => [String(s._id), s]));

  for (let i = 0; i < services.length; i++) {
    const svc = serviceMap.get(String(services[i].serviceId));
    if (!svc) {
      throw httpError(404, `Không tìm thấy dịch vụ tại vị trí thứ ${i + 1}`);
    }
    if (svc.status !== 'Active') {
      throw httpError(400, `Dịch vụ "${svc.name}" hiện đã ngừng hoạt động`);
    }
  }

  // 2. Kiểm tra nhân sự được phân công (nếu Lễ tân chọn Bác sĩ / Groomer ngay lúc tạo Walk-in)
  const staffIds = [
    ...new Set(services.filter((item) => item.assignedStaffId).map((item) => String(item.assignedStaffId))),
  ];
  if (staffIds.length > 0) {
    const foundStaffs = await User.find({ _id: { $in: staffIds } })
      .select('code fullName role status')
      .lean();
    const staffMap = new Map(foundStaffs.map((st) => [String(st._id), st]));

    for (let i = 0; i < services.length; i++) {
      const staffId = services[i].assignedStaffId;
      if (!staffId) continue;

      const staff = staffMap.get(String(staffId));
      const svc = serviceMap.get(String(services[i].serviceId));
      if (!staff) {
        throw httpError(404, `Không tìm thấy nhân viên được phân công cho dịch vụ thứ ${i + 1}`);
      }
      if (!CLINICAL_STAFF_ROLES.includes(staff.role)) {
        throw httpError(400, 'Nhân sự được phân công phải có vai trò Bác sĩ (Veterinarian) hoặc Groomer');
      }
      if (staff.status !== 'Active') {
        throw httpError(400, `Nhân viên "${staff.fullName}" hiện không ở trạng thái hoạt động (Active)`);
      }
      if (svc.category === 'Grooming' && staff.role !== 'Groomer') {
        throw httpError(400, `Dịch vụ "${svc.name}" (Grooming) chỉ được phân công cho nhân viên Groomer`);
      }
      if (svc.category !== 'Grooming' && staff.role !== 'Veterinarian') {
        throw httpError(400, `Dịch vụ "${svc.name}" (${svc.category}) chỉ được phân công cho Bác sĩ thú y (Veterinarian)`);
      }
    }
  }

  // 3. Kiểm tra chuồng lưu giữ (nếu Lễ tân chọn chuồng ngay)
  if (cageId) {
    const cage = await Cage.findById(cageId).lean();
    if (!cage) {
      throw httpError(404, 'Không tìm thấy chuồng lưu giữ');
    }
    if (cage.status !== 'Available') {
      throw httpError(409, 'Chuồng lưu giữ hiện không ở trạng thái trống (Available)');
    }
  }

  // 4. Xác định khách hàng (User): dùng lại khách cũ hoặc tạo tài khoản Inactive theo BR-04
  let customer = await User.findOne({ phone }).lean();
  let isNewCustomer = false;
  let pet = null;
  let isNewPet = false;

  if (customer) {
    if (customer.role !== 'PetOwner') {
      throw httpError(409, 'Số điện thoại này thuộc về tài khoản nhân sự nội bộ, không phải khách hàng');
    }
    if (customer.status === 'Locked') {
      throw httpError(403, 'Tài khoản khách hàng này đang bị khóa, không thể tiếp nhận');
    }

    // Nếu khách đã tồn tại và Lễ tân chọn thú cưng cũ (petId)
    if (petId) {
      pet = await Pet.findOne({ _id: petId, ownerId: customer._id }).lean();
      if (!pet) {
        throw httpError(404, 'Không tìm thấy thú cưng thuộc quyền sở hữu của khách hàng này');
      }
      if (pet.status === 'Deleted') {
        throw httpError(400, 'Không thể tiếp nhận thú cưng đã bị xóa khỏi hồ sơ');
      }

      // Chống tạo trùng đơn khám trong cùng một ngày cho cùng một thú cưng
      const duplicatedOrder = await AppointmentOrder.exists({
        petId: pet._id,
        date,
        derivedStatus: { $ne: 'Cancelled' },
      });
      if (duplicatedOrder) {
        throw httpError(409, 'Thú cưng này đã có lịch hẹn hoặc ca khám đang hoạt động trong ngày hôm nay');
      }
    }
  } else {
    // Khách hàng mới chưa có trong hệ thống
    if (petId) {
      throw httpError(
        400,
        'Khách hàng mới chưa có hồ sơ trong hệ thống, vui lòng nhập thông tin thú cưng mới (petInfo)'
      );
    }
    if (!fullName) {
      throw httpError(400, 'Vui lòng nhập họ tên cho khách hàng vãng lai mới');
    }
    if (email) {
      const emailExists = await User.exists({ email });
      if (emailExists) {
        throw httpError(409, 'Địa chỉ email này đã được sử dụng bởi tài khoản khác');
      }
    }

    customer = await createInactiveWalkInUser({ fullName, phone, email });
    isNewCustomer = true;
  }

  // 5. Tạo thú cưng mới nếu Lễ tân truyền petInfo (UC-09)
  if (!pet && petInfo) {
    pet = await createWalkInPet(customer._id, petInfo);
    isNewPet = true;
  }

  // 6. Tạo đơn lịch hẹn Walk-in ở trạng thái CheckedIn ngay tại quầy (UC-19, BR-06)
  const appointment = await createWalkInAppointmentOrder({
    petId: pet._id,
    ownerId: customer._id,
    date,
    note,
  });

  // 7. Tạo tuần tự từng dịch vụ trong đơn Walk-in (AppointmentService)
  const createdServices = [];
  for (let i = 0; i < services.length; i++) {
    const { serviceId, assignedStaffId, isEmergency } = services[i];
    const sequenceNo = i + 1;

    const serviceDoc = {
      orderId: appointment._id,
      serviceId,
      sequenceNo,
      isEmergency: Boolean(isEmergency),
      assignedStaffId: assignedStaffId || null,
      status: 'Booked',
      queueNo: null,
      enqueueAt: null,
    };

    // Vì đơn Walk-in đã ở trạng thái CheckedIn, nếu có phân công nhân viên thì đẩy thẳng vào hàng đợi Waiting (BR-12)
    if (assignedStaffId) {
      const lastQueued = await AppointmentService.findOne({
        assignedStaffId,
        queueNo: { $ne: null },
      })
        .sort({ queueNo: -1 })
        .select('queueNo')
        .lean();

      serviceDoc.status = 'Waiting';
      serviceDoc.queueNo = lastQueued && lastQueued.queueNo ? lastQueued.queueNo + 1 : 1;
      serviceDoc.enqueueAt = appointment.checkedInAt;
    }

    const created = await AppointmentService.create(serviceDoc);
    const populated = await AppointmentService.findById(created._id)
      .populate('serviceId')
      .populate('assignedStaffId', 'code fullName role status')
      .lean();

    createdServices.push(populated);
  }

  // 8. Gán chuồng lưu giữ nếu Lễ tân chọn chuồng ngay trên Modal Walk-in (SCR-18 / UC-29 / BR-11)
  let cageAssignment = null;
  if (cageId) {
    cageAssignment = await createCageAssignment({
      cageId,
      orderId: appointment._id,
      assignedById: receptionistId,
      petWeight: pet?.weight,
      requiresIsolation: false,
    });
  }

  return {
    isNewCustomer,
    customer: toPublicCustomer(customer),
    isNewPet,
    pet,
    appointment,
    services: createdServices,
    cageAssignment,
  };
};

module.exports = {
  lookupCustomerByPhone,
  createWalkInBooking,
};

jest.mock('../../src/models/AppointmentService', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../src/models/AppointmentOrder', () => ({
  exists: jest.fn(),
}));

const AppointmentService = require('../../src/models/AppointmentService');
const AppointmentOrder = require('../../src/models/AppointmentOrder');
const { createOnlineAppointmentService } = require('../../src/services/appointmentService.service');

// Giả lập chuỗi findOne().sort().select().lean()
const mockLastSequence = (result) => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  AppointmentService.findOne.mockReturnValue(chain);
  return chain;
};

const basePayload = {
  ownerId: 'owner-1',
  orderId: 'order-1',
  serviceId: 'service-1',
};

describe('createOnlineAppointmentService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    AppointmentOrder.exists.mockResolvedValue({ _id: 'order-1' });
    AppointmentService.create.mockImplementation(async (doc) => ({ _id: 'as-1', ...doc }));
  });

  describe('kiểm tra quyền sở hữu', () => {
    it('kiểm tra lịch hẹn theo orderId và ownerId', async () => {
      mockLastSequence(null);

      await createOnlineAppointmentService(basePayload);

      expect(AppointmentOrder.exists).toHaveBeenCalledWith({ _id: 'order-1', ownerId: 'owner-1' });
    });

    it('ném lỗi 403 nếu lịch hẹn không thuộc về ownerId', async () => {
      AppointmentOrder.exists.mockResolvedValue(null);

      await expect(createOnlineAppointmentService(basePayload)).rejects.toMatchObject({
        statusCode: 403,
        message: 'Bạn chỉ có thể tạo dịch vụ cho lịch hẹn của mình',
      });
    });

    it('không truy vấn hay tạo dữ liệu khi không phải chủ lịch hẹn', async () => {
      AppointmentOrder.exists.mockResolvedValue(null);

      await createOnlineAppointmentService(basePayload).catch(() => {});

      expect(AppointmentService.findOne).not.toHaveBeenCalled();
      expect(AppointmentService.create).not.toHaveBeenCalled();
    });
  });

  describe('sequenceNo', () => {
    it('bằng 1 khi lịch hẹn chưa có dịch vụ nào', async () => {
      mockLastSequence(null);

      await createOnlineAppointmentService(basePayload);

      expect(AppointmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceNo: 1 })
      );
    });

    it('bằng số lớn nhất hiện có + 1 khi không truyền sequenceNo', async () => {
      const chain = mockLastSequence({ sequenceNo: 3 });

      await createOnlineAppointmentService(basePayload);

      expect(AppointmentService.findOne).toHaveBeenCalledWith({ orderId: 'order-1' });
      expect(chain.sort).toHaveBeenCalledWith({ sequenceNo: -1 });
      expect(AppointmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceNo: 4 })
      );
    });

    it('dùng sequenceNo được truyền vào và không truy vấn số lớn nhất', async () => {
      await createOnlineAppointmentService({ ...basePayload, sequenceNo: 7 });

      expect(AppointmentService.findOne).not.toHaveBeenCalled();
      expect(AppointmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceNo: 7 })
      );
    });
  });

  describe('dữ liệu tạo mới', () => {
    beforeEach(() => mockLastSequence(null));

    it('chỉ truyền orderId, serviceId, sequenceNo khi không có isEmergency', async () => {
      await createOnlineAppointmentService(basePayload);

      expect(AppointmentService.create).toHaveBeenCalledWith({
        orderId: 'order-1',
        serviceId: 'service-1',
        sequenceNo: 1,
      });
    });

    it.each([true, false])('truyền isEmergency = %s khi là boolean', async (value) => {
      await createOnlineAppointmentService({ ...basePayload, isEmergency: value });

      expect(AppointmentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ isEmergency: value })
      );
    });

    it('bỏ qua isEmergency khi không phải boolean', async () => {
      await createOnlineAppointmentService({ ...basePayload, isEmergency: 'true' });

      expect(AppointmentService.create.mock.calls[0][0]).not.toHaveProperty('isEmergency');
    });

    it('không truyền các trường chỉ dùng giá trị mặc định', async () => {
      await createOnlineAppointmentService({
        ...basePayload,
        preferredStaffId: 'staff-1',
        assignedStaffId: 'staff-2',
        status: 'Done',
        queueNo: 5,
        enqueueAt: new Date(),
        dequeueAt: new Date(),
        groomingNote: { beforeNote: 'x' },
      });

      const doc = AppointmentService.create.mock.calls[0][0];
      [
        'preferredStaffId',
        'assignedStaffId',
        'status',
        'queueNo',
        'enqueueAt',
        'dequeueAt',
        'groomingNote',
        'ownerId',
      ].forEach((field) => expect(doc).not.toHaveProperty(field));
    });
  });

  describe('kết quả trả về', () => {
    it('trả về message tiếng Việt và dữ liệu vừa tạo', async () => {
      mockLastSequence(null);

      const result = await createOnlineAppointmentService(basePayload);

      expect(result).toEqual({
        message: 'Tạo dịch vụ cho lịch hẹn online thành công',
        data: { _id: 'as-1', orderId: 'order-1', serviceId: 'service-1', sequenceNo: 1 },
      });
    });
  });

  describe('xử lý lỗi khi tạo', () => {
    beforeEach(() => mockLastSequence(null));

    it('ném lỗi 409 khi trùng index { orderId, sequenceNo }', async () => {
      AppointmentService.create.mockRejectedValue({ code: 11000 });

      await expect(createOnlineAppointmentService(basePayload)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Số thứ tự dịch vụ đã tồn tại trong lịch hẹn này',
      });
    });

    it('ném lại nguyên lỗi khác', async () => {
      const dbError = new Error('DB down');
      AppointmentService.create.mockRejectedValue(dbError);

      await expect(createOnlineAppointmentService(basePayload)).rejects.toBe(dbError);
    });
  });
});
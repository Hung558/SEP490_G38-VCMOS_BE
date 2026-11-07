jest.mock('../../src/models/AppointmentService', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
}));
jest.mock('../../src/models/AppointmentOrder', () => ({
  exists: jest.fn(),
  deleteOne: jest.fn(),
}));
// Không nạp appointmentOrder.service thật (kéo theo nodemailer, Pet, User...)
jest.mock('../../src/services/appointmentOrder.service', () => ({
  createOnlineAppointment: jest.fn(),
}));

const AppointmentService = require('../../src/models/AppointmentService');
const AppointmentOrder = require('../../src/models/AppointmentOrder');
const { createOnlineAppointment } = require('../../src/services/appointmentOrder.service');
const {
  createOnlineAppointmentService,
  createOnlineBooking,
  getAppointmentServicesByOrderId,
  assignStaffToAppointmentService,
} = require('../../src/services/appointmentService.service');

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

// Giả lập nhiều lần gọi findOne liên tiếp (mỗi lần trả về một kết quả khác nhau)
const mockLastSequences = (...results) => {
  results.forEach((result) => {
    AppointmentService.findOne.mockReturnValueOnce({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(result),
    });
  });
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

describe('createOnlineBooking', () => {
  const appointment = { _id: 'order-1', code: 'APT-ABC123', ownerId: 'owner-1' };

  const bookingPayload = {
    ownerId: 'owner-1',
    petId: 'pet-1',
    date: '2026-11-10',
    note: 'Ghi chú',
    services: [{ serviceId: 'service-1' }, { serviceId: 'service-2' }],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    createOnlineAppointment.mockResolvedValue(appointment);
    AppointmentOrder.exists.mockResolvedValue({ _id: 'order-1' });
    AppointmentService.create.mockImplementation(async (doc) => ({
      _id: `as-${doc.sequenceNo}`,
      ...doc,
    }));
    AppointmentService.deleteMany.mockResolvedValue({ deletedCount: 0 });
    AppointmentOrder.deleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  describe('kiểm tra danh sách dịch vụ', () => {
    it.each([
      ['không truyền services', undefined],
      ['services không phải mảng', 'service-1'],
      ['services là mảng rỗng', []],
    ])('ném lỗi 400 khi %s', async (_label, services) => {
      await expect(createOnlineBooking({ ...bookingPayload, services })).rejects.toMatchObject({
        statusCode: 400,
        message: 'Lịch hẹn phải có ít nhất một dịch vụ',
      });
    });

    it('không tạo lịch hẹn hay dịch vụ khi không có dịch vụ nào', async () => {
      await createOnlineBooking({ ...bookingPayload, services: [] }).catch(() => {});

      expect(createOnlineAppointment).not.toHaveBeenCalled();
      expect(AppointmentService.create).not.toHaveBeenCalled();
    });
  });

  describe('tạo lịch hẹn', () => {
    beforeEach(() => mockLastSequences(null, { sequenceNo: 1 }));

    it('gọi createOnlineAppointment với ownerId và { petId, date, note }', async () => {
      await createOnlineBooking(bookingPayload);

      expect(createOnlineAppointment).toHaveBeenCalledTimes(1);
      expect(createOnlineAppointment).toHaveBeenCalledWith('owner-1', {
        petId: 'pet-1',
        date: '2026-11-10',
        note: 'Ghi chú',
      });
    });

    it('ném lại lỗi từ createOnlineAppointment và không tạo dịch vụ', async () => {
      const orderError = Object.assign(new Error('Thú cưng này đã có lịch hẹn trong ngày đã chọn'), {
        status: 409,
      });
      createOnlineAppointment.mockRejectedValue(orderError);

      await expect(createOnlineBooking(bookingPayload)).rejects.toBe(orderError);

      expect(AppointmentService.create).not.toHaveBeenCalled();
    });

    it('không xoá gì khi tạo lịch hẹn thất bại (chưa có gì để hoàn tác)', async () => {
      createOnlineAppointment.mockRejectedValue(new Error('fail'));

      await createOnlineBooking(bookingPayload).catch(() => {});

      expect(AppointmentService.deleteMany).not.toHaveBeenCalled();
      expect(AppointmentOrder.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('tạo các dịch vụ', () => {
    it('tạo mỗi dịch vụ với orderId của lịch hẹn vừa tạo và kiểm tra quyền sở hữu', async () => {
      mockLastSequences(null, { sequenceNo: 1 });

      await createOnlineBooking(bookingPayload);

      expect(AppointmentOrder.exists).toHaveBeenCalledTimes(2);
      expect(AppointmentOrder.exists).toHaveBeenCalledWith({ _id: 'order-1', ownerId: 'owner-1' });
      expect(AppointmentService.create).toHaveBeenNthCalledWith(1, {
        orderId: 'order-1',
        serviceId: 'service-1',
        sequenceNo: 1,
      });
      expect(AppointmentService.create).toHaveBeenNthCalledWith(2, {
        orderId: 'order-1',
        serviceId: 'service-2',
        sequenceNo: 2,
      });
    });

    it('tạo tuần tự: dịch vụ sau chỉ bắt đầu khi dịch vụ trước đã xong', async () => {
      mockLastSequences(null, { sequenceNo: 1 });
      const events = [];
      AppointmentService.create.mockImplementation(async (doc) => {
        events.push(`start-${doc.serviceId}`);
        await new Promise((resolve) => setImmediate(resolve));
        events.push(`end-${doc.serviceId}`);
        return { _id: `as-${doc.sequenceNo}`, ...doc };
      });

      await createOnlineBooking(bookingPayload);

      expect(events).toEqual(['start-service-1', 'end-service-1', 'start-service-2', 'end-service-2']);
    });

    it('truyền sequenceNo và isEmergency của từng dịch vụ', async () => {
      await createOnlineBooking({
        ...bookingPayload,
        services: [
          { serviceId: 'service-1', sequenceNo: 5, isEmergency: true },
          { serviceId: 'service-2', sequenceNo: 6, isEmergency: false },
        ],
      });

      expect(AppointmentService.findOne).not.toHaveBeenCalled();
      expect(AppointmentService.create).toHaveBeenNthCalledWith(1, {
        orderId: 'order-1',
        serviceId: 'service-1',
        sequenceNo: 5,
        isEmergency: true,
      });
      expect(AppointmentService.create).toHaveBeenNthCalledWith(2, {
        orderId: 'order-1',
        serviceId: 'service-2',
        sequenceNo: 6,
        isEmergency: false,
      });
    });

    it('chỉ có một dịch vụ vẫn tạo được', async () => {
      mockLastSequences(null);

      const result = await createOnlineBooking({
        ...bookingPayload,
        services: [{ serviceId: 'service-1' }],
      });

      expect(AppointmentService.create).toHaveBeenCalledTimes(1);
      expect(result.data.services).toHaveLength(1);
    });
  });

  describe('kết quả trả về', () => {
    it('trả về message tiếng Việt, lịch hẹn và danh sách dịch vụ theo thứ tự đã gửi', async () => {
      mockLastSequences(null, { sequenceNo: 1 });

      const result = await createOnlineBooking(bookingPayload);

      expect(result).toEqual({
        message: 'Đặt lịch online thành công',
        data: {
          appointment,
          services: [
            { _id: 'as-1', orderId: 'order-1', serviceId: 'service-1', sequenceNo: 1 },
            { _id: 'as-2', orderId: 'order-1', serviceId: 'service-2', sequenceNo: 2 },
          ],
        },
      });
    });

    it('không xoá dữ liệu khi tạo thành công', async () => {
      mockLastSequences(null, { sequenceNo: 1 });

      await createOnlineBooking(bookingPayload);

      expect(AppointmentService.deleteMany).not.toHaveBeenCalled();
      expect(AppointmentOrder.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('hoàn tác khi tạo dịch vụ thất bại', () => {
    it('xoá các dịch vụ và lịch hẹn đã tạo, rồi ném lại lỗi gốc', async () => {
      mockLastSequences(null, { sequenceNo: 1 });
      const dbError = new Error('DB down');
      AppointmentService.create
        .mockResolvedValueOnce({ _id: 'as-1', orderId: 'order-1', serviceId: 'service-1', sequenceNo: 1 })
        .mockRejectedValueOnce(dbError);

      await expect(createOnlineBooking(bookingPayload)).rejects.toBe(dbError);

      expect(AppointmentService.deleteMany).toHaveBeenCalledWith({ orderId: 'order-1' });
      expect(AppointmentOrder.deleteOne).toHaveBeenCalledWith({ _id: 'order-1' });
    });

    it('hoàn tác khi dịch vụ đầu tiên thất bại và không tạo các dịch vụ còn lại', async () => {
      mockLastSequences(null);
      AppointmentService.create.mockRejectedValueOnce(new Error('fail'));

      await createOnlineBooking(bookingPayload).catch(() => {});

      expect(AppointmentService.create).toHaveBeenCalledTimes(1);
      expect(AppointmentService.deleteMany).toHaveBeenCalledWith({ orderId: 'order-1' });
      expect(AppointmentOrder.deleteOne).toHaveBeenCalledWith({ _id: 'order-1' });
    });

    it('ném lỗi 409 khi trùng sequenceNo và hoàn tác', async () => {
      AppointmentService.create
        .mockResolvedValueOnce({ _id: 'as-1', orderId: 'order-1', serviceId: 'service-1', sequenceNo: 1 })
        .mockRejectedValueOnce({ code: 11000 });

      await expect(
        createOnlineBooking({
          ...bookingPayload,
          services: [
            { serviceId: 'service-1', sequenceNo: 1 },
            { serviceId: 'service-2', sequenceNo: 1 },
          ],
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Số thứ tự dịch vụ đã tồn tại trong lịch hẹn này',
      });

      expect(AppointmentService.deleteMany).toHaveBeenCalledWith({ orderId: 'order-1' });
      expect(AppointmentOrder.deleteOne).toHaveBeenCalledWith({ _id: 'order-1' });
    });

    it('ném lỗi 403 và hoàn tác khi lịch hẹn không thuộc về ownerId', async () => {
      AppointmentOrder.exists.mockResolvedValue(null);

      await expect(createOnlineBooking(bookingPayload)).rejects.toMatchObject({ statusCode: 403 });

      expect(AppointmentService.create).not.toHaveBeenCalled();
      expect(AppointmentOrder.deleteOne).toHaveBeenCalledWith({ _id: 'order-1' });
    });

    it('vẫn ném lỗi gốc nếu bước xoá cũng thất bại', async () => {
      mockLastSequences(null);
      const originalError = new Error('create failed');
      AppointmentService.create.mockRejectedValueOnce(originalError);
      AppointmentService.deleteMany.mockRejectedValue(new Error('delete failed'));
      AppointmentOrder.deleteOne.mockRejectedValue(new Error('delete failed'));

      await expect(createOnlineBooking(bookingPayload)).rejects.toBe(originalError);

      expect(AppointmentService.deleteMany).toHaveBeenCalled();
      expect(AppointmentOrder.deleteOne).toHaveBeenCalled();
    });
  });
});

describe('getAppointmentServicesByOrderId & assignStaffToAppointmentService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('getAppointmentServicesByOrderId: trả về danh sách dịch vụ của đơn hẹn đã populate và sort theo sequenceNo', async () => {
    const items = [{ _id: 'as-1', sequenceNo: 1 }];
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(items),
    };
    AppointmentService.find.mockReturnValue(chain);

    const result = await getAppointmentServicesByOrderId('order-1');

    expect(AppointmentService.find).toHaveBeenCalledWith({ orderId: 'order-1' });
    expect(chain.sort).toHaveBeenCalledWith({ sequenceNo: 1 });
    expect(result).toEqual({
      message: 'Lấy danh sách dịch vụ của lịch hẹn thành công',
      data: items,
    });
  });

  it('assignStaffToAppointmentService: phân công bác sĩ khi đơn đã CheckedIn -> chuyển status sang Waiting và cấp queueNo', async () => {
    AppointmentService.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'as-1', orderId: 'order-1', status: 'Booked' }),
    });
    AppointmentService.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ queueNo: 2 }),
    });
    const updatedDoc = {
      _id: 'as-1',
      assignedStaffId: { _id: 'vet-1', fullName: 'BS Minh' },
      status: 'Waiting',
      queueNo: 3,
    };
    AppointmentService.findByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(updatedDoc),
    });

    const result = await assignStaffToAppointmentService({
      appointmentServiceId: 'as-1',
      assignedStaffId: 'vet-1',
      orderStatus: 'CheckedIn',
    });

    expect(AppointmentService.findByIdAndUpdate).toHaveBeenCalledWith(
      'as-1',
      {
        $set: {
          assignedStaffId: 'vet-1',
          status: 'Waiting',
          enqueueAt: expect.any(Date),
          queueNo: 3,
        },
      },
      { returnDocument: 'after' }
    );
    expect(result).toEqual({
      message: 'Phân công nhân sự cho dịch vụ thành công',
      data: updatedDoc,
    });
  });
});
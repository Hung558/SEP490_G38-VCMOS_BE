/**
 * Unit tests for appointmentOrder.service.js
 */
const crypto = require('crypto');

jest.mock('../../src/models/AppointmentOrder');
jest.mock('../../src/models/Pet');

const AppointmentOrder = require('../../src/models/AppointmentOrder');
const Pet = require('../../src/models/Pet');
const service = require('../../src/services/appointmentOrder.service');

// ---------- helpers ----------

/** Pet.findOne(...).select(...).lean() chain */
const mockPetFindOne = (result) => {
  const lean = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ lean });
  Pet.findOne.mockReturnValue({ select });
  return { select, lean };
};

/** AppointmentOrder.find(...).sort().skip().limit().lean() chain */
const mockAppointmentFind = (items) => {
  const lean = jest.fn().mockResolvedValue(items);
  const limit = jest.fn().mockReturnValue({ lean });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  AppointmentOrder.find.mockReturnValue({ sort });
  return { sort, skip, limit, lean };
};

/** AppointmentOrder.findOne(...).lean() chain */
const mockAppointmentFindOne = (result) => {
  const lean = jest.fn().mockResolvedValue(result);
  AppointmentOrder.findOne.mockReturnValue({ lean });
  return { lean };
};

const duplicateCodeError = () => {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  err.keyPattern = { code: 1 };
  return err;
};

const OWNER_ID = 'owner-1';
const PET_ID = 'pet-1';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- createOnlineAppointment ----------

describe('createOnlineAppointment', () => {
  const input = { petId: PET_ID, date: '2026-11-10', note: 'Tiêm phòng' };

  describe('pet validation', () => {
    it('throws 404 when the pet does not exist or is not owned by the user', async () => {
      mockPetFindOne(null);

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toMatchObject({
        status: 404,
        message: 'Không tìm thấy thú cưng',
      });

      expect(Pet.findOne).toHaveBeenCalledWith({ _id: PET_ID, ownerId: OWNER_ID });
      expect(AppointmentOrder.exists).not.toHaveBeenCalled();
      expect(AppointmentOrder.create).not.toHaveBeenCalled();
    });

    it('only selects _id of the pet', async () => {
      const { select } = mockPetFindOne({ _id: PET_ID });
      AppointmentOrder.exists.mockResolvedValue(null);
      AppointmentOrder.create.mockResolvedValue({});

      await service.createOnlineAppointment(OWNER_ID, input);

      expect(select).toHaveBeenCalledWith('_id');
    });
  });

  describe('double-booking check', () => {
    it('throws 409 when the pet already has a non-cancelled appointment that day', async () => {
      mockPetFindOne({ _id: PET_ID });
      AppointmentOrder.exists.mockResolvedValue({ _id: 'existing' });

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toMatchObject({
        status: 409,
        message: 'Thú cưng này đã có lịch hẹn trong ngày đã chọn',
      });

      expect(AppointmentOrder.exists).toHaveBeenCalledWith({
        petId: PET_ID,
        date: input.date,
        derivedStatus: { $ne: 'Cancelled' },
      });
      expect(AppointmentOrder.create).not.toHaveBeenCalled();
    });
  });

  describe('creation', () => {
    beforeEach(() => {
      mockPetFindOne({ _id: PET_ID });
      AppointmentOrder.exists.mockResolvedValue(null);
    });

    it('creates an online appointment and returns the created document', async () => {
      const created = { _id: 'apt-1', code: 'APT-XXXXXX' };
      AppointmentOrder.create.mockResolvedValue(created);

      const result = await service.createOnlineAppointment(OWNER_ID, input);

      expect(result).toBe(created);
      expect(AppointmentOrder.create).toHaveBeenCalledTimes(1);
      expect(AppointmentOrder.create).toHaveBeenCalledWith({
        code: expect.any(String),
        petId: PET_ID,
        ownerId: OWNER_ID,
        date: input.date,
        note: input.note,
        isOnline: true,
        checkedInAt: null,
      });
    });

    it('does not set derivedStatus explicitly (relies on schema default)', async () => {
      AppointmentOrder.create.mockResolvedValue({});

      await service.createOnlineAppointment(OWNER_ID, input);

      expect(AppointmentOrder.create.mock.calls[0][0]).not.toHaveProperty('derivedStatus');
    });

    it('generates a code in the format APT-XXXXXX using the safe alphabet', async () => {
      AppointmentOrder.create.mockResolvedValue({});

      // Run several times to give the regex a fair chance to catch bad chars
      for (let i = 0; i < 50; i++) {
        await service.createOnlineAppointment(OWNER_ID, input);
      }

      for (const [payload] of AppointmentOrder.create.mock.calls) {
        // Alphabet excludes 0, O, 1, I
        expect(payload.code).toMatch(/^APT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      }
    });

    it('builds the code from crypto.randomInt over the full alphabet', async () => {
      AppointmentOrder.create.mockResolvedValue({});
      const randomIntSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(0);

      await service.createOnlineAppointment(OWNER_ID, input);

      expect(randomIntSpy).toHaveBeenCalledTimes(6);
      expect(randomIntSpy).toHaveBeenCalledWith(32); // alphabet length
      expect(AppointmentOrder.create.mock.calls[0][0].code).toBe('APT-AAAAAA');
    });

    it('maps random indexes to the expected characters', async () => {
      AppointmentOrder.create.mockResolvedValue({});
      // indexes: 0 -> A, 31 -> 9, 8 -> J (I is skipped), 22 -> X? computed below
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const indexes = [0, 31, 8, 15, 23, 7];
      const spy = jest.spyOn(crypto, 'randomInt');
      indexes.forEach((i) => spy.mockReturnValueOnce(i));

      await service.createOnlineAppointment(OWNER_ID, input);

      const expected = `APT-${indexes.map((i) => alphabet[i]).join('')}`;
      expect(AppointmentOrder.create.mock.calls[0][0].code).toBe(expected);
    });
  });

  describe('code collision retries', () => {
    beforeEach(() => {
      mockPetFindOne({ _id: PET_ID });
      AppointmentOrder.exists.mockResolvedValue(null);
    });

    it('retries when the unique code index is violated (keyPattern.code)', async () => {
      const created = { _id: 'apt-1' };
      AppointmentOrder.create
        .mockRejectedValueOnce(duplicateCodeError())
        .mockRejectedValueOnce(duplicateCodeError())
        .mockResolvedValueOnce(created);

      const result = await service.createOnlineAppointment(OWNER_ID, input);

      expect(result).toBe(created);
      expect(AppointmentOrder.create).toHaveBeenCalledTimes(3);
    });

    it('detects duplicate code errors via the error message when keyPattern is missing', async () => {
      const err = new Error('E11000 duplicate key error index: code_1 dup key');
      err.code = 11000;
      const created = { _id: 'apt-2' };
      AppointmentOrder.create.mockRejectedValueOnce(err).mockResolvedValueOnce(created);

      const result = await service.createOnlineAppointment(OWNER_ID, input);

      expect(result).toBe(created);
      expect(AppointmentOrder.create).toHaveBeenCalledTimes(2);
    });

    it('generates a fresh code on each attempt', async () => {
      AppointmentOrder.create
        .mockRejectedValueOnce(duplicateCodeError())
        .mockResolvedValueOnce({});
      const spy = jest.spyOn(crypto, 'randomInt');
      // first attempt: all 0 -> AAAAAA, second attempt: all 1 -> BBBBBB
      for (let i = 0; i < 6; i++) spy.mockReturnValueOnce(0);
      for (let i = 0; i < 6; i++) spy.mockReturnValueOnce(1);

      await service.createOnlineAppointment(OWNER_ID, input);

      expect(AppointmentOrder.create.mock.calls[0][0].code).toBe('APT-AAAAAA');
      expect(AppointmentOrder.create.mock.calls[1][0].code).toBe('APT-BBBBBB');
    });

    it('throws 500 after exhausting all 5 retries', async () => {
      AppointmentOrder.create.mockRejectedValue(duplicateCodeError());

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toMatchObject({
        status: 500,
        message: 'Không thể tạo mã lịch hẹn, vui lòng thử lại',
      });

      expect(AppointmentOrder.create).toHaveBeenCalledTimes(5);
    });

    it('succeeds on the last (5th) attempt', async () => {
      const created = { _id: 'apt-last' };
      for (let i = 0; i < 4; i++) {
        AppointmentOrder.create.mockRejectedValueOnce(duplicateCodeError());
      }
      AppointmentOrder.create.mockResolvedValueOnce(created);

      await expect(service.createOnlineAppointment(OWNER_ID, input)).resolves.toBe(created);
      expect(AppointmentOrder.create).toHaveBeenCalledTimes(5);
    });

    it('rethrows non-duplicate errors immediately without retrying', async () => {
      const dbError = new Error('connection lost');
      AppointmentOrder.create.mockRejectedValue(dbError);

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toBe(dbError);
      expect(AppointmentOrder.create).toHaveBeenCalledTimes(1);
    });

    it('does not retry on a duplicate-key error for a different field', async () => {
      const err = new Error('E11000 duplicate key error dup key: { petId: 1 }');
      err.code = 11000;
      err.keyPattern = { petId: 1 };
      AppointmentOrder.create.mockRejectedValue(err);

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toBe(err);
      expect(AppointmentOrder.create).toHaveBeenCalledTimes(1);
    });

    it('does not retry on a non-11000 error whose message mentions "code"', async () => {
      const err = new Error('invalid code');
      err.code = 123;
      AppointmentOrder.create.mockRejectedValue(err);

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toBe(err);
      expect(AppointmentOrder.create).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------- listMyOnlineAppointments ----------

describe('listMyOnlineAppointments', () => {
  it('uses default pagination and a base filter scoped to the owner and online bookings', async () => {
    const chain = mockAppointmentFind([{ _id: 'a1' }]);
    AppointmentOrder.countDocuments.mockResolvedValue(1);

    const result = await service.listMyOnlineAppointments(OWNER_ID, {});

    expect(AppointmentOrder.find).toHaveBeenCalledWith({ ownerId: OWNER_ID, isOnline: true });
    expect(AppointmentOrder.countDocuments).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      isOnline: true,
    });
    expect(chain.sort).toHaveBeenCalledWith({ date: -1, createdAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      items: [{ _id: 'a1' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('adds the status filter on derivedStatus', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    await service.listMyOnlineAppointments(OWNER_ID, { status: 'Booked' });

    const expected = { ownerId: OWNER_ID, isOnline: true, derivedStatus: 'Booked' };
    expect(AppointmentOrder.find).toHaveBeenCalledWith(expected);
    expect(AppointmentOrder.countDocuments).toHaveBeenCalledWith(expected);
  });

  it('applies both from and to as an inclusive date range', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    await service.listMyOnlineAppointments(OWNER_ID, { from: '2026-11-01', to: '2026-11-30' });

    expect(AppointmentOrder.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      isOnline: true,
      date: { $gte: '2026-11-01', $lte: '2026-11-30' },
    });
  });

  it('applies only "from" when "to" is missing', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    await service.listMyOnlineAppointments(OWNER_ID, { from: '2026-11-01' });

    expect(AppointmentOrder.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      isOnline: true,
      date: { $gte: '2026-11-01' },
    });
  });

  it('applies only "to" when "from" is missing', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    await service.listMyOnlineAppointments(OWNER_ID, { to: '2026-11-30' });

    expect(AppointmentOrder.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      isOnline: true,
      date: { $lte: '2026-11-30' },
    });
  });

  it('combines status and date filters', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    await service.listMyOnlineAppointments(OWNER_ID, {
      status: 'Cancelled',
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(AppointmentOrder.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      isOnline: true,
      derivedStatus: 'Cancelled',
      date: { $gte: '2026-01-01', $lte: '2026-12-31' },
    });
  });

  it('does not add a date filter when neither from nor to is given', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    await service.listMyOnlineAppointments(OWNER_ID, { status: 'Booked' });

    expect(AppointmentOrder.find.mock.calls[0][0]).not.toHaveProperty('date');
  });

  it('computes skip/limit and totalPages for custom pagination', async () => {
    const chain = mockAppointmentFind([{ _id: 'a1' }, { _id: 'a2' }]);
    AppointmentOrder.countDocuments.mockResolvedValue(23);

    const result = await service.listMyOnlineAppointments(OWNER_ID, { page: 3, limit: 5 });

    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(chain.limit).toHaveBeenCalledWith(5);
    expect(result.pagination).toEqual({ page: 3, limit: 5, total: 23, totalPages: 5 });
  });

  it('returns totalPages 0 when there are no results', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    const result = await service.listMyOnlineAppointments(OWNER_ID, {});

    expect(result.items).toEqual([]);
    expect(result.pagination.totalPages).toBe(0);
  });

  it('rounds totalPages up for partial last pages', async () => {
    mockAppointmentFind([]);
    AppointmentOrder.countDocuments.mockResolvedValue(11);

    const result = await service.listMyOnlineAppointments(OWNER_ID, { limit: 10 });

    expect(result.pagination.totalPages).toBe(2);
  });

  it('propagates database errors', async () => {
    const lean = jest.fn().mockRejectedValue(new Error('db down'));
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    AppointmentOrder.find.mockReturnValue({ sort });
    AppointmentOrder.countDocuments.mockResolvedValue(0);

    await expect(service.listMyOnlineAppointments(OWNER_ID, {})).rejects.toThrow('db down');
  });
});

// ---------- getMyOnlineAppointment ----------

describe('getMyOnlineAppointment', () => {
  it('returns the appointment when it belongs to the owner and is online', async () => {
    const appointment = { _id: 'apt-1', ownerId: OWNER_ID, isOnline: true };
    mockAppointmentFindOne(appointment);

    const result = await service.getMyOnlineAppointment(OWNER_ID, 'apt-1');

    expect(result).toBe(appointment);
    expect(AppointmentOrder.findOne).toHaveBeenCalledWith({
      _id: 'apt-1',
      ownerId: OWNER_ID,
      isOnline: true,
    });
  });

  it('throws 404 when the appointment is not found', async () => {
    mockAppointmentFindOne(null);

    await expect(service.getMyOnlineAppointment(OWNER_ID, 'missing')).rejects.toMatchObject({
      status: 404,
      message: 'Không tìm thấy lịch hẹn',
    });
  });

  it('propagates database errors', async () => {
    const lean = jest.fn().mockRejectedValue(new Error('cast error'));
    AppointmentOrder.findOne.mockReturnValue({ lean });

    await expect(service.getMyOnlineAppointment(OWNER_ID, 'bad-id')).rejects.toThrow('cast error');
  });
});
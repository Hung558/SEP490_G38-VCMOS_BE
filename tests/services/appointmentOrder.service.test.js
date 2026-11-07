/**
 * Unit tests for appointmentOrder.service.js
 */
const crypto = require('crypto');

jest.mock('nodemailer');
jest.mock('../../src/models/AppointmentOrder');
jest.mock('../../src/models/AppointmentService');
jest.mock('../../src/models/Pet');
jest.mock('../../src/models/User');

const nodemailer = require('nodemailer');
const AppointmentOrder = require('../../src/models/AppointmentOrder');
const AppointmentService = require('../../src/models/AppointmentService');
const Pet = require('../../src/models/Pet');
const User = require('../../src/models/User');
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

/** AppointmentOrder.find(...).populate().populate().sort().skip().limit().lean() chain */
const mockAppointmentFindPopulated = (items) => {
  const lean = jest.fn().mockResolvedValue(items);
  const limit = jest.fn().mockReturnValue({ lean });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  const populateOwner = jest.fn().mockReturnValue({ sort });
  const populatePet = jest.fn().mockReturnValue({ populate: populateOwner });
  AppointmentOrder.find.mockReturnValue({ populate: populatePet });
  return { populatePet, populateOwner, sort, skip, limit, lean };
};

/** AppointmentOrder.findOne(...).lean() chain */
const mockAppointmentFindOne = (result) => {
  const lean = jest.fn().mockResolvedValue(result);
  AppointmentOrder.findOne.mockReturnValue({ lean });
  return { lean };
};

/** AppointmentOrder.findOneAndUpdate(...).lean() chain */
const mockFindOneAndUpdate = (result) => {
  const lean = jest.fn().mockResolvedValue(result);
  AppointmentOrder.findOneAndUpdate.mockReturnValue({ lean });
  return { lean };
};

/** AppointmentOrder.findById(...).select(...).lean() chain */
const mockFindById = (result) => {
  const lean = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ lean });
  AppointmentOrder.findById.mockReturnValue({ select });
  return { select, lean };
};

/** User.find(...).select(...).lean() chain (receptionist lookup) */
const mockReceptionists = (receptionists) => {
  const lean = jest.fn().mockResolvedValue(receptionists);
  const select = jest.fn().mockReturnValue({ lean });
  User.find.mockReturnValue({ select });
  return { select, lean };
};

/** User.findById(...).select(...).lean() chain (owner lookup) */
const mockOwner = (owner) => {
  const lean = jest.fn().mockResolvedValue(owner);
  const select = jest.fn().mockReturnValue({ lean });
  User.findById.mockReturnValue({ select });
  return { select, lean };
};

/**
 * The notification is fire-and-forget (not awaited by the service),
 * so tests must let pending promises settle before asserting on it.
 */
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const mockSendMail = jest.fn();

/** Make sendNewAppointmentEmail go through the real nodemailer path instead of the dev/test early return. */
const enableRealEmail = () => {
  process.env.NODE_ENV = 'development';
  process.env.EMAIL_USER = 'clinic@gmail.com';
  process.env.EMAIL_PASS = 'app-password';
};

const duplicateCodeError = () => {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  err.keyPattern = { code: 1 };
  return err;
};

const OWNER_ID = 'owner-1';
const PET_ID = 'pet-1';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();

  // Sensible defaults so tests that don't care about email never hit real lookups
  mockReceptionists([]);
  mockOwner({ fullName: 'Nguyễn Văn A', phone: '0901234567' });
  mockSendMail.mockResolvedValue({});
  nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

  // Keep test output clean; individual tests assert on these when relevant
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
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

    it('only selects _id and name of the pet (name is needed for the notification email)', async () => {
      const { select } = mockPetFindOne({ _id: PET_ID, name: 'Milu' });
      AppointmentOrder.exists.mockResolvedValue(null);
      AppointmentOrder.create.mockResolvedValue({});

      await service.createOnlineAppointment(OWNER_ID, input);

      expect(select).toHaveBeenCalledWith('_id name');
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

// ---------- receptionist notification (called from createOnlineAppointment) ----------

describe('createOnlineAppointment - receptionist notification', () => {
  const input = { petId: PET_ID, date: '2026-11-10', note: 'Tiêm phòng' };
  const created = {
    _id: 'apt-1',
    code: 'APT-K7M2QX',
    ownerId: OWNER_ID,
    petId: PET_ID,
    date: input.date,
    note: input.note,
  };
  const receptionists = [{ email: 'le.tan1@vcmos.vn' }, { email: 'le.tan2@vcmos.vn' }];

  beforeEach(() => {
    mockPetFindOne({ _id: PET_ID, name: 'Milu' });
    AppointmentOrder.exists.mockResolvedValue(null);
    AppointmentOrder.create.mockResolvedValue(created);
    mockReceptionists(receptionists);
    enableRealEmail();
  });

  describe('recipient lookup', () => {
    it('looks up only active receptionists that have an email, selecting just the email', async () => {
      const { select } = mockReceptionists(receptionists);

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(User.find).toHaveBeenCalledTimes(1);
      expect(User.find).toHaveBeenCalledWith({
        role: 'Receptionist',
        status: 'Active',
        email: { $type: 'string' },
      });
      expect(select).toHaveBeenCalledWith('email');
    });

    it('loads the owner (from the created appointment) to get name and phone', async () => {
      const { select } = mockOwner({ fullName: 'Nguyễn Văn A', phone: '0901234567' });

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(User.findById).toHaveBeenCalledWith(OWNER_ID);
      expect(select).toHaveBeenCalledWith('fullName phone');
    });

    it('does not send anything when there are no receptionists', async () => {
      mockReceptionists([]);

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('email content', () => {
    it('creates a Gmail transport with credentials from the environment', async () => {
      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        service: 'gmail',
        auth: { user: 'clinic@gmail.com', pass: 'app-password' },
      });
    });

    it('sends a single email with all receptionists in BCC (addresses are not exposed to each other)', async () => {
      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.from).toBe('"VCMOS Veterinary Clinic" <clinic@gmail.com>');
      expect(mail.to).toBe('clinic@gmail.com');
      expect(mail.bcc).toEqual(['le.tan1@vcmos.vn', 'le.tan2@vcmos.vn']);
    });

    it('puts the appointment code in the subject', async () => {
      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(mockSendMail.mock.calls[0][0].subject).toBe('[VCMOS] Có lịch hẹn online mới APT-K7M2QX');
    });

    it('includes appointment, owner and pet details in the plain-text body', async () => {
      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      const { text } = mockSendMail.mock.calls[0][0];
      expect(text).toContain('APT-K7M2QX');
      expect(text).toContain('2026-11-10');
      expect(text).toContain('Nguyễn Văn A');
      expect(text).toContain('0901234567');
      expect(text).toContain('Milu');
      expect(text).toContain('Tiêm phòng');
    });

    it('includes appointment, owner and pet details in the HTML body using the clinic layout', async () => {
      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      const { html } = mockSendMail.mock.calls[0][0];
      expect(html).toContain('PHÒNG KHÁM THÚ Y VCMOS'); // same header as the OTP email
      expect(html).toContain('APT-K7M2QX');
      expect(html).toContain('2026-11-10');
      expect(html).toContain('Nguyễn Văn A');
      expect(html).toContain('0901234567');
      expect(html).toContain('Milu');
      expect(html).toContain('Tiêm phòng');
    });

    it('escapes HTML in user-provided fields to prevent injection', async () => {
      AppointmentOrder.create.mockResolvedValue({
        ...created,
        note: '<script>alert("x")</script> & "quote"',
      });
      mockOwner({ fullName: '<b>Hacker</b>', phone: '0901234567' });

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      const { html } = mockSendMail.mock.calls[0][0];
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>Hacker</b>');
      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quote&quot;');
      expect(html).toContain('&lt;b&gt;Hacker&lt;/b&gt;');
    });

    it('shows "—" for missing optional values (no note, unknown owner, pet without name)', async () => {
      mockPetFindOne({ _id: PET_ID }); // no name
      AppointmentOrder.create.mockResolvedValue({ ...created, note: undefined });
      mockOwner(null);

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      const { text, html } = mockSendMail.mock.calls[0][0];
      expect(text).toContain('Chủ nuôi: — (—)');
      expect(text).toContain('Thú cưng: —');
      expect(text).toContain('Ghi chú: —');
      // Ngày hẹn is always present; the 4 other rows fall back to the dash
      expect((html.match(/>—</g) || []).length).toBe(4);
    });
  });

  describe('environment handling (same behaviour as sendOtpEmail)', () => {
    it('logs to the console instead of sending when EMAIL_USER / EMAIL_PASS are not configured', async () => {
      delete process.env.EMAIL_USER;
      delete process.env.EMAIL_PASS;

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledTimes(1);
      const logLine = console.log.mock.calls[0][0];
      expect(logLine).toContain('[DEV EMAIL APPOINTMENT');
      expect(logLine).toContain('le.tan1@vcmos.vn, le.tan2@vcmos.vn');
      expect(logLine).toContain('APT-K7M2QX');
    });

    it('does not send or log anything when NODE_ENV is "test", even with credentials', async () => {
      process.env.NODE_ENV = 'test';

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('failure isolation', () => {
    it('returns the created appointment without waiting for the email to be sent', async () => {
      mockSendMail.mockReturnValue(new Promise(() => {})); // never resolves

      const result = await service.createOnlineAppointment(OWNER_ID, input);

      expect(result).toBe(created);
    });

    it('still returns the appointment and logs an error when sending the email fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP down'));

      const result = await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(result).toBe(created);
      expect(console.error).toHaveBeenCalledWith(
        '[Appointment] Gửi email thông báo cho lễ tân thất bại:',
        'SMTP down'
      );
    });

    it('still returns the appointment when the receptionist lookup fails', async () => {
      const lean = jest.fn().mockRejectedValue(new Error('db down'));
      User.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean }) });

      const result = await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(result).toBe(created);
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        '[Appointment] Gửi email thông báo cho lễ tân thất bại:',
        'db down'
      );
    });

    it('still returns the appointment when the owner lookup fails', async () => {
      const lean = jest.fn().mockRejectedValue(new Error('owner lookup failed'));
      User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean }) });

      const result = await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(result).toBe(created);
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('when no notification should be sent', () => {
    it('does not notify when the pet is not found', async () => {
      mockPetFindOne(null);

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toMatchObject({ status: 404 });
      await flushPromises();

      expect(User.find).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does not notify when the slot is already booked (409)', async () => {
      AppointmentOrder.exists.mockResolvedValue({ _id: 'existing' });

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toMatchObject({ status: 409 });
      await flushPromises();

      expect(User.find).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does not notify when creation fails with a non-duplicate error', async () => {
      AppointmentOrder.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toThrow('connection lost');
      await flushPromises();

      expect(User.find).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('does not notify when all code retries are exhausted (500)', async () => {
      AppointmentOrder.create.mockRejectedValue(duplicateCodeError());

      await expect(service.createOnlineAppointment(OWNER_ID, input)).rejects.toMatchObject({ status: 500 });
      await flushPromises();

      expect(User.find).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('notifies exactly once when creation succeeds after code collisions', async () => {
      AppointmentOrder.create
        .mockRejectedValueOnce(duplicateCodeError())
        .mockRejectedValueOnce(duplicateCodeError())
        .mockResolvedValueOnce(created);

      await service.createOnlineAppointment(OWNER_ID, input);
      await flushPromises();

      expect(AppointmentOrder.create).toHaveBeenCalledTimes(3);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
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

// ---------- listAllAppointments ----------

describe('listAllAppointments', () => {
  const setup = (items = [], total = 0) => {
    const chain = mockAppointmentFindPopulated(items);
    AppointmentOrder.countDocuments.mockResolvedValue(total);
    return chain;
  };

  describe('default behaviour', () => {
    it('works without any arguments and uses page 1, limit 10', async () => {
      const chain = setup([{ _id: 'a1' }], 1);

      const result = await service.listAllAppointments();

      expect(AppointmentOrder.find).toHaveBeenCalledWith({});
      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        items: [{ _id: 'a1' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it('is not scoped to an owner or to online bookings when no filters are given', async () => {
      setup();

      await service.listAllAppointments({});

      const filter = AppointmentOrder.find.mock.calls[0][0];
      expect(filter).toEqual({});
      expect(filter).not.toHaveProperty('ownerId');
      expect(filter).not.toHaveProperty('isOnline');
    });

    it('uses the same filter for find and countDocuments', async () => {
      setup();

      await service.listAllAppointments({ status: 'Booked', isOnline: true });

      const expected = { derivedStatus: 'Booked', isOnline: true };
      expect(AppointmentOrder.find).toHaveBeenCalledWith(expected);
      expect(AppointmentOrder.countDocuments).toHaveBeenCalledWith(expected);
    });

    it('returns plain objects (uses lean)', async () => {
      const { lean } = setup();

      await service.listAllAppointments({});

      expect(lean).toHaveBeenCalledTimes(1);
    });
  });

  describe('populate and sorting', () => {
    it('populates the pet with name only', async () => {
      const { populatePet } = setup();

      await service.listAllAppointments({});

      expect(populatePet).toHaveBeenCalledWith('petId', 'name');
    });

    it('populates the owner with fullName and phone', async () => {
      const { populateOwner } = setup();

      await service.listAllAppointments({});

      expect(populateOwner).toHaveBeenCalledWith('ownerId', 'fullName phone');
    });

    it('sorts by date then createdAt, newest first', async () => {
      const { sort } = setup();

      await service.listAllAppointments({});

      expect(sort).toHaveBeenCalledWith({ date: -1, createdAt: -1 });
    });
  });

  describe('filters', () => {
    it('adds the status filter on derivedStatus', async () => {
      setup();

      await service.listAllAppointments({ status: 'CheckedIn' });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({ derivedStatus: 'CheckedIn' });
    });

    it.each([true, false])('adds the isOnline filter when it is %s', async (isOnline) => {
      setup();

      await service.listAllAppointments({ isOnline });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({ isOnline });
    });

    it('ignores isOnline when it is not a real boolean', async () => {
      setup();

      await service.listAllAppointments({ isOnline: 'true' });

      expect(AppointmentOrder.find.mock.calls[0][0]).not.toHaveProperty('isOnline');
    });

    it('adds the ownerId filter', async () => {
      setup();

      await service.listAllAppointments({ ownerId: OWNER_ID });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    });

    it('adds the petId filter', async () => {
      setup();

      await service.listAllAppointments({ petId: PET_ID });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({ petId: PET_ID });
    });

    it('trims and uppercases the code before matching', async () => {
      setup();

      await service.listAllAppointments({ code: '  apt-k7m2qx ' });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({ code: 'APT-K7M2QX' });
    });

    it('applies both from and to as an inclusive date range', async () => {
      setup();

      await service.listAllAppointments({ from: '2026-11-01', to: '2026-11-30' });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({
        date: { $gte: '2026-11-01', $lte: '2026-11-30' },
      });
    });

    it('applies only "from" when "to" is missing', async () => {
      setup();

      await service.listAllAppointments({ from: '2026-11-01' });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({ date: { $gte: '2026-11-01' } });
    });

    it('applies only "to" when "from" is missing', async () => {
      setup();

      await service.listAllAppointments({ to: '2026-11-30' });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({ date: { $lte: '2026-11-30' } });
    });

    it('does not add a date filter when neither from nor to is given', async () => {
      setup();

      await service.listAllAppointments({ status: 'Booked' });

      expect(AppointmentOrder.find.mock.calls[0][0]).not.toHaveProperty('date');
    });

    it('combines all filters', async () => {
      setup();

      await service.listAllAppointments({
        status: 'Done',
        isOnline: false,
        ownerId: OWNER_ID,
        petId: PET_ID,
        code: 'apt-abc234',
        from: '2026-01-01',
        to: '2026-12-31',
      });

      expect(AppointmentOrder.find).toHaveBeenCalledWith({
        derivedStatus: 'Done',
        isOnline: false,
        ownerId: OWNER_ID,
        petId: PET_ID,
        code: 'APT-ABC234',
        date: { $gte: '2026-01-01', $lte: '2026-12-31' },
      });
    });
  });

  describe('pagination', () => {
    it('computes skip/limit and totalPages for custom pagination', async () => {
      const chain = setup([{ _id: 'a1' }, { _id: 'a2' }], 23);

      const result = await service.listAllAppointments({ page: 3, limit: 5 });

      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(5);
      expect(result.pagination).toEqual({ page: 3, limit: 5, total: 23, totalPages: 5 });
    });

    it('accepts numeric strings for page and limit', async () => {
      const chain = setup([], 50);

      const result = await service.listAllAppointments({ page: '2', limit: '20' });

      expect(chain.skip).toHaveBeenCalledWith(20);
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(result.pagination).toEqual({ page: 2, limit: 20, total: 50, totalPages: 3 });
    });

    it.each([0, -3, 'abc', null])('falls back to page 1 when page is %p', async (page) => {
      const chain = setup();

      const result = await service.listAllAppointments({ page });

      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(result.pagination.page).toBe(1);
    });

    it.each([
      [0, 10],
      ['abc', 10],
      [null, 10],
      [-5, 1],
      [500, 100],
      [100, 100],
    ])('normalizes limit %p to %p', async (limit, expected) => {
      const chain = setup();

      const result = await service.listAllAppointments({ limit });

      expect(chain.limit).toHaveBeenCalledWith(expected);
      expect(result.pagination.limit).toBe(expected);
    });

    it('returns totalPages 0 when there are no results', async () => {
      setup([], 0);

      const result = await service.listAllAppointments({});

      expect(result.items).toEqual([]);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('rounds totalPages up for partial last pages', async () => {
      setup([], 11);

      const result = await service.listAllAppointments({ limit: 10 });

      expect(result.pagination.totalPages).toBe(2);
    });
  });

  describe('database errors', () => {
    it('propagates errors from the find query', async () => {
      const lean = jest.fn().mockRejectedValue(new Error('db down'));
      const limit = jest.fn().mockReturnValue({ lean });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });
      const populateOwner = jest.fn().mockReturnValue({ sort });
      AppointmentOrder.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({ populate: populateOwner }),
      });
      AppointmentOrder.countDocuments.mockResolvedValue(0);

      await expect(service.listAllAppointments({})).rejects.toThrow('db down');
    });

    it('propagates errors from countDocuments', async () => {
      mockAppointmentFindPopulated([]);
      AppointmentOrder.countDocuments.mockRejectedValue(new Error('count failed'));

      await expect(service.listAllAppointments({})).rejects.toThrow('count failed');
    });
  });
});

// ---------- getMyOnlineAppointment ----------

describe('getMyOnlineAppointment', () => {
  it('returns the appointment when it belongs to the owner and is online', async () => {
    const appointment = { _id: 'apt-1', ownerId: OWNER_ID, isOnline: true };
    mockAppointmentFindOne(appointment);

    const mockServices = [{ _id: 'svc-1', sequenceNo: 1 }];
    const lean = jest.fn().mockResolvedValue(mockServices);
    const sort = jest.fn().mockReturnValue({ lean });
    const populateAssigned = jest.fn().mockReturnValue({ sort });
    const populatePreferred = jest.fn().mockReturnValue({ populate: populateAssigned });
    const populateService = jest.fn().mockReturnValue({ populate: populatePreferred });
    AppointmentService.find.mockReturnValue({ populate: populateService });

    const result = await service.getMyOnlineAppointment(OWNER_ID, 'apt-1');

    expect(result).toEqual({ ...appointment, services: mockServices });
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

// ---------- checkInAppointment ----------

describe('checkInAppointment', () => {
  const APPOINTMENT_ID = 'apt-1';

  describe('successful check-in', () => {
    it('returns the updated appointment', async () => {
      const updated = { _id: APPOINTMENT_ID, derivedStatus: 'CheckedIn' };
      mockFindOneAndUpdate(updated);

      const result = await service.checkInAppointment(APPOINTMENT_ID);

      expect(result).toBe(updated);
    });

    it('only updates an appointment that is currently "Booked" (atomic status check)', async () => {
      mockFindOneAndUpdate({ _id: APPOINTMENT_ID });

      await service.checkInAppointment(APPOINTMENT_ID);

      expect(AppointmentOrder.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(AppointmentOrder.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: APPOINTMENT_ID, derivedStatus: 'Booked' },
        { $set: { derivedStatus: 'CheckedIn', checkedInAt: expect.any(Date) } },
        { new: true }
      );
    });

    it('sets checkedInAt to the current time', async () => {
      mockFindOneAndUpdate({ _id: APPOINTMENT_ID });

      const before = Date.now();
      await service.checkInAppointment(APPOINTMENT_ID);
      const after = Date.now();

      const update = AppointmentOrder.findOneAndUpdate.mock.calls[0][1];
      const checkedInAt = update.$set.checkedInAt.getTime();
      expect(checkedInAt).toBeGreaterThanOrEqual(before);
      expect(checkedInAt).toBeLessThanOrEqual(after);
    });

    it('returns a plain object (uses lean)', async () => {
      const { lean } = mockFindOneAndUpdate({ _id: APPOINTMENT_ID });

      await service.checkInAppointment(APPOINTMENT_ID);

      expect(lean).toHaveBeenCalledTimes(1);
    });

    it('does not run the follow-up lookup when the update succeeds', async () => {
      mockFindOneAndUpdate({ _id: APPOINTMENT_ID });

      await service.checkInAppointment(APPOINTMENT_ID);

      expect(AppointmentOrder.findById).not.toHaveBeenCalled();
    });

    it('is not scoped to an owner or to online bookings (staff action)', async () => {
      mockFindOneAndUpdate({ _id: APPOINTMENT_ID });

      await service.checkInAppointment(APPOINTMENT_ID);

      const filter = AppointmentOrder.findOneAndUpdate.mock.calls[0][0];
      expect(filter).not.toHaveProperty('ownerId');
      expect(filter).not.toHaveProperty('isOnline');
    });
  });

  describe('appointment not found', () => {
    it('throws 404 when no appointment matches the id', async () => {
      mockFindOneAndUpdate(null);
      mockFindById(null);

      await expect(service.checkInAppointment('missing')).rejects.toMatchObject({
        status: 404,
        message: 'Không tìm thấy lịch hẹn',
      });
    });

    it('looks the appointment up by id, selecting only derivedStatus', async () => {
      mockFindOneAndUpdate(null);
      const { select } = mockFindById(null);

      await expect(service.checkInAppointment('missing')).rejects.toMatchObject({ status: 404 });

      expect(AppointmentOrder.findById).toHaveBeenCalledWith('missing');
      expect(select).toHaveBeenCalledWith('derivedStatus');
    });
  });

  describe('appointment not in "Booked" status', () => {
    it.each(['CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Cancelled', 'Overdue'])(
      'throws 409 including the current status when it is "%s"',
      async (status) => {
        mockFindOneAndUpdate(null);
        mockFindById({ _id: APPOINTMENT_ID, derivedStatus: status });

        await expect(service.checkInAppointment(APPOINTMENT_ID)).rejects.toMatchObject({
          status: 409,
          message: `Không thể check-in lịch hẹn đang ở trạng thái "${status}"`,
        });
      }
    );

    it('does not modify the appointment when the status is not "Booked"', async () => {
      mockFindOneAndUpdate(null);
      mockFindById({ _id: APPOINTMENT_ID, derivedStatus: 'Done' });

      await expect(service.checkInAppointment(APPOINTMENT_ID)).rejects.toMatchObject({ status: 409 });

      // The only write attempted is the conditional update, which matched nothing
      expect(AppointmentOrder.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(AppointmentOrder.findOneAndUpdate.mock.calls[0][0]).toEqual({
        _id: APPOINTMENT_ID,
        derivedStatus: 'Booked',
      });
    });
  });

  describe('repeated / concurrent check-in', () => {
    it('lets the first call succeed and rejects the second with 409', async () => {
      AppointmentOrder.findOneAndUpdate
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: APPOINTMENT_ID, derivedStatus: 'CheckedIn' }) })
        .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
      mockFindById({ _id: APPOINTMENT_ID, derivedStatus: 'CheckedIn' });

      await expect(service.checkInAppointment(APPOINTMENT_ID)).resolves.toMatchObject({
        derivedStatus: 'CheckedIn',
      });
      await expect(service.checkInAppointment(APPOINTMENT_ID)).rejects.toMatchObject({
        status: 409,
        message: 'Không thể check-in lịch hẹn đang ở trạng thái "CheckedIn"',
      });
    });
  });

  describe('database errors', () => {
    it('propagates errors thrown by the conditional update (e.g. cast error)', async () => {
      const lean = jest.fn().mockRejectedValue(new Error('cast error'));
      AppointmentOrder.findOneAndUpdate.mockReturnValue({ lean });

      await expect(service.checkInAppointment('bad-id')).rejects.toThrow('cast error');
      expect(AppointmentOrder.findById).not.toHaveBeenCalled();
    });

    it('propagates errors thrown by the follow-up lookup', async () => {
      mockFindOneAndUpdate(null);
      const lean = jest.fn().mockRejectedValue(new Error('db down'));
      AppointmentOrder.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean }) });

      await expect(service.checkInAppointment(APPOINTMENT_ID)).rejects.toThrow('db down');
    });
  });
});
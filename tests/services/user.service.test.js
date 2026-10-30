/**
 * Unit tests for user.service.js (Jest)
 * bcryptjs, nodemailer and the User model are mocked; crypto.randomInt is spied on.
 *
 * `sendOtpEmail` and `createAndSendOtp` are not exported, so they are tested through
 * the public functions that use them (sendMyEmailOtp, forgotPassword, sendChangePasswordOtp).
 */

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('../../src/models/User', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('../../src/models/User');
const userService = require('../../src/services/user.service');

/* -------------------------------- helpers -------------------------------- */

const USER_ID = 'user-1';
const PROFILE_FIELDS = 'code fullName phone email isEmailVerified role status createdAt';
const OTP_UNSET = { emailOtpHash: 1, emailOtpExpiresAt: 1 };

const minutesFromNow = (m) => new Date(Date.now() + m * 60 * 1000);

// Mimics `Model.method(...).select(...).lean()`; pass an Error to make `.lean()` reject.
const makeQuery = (result) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn(),
  };
  if (result instanceof Error) query.lean.mockRejectedValue(result);
  else query.lean.mockResolvedValue(result);
  return query;
};

const mockFindById = (result) => {
  const query = makeQuery(result);
  User.findById.mockReturnValue(query);
  return query;
};

const mockFindOne = (result) => {
  const query = makeQuery(result);
  User.findOne.mockReturnValue(query);
  return query;
};

const mockFindByIdAndUpdateChain = (result) => {
  const query = makeQuery(result);
  User.findByIdAndUpdate.mockReturnValue(query);
  return query;
};

const duplicateError = (keyPattern) => {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  if (keyPattern) err.keyPattern = keyPattern;
  return err;
};

// Deterministic OTP generation: randomInt -> 123456, hash -> 'otp-hash'.
const setupOtpGeneration = (otp = 123456) => {
  const spy = jest.spyOn(crypto, 'randomInt').mockReturnValue(otp);
  bcrypt.hash.mockResolvedValue('otp-hash');
  User.findByIdAndUpdate.mockResolvedValue({});
  return spy;
};

// Turn on the "real email" branch of sendOtpEmail.
const enableRealEmail = () => {
  process.env.NODE_ENV = 'production';
  process.env.EMAIL_USER = 'clinic@gmail.com';
  process.env.EMAIL_PASS = 'app-password';
  const sendMail = jest.fn().mockResolvedValue({});
  nodemailer.createTransport.mockReturnValue({ sendMail });
  return sendMail;
};

const ORIGINAL_ENV = { ...process.env };
let consoleLogSpy;

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

/* ------------------------------ getMyProfile ------------------------------ */

describe('getMyProfile', () => {
  it('returns the lean profile with only the allowed fields selected', async () => {
    const profile = { _id: USER_ID, fullName: 'Nguyen Van A' };
    const query = mockFindById(profile);

    const result = await userService.getMyProfile(USER_ID);

    expect(User.findById).toHaveBeenCalledWith(USER_ID);
    expect(query.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(query.lean).toHaveBeenCalled();
    expect(result).toBe(profile);
  });

  it('throws 404 when the user no longer exists', async () => {
    mockFindById(null);

    await expect(userService.getMyProfile(USER_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy người dùng',
    });
  });
});

/* ----------------------------- updateMyProfile ---------------------------- */

describe('updateMyProfile', () => {
  const CURRENT_EMAIL = 'old@example.com';

  beforeEach(() => {
    mockFindById({ _id: USER_ID, email: CURRENT_EMAIL });
    mockFindByIdAndUpdateChain({ _id: USER_ID, fullName: 'Updated' });
  });

  const getUpdateQuery = () => User.findByIdAndUpdate.mock.calls[0][1];

  it('throws 404 and does not update when the user does not exist', async () => {
    mockFindById(null);

    await expect(
      userService.updateMyProfile(USER_ID, 'Name', '0901234567', 'a@example.com')
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('trims name and phone and returns the updated lean profile', async () => {
    const updated = { _id: USER_ID, fullName: 'Nguyen Van A' };
    const query = mockFindByIdAndUpdateChain(updated);

    const result = await userService.updateMyProfile(USER_ID, '  Nguyen Van A ', ' 0901234567 ');

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      USER_ID,
      { $set: { fullName: 'Nguyen Van A', phone: '0901234567' } },
      { returnDocument: 'after' }
    );
    expect(query.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(result).toBe(updated);
  });

  it('leaves email and verification untouched when email is undefined', async () => {
    await userService.updateMyProfile(USER_ID, 'Name', '0901234567', undefined);

    const q = getUpdateQuery();
    expect(q.$set).toEqual({ fullName: 'Name', phone: '0901234567' });
    expect(q).not.toHaveProperty('$unset');
  });

  it('keeps verification when the email is unchanged (ignoring case and whitespace)', async () => {
    await userService.updateMyProfile(USER_ID, 'Name', '0901234567', '  OLD@Example.com ');

    const q = getUpdateQuery();
    expect(q.$set.email).toBe(CURRENT_EMAIL);
    expect(q.$set).not.toHaveProperty('isEmailVerified');
    expect(q).not.toHaveProperty('$unset');
  });

  it('resets verification and clears OTP data when the email changes', async () => {
    await userService.updateMyProfile(USER_ID, 'Name', '0901234567', '  NEW@Example.com ');

    const q = getUpdateQuery();
    expect(q.$set).toMatchObject({ email: 'new@example.com', isEmailVerified: false });
    expect(q.$unset).toEqual(OTP_UNSET);
  });

  it.each([[''], ['   '], [null]])(
    'removes the email, resets verification and clears OTP data when email is %p',
    async (email) => {
      await userService.updateMyProfile(USER_ID, 'Name', '0901234567', email);

      const q = getUpdateQuery();
      expect(q.$set).not.toHaveProperty('email');
      expect(q.$set.isEmailVerified).toBe(false);
      expect(q.$unset).toEqual({ email: 1, ...OTP_UNSET });
    }
  );

  describe('duplicate key errors', () => {
    it('throws 409 mentioning email when the email is duplicated', async () => {
      mockFindByIdAndUpdateChain(duplicateError({ email: 1 }));

      await expect(
        userService.updateMyProfile(USER_ID, 'Name', '0901234567', 'x@example.com')
      ).rejects.toMatchObject({ statusCode: 409, message: 'Email đã được sử dụng' });
    });

    it('throws 409 mentioning the phone number when the phone is duplicated', async () => {
      mockFindByIdAndUpdateChain(duplicateError({ phone: 1 }));

      await expect(
        userService.updateMyProfile(USER_ID, 'Name', '0901234567', 'x@example.com')
      ).rejects.toMatchObject({ statusCode: 409, message: 'Số điện thoại đã được sử dụng' });
    });

    it('falls back to the phone message when keyPattern is missing', async () => {
      mockFindByIdAndUpdateChain(duplicateError());

      await expect(
        userService.updateMyProfile(USER_ID, 'Name', '0901234567')
      ).rejects.toMatchObject({ statusCode: 409, message: 'Số điện thoại đã được sử dụng' });
    });
  });

  it('rethrows non-duplicate errors unchanged', async () => {
    const err = new Error('db down');
    mockFindByIdAndUpdateChain(err);

    await expect(userService.updateMyProfile(USER_ID, 'Name', '0901234567')).rejects.toBe(err);
  });
});

/* ------------------- OTP sending (sendOtpEmail via callers) ---------------- */

describe('sendMyEmailOtp', () => {
  it('throws 404 when the user does not exist', async () => {
    mockFindById(null);

    await expect(userService.sendMyEmailOtp(USER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when the account has no email', async () => {
    mockFindById({ email: undefined, isEmailVerified: false });

    await expect(userService.sendMyEmailOtp(USER_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Tài khoản chưa cập nhật địa chỉ email',
    });
  });

  it('throws 400 when the email is already verified', async () => {
    mockFindById({ email: 'a@example.com', isEmailVerified: true });

    await expect(userService.sendMyEmailOtp(USER_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Email này đã được xác thực',
    });
  });

  describe('OTP generation and storage', () => {
    beforeEach(() => {
      mockFindById({ email: 'a@example.com', isEmailVerified: false });
    });

    it('generates a 6-digit OTP via crypto.randomInt(100000, 1000000)', async () => {
      const spy = setupOtpGeneration(123456);

      await userService.sendMyEmailOtp(USER_ID);

      expect(spy).toHaveBeenCalledWith(100000, 1000000);
      expect(bcrypt.hash).toHaveBeenCalledWith('123456', 10);
    });

    it('stores only the hash with a 5-minute expiry (never the plain OTP)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      setupOtpGeneration();

      await userService.sendMyEmailOtp(USER_ID);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(USER_ID, {
        $set: {
          emailOtpHash: 'otp-hash',
          emailOtpExpiresAt: new Date('2026-01-01T00:05:00.000Z'),
        },
      });
      expect(JSON.stringify(User.findByIdAndUpdate.mock.calls[0])).not.toContain('123456');
    });
  });

  describe('delivery', () => {
    beforeEach(() => {
      mockFindById({ email: 'a@example.com', isEmailVerified: false });
      setupOtpGeneration(654321);
    });

    it('in the test environment: sends no email, logs nothing, and returns the OTP as devToken', async () => {
      const result = await userService.sendMyEmailOtp(USER_ID);

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ sentViaEmail: false, devToken: '654321' });
    });

    it('in development without email credentials: logs the OTP and returns it as devToken', async () => {
      process.env.NODE_ENV = 'development';

      const result = await userService.sendMyEmailOtp(USER_ID);

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('654321'));
      expect(result).toEqual({ sentViaEmail: false, devToken: '654321' });
    });

    it('does not send real email when only one of EMAIL_USER / EMAIL_PASS is set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_USER = 'clinic@gmail.com';

      const result = await userService.sendMyEmailOtp(USER_ID);

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(result.sentViaEmail).toBe(false);
    });

    it('does not send real email in the test environment even when credentials are set', async () => {
      process.env.EMAIL_USER = 'clinic@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      const result = await userService.sendMyEmailOtp(USER_ID);

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(result).toEqual({ sentViaEmail: false, devToken: '654321' });
    });

    it('with credentials in production: sends the email and does not leak the OTP in the result', async () => {
      const sendMail = enableRealEmail();

      const result = await userService.sendMyEmailOtp(USER_ID);

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        service: 'gmail',
        auth: { user: 'clinic@gmail.com', pass: 'app-password' },
      });
      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail.from).toContain('clinic@gmail.com');
      expect(mail.to).toBe('a@example.com');
      expect(mail.subject).toContain('xác thực địa chỉ email');
      expect(mail.text).toContain('654321');
      expect(mail.html).toContain('654321');
      expect(result).toEqual({ sentViaEmail: true, devToken: undefined });
    });

    it('propagates mail transport failures', async () => {
      const sendMail = enableRealEmail();
      sendMail.mockRejectedValue(new Error('SMTP down'));

      await expect(userService.sendMyEmailOtp(USER_ID)).rejects.toThrow('SMTP down');
    });
  });
});

/* ------------------------------ verifyMyEmail ------------------------------ */

describe('verifyMyEmail', () => {
  const validUser = (overrides = {}) => ({
    _id: USER_ID,
    email: 'a@example.com',
    isEmailVerified: false,
    emailOtpHash: 'otp-hash',
    emailOtpExpiresAt: minutesFromNow(3),
    ...overrides,
  });

  it('selects the hidden OTP fields explicitly', async () => {
    const query = mockFindById(validUser());
    bcrypt.compare.mockResolvedValue(true);
    mockFindByIdAndUpdateChain({});

    await userService.verifyMyEmail(USER_ID, '123456');

    expect(query.select).toHaveBeenCalledWith(
      '+emailOtpHash +emailOtpExpiresAt email isEmailVerified'
    );
  });

  it('throws 404 when the user does not exist', async () => {
    mockFindById(null);

    await expect(userService.verifyMyEmail(USER_ID, '123456')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 when the account has no email', async () => {
    mockFindById(validUser({ email: undefined }));

    await expect(userService.verifyMyEmail(USER_ID, '123456')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Tài khoản chưa cập nhật địa chỉ email',
    });
  });

  it('throws 400 when the email is already verified', async () => {
    mockFindById(validUser({ isEmailVerified: true }));

    await expect(userService.verifyMyEmail(USER_ID, '123456')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Email này đã được xác thực',
    });
  });

  describe('invalid OTP', () => {
    const OTP_ERROR = { statusCode: 400, message: 'Mã xác thực không hợp lệ hoặc đã hết hạn' };

    it.each([
      ['no OTP was requested (hash missing)', { emailOtpHash: undefined }],
      ['no expiry stored', { emailOtpExpiresAt: undefined }],
      ['the OTP has expired', { emailOtpExpiresAt: minutesFromNow(-1) }],
    ])('throws 400 and skips comparison when %s', async (_label, overrides) => {
      mockFindById(validUser(overrides));

      await expect(userService.verifyMyEmail(USER_ID, '123456')).rejects.toMatchObject(OTP_ERROR);
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('throws 400 when the OTP does not match', async () => {
      mockFindById(validUser());
      bcrypt.compare.mockResolvedValue(false);

      await expect(userService.verifyMyEmail(USER_ID, '000000')).rejects.toMatchObject(OTP_ERROR);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  it('marks the email as verified, clears OTP data and returns the profile', async () => {
    mockFindById(validUser());
    bcrypt.compare.mockResolvedValue(true);
    const updated = { _id: USER_ID, isEmailVerified: true };
    const query = mockFindByIdAndUpdateChain(updated);

    const result = await userService.verifyMyEmail(USER_ID, '  123456  ');

    expect(bcrypt.compare).toHaveBeenCalledWith('123456', 'otp-hash'); // trimmed
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      USER_ID,
      { $set: { isEmailVerified: true }, $unset: OTP_UNSET },
      { returnDocument: 'after' }
    );
    expect(query.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(result).toBe(updated);
  });
});

/* ------------------------------ forgotPassword ----------------------------- */

describe('forgotPassword', () => {
  const verifiedUser = (overrides = {}) => ({
    _id: 'user-9',
    email: 'a@example.com',
    isEmailVerified: true,
    status: 'Active',
    ...overrides,
  });

  it('looks the account up by trimmed, lowercased email', async () => {
    const query = mockFindOne(verifiedUser());
    setupOtpGeneration();

    await userService.forgotPassword('  A@Example.COM ');

    expect(User.findOne).toHaveBeenCalledWith({ email: 'a@example.com' });
    expect(query.select).toHaveBeenCalledWith('email isEmailVerified status');
  });

  it('throws 404 when no account has that email', async () => {
    mockFindOne(null);

    await expect(userService.forgotPassword('x@example.com')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy tài khoản với email này',
    });
  });

  it('throws 400 when the email is not verified', async () => {
    mockFindOne(verifiedUser({ isEmailVerified: false }));

    await expect(userService.forgotPassword('a@example.com')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('throws 403 when the account is locked', async () => {
    mockFindOne(verifiedUser({ status: 'Locked' }));

    await expect(userService.forgotPassword('a@example.com')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('stores an OTP for the account and returns the dev token outside real-email mode', async () => {
    mockFindOne(verifiedUser());
    setupOtpGeneration(111222);

    const result = await userService.forgotPassword('a@example.com');

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user-9', {
      $set: { emailOtpHash: 'otp-hash', emailOtpExpiresAt: expect.any(Date) },
    });
    expect(result).toEqual({ sentViaEmail: false, devToken: '111222' });
  });

  it('emails the OTP with the password-recovery purpose', async () => {
    mockFindOne(verifiedUser());
    setupOtpGeneration();
    const sendMail = enableRealEmail();

    await userService.forgotPassword('a@example.com');

    expect(sendMail.mock.calls[0][0].subject).toContain('khôi phục mật khẩu');
    expect(sendMail.mock.calls[0][0].to).toBe('a@example.com');
  });
});

/* ------------------------------ resetPassword ------------------------------ */

describe('resetPassword', () => {
  const user = (overrides = {}) => ({
    _id: 'user-9',
    isEmailVerified: true,
    emailOtpHash: 'otp-hash',
    emailOtpExpiresAt: minutesFromNow(3),
    ...overrides,
  });

  it('looks the account up by normalised email and selects hidden OTP fields', async () => {
    const query = mockFindOne(user());
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('new-hash');

    await userService.resetPassword('  A@Example.COM ', '123456', 'newPass1');

    expect(User.findOne).toHaveBeenCalledWith({ email: 'a@example.com' });
    expect(query.select).toHaveBeenCalledWith('+emailOtpHash +emailOtpExpiresAt isEmailVerified');
  });

  it('throws 404 when no account has that email', async () => {
    mockFindOne(null);

    await expect(userService.resetPassword('x@example.com', '123456', 'pw')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 when the email is not verified', async () => {
    mockFindOne(user({ isEmailVerified: false }));

    await expect(userService.resetPassword('a@example.com', '123456', 'pw')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Email này chưa được xác thực',
    });
  });

  it.each([
    ['the OTP has expired', { emailOtpExpiresAt: minutesFromNow(-1) }],
    ['no OTP was requested', { emailOtpHash: undefined }],
  ])('throws 400 and does not change the password when %s', async (_label, overrides) => {
    mockFindOne(user(overrides));

    await expect(userService.resetPassword('a@example.com', '123456', 'pw')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Mã xác thực không hợp lệ hoặc đã hết hạn',
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('throws 400 when the OTP is wrong, before hashing the new password', async () => {
    mockFindOne(user());
    bcrypt.compare.mockResolvedValue(false);

    await expect(userService.resetPassword('a@example.com', '000000', 'pw')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('saves the hashed new password and clears the OTP on success', async () => {
    mockFindOne(user());
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('new-hash');
    User.findByIdAndUpdate.mockResolvedValue({});

    const result = await userService.resetPassword('a@example.com', ' 123456 ', 'newPass1');

    expect(bcrypt.compare).toHaveBeenCalledWith('123456', 'otp-hash');
    expect(bcrypt.hash).toHaveBeenCalledWith('newPass1', 10);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user-9', {
      $set: { passwordHash: 'new-hash' },
      $unset: OTP_UNSET,
    });
    expect(result).toBeUndefined();
  });
});

/* -------------------------- sendChangePasswordOtp -------------------------- */

describe('sendChangePasswordOtp', () => {
  const NEEDS_VERIFIED_EMAIL = {
    statusCode: 400,
    message: 'Bạn cần xác thực địa chỉ email trước khi đổi mật khẩu',
  };

  it('throws 404 when the user does not exist', async () => {
    mockFindById(null);

    await expect(userService.sendChangePasswordOtp(USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 when the account has no email', async () => {
    mockFindById({ email: undefined, isEmailVerified: false });

    await expect(userService.sendChangePasswordOtp(USER_ID)).rejects.toMatchObject(
      NEEDS_VERIFIED_EMAIL
    );
  });

  it('throws 400 when the email is not verified', async () => {
    mockFindById({ email: 'a@example.com', isEmailVerified: false });

    await expect(userService.sendChangePasswordOtp(USER_ID)).rejects.toMatchObject(
      NEEDS_VERIFIED_EMAIL
    );
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('stores an OTP and emails it with the change-password purpose', async () => {
    mockFindById({ email: 'a@example.com', isEmailVerified: true });
    setupOtpGeneration(999000);
    const sendMail = enableRealEmail();

    const result = await userService.sendChangePasswordOtp(USER_ID);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(USER_ID, {
      $set: { emailOtpHash: 'otp-hash', emailOtpExpiresAt: expect.any(Date) },
    });
    expect(sendMail.mock.calls[0][0].subject).toContain('đổi mật khẩu');
    expect(result).toEqual({ sentViaEmail: true, devToken: undefined });
  });
});

/* ----------------------------- changeMyPassword ---------------------------- */

describe('changeMyPassword', () => {
  const user = (overrides = {}) => ({
    _id: USER_ID,
    email: 'a@example.com',
    isEmailVerified: true,
    passwordHash: 'current-hash',
    emailOtpHash: 'otp-hash',
    emailOtpExpiresAt: minutesFromNow(3),
    ...overrides,
  });

  it('selects the hidden password and OTP fields explicitly', async () => {
    const query = mockFindById(user());
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('new-hash');
    User.findByIdAndUpdate.mockResolvedValue({});

    await userService.changeMyPassword(USER_ID, 'oldPass', 'newPass', '123456');

    expect(query.select).toHaveBeenCalledWith(
      '+passwordHash +emailOtpHash +emailOtpExpiresAt email isEmailVerified'
    );
  });

  it('throws 404 when the user does not exist', async () => {
    mockFindById(null);

    await expect(
      userService.changeMyPassword(USER_ID, 'old', 'new', '123456')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    ['has no email', { email: undefined }],
    ['has an unverified email', { isEmailVerified: false }],
  ])('throws 400 when the account %s', async (_label, overrides) => {
    mockFindById(user(overrides));

    await expect(
      userService.changeMyPassword(USER_ID, 'old', 'new', '123456')
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Bạn cần xác thực địa chỉ email trước khi đổi mật khẩu',
    });
  });

  it('throws 400 when the account has no password hash', async () => {
    mockFindById(user({ passwordHash: undefined }));

    await expect(
      userService.changeMyPassword(USER_ID, 'old', 'new', '123456')
    ).rejects.toMatchObject({ statusCode: 400, message: 'Mật khẩu hiện tại không chính xác' });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('throws 400 for a wrong current password, without checking the OTP', async () => {
    mockFindById(user());
    bcrypt.compare.mockResolvedValue(false);

    await expect(
      userService.changeMyPassword(USER_ID, 'wrong', 'new', '123456')
    ).rejects.toMatchObject({ statusCode: 400, message: 'Mật khẩu hiện tại không chính xác' });

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    expect(bcrypt.compare).toHaveBeenCalledWith('wrong', 'current-hash');
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('throws 400 for an expired OTP even when the current password is right', async () => {
    mockFindById(user({ emailOtpExpiresAt: minutesFromNow(-1) }));
    bcrypt.compare.mockResolvedValueOnce(true);

    await expect(
      userService.changeMyPassword(USER_ID, 'old', 'new', '123456')
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Mã xác thực không hợp lệ hoặc đã hết hạn',
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('throws 400 for a wrong OTP and does not change the password', async () => {
    mockFindById(user());
    bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      userService.changeMyPassword(USER_ID, 'old', 'new', '000000')
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Mã xác thực không hợp lệ hoặc đã hết hạn',
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('verifies both secrets, then saves the new hash and clears the OTP', async () => {
    mockFindById(user());
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('new-hash');
    User.findByIdAndUpdate.mockResolvedValue({});

    const result = await userService.changeMyPassword(USER_ID, 'oldPass', 'newPass', ' 123456 ');

    expect(bcrypt.compare).toHaveBeenNthCalledWith(1, 'oldPass', 'current-hash');
    expect(bcrypt.compare).toHaveBeenNthCalledWith(2, '123456', 'otp-hash');
    expect(bcrypt.hash).toHaveBeenCalledWith('newPass', 10);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(USER_ID, {
      $set: { passwordHash: 'new-hash' },
      $unset: OTP_UNSET,
    });
    expect(result).toBeUndefined();
  });
});
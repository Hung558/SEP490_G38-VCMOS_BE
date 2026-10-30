/**
 * Unit tests for auth.service.js (Jest)
 * bcrypt, jsonwebtoken, the User model and the phone validator are mocked.
 */

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
}));

jest.mock('../../src/models/User', () => ({
  exists: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
}));

// Simple stand-in phone regex so these tests don't depend on the real validator.
jest.mock('../../src/validators/auth.validator', () => ({
  PHONE_REGEX: /^(0|\+84)\d{9}$/,
}));

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const authService = require('../../src/services/auth.service');

/* -------------------------------- helpers -------------------------------- */

const USER_CODE_REGEX = /^USR-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const makeUserDoc = (overrides = {}) => ({
  _id: 'user-1',
  code: 'USR-ABC234',
  fullName: 'Nguyen Van A',
  phone: '0901234567',
  email: 'a@example.com',
  isEmailVerified: true,
  role: 'PetOwner',
  status: 'Active',
  passwordHash: 'hashed-password',
  ...overrides,
});

const duplicateError = (keyPattern, message = 'E11000 duplicate key error') => {
  const err = new Error(message);
  err.code = 11000;
  if (keyPattern) err.keyPattern = keyPattern;
  return err;
};

// User.findOne(query).select('+passwordHash') -> resolves to `user`
const mockFindOneResolves = (user) => {
  const select = jest.fn().mockResolvedValue(user);
  User.findOne.mockReturnValue({ select });
  return select;
};

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.resetAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  delete process.env.JWT_EXPIRES_IN;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/* ---------------------------- generateUserCode ---------------------------- */

describe('generateUserCode', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a code in the format USR-XXXXXX using the safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(authService.generateUserCode()).toMatch(USER_CODE_REGEX);
    }
  });

  it('never uses confusing characters (0, O, 1, I)', () => {
    for (let i = 0; i < 200; i++) {
      const suffix = authService.generateUserCode().slice(4);
      expect(suffix).not.toMatch(/[0O1I]/);
    }
  });

  it('draws each character with crypto.randomInt over the full alphabet', () => {
    const spy = jest.spyOn(crypto, 'randomInt').mockReturnValue(0);

    const code = authService.generateUserCode();

    expect(code).toBe('USR-AAAAAA');
    expect(spy).toHaveBeenCalledTimes(6);
    expect(spy).toHaveBeenCalledWith(32);
  });

  it('maps the last index to the last alphabet character', () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValue(31);

    expect(authService.generateUserCode()).toBe('USR-999999');
  });
});

/* -------------------------------- register -------------------------------- */

describe('register', () => {
  const input = {
    fullName: '  Nguyen Van A  ',
    phone: '  0901234567  ',
    email: '  A@Example.COM  ',
    password: 'secret123',
  };

  beforeEach(() => {
    User.exists.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-password');
    User.create.mockImplementation(async (doc) => ({ _id: 'user-1', ...doc }));
  });

  it('creates a PetOwner with trimmed/normalised fields and a hashed password', async () => {
    await authService.register(input);

    expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);
    expect(User.create).toHaveBeenCalledTimes(1);
    const arg = User.create.mock.calls[0][0];
    expect(arg).toMatchObject({
      fullName: 'Nguyen Van A',
      phone: '0901234567',
      email: 'a@example.com',
      passwordHash: 'hashed-password',
      role: 'PetOwner',
    });
    expect(arg.code).toMatch(USER_CODE_REGEX);
    expect(arg).not.toHaveProperty('password');
  });

  it('always assigns the PetOwner role, ignoring any role passed in', async () => {
    await authService.register({ ...input, role: 'Admin' });

    expect(User.create.mock.calls[0][0].role).toBe('PetOwner');
  });

  it('checks phone and (normalised) email for existing accounts', async () => {
    await authService.register(input);

    expect(User.exists).toHaveBeenCalledWith({ phone: '0901234567' });
    expect(User.exists).toHaveBeenCalledWith({ email: 'a@example.com' });
  });

  it('returns only public user fields (no passwordHash) and coerces isEmailVerified to boolean', async () => {
    User.create.mockResolvedValue(
      makeUserDoc({ isEmailVerified: undefined, passwordHash: 'secret-hash' })
    );

    const result = await authService.register(input);

    expect(result).toEqual({
      _id: 'user-1',
      code: 'USR-ABC234',
      fullName: 'Nguyen Van A',
      phone: '0901234567',
      email: 'a@example.com',
      isEmailVerified: false,
      role: 'PetOwner',
      status: 'Active',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  describe('without an email', () => {
    it.each([[undefined], [null], ['']])('skips the email check and stores undefined for %p', async (email) => {
      await authService.register({ ...input, email });

      expect(User.exists).toHaveBeenCalledTimes(1);
      expect(User.exists).toHaveBeenCalledWith({ phone: '0901234567' });
      expect(User.create.mock.calls[0][0].email).toBeUndefined();
    });
  });

  describe('pre-check conflicts', () => {
    it('throws 409 when the phone is already registered, without hashing or creating', async () => {
      User.exists.mockResolvedValueOnce({ _id: 'existing' });

      await expect(authService.register(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Số điện thoại đã được đăng ký',
      });
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(User.create).not.toHaveBeenCalled();
    });

    it('throws 409 when the email is already registered', async () => {
      User.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'existing' });

      await expect(authService.register(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email đã được đăng ký',
      });
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(User.create).not.toHaveBeenCalled();
    });
  });

  describe('code collisions', () => {
    it('retries with a new code when the duplicate key is on `code`', async () => {
      User.create
        .mockRejectedValueOnce(duplicateError({ code: 1 }))
        .mockRejectedValueOnce(duplicateError({ code: 1 }))
        .mockImplementationOnce(async (doc) => ({ _id: 'user-1', ...doc }));

      const result = await authService.register(input);

      expect(User.create).toHaveBeenCalledTimes(3);
      User.create.mock.calls.forEach(([doc]) => expect(doc.code).toMatch(USER_CODE_REGEX));
      expect(result.role).toBe('PetOwner');
      // Password is hashed once, not once per retry.
      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    });

    it('detects a `code` duplicate from the message when keyPattern is missing', async () => {
      User.create
        .mockRejectedValueOnce(duplicateError(undefined, 'E11000 ... index: code_1 dup key'))
        .mockImplementationOnce(async (doc) => ({ _id: 'user-1', ...doc }));

      await authService.register(input);

      expect(User.create).toHaveBeenCalledTimes(2);
    });

    it('throws 500 after 5 consecutive code collisions', async () => {
      User.create.mockRejectedValue(duplicateError({ code: 1 }));

      await expect(authService.register(input)).rejects.toMatchObject({ statusCode: 500 });
      expect(User.create).toHaveBeenCalledTimes(5);
    });
  });

  describe('race conditions (unique index fires after the pre-check)', () => {
    it('throws 409 on a duplicate phone', async () => {
      User.create.mockRejectedValue(duplicateError({ phone: 1 }));

      await expect(authService.register(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Số điện thoại hoặc email đã được đăng ký',
      });
      expect(User.create).toHaveBeenCalledTimes(1);
    });

    it('throws 409 on a duplicate email', async () => {
      User.create.mockRejectedValue(duplicateError({ email: 1 }));

      await expect(authService.register(input)).rejects.toMatchObject({ statusCode: 409 });
      expect(User.create).toHaveBeenCalledTimes(1);
    });

    it('throws 409 on a duplicate detected only via message (phone_1)', async () => {
      User.create.mockRejectedValue(duplicateError(undefined, 'E11000 ... index: phone_1 dup key'));

      await expect(authService.register(input)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  it('rethrows unexpected errors from User.create without retrying', async () => {
    const err = new Error('Validation failed');
    User.create.mockRejectedValue(err);

    await expect(authService.register(input)).rejects.toBe(err);
    expect(User.create).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from the password hashing step', async () => {
    bcrypt.hash.mockRejectedValue(new Error('hash failed'));

    await expect(authService.register(input)).rejects.toThrow('hash failed');
    expect(User.create).not.toHaveBeenCalled();
  });
});

/* ---------------------------------- login --------------------------------- */

describe('login', () => {
  beforeEach(() => {
    jwt.sign.mockReturnValue('signed-token');
  });

  describe('query construction', () => {
    it('looks up by phone when the identifier matches the phone regex', async () => {
      const select = mockFindOneResolves(makeUserDoc());
      bcrypt.compare.mockResolvedValue(true);

      await authService.login({ identifier: '  0901234567  ', password: 'pw' });

      expect(User.findOne).toHaveBeenCalledWith({ phone: '0901234567' });
      expect(select).toHaveBeenCalledWith('+passwordHash');
    });

    it('looks up by lowercased, trimmed email otherwise', async () => {
      mockFindOneResolves(makeUserDoc());
      bcrypt.compare.mockResolvedValue(true);

      await authService.login({ identifier: '  A@Example.COM ', password: 'pw' });

      expect(User.findOne).toHaveBeenCalledWith({ email: 'a@example.com' });
    });
  });

  describe('invalid credentials', () => {
    const GENERIC_MESSAGE = 'Thông tin đăng nhập không chính xác';

    it('throws 401 when the user does not exist, without comparing passwords', async () => {
      mockFindOneResolves(null);

      await expect(
        authService.login({ identifier: 'nobody@example.com', password: 'pw' })
      ).rejects.toMatchObject({ statusCode: 401, message: GENERIC_MESSAGE });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws 401 when the user has no password hash (e.g. social account)', async () => {
      mockFindOneResolves(makeUserDoc({ passwordHash: undefined }));

      await expect(
        authService.login({ identifier: 'a@example.com', password: 'pw' })
      ).rejects.toMatchObject({ statusCode: 401, message: GENERIC_MESSAGE });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws 401 when the password is wrong', async () => {
      mockFindOneResolves(makeUserDoc());
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        authService.login({ identifier: 'a@example.com', password: 'wrong' })
      ).rejects.toMatchObject({ statusCode: 401, message: GENERIC_MESSAGE });
      expect(bcrypt.compare).toHaveBeenCalledWith('wrong', 'hashed-password');
    });

    it('uses the same error for unknown account and wrong password (no account enumeration)', async () => {
      mockFindOneResolves(null);
      const unknown = await authService
        .login({ identifier: 'x@example.com', password: 'pw' })
        .catch((e) => e);

      mockFindOneResolves(makeUserDoc());
      bcrypt.compare.mockResolvedValue(false);
      const wrongPw = await authService
        .login({ identifier: 'a@example.com', password: 'bad' })
        .catch((e) => e);

      expect(unknown.statusCode).toBe(wrongPw.statusCode);
      expect(unknown.message).toBe(wrongPw.message);
    });
  });

  describe('account status', () => {
    beforeEach(() => bcrypt.compare.mockResolvedValue(true));

    it('throws 403 for a locked account', async () => {
      mockFindOneResolves(makeUserDoc({ status: 'Locked' }));

      await expect(
        authService.login({ identifier: 'a@example.com', password: 'pw' })
      ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('khoá') });
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('throws 403 for an inactive account', async () => {
      mockFindOneResolves(makeUserDoc({ status: 'Inactive' }));

      await expect(
        authService.login({ identifier: 'a@example.com', password: 'pw' })
      ).rejects.toMatchObject({ statusCode: 403, message: 'Tài khoản đã ngừng hoạt động' });
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('checks the password before the status (locked + wrong password → 401, not 403)', async () => {
      mockFindOneResolves(makeUserDoc({ status: 'Locked' }));
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        authService.login({ identifier: 'a@example.com', password: 'wrong' })
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('successful login', () => {
    beforeEach(() => {
      mockFindOneResolves(makeUserDoc({ role: 'Staff' }));
      bcrypt.compare.mockResolvedValue(true);
    });

    it('returns a token and the public user (no passwordHash)', async () => {
      const result = await authService.login({ identifier: 'a@example.com', password: 'pw' });

      expect(result.token).toBe('signed-token');
      expect(result.user).toEqual({
        _id: 'user-1',
        code: 'USR-ABC234',
        fullName: 'Nguyen Van A',
        phone: '0901234567',
        email: 'a@example.com',
        isEmailVerified: true,
        role: 'Staff',
        status: 'Active',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('signs the JWT with id and role, the secret, and a 1d default expiry', async () => {
      await authService.login({ identifier: 'a@example.com', password: 'pw' });

      expect(jwt.sign).toHaveBeenCalledWith({ id: 'user-1', role: 'Staff' }, 'test-secret', {
        expiresIn: '1d',
      });
    });

    it('honours JWT_EXPIRES_IN when set', async () => {
      process.env.JWT_EXPIRES_IN = '7d';

      await authService.login({ identifier: 'a@example.com', password: 'pw' });

      expect(jwt.sign).toHaveBeenCalledWith(expect.any(Object), 'test-secret', { expiresIn: '7d' });
    });

    it('coerces a missing isEmailVerified to false', async () => {
      mockFindOneResolves(makeUserDoc({ isEmailVerified: undefined }));

      const { user } = await authService.login({ identifier: 'a@example.com', password: 'pw' });

      expect(user.isEmailVerified).toBe(false);
    });
  });

  it('propagates database errors', async () => {
    const select = jest.fn().mockRejectedValue(new Error('db down'));
    User.findOne.mockReturnValue({ select });

    await expect(
      authService.login({ identifier: 'a@example.com', password: 'pw' })
    ).rejects.toThrow('db down');
  });
});
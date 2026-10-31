/**
 * Unit tests for admin.service.js (Jest)
 *
 * Everything the service depends on is mocked: bcryptjs, mongoose (only ObjectId.isValid is used),
 * the User and Pet models, auth.service (generateUserCode) and the admin validator constants.
 */

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

jest.mock('mongoose', () => ({
  Types: { ObjectId: { isValid: jest.fn() } },
}));

jest.mock('../../src/models/User', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  exists: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../src/models/Pet', () => ({
  find: jest.fn(),
}));

jest.mock('../../src/services/auth.service', () => ({
  generateUserCode: jest.fn(),
}));

jest.mock('../../src/validators/admin.validator', () => ({
  ALL_ROLES: ['PetOwner', 'Receptionist', 'Veterinarian', 'Groomer', 'Admin'],
  STAFF_ROLES: ['Receptionist', 'Veterinarian', 'Groomer'],
  USER_STATUSES: ['Active', 'Inactive', 'Locked'],
}));

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Pet = require('../../src/models/Pet');
const { generateUserCode } = require('../../src/services/auth.service');
const adminService = require('../../src/services/admin.service');

/* -------------------------------- helpers -------------------------------- */

const PROFILE_FIELDS = 'code fullName phone email isEmailVerified role status createdAt';
const OTP_UNSET = { emailOtpHash: 1, emailOtpExpiresAt: 1 };
const TARGET_ID = 'target-1';
const ADMIN_ID = 'admin-1';

// Mimics a chain like `Model.method().select().sort().lean()`.
// Pass an Error to make `.lean()` reject.
const makeQuery = (result) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn(),
  };
  if (result instanceof Error) query.lean.mockRejectedValue(result);
  else query.lean.mockResolvedValue(result);
  return query;
};

const mockUserFind = (result = []) => {
  const q = makeQuery(result);
  User.find.mockReturnValue(q);
  return q;
};
const mockUserFindById = (result) => {
  const q = makeQuery(result);
  User.findById.mockReturnValue(q);
  return q;
};
const mockUserFindByIdAndUpdate = (result) => {
  const q = makeQuery(result);
  User.findByIdAndUpdate.mockReturnValue(q);
  return q;
};
const mockPetFind = (result = []) => {
  const q = makeQuery(result);
  Pet.find.mockReturnValue(q);
  return q;
};

const duplicateError = (keyPattern) => {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  if (keyPattern) err.keyPattern = keyPattern;
  return err;
};

beforeEach(() => {
  jest.resetAllMocks();
  mongoose.Types.ObjectId.isValid.mockReturnValue(true);
});

/* ------------------------------- getAllUsers ------------------------------ */

describe('getAllUsers', () => {
  it('returns all users newest first when no filters are given', async () => {
    const users = [{ _id: 'u1' }, { _id: 'u2' }];
    const query = mockUserFind(users);

    const result = await adminService.getAllUsers();

    expect(User.find).toHaveBeenCalledWith({});
    expect(query.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.lean).toHaveBeenCalled();
    expect(result).toBe(users);
  });

  describe('role filter', () => {
    it('applies a valid role', async () => {
      mockUserFind();

      await adminService.getAllUsers({ role: 'Veterinarian' });

      expect(User.find).toHaveBeenCalledWith({ role: 'Veterinarian' });
    });

    it('throws 400 for an unknown role, without querying', async () => {
      await expect(adminService.getAllUsers({ role: 'Hacker' })).rejects.toMatchObject({
        statusCode: 400,
        message: 'Vai trò lọc không hợp lệ',
      });
      expect(User.find).not.toHaveBeenCalled();
    });

    it('ignores an empty-string role', async () => {
      mockUserFind();

      await adminService.getAllUsers({ role: '' });

      expect(User.find).toHaveBeenCalledWith({});
    });
  });

  describe('status filter', () => {
    it('applies a valid status', async () => {
      mockUserFind();

      await adminService.getAllUsers({ status: 'Locked' });

      expect(User.find).toHaveBeenCalledWith({ status: 'Locked' });
    });

    it('throws 400 for an unknown status, without querying', async () => {
      await expect(adminService.getAllUsers({ status: 'Banned' })).rejects.toMatchObject({
        statusCode: 400,
        message: 'Trạng thái lọc không hợp lệ',
      });
      expect(User.find).not.toHaveBeenCalled();
    });

    it('ignores an empty-string status', async () => {
      mockUserFind();

      await adminService.getAllUsers({ status: '' });

      expect(User.find).toHaveBeenCalledWith({});
    });
  });

  describe('search', () => {
    const getFilter = () => User.find.mock.calls[0][0];

    it('searches name, phone, email and code with a case-insensitive regex', async () => {
      mockUserFind();

      await adminService.getAllUsers({ search: '  nguyen  ' });

      const { $or } = getFilter();
      expect($or).toHaveLength(4);
      expect($or.map((c) => Object.keys(c)[0])).toEqual(['fullName', 'phone', 'email', 'code']);
      $or.forEach((condition) => {
        const regex = Object.values(condition)[0];
        expect(regex).toBeInstanceOf(RegExp);
        expect(regex.source).toBe('nguyen'); // trimmed
        expect(regex.flags).toBe('i');
      });
    });

    it('escapes regex special characters so input is matched literally', async () => {
      mockUserFind();

      await adminService.getAllUsers({ search: 'a.b*c+(d)[e]' });

      const regex = getFilter().$or[0].fullName;
      expect(regex.test('a.b*c+(d)[e]')).toBe(true);
      expect(regex.test('aXbbbc+(d)[e]')).toBe(false); // "." is not a wildcard
    });

    it('does not throw on an invalid-regex input such as an unmatched parenthesis', async () => {
      mockUserFind();

      await expect(adminService.getAllUsers({ search: '(' })).resolves.toBeDefined();
    });

    it.each([[''], ['   '], [123], [null], [{}]])('ignores a blank or non-string search (%p)', async (search) => {
      mockUserFind();

      await adminService.getAllUsers({ search });

      expect(User.find).toHaveBeenCalledWith({});
    });
  });

  it('combines role, status and search in one filter', async () => {
    mockUserFind();

    await adminService.getAllUsers({ role: 'Groomer', status: 'Active', search: 'an' });

    const filter = User.find.mock.calls[0][0];
    expect(filter).toMatchObject({ role: 'Groomer', status: 'Active' });
    expect(filter.$or).toHaveLength(4);
  });

  it('propagates database errors', async () => {
    mockUserFind(new Error('db down'));

    await expect(adminService.getAllUsers()).rejects.toThrow('db down');
  });
});

/* ------------------------------- getUserById ------------------------------ */

describe('getUserById', () => {
  it('throws 400 for an invalid id, without querying', async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(false);

    await expect(adminService.getUserById('bad-id')).rejects.toMatchObject({
      statusCode: 400,
      message: 'ID người dùng không hợp lệ',
    });
    expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('bad-id');
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('throws 404 when the user does not exist', async () => {
    mockUserFindById(null);

    await expect(adminService.getUserById(TARGET_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy người dùng',
    });
  });

  it('returns a PetOwner together with their pets, newest first', async () => {
    const owner = { _id: 'owner-1', role: 'PetOwner' };
    const pets = [{ _id: 'p1' }, { _id: 'p2' }];
    const userQuery = mockUserFindById(owner);
    const petQuery = mockPetFind(pets);

    const result = await adminService.getUserById('owner-1');

    expect(User.findById).toHaveBeenCalledWith('owner-1');
    expect(userQuery.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(Pet.find).toHaveBeenCalledWith({ ownerId: 'owner-1' });
    expect(petQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result.pets).toBe(pets);
    expect(result).toMatchObject({ _id: 'owner-1', role: 'PetOwner' });
  });

  it.each([['Receptionist'], ['Veterinarian'], ['Groomer'], ['Admin']])(
    'does not load pets for a %s',
    async (role) => {
      mockUserFindById({ _id: 'staff-1', role });

      const result = await adminService.getUserById('staff-1');

      expect(Pet.find).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('pets');
    }
  );
});

/* --------------------------- createStaffAccount --------------------------- */

describe('createStaffAccount', () => {
  const input = {
    fullName: '  Tran Thi B  ',
    phone: '  0912345678  ',
    email: '  B@Clinic.COM  ',
    password: 'secret123',
    role: 'Veterinarian',
  };

  beforeEach(() => {
    User.exists.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-password');
    generateUserCode.mockReturnValue('USR-ABC234');
    User.create.mockResolvedValue({ _id: 'new-1' });
    mockUserFindById({ _id: 'new-1', fullName: 'Tran Thi B' });
  });

  it('creates an Active account with normalised fields, generated code and hashed password', async () => {
    await adminService.createStaffAccount(input);

    expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);
    expect(User.create).toHaveBeenCalledWith({
      code: 'USR-ABC234',
      fullName: 'Tran Thi B',
      phone: '0912345678',
      email: 'b@clinic.com',
      passwordHash: 'hashed-password',
      role: 'Veterinarian',
      status: 'Active',
    });
  });

  it('returns a re-fetched public profile instead of the raw created document', async () => {
    const profile = { _id: 'new-1', fullName: 'Tran Thi B', role: 'Veterinarian' };
    const query = mockUserFindById(profile);

    const result = await adminService.createStaffAccount(input);

    expect(User.findById).toHaveBeenCalledWith('new-1');
    expect(query.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(result).toBe(profile);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('checks the phone and the normalised email for existing accounts', async () => {
    await adminService.createStaffAccount(input);

    expect(User.exists).toHaveBeenCalledWith({ phone: '0912345678' });
    expect(User.exists).toHaveBeenCalledWith({ email: 'b@clinic.com' });
  });

  it.each([[undefined], [null], ['']])('skips the email check and stores undefined for email %p', async (email) => {
    await adminService.createStaffAccount({ ...input, email });

    expect(User.exists).toHaveBeenCalledTimes(1);
    expect(User.create.mock.calls[0][0].email).toBeUndefined();
  });

  describe('pre-check conflicts', () => {
    it('throws 409 when the phone is already registered', async () => {
      User.exists.mockResolvedValueOnce({ _id: 'existing' });

      await expect(adminService.createStaffAccount(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Số điện thoại đã được đăng ký',
      });
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(User.create).not.toHaveBeenCalled();
    });

    it('throws 409 when the email is already registered', async () => {
      User.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'existing' });

      await expect(adminService.createStaffAccount(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email đã được đăng ký',
      });
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(User.create).not.toHaveBeenCalled();
    });
  });

  describe('code collisions', () => {
    it('retries with a freshly generated code when the duplicate is on `code`', async () => {
      generateUserCode
        .mockReset()
        .mockReturnValueOnce('USR-AAAAAA')
        .mockReturnValueOnce('USR-BBBBBB')
        .mockReturnValueOnce('USR-CCCCCC');
      User.create
        .mockReset()
        .mockRejectedValueOnce(duplicateError({ code: 1 }))
        .mockRejectedValueOnce(duplicateError({ code: 1 }))
        .mockResolvedValueOnce({ _id: 'new-1' });

      await adminService.createStaffAccount(input);

      expect(User.create).toHaveBeenCalledTimes(3);
      expect(User.create.mock.calls.map(([doc]) => doc.code)).toEqual([
        'USR-AAAAAA',
        'USR-BBBBBB',
        'USR-CCCCCC',
      ]);
      expect(bcrypt.hash).toHaveBeenCalledTimes(1); // hashed once, not per retry
    });

    it('throws 500 after 5 consecutive code collisions', async () => {
      User.create.mockRejectedValue(duplicateError({ code: 1 }));

      await expect(adminService.createStaffAccount(input)).rejects.toMatchObject({
        statusCode: 500,
      });
      expect(User.create).toHaveBeenCalledTimes(5);
      expect(generateUserCode).toHaveBeenCalledTimes(5);
    });
  });

  describe('race conditions (unique index fires after the pre-check)', () => {
    it('throws 409 for a duplicate phone, without retrying', async () => {
      User.create.mockRejectedValue(duplicateError({ phone: 1 }));

      await expect(adminService.createStaffAccount(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Số điện thoại đã được đăng ký',
      });
      expect(User.create).toHaveBeenCalledTimes(1);
    });

    it('throws 409 for a duplicate email', async () => {
      User.create.mockRejectedValue(duplicateError({ email: 1 }));

      await expect(adminService.createStaffAccount(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email đã được đăng ký',
      });
    });

    it('falls back to the phone message when the duplicate error has no keyPattern', async () => {
      User.create.mockRejectedValue(duplicateError());

      await expect(adminService.createStaffAccount(input)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Số điện thoại đã được đăng ký',
      });
      expect(User.create).toHaveBeenCalledTimes(1);
    });
  });

  it('rethrows unexpected errors without retrying', async () => {
    const err = new Error('Validation failed');
    User.create.mockRejectedValue(err);

    await expect(adminService.createStaffAccount(input)).rejects.toBe(err);
    expect(User.create).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------- updateUserByAdmin --------------------------- */

describe('updateUserByAdmin', () => {
  const CURRENT_EMAIL = 'old@clinic.com';
  const input = { fullName: '  New Name ', phone: ' 0987654321 ' };

  beforeEach(() => {
    mockUserFindById({ _id: TARGET_ID, email: CURRENT_EMAIL, role: 'Receptionist' });
    mockUserFindByIdAndUpdate({ _id: TARGET_ID, fullName: 'New Name' });
  });

  const getUpdateQuery = () => User.findByIdAndUpdate.mock.calls[0][1];

  it('throws 400 for an invalid id, without querying', async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(false);

    await expect(adminService.updateUserByAdmin('bad', input)).rejects.toMatchObject({
      statusCode: 400,
      message: 'ID người dùng không hợp lệ',
    });
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('throws 404 and does not update when the user does not exist', async () => {
    mockUserFindById(null);

    await expect(adminService.updateUserByAdmin(TARGET_ID, input)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('loads only the role of the current user', async () => {
    const query = mockUserFindById({ _id: TARGET_ID, email: CURRENT_EMAIL, role: 'Receptionist' });

    await adminService.updateUserByAdmin(TARGET_ID, input);

    expect(query.select).toHaveBeenCalledWith('role');
  });

  it('trims name, ignores phone/email, and returns the updated lean profile', async () => {
    const updated = { _id: TARGET_ID, fullName: 'New Name' };
    const query = mockUserFindByIdAndUpdate(updated);

    const result = await adminService.updateUserByAdmin(TARGET_ID, input);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      TARGET_ID,
      { $set: { fullName: 'New Name' } },
      { returnDocument: 'after' }
    );
    expect(query.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(result).toBe(updated);
  });

  describe('role changes', () => {
    it('allows changing a staff account to another staff role', async () => {
      await adminService.updateUserByAdmin(TARGET_ID, { ...input, role: 'Groomer' });

      expect(getUpdateQuery().$set.role).toBe('Groomer');
    });

    it('throws 400 when trying to change the role of a non-staff account', async () => {
      mockUserFindById({ _id: TARGET_ID, email: CURRENT_EMAIL, role: 'PetOwner' });

      await expect(
        adminService.updateUserByAdmin(TARGET_ID, { ...input, role: 'Veterinarian' })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Chỉ được phép thay đổi vai trò của tài khoản nhân viên',
      });
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('blocks an Admin account from being re-assigned to another role', async () => {
      mockUserFindById({ _id: TARGET_ID, email: CURRENT_EMAIL, role: 'Admin' });

      await expect(
        adminService.updateUserByAdmin(TARGET_ID, { ...input, role: 'Groomer' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('allows a non-staff account to be updated when the role is unchanged', async () => {
      mockUserFindById({ _id: TARGET_ID, email: CURRENT_EMAIL, role: 'PetOwner' });

      await adminService.updateUserByAdmin(TARGET_ID, { ...input, role: 'PetOwner' });

      expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not touch the role when none is provided', async () => {
      mockUserFindById({ _id: TARGET_ID, email: CURRENT_EMAIL, role: 'PetOwner' });

      await adminService.updateUserByAdmin(TARGET_ID, input);

      expect(getUpdateQuery().$set).not.toHaveProperty('role');
    });
  });

  describe('errors', () => {
    it('rethrows database errors unchanged', async () => {
      const err = new Error('db down');
      mockUserFindByIdAndUpdate(err);

      await expect(adminService.updateUserByAdmin(TARGET_ID, input)).rejects.toBe(err);
    });
  });
});

/* ----------------------------- updateUserStatus --------------------------- */

describe('updateUserStatus', () => {
  it('throws 400 for an invalid target id, without updating', async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(false);

    await expect(
      adminService.updateUserStatus(ADMIN_ID, 'bad', 'Locked')
    ).rejects.toMatchObject({ statusCode: 400, message: 'ID người dùng không hợp lệ' });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  describe('self-protection', () => {
    it('prevents an admin from setting their own status to Locked', async () => {
      await expect(
        adminService.updateUserStatus(ADMIN_ID, ADMIN_ID, 'Locked')
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Không thể tự khóa tài khoản của chính mình',
      });
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('allows an admin to set their own status to Active', async () => {
      mockUserFindByIdAndUpdate({ _id: ADMIN_ID, status: 'Active' });

      await expect(adminService.updateUserStatus(ADMIN_ID, ADMIN_ID, 'Active')).resolves.toMatchObject({
        status: 'Active',
      });
    });

    it('compares ids as strings, so an ObjectId-like adminId still matches', async () => {
      const objectIdLike = { toString: () => 'same-id' };

      await expect(
        adminService.updateUserStatus(objectIdLike, 'same-id', 'Locked')
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  it('updates the status of another user and returns the public profile', async () => {
    const updated = { _id: TARGET_ID, status: 'Locked' };
    const query = mockUserFindByIdAndUpdate(updated);

    const result = await adminService.updateUserStatus(ADMIN_ID, TARGET_ID, 'Locked');

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      TARGET_ID,
      { $set: { status: 'Locked' } },
      { returnDocument: 'after' }
    );
    expect(query.select).toHaveBeenCalledWith(PROFILE_FIELDS);
    expect(result).toBe(updated);
  });

  it('can unlock another user (status Active)', async () => {
    mockUserFindByIdAndUpdate({ _id: TARGET_ID, status: 'Active' });

    await adminService.updateUserStatus(ADMIN_ID, TARGET_ID, 'Active');

    expect(User.findByIdAndUpdate.mock.calls[0][1]).toEqual({ $set: { status: 'Active' } });
  });

  it('throws 404 when the target user does not exist', async () => {
    mockUserFindByIdAndUpdate(null);

    await expect(
      adminService.updateUserStatus(ADMIN_ID, TARGET_ID, 'Locked')
    ).rejects.toMatchObject({ statusCode: 404, message: 'Không tìm thấy người dùng' });
  });

  it('propagates database errors', async () => {
    mockUserFindByIdAndUpdate(new Error('db down'));

    await expect(adminService.updateUserStatus(ADMIN_ID, TARGET_ID, 'Locked')).rejects.toThrow(
      'db down'
    );
  });
});
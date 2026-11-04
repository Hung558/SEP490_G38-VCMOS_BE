/**
 * Unit tests for src/services/service.service.js
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

jest.mock('../../src/models/Service', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  exists: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../../src/validators/service.validator', () => ({
  SERVICE_CATEGORIES: ['Examination', 'Vaccination', 'Grooming', 'Paraclinical', 'Inpatient'],
  SERVICE_STATUSES: ['Active', 'Inactive'],
}));

const Service = require('../../src/models/Service');
const serviceService = require('../../src/services/service.service');

const {
  generateServiceCode,
  getAllServices,
  getServiceById,
  createService,
  updateService,
  updateServiceStatus,
} = serviceService;

// ---------- helpers ----------
const VALID_ID = new mongoose.Types.ObjectId().toString();
const INVALID_ID = 'not-an-object-id';

const leanChain = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

const findChain = (value) => {
  const lean = jest.fn().mockResolvedValue(value);
  const sort = jest.fn().mockReturnValue({ lean });
  Service.find.mockReturnValue({ sort });
  return { sort, lean };
};

const codeCollision = () =>
  Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { code: 1 } });

const nameCollision = () =>
  Object.assign(new Error('E11000 duplicate key'), {
    code: 11000,
    keyPattern: { category: 1, name: 1 },
  });

const expectHttpError = async (promise, statusCode, message) => {
  await expect(promise).rejects.toMatchObject({ statusCode, message });
};

const validPayload = (overrides = {}) => ({
  name: '  Deep Tissue  ',
  category: 'Examination',
  defaultDuration: '60',
  basePrice: '500000',
  description: '  Relaxing  ',
  status: 'Active',
  ...overrides,
});

beforeEach(() => {
  Object.values(Service).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- generateServiceCode ----------
describe('generateServiceCode (BR-24)', () => {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  it('returns a code in the format SRV-XXXXXX', () => {
    expect(generateServiceCode()).toMatch(new RegExp(`^SRV-[${ALPHABET}]{6}$`));
  });

  it('never uses ambiguous characters (0, O, 1, I)', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateServiceCode().slice(4)).not.toMatch(/[01OI]/);
    }
  });

  it('draws each character with crypto.randomInt over the alphabet length', () => {
    const spy = jest.spyOn(crypto, 'randomInt').mockReturnValue(0);

    expect(generateServiceCode()).toBe('SRV-AAAAAA');
    expect(spy).toHaveBeenCalledTimes(6);
    spy.mock.calls.forEach((args) => expect(args).toEqual([ALPHABET.length]));
  });

  it('maps random indices to the matching alphabet characters', () => {
    let i = 0;
    jest.spyOn(crypto, 'randomInt').mockImplementation(() => i++);

    expect(generateServiceCode()).toBe('SRV-ABCDEF');
  });

  it('produces different codes across calls (sanity check)', () => {
    const codes = new Set(Array.from({ length: 50 }, generateServiceCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ---------- getAllServices ----------
describe('getAllServices', () => {
  it('returns all services sorted by createdAt desc when no filters are given', async () => {
    const services = [{ name: 'A' }, { name: 'B' }];
    const { sort, lean } = findChain(services);

    const result = await getAllServices();

    expect(Service.find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(lean).toHaveBeenCalled();
    expect(result).toBe(services);
  });

  it('applies a valid category filter', async () => {
    findChain([]);
    await getAllServices({ category: 'Vaccination' });
    expect(Service.find).toHaveBeenCalledWith({ category: 'Vaccination' });
  });

  it('applies a valid status filter', async () => {
    findChain([]);
    await getAllServices({ status: 'Inactive' });
    expect(Service.find).toHaveBeenCalledWith({ status: 'Inactive' });
  });

  it('ignores empty-string category and status', async () => {
    findChain([]);
    await getAllServices({ category: '', status: '' });
    expect(Service.find).toHaveBeenCalledWith({});
  });

  it('throws 400 for an invalid category and does not query the DB', async () => {
    await expectHttpError(
      getAllServices({ category: 'Nope' }),
      400,
      'Danh mục lọc không hợp lệ'
    );
    expect(Service.find).not.toHaveBeenCalled();
  });

  it('throws 400 for an invalid status and does not query the DB', async () => {
    await expectHttpError(
      getAllServices({ status: 'Deleted' }),
      400,
      'Trạng thái lọc không hợp lệ'
    );
    expect(Service.find).not.toHaveBeenCalled();
  });

  it('builds a case-insensitive $or regex over name, code and description', async () => {
    findChain([]);
    await getAllServices({ search: '  spa  ' });

    const filter = Service.find.mock.calls[0][0];
    expect(filter.$or).toHaveLength(3);
    expect(filter.$or.map((c) => Object.keys(c)[0])).toEqual(['name', 'code', 'description']);

    filter.$or.forEach((clause) => {
      const regex = Object.values(clause)[0];
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.source).toBe('spa'); // trimmed
      expect(regex.flags).toBe('i');
    });
  });

  it('escapes regex special characters in the search keyword', async () => {
    findChain([]);
    await getAllServices({ search: 'a.b(c)*' });

    const regex = Service.find.mock.calls[0][0].$or[0].name;
    expect(regex.source).toBe('a\\.b\\(c\\)\\*');
    expect(regex.test('a.b(c)*')).toBe(true);
    expect(regex.test('aXb(c)*')).toBe(false);
  });

  it('ignores whitespace-only and non-string search values', async () => {
    findChain([]);

    await getAllServices({ search: '   ' });
    expect(Service.find).toHaveBeenLastCalledWith({});

    await getAllServices({ search: 123 });
    expect(Service.find).toHaveBeenLastCalledWith({});

    await getAllServices({ search: null });
    expect(Service.find).toHaveBeenLastCalledWith({});
  });

  it('combines category, status and search filters', async () => {
    findChain([]);
    await getAllServices({ category: 'Grooming', status: 'Active', search: 'x' });

    const filter = Service.find.mock.calls[0][0];
    expect(filter).toMatchObject({ category: 'Grooming', status: 'Active' });
    expect(filter.$or).toHaveLength(3);
  });
});

// ---------- getServiceById ----------
describe('getServiceById', () => {
  it('throws 400 for an invalid ObjectId', async () => {
    await expectHttpError(getServiceById(INVALID_ID), 400, 'ID dịch vụ không hợp lệ');
    expect(Service.findById).not.toHaveBeenCalled();
  });

  it('throws 404 when the service does not exist', async () => {
    Service.findById.mockReturnValue(leanChain(null));
    await expectHttpError(getServiceById(VALID_ID), 404, 'Không tìm thấy dịch vụ');
  });

  it('returns the service when found', async () => {
    const service = { _id: VALID_ID, name: 'Deep Tissue' };
    Service.findById.mockReturnValue(leanChain(service));

    await expect(getServiceById(VALID_ID)).resolves.toBe(service);
    expect(Service.findById).toHaveBeenCalledWith(VALID_ID);
  });
});

// ---------- createService ----------
describe('createService', () => {
  const createdDoc = (obj) => ({ toObject: () => obj });

  it('creates a service with trimmed fields, numeric conversion and generated code', async () => {
    Service.exists.mockResolvedValue(null);
    Service.create.mockImplementation(async (data) => createdDoc(data));

    const result = await createService(validPayload());

    const arg = Service.create.mock.calls[0][0];
    expect(arg.code).toMatch(/^SRV-[A-Z2-9]{6}$/);
    expect(arg).toMatchObject({
      name: 'Deep Tissue',
      category: 'Examination',
      defaultDuration: 60,
      basePrice: 500000,
      description: 'Relaxing',
      status: 'Active',
    });
    expect(typeof arg.defaultDuration).toBe('number');
    expect(typeof arg.basePrice).toBe('number');
    expect(result).toEqual(arg); // result of toObject()
  });

  it("defaults status to 'Active' when omitted", async () => {
    Service.exists.mockResolvedValue(null);
    Service.create.mockImplementation(async (data) => createdDoc(data));

    await createService(validPayload({ status: undefined }));
    expect(Service.create.mock.calls[0][0].status).toBe('Active');
  });

  it('keeps an explicit Inactive status', async () => {
    Service.exists.mockResolvedValue(null);
    Service.create.mockImplementation(async (data) => createdDoc(data));

    await createService(validPayload({ status: 'Inactive' }));
    expect(Service.create.mock.calls[0][0].status).toBe('Inactive');
  });

  it('sets description to undefined when missing or empty', async () => {
    Service.exists.mockResolvedValue(null);
    Service.create.mockImplementation(async (data) => createdDoc(data));

    await createService(validPayload({ description: undefined }));
    expect(Service.create.mock.calls[0][0].description).toBeUndefined();

    await createService(validPayload({ description: '' }));
    expect(Service.create.mock.calls[1][0].description).toBeUndefined();
  });

  it('checks duplicates by category + anchored, escaped, case-insensitive name', async () => {
    Service.exists.mockResolvedValue(null);
    Service.create.mockImplementation(async (data) => createdDoc(data));

    await createService(validPayload({ name: ' Spa (VIP) ' }));

    const query = Service.exists.mock.calls[0][0];
    expect(query.category).toBe('Examination');
    expect(query.name.source).toBe('^Spa \\(VIP\\)$');
    expect(query.name.flags).toBe('i');
    expect(query.name.test('spa (vip)')).toBe(true);
    expect(query.name.test('xspa (vip)')).toBe(false);
    expect(query.name.test('spa (vip) extra')).toBe(false);
  });

  it('throws 409 and does not create when the name already exists in the category', async () => {
    Service.exists.mockResolvedValue({ _id: VALID_ID });

    await expectHttpError(
      createService(validPayload()),
      409,
      'Tên dịch vụ đã tồn tại trong danh mục này'
    );
    expect(Service.create).not.toHaveBeenCalled();
  });

  it('retries with a new code when the generated code collides', async () => {
    let i = 0;
    jest.spyOn(crypto, 'randomInt').mockImplementation(() => i++ % 32);

    Service.exists.mockResolvedValue(null);
    Service.create
      .mockRejectedValueOnce(codeCollision())
      .mockImplementationOnce(async (data) => createdDoc(data));

    const result = await createService(validPayload());

    expect(Service.create).toHaveBeenCalledTimes(2);
    expect(Service.create.mock.calls[0][0].code).toBe('SRV-ABCDEF');
    expect(Service.create.mock.calls[1][0].code).toBe('SRV-GHJKLM');
    expect(result.code).toBe('SRV-GHJKLM');
  });

  it('throws 500 after exhausting all code retries (5 attempts)', async () => {
    Service.exists.mockResolvedValue(null);
    Service.create.mockRejectedValue(codeCollision());

    await expectHttpError(
      createService(validPayload()),
      500,
      'Không thể tạo mã dịch vụ, vui lòng thử lại'
    );
    expect(Service.create).toHaveBeenCalledTimes(5);
  });

  it('throws 409 on a duplicate-key error from the {category, name} index', async () => {
    Service.exists.mockResolvedValue(null);
    Service.create.mockRejectedValue(nameCollision());

    await expectHttpError(
      createService(validPayload()),
      409,
      'Tên dịch vụ đã tồn tại trong danh mục này'
    );
    expect(Service.create).toHaveBeenCalledTimes(1); // no retry
  });

  it('rethrows unexpected errors untouched', async () => {
    const boom = new Error('db down');
    Service.exists.mockResolvedValue(null);
    Service.create.mockRejectedValue(boom);

    await expect(createService(validPayload())).rejects.toBe(boom);
    expect(Service.create).toHaveBeenCalledTimes(1);
  });
});

// ---------- updateService ----------
describe('updateService', () => {
  const existing = { _id: VALID_ID, code: 'SRV-ABC234', description: 'Old description' };

  const setup = ({ duplicate = null, updated = { _id: VALID_ID } } = {}) => {
    Service.findById.mockReturnValue(leanChain(existing));
    Service.exists.mockResolvedValue(duplicate);
    Service.findByIdAndUpdate.mockReturnValue(leanChain(updated));
  };

  it('throws 400 for an invalid ObjectId', async () => {
    await expectHttpError(
      updateService(INVALID_ID, validPayload()),
      400,
      'ID dịch vụ không hợp lệ'
    );
    expect(Service.findById).not.toHaveBeenCalled();
  });

  it('throws 404 when the service does not exist', async () => {
    Service.findById.mockReturnValue(leanChain(null));

    await expectHttpError(
      updateService(VALID_ID, validPayload()),
      404,
      'Không tìm thấy dịch vụ'
    );
    expect(Service.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('excludes the current service when checking for duplicate names', async () => {
    setup();
    await updateService(VALID_ID, validPayload({ name: ' Spa.Deluxe ' }));

    const query = Service.exists.mock.calls[0][0];
    expect(query._id).toEqual({ $ne: VALID_ID });
    expect(query.category).toBe('Examination');
    expect(query.name.source).toBe('^Spa\\.Deluxe$');
    expect(query.name.flags).toBe('i');
  });

  it('throws 409 when another service in the category has the same name', async () => {
    setup({ duplicate: { _id: 'other' } });

    await expectHttpError(
      updateService(VALID_ID, validPayload()),
      409,
      'Tên dịch vụ đã tồn tại trong danh mục này'
    );
    expect(Service.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('updates with trimmed values, numeric conversion and returnDocument: after', async () => {
    const updated = { _id: VALID_ID, name: 'Deep Tissue' };
    setup({ updated });

    const result = await updateService(VALID_ID, validPayload());

    expect(Service.findByIdAndUpdate).toHaveBeenCalledWith(
      VALID_ID,
      {
        $set: {
          name: 'Deep Tissue',
          category: 'Examination',
          defaultDuration: 60,
          basePrice: 500000,
          description: 'Relaxing',
          status: 'Active',
        },
      },
      { returnDocument: 'after' }
    );
    expect(result).toBe(updated);
  });

  it('never allows the code field to be modified', async () => {
    setup();
    await updateService(VALID_ID, { ...validPayload(), code: 'SRV-HACKED' });

    const $set = Service.findByIdAndUpdate.mock.calls[0][1].$set;
    expect($set).not.toHaveProperty('code');
  });

  it('keeps the existing description when description is undefined or null', async () => {
    setup();

    await updateService(VALID_ID, validPayload({ description: undefined }));
    expect(Service.findByIdAndUpdate.mock.calls[0][1].$set.description).toBe('Old description');

    await updateService(VALID_ID, validPayload({ description: null }));
    expect(Service.findByIdAndUpdate.mock.calls[1][1].$set.description).toBe('Old description');
  });

  it('allows clearing the description with an empty string', async () => {
    setup();
    await updateService(VALID_ID, validPayload({ description: '   ' }));
    expect(Service.findByIdAndUpdate.mock.calls[0][1].$set.description).toBe('');
  });

  it.each([undefined, null, ''])('omits status from $set when status is %p', async (status) => {
    setup();
    await updateService(VALID_ID, validPayload({ status }));
    expect(Service.findByIdAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('status');
  });

  it('includes status in $set when provided', async () => {
    setup();
    await updateService(VALID_ID, validPayload({ status: 'Inactive' }));
    expect(Service.findByIdAndUpdate.mock.calls[0][1].$set.status).toBe('Inactive');
  });

  it('throws 409 when the update hits a duplicate-key error', async () => {
    Service.findById.mockReturnValue(leanChain(existing));
    Service.exists.mockResolvedValue(null);
    Service.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockRejectedValue(nameCollision()),
    });

    await expectHttpError(
      updateService(VALID_ID, validPayload()),
      409,
      'Tên dịch vụ đã tồn tại trong danh mục này'
    );
  });

  it('rethrows unexpected errors untouched', async () => {
    const boom = new Error('db down');
    Service.findById.mockReturnValue(leanChain(existing));
    Service.exists.mockResolvedValue(null);
    Service.findByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockRejectedValue(boom) });

    await expect(updateService(VALID_ID, validPayload())).rejects.toBe(boom);
  });
});

// ---------- updateServiceStatus ----------
describe('updateServiceStatus', () => {
  it('throws 400 for an invalid ObjectId', async () => {
    await expectHttpError(
      updateServiceStatus(INVALID_ID, 'Inactive'),
      400,
      'ID dịch vụ không hợp lệ'
    );
    expect(Service.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('throws 404 when the service does not exist', async () => {
    Service.findByIdAndUpdate.mockReturnValue(leanChain(null));

    await expectHttpError(
      updateServiceStatus(VALID_ID, 'Inactive'),
      404,
      'Không tìm thấy dịch vụ'
    );
  });

  it('updates only the status and returns the updated service', async () => {
    const updated = { _id: VALID_ID, status: 'Inactive' };
    Service.findByIdAndUpdate.mockReturnValue(leanChain(updated));

    const result = await updateServiceStatus(VALID_ID, 'Inactive');

    expect(Service.findByIdAndUpdate).toHaveBeenCalledWith(
      VALID_ID,
      { $set: { status: 'Inactive' } },
      { returnDocument: 'after' }
    );
    expect(result).toBe(updated);
  });
});
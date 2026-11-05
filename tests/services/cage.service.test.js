jest.mock('../../src/models/Cage', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

const Cage = require('../../src/models/Cage');
const cageService = require('../../src/services/cage.service');

const { ServiceError } = cageService;

const CAGE_ID = '6ad96d4a9664da6b2c0d8d70';

const sampleCage = (overrides = {}) => ({
  _id: CAGE_ID,
  label: 'A-01',
  size: 'M',
  isIsolated: false,
  status: 'Available',
  ...overrides,
});

// Builds the chain used by getCages: find().sort().skip().limit().lean()
const mockFindChain = (items) => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(items),
  };
  Cage.find.mockReturnValue(chain);
  return chain;
};

// Asserts that a promise rejects with a ServiceError of the given status/message
const expectServiceError = async (promise, statusCode, message) => {
  await expect(promise).rejects.toBeInstanceOf(ServiceError);
  await expect(promise).rejects.toMatchObject({ statusCode, message });
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ServiceError', () => {
  it('stores message, name and statusCode', () => {
    const err = new ServiceError('Lỗi', 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ServiceError');
    expect(err.message).toBe('Lỗi');
    expect(err.statusCode).toBe(404);
  });

  it('defaults statusCode to 500', () => {
    expect(new ServiceError('Lỗi').statusCode).toBe(500);
  });
});

describe('createCage', () => {
  it('creates a cage with the given data and returns it', async () => {
    const data = { label: 'A-01', size: 'M' };
    const created = sampleCage();
    Cage.create.mockResolvedValue(created);

    const result = await cageService.createCage(data);

    expect(Cage.create).toHaveBeenCalledTimes(1);
    expect(Cage.create).toHaveBeenCalledWith(data);
    expect(result).toBe(created);
  });

  it('throws a 409 ServiceError when the label already exists', async () => {
    Cage.create.mockRejectedValue({ code: 11000 });

    await expectServiceError(
      cageService.createCage({ label: 'A-01', size: 'M' }),
      409,
      'Nhãn chuồng đã tồn tại'
    );
  });

  it('rethrows unexpected errors unchanged', async () => {
    const dbError = new Error('DB down');
    Cage.create.mockRejectedValue(dbError);

    await expect(cageService.createCage({ label: 'A-01', size: 'M' })).rejects.toBe(dbError);
  });
});

describe('getCages', () => {
  it('uses default pagination and sort when no options are given', async () => {
    const items = [sampleCage()];
    const chain = mockFindChain(items);
    Cage.countDocuments.mockResolvedValue(1);

    const result = await cageService.getCages();

    expect(Cage.find).toHaveBeenCalledWith({});
    expect(chain.sort).toHaveBeenCalledWith('label');
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.lean).toHaveBeenCalledTimes(1);
    expect(Cage.countDocuments).toHaveBeenCalledWith({});
    expect(result).toEqual({
      items,
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('passes filters to both find and countDocuments', async () => {
    mockFindChain([]);
    Cage.countDocuments.mockResolvedValue(0);
    const filters = { status: 'Available', size: 'L', isIsolated: true };

    await cageService.getCages(filters);

    expect(Cage.find).toHaveBeenCalledWith(filters);
    expect(Cage.countDocuments).toHaveBeenCalledWith(filters);
  });

  it('applies custom page, limit and sort', async () => {
    const chain = mockFindChain([]);
    Cage.countDocuments.mockResolvedValue(45);

    const result = await cageService.getCages({}, { page: 3, limit: 10, sort: '-createdAt' });

    expect(chain.sort).toHaveBeenCalledWith('-createdAt');
    expect(chain.skip).toHaveBeenCalledWith(20); // (3 - 1) * 10
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(5); // ceil(45 / 10)
  });

  it('returns totalPages = 0 when nothing matches', async () => {
    mockFindChain([]);
    Cage.countDocuments.mockResolvedValue(0);

    const result = await cageService.getCages();

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('propagates database errors', async () => {
    const dbError = new Error('DB down');
    const chain = mockFindChain([]);
    chain.lean.mockRejectedValue(dbError);
    Cage.countDocuments.mockResolvedValue(0);

    await expect(cageService.getCages()).rejects.toBe(dbError);
  });
});

describe('getCageById', () => {
  it('returns the cage when found', async () => {
    const cage = sampleCage();
    Cage.findById.mockResolvedValue(cage);

    const result = await cageService.getCageById(CAGE_ID);

    expect(Cage.findById).toHaveBeenCalledWith(CAGE_ID);
    expect(result).toBe(cage);
  });

  it('throws a 404 ServiceError when the cage does not exist', async () => {
    Cage.findById.mockResolvedValue(null);

    await expectServiceError(cageService.getCageById(CAGE_ID), 404, 'Không tìm thấy chuồng');
  });

  it('propagates database errors', async () => {
    const dbError = new Error('DB down');
    Cage.findById.mockRejectedValue(dbError);

    await expect(cageService.getCageById(CAGE_ID)).rejects.toBe(dbError);
  });
});

describe('updateCage', () => {
  it('updates the cage with validators on and returns the new document', async () => {
    const data = { status: 'Occupied', isIsolated: true };
    const updated = sampleCage(data);
    Cage.findByIdAndUpdate.mockResolvedValue(updated);

    const result = await cageService.updateCage(CAGE_ID, data);

    expect(Cage.findByIdAndUpdate).toHaveBeenCalledWith(CAGE_ID, data, {
      new: true,
      runValidators: true,
    });
    expect(result).toBe(updated);
  });

  it('throws a 404 ServiceError when the cage does not exist', async () => {
    Cage.findByIdAndUpdate.mockResolvedValue(null);

    await expectServiceError(
      cageService.updateCage(CAGE_ID, { status: 'Occupied' }),
      404,
      'Không tìm thấy chuồng'
    );
  });

  it('throws a 409 ServiceError when the new label already exists', async () => {
    Cage.findByIdAndUpdate.mockRejectedValue({ code: 11000 });

    await expectServiceError(
      cageService.updateCage(CAGE_ID, { label: 'A-02' }),
      409,
      'Nhãn chuồng đã tồn tại'
    );
  });

  it('rethrows unexpected errors unchanged', async () => {
    const dbError = new Error('DB down');
    Cage.findByIdAndUpdate.mockRejectedValue(dbError);

    await expect(cageService.updateCage(CAGE_ID, { size: 'L' })).rejects.toBe(dbError);
  });
});
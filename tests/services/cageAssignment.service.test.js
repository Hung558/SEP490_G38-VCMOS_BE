const Cage = require('../../src/models/Cage');
const CageAssignment = require('../../src/models/CageAssignment');
const {
  createCageAssignment,
  getAllCageAssignments,
  getCageAssignmentById,
  getCageAssignmentByOrderId,
  releaseCageAssignment,
} = require('../../src/services/cageAssignment.service');

// Replace the Mongoose models with plain mocks so no database is needed
jest.mock('../../src/models/Cage', () => ({
  findOneAndUpdate: jest.fn(),
  exists: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../../src/models/CageAssignment', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  exists: jest.fn(),
  updateOne: jest.fn(),
}));

const CAGE_ID = '6ad96d4a9664da6b2c0d8e10';
const ORDER_ID = '6ad96d4a9664da6b2c0d8f22';
const USER_ID = '6ad96d4a9664da6b2c0d8d61';
const ASSIGNMENT_ID = '6ad96d4a9664da6b2c0d9a01';

const POPULATE_OPTIONS = [
  { path: 'cageId' },
  { path: 'orderId' },
  { path: 'assignedById', select: '-password' },
];

const INVALID_IDS = ['abc', 'not-a-valid-id', '', null, undefined];

beforeEach(() => {
  jest.resetAllMocks();
});

describe('createCageAssignment', () => {
  const validInput = { cageId: CAGE_ID, orderId: ORDER_ID, assignedById: USER_ID };

  describe('input validation', () => {
    it.each(INVALID_IDS)('rejects invalid cageId (%p) with 400', async (bad) => {
      await expect(
        createCageAssignment({ ...validInput, cageId: bad })
      ).rejects.toMatchObject({ statusCode: 400, message: 'ID chuồng không hợp lệ' });
    });

    it.each(INVALID_IDS)('rejects invalid orderId (%p) with 400', async (bad) => {
      await expect(
        createCageAssignment({ ...validInput, orderId: bad })
      ).rejects.toMatchObject({ statusCode: 400, message: 'ID đơn hẹn không hợp lệ' });
    });

    it.each(INVALID_IDS)('rejects invalid assignedById (%p) with 400', async (bad) => {
      await expect(
        createCageAssignment({ ...validInput, assignedById: bad })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'ID người phân công không hợp lệ',
      });
    });

    it('does not touch the database when input is invalid', async () => {
      await expect(
        createCageAssignment({ ...validInput, cageId: 'abc' })
      ).rejects.toBeDefined();

      expect(Cage.findOneAndUpdate).not.toHaveBeenCalled();
      expect(CageAssignment.create).not.toHaveBeenCalled();
    });
  });

  describe('cage availability', () => {
    it('throws 404 when the cage does not exist', async () => {
      Cage.findOneAndUpdate.mockResolvedValue(null);
      Cage.exists.mockResolvedValue(null);

      await expect(createCageAssignment(validInput)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy chuồng',
      });

      expect(Cage.exists).toHaveBeenCalledWith({ _id: CAGE_ID });
      expect(CageAssignment.create).not.toHaveBeenCalled();
      expect(Cage.updateOne).not.toHaveBeenCalled();
    });

    it('throws 409 when the cage exists but is not Available', async () => {
      Cage.findOneAndUpdate.mockResolvedValue(null);
      Cage.exists.mockResolvedValue({ _id: CAGE_ID });

      await expect(createCageAssignment(validInput)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Chuồng không ở trạng thái trống (Available)',
      });

      expect(CageAssignment.create).not.toHaveBeenCalled();
      expect(Cage.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('successful creation', () => {
    let populate;
    let populated;

    beforeEach(() => {
      populated = { _id: ASSIGNMENT_ID, cageId: { _id: CAGE_ID, status: 'Occupied' } };
      populate = jest.fn().mockResolvedValue(populated);
      Cage.findOneAndUpdate.mockResolvedValue({ _id: CAGE_ID, status: 'Occupied' });
      CageAssignment.create.mockResolvedValue({ populate });
    });

    it('only claims cages whose status is Available and sets them to Occupied', async () => {
      await createCageAssignment(validInput);

      expect(Cage.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: CAGE_ID, status: 'Available' },
        { $set: { status: 'Occupied' } },
        { new: true }
      );
    });

    it('creates the assignment with the given ids', async () => {
      await createCageAssignment(validInput);

      expect(CageAssignment.create).toHaveBeenCalledWith({
        cageId: CAGE_ID,
        orderId: ORDER_ID,
        assignedById: USER_ID,
      });
    });

    it('claims the cage before creating the assignment', async () => {
      await createCageAssignment(validInput);

      const claimOrder = Cage.findOneAndUpdate.mock.invocationCallOrder[0];
      const createOrder = CageAssignment.create.mock.invocationCallOrder[0];
      expect(claimOrder).toBeLessThan(createOrder);
    });

    it('returns the populated assignment', async () => {
      const result = await createCageAssignment(validInput);

      expect(populate).toHaveBeenCalledWith(POPULATE_OPTIONS);
      expect(result).toBe(populated);
    });

    it('does not roll the cage back', async () => {
      await createCageAssignment(validInput);

      expect(Cage.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('failure while creating the assignment', () => {
    beforeEach(() => {
      Cage.findOneAndUpdate.mockResolvedValue({ _id: CAGE_ID, status: 'Occupied' });
      Cage.updateOne.mockResolvedValue({ acknowledged: true });
    });

    it('rolls the cage back to Available and rethrows unknown errors', async () => {
      const dbError = new Error('connection lost');
      CageAssignment.create.mockRejectedValue(dbError);

      await expect(createCageAssignment(validInput)).rejects.toBe(dbError);

      expect(Cage.updateOne).toHaveBeenCalledWith(
        { _id: CAGE_ID },
        { $set: { status: 'Available' } }
      );
    });

    it('rolls back and throws 409 on a duplicate-key error', async () => {
      const duplicateError = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
      });
      CageAssignment.create.mockRejectedValue(duplicateError);

      await expect(createCageAssignment(validInput)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Chuồng đã có phân công đang hoạt động',
      });

      expect(Cage.updateOne).toHaveBeenCalledWith(
        { _id: CAGE_ID },
        { $set: { status: 'Available' } }
      );
    });
  });
});

describe('getAllCageAssignments', () => {
  const assignments = [{ _id: 'a1' }, { _id: 'a2' }];
  let populate;
  let sort;

  beforeEach(() => {
    sort = jest.fn().mockResolvedValue(assignments);
    populate = jest.fn().mockReturnValue({ sort });
    CageAssignment.find.mockReturnValue({ populate });
  });

  it('returns all assignments with an empty query when no filters are given', async () => {
    const result = await getAllCageAssignments();

    expect(CageAssignment.find).toHaveBeenCalledWith({});
    expect(result).toBe(assignments);
  });

  it('populates references and sorts newest first', async () => {
    await getAllCageAssignments();

    expect(populate).toHaveBeenCalledWith(POPULATE_OPTIONS);
    expect(sort).toHaveBeenCalledWith({ assignedAt: -1 });
  });

  it('filters by cageId', async () => {
    await getAllCageAssignments({ cageId: CAGE_ID });

    expect(CageAssignment.find).toHaveBeenCalledWith({ cageId: CAGE_ID });
  });

  it('filters by orderId', async () => {
    await getAllCageAssignments({ orderId: ORDER_ID });

    expect(CageAssignment.find).toHaveBeenCalledWith({ orderId: ORDER_ID });
  });

  it('filters open assignments when active is true', async () => {
    await getAllCageAssignments({ active: true });

    expect(CageAssignment.find).toHaveBeenCalledWith({ releasedAt: null });
  });

  it('filters released assignments when active is false', async () => {
    await getAllCageAssignments({ active: false });

    expect(CageAssignment.find).toHaveBeenCalledWith({ releasedAt: { $ne: null } });
  });

  it('does not filter on releasedAt when active is omitted', async () => {
    await getAllCageAssignments({ cageId: CAGE_ID });

    const query = CageAssignment.find.mock.calls[0][0];
    expect(query).not.toHaveProperty('releasedAt');
  });

  it('combines all filters', async () => {
    await getAllCageAssignments({ cageId: CAGE_ID, orderId: ORDER_ID, active: true });

    expect(CageAssignment.find).toHaveBeenCalledWith({
      cageId: CAGE_ID,
      orderId: ORDER_ID,
      releasedAt: null,
    });
  });

  it('returns an empty array when nothing matches', async () => {
    sort.mockResolvedValue([]);

    await expect(getAllCageAssignments()).resolves.toEqual([]);
  });

  it('rejects an invalid cageId with 400 without querying', async () => {
    await expect(getAllCageAssignments({ cageId: 'abc' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'ID chuồng không hợp lệ',
    });

    expect(CageAssignment.find).not.toHaveBeenCalled();
  });

  it('rejects an invalid orderId with 400 without querying', async () => {
    await expect(getAllCageAssignments({ orderId: 'abc' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'ID đơn hẹn không hợp lệ',
    });

    expect(CageAssignment.find).not.toHaveBeenCalled();
  });
});

describe('getCageAssignmentById', () => {
  let populate;

  beforeEach(() => {
    populate = jest.fn();
    CageAssignment.findById.mockReturnValue({ populate });
  });

  it.each(INVALID_IDS)('rejects invalid id (%p) with 400', async (bad) => {
    await expect(getCageAssignmentById(bad)).rejects.toMatchObject({
      statusCode: 400,
      message: 'ID phân công chuồng không hợp lệ',
    });

    expect(CageAssignment.findById).not.toHaveBeenCalled();
  });

  it('returns the populated assignment when found', async () => {
    const assignment = { _id: ASSIGNMENT_ID };
    populate.mockResolvedValue(assignment);

    const result = await getCageAssignmentById(ASSIGNMENT_ID);

    expect(CageAssignment.findById).toHaveBeenCalledWith(ASSIGNMENT_ID);
    expect(populate).toHaveBeenCalledWith(POPULATE_OPTIONS);
    expect(result).toBe(assignment);
  });

  it('throws 404 when the assignment does not exist', async () => {
    populate.mockResolvedValue(null);

    await expect(getCageAssignmentById(ASSIGNMENT_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy phân công chuồng',
    });
  });
});

describe('getCageAssignmentByOrderId', () => {
  let populate;
  let sort;

  beforeEach(() => {
    populate = jest.fn();
    sort = jest.fn().mockReturnValue({ populate });
    CageAssignment.findOne.mockReturnValue({ sort });
  });

  it.each(INVALID_IDS)('rejects invalid orderId (%p) with 400', async (bad) => {
    await expect(getCageAssignmentByOrderId(bad)).rejects.toMatchObject({
      statusCode: 400,
      message: 'ID đơn hẹn không hợp lệ',
    });

    expect(CageAssignment.findOne).not.toHaveBeenCalled();
  });

  it('looks up only the open assignment (releasedAt = null) of the order', async () => {
    populate.mockResolvedValue({ _id: ASSIGNMENT_ID });

    await getCageAssignmentByOrderId(ORDER_ID);

    expect(CageAssignment.findOne).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      releasedAt: null,
    });
  });

  it('sorts newest first so the most recent open assignment wins', async () => {
    populate.mockResolvedValue({ _id: ASSIGNMENT_ID });

    await getCageAssignmentByOrderId(ORDER_ID);

    expect(sort).toHaveBeenCalledWith({ assignedAt: -1 });
  });

  it('returns the populated assignment when found', async () => {
    const assignment = { _id: ASSIGNMENT_ID };
    populate.mockResolvedValue(assignment);

    const result = await getCageAssignmentByOrderId(ORDER_ID);

    expect(populate).toHaveBeenCalledWith(POPULATE_OPTIONS);
    expect(result).toBe(assignment);
  });

  it('throws 404 when the order has no open assignment', async () => {
    populate.mockResolvedValue(null);

    await expect(getCageAssignmentByOrderId(ORDER_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Đơn hẹn này chưa có phân công chuồng đang hoạt động',
    });
  });
});

describe('releaseCageAssignment', () => {
  let populate;
  let populated;
  let released;

  beforeEach(() => {
    populated = { _id: ASSIGNMENT_ID, cageId: { _id: CAGE_ID, status: 'Available' } };
    populate = jest.fn().mockResolvedValue(populated);
    released = { _id: ASSIGNMENT_ID, cageId: CAGE_ID, populate };
    CageAssignment.findOneAndUpdate.mockResolvedValue(released);
    Cage.updateOne.mockResolvedValue({ acknowledged: true });
    CageAssignment.updateOne.mockResolvedValue({ acknowledged: true });
  });

  describe('input validation', () => {
    it.each(INVALID_IDS)('rejects invalid id (%p) with 400', async (bad) => {
      await expect(releaseCageAssignment(bad)).rejects.toMatchObject({
        statusCode: 400,
        message: 'ID phân công chuồng không hợp lệ',
      });
    });

    it('does not touch the database when the id is invalid', async () => {
      await expect(releaseCageAssignment('abc')).rejects.toBeDefined();

      expect(CageAssignment.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Cage.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('assignment state', () => {
    beforeEach(() => {
      CageAssignment.findOneAndUpdate.mockResolvedValue(null);
    });

    it('throws 404 when the assignment does not exist', async () => {
      CageAssignment.exists.mockResolvedValue(null);

      await expect(releaseCageAssignment(ASSIGNMENT_ID)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy phân công chuồng',
      });

      expect(CageAssignment.exists).toHaveBeenCalledWith({ _id: ASSIGNMENT_ID });
      expect(Cage.updateOne).not.toHaveBeenCalled();
    });

    it('throws 409 when the assignment was already released', async () => {
      CageAssignment.exists.mockResolvedValue({ _id: ASSIGNMENT_ID });

      await expect(releaseCageAssignment(ASSIGNMENT_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Phân công chuồng này đã được giải phóng trước đó',
      });

      expect(Cage.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('successful release', () => {
    it('only closes an open assignment and sets releasedAt to now', async () => {
      await releaseCageAssignment(ASSIGNMENT_ID);

      expect(CageAssignment.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: ASSIGNMENT_ID, releasedAt: null },
        { $set: { releasedAt: expect.any(Date) } },
        { new: true }
      );
    });

    it('sets the cage of the assignment back to Available', async () => {
      await releaseCageAssignment(ASSIGNMENT_ID);

      expect(Cage.updateOne).toHaveBeenCalledWith(
        { _id: CAGE_ID },
        { $set: { status: 'Available' } }
      );
    });

    it('closes the assignment before freeing the cage', async () => {
      await releaseCageAssignment(ASSIGNMENT_ID);

      const closeOrder = CageAssignment.findOneAndUpdate.mock.invocationCallOrder[0];
      const freeOrder = Cage.updateOne.mock.invocationCallOrder[0];
      expect(closeOrder).toBeLessThan(freeOrder);
    });

    it('returns the populated assignment', async () => {
      const result = await releaseCageAssignment(ASSIGNMENT_ID);

      expect(populate).toHaveBeenCalledWith(POPULATE_OPTIONS);
      expect(result).toBe(populated);
    });

    it('does not re-open the assignment', async () => {
      await releaseCageAssignment(ASSIGNMENT_ID);

      expect(CageAssignment.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('failure while freeing the cage', () => {
    it('re-opens the assignment and rethrows the error', async () => {
      const dbError = new Error('connection lost');
      Cage.updateOne.mockRejectedValue(dbError);

      await expect(releaseCageAssignment(ASSIGNMENT_ID)).rejects.toBe(dbError);

      expect(CageAssignment.updateOne).toHaveBeenCalledWith(
        { _id: ASSIGNMENT_ID },
        { $set: { releasedAt: null } }
      );
      expect(populate).not.toHaveBeenCalled();
    });
  });
});
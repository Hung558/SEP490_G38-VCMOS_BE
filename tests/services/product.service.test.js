const Product = require('../../src/models/Product');
const productService = require('../../src/services/product.service');

// Replace the Mongoose model with plain jest mocks: no database needed.
jest.mock('../../src/models/Product', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
}));

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PRODUCT_ID = '64b7f0c2a1b2c3d4e5f60718';

const sampleProduct = (overrides = {}) => ({
  _id: PRODUCT_ID,
  code: 'PRD-K7M2QX',
  name: 'Paracetamol 500mg',
  category: 'Medicine',
  unit: 'Box',
  unitPrice: 15000,
  status: 'Active',
  ...overrides,
});

/** Mock `Product.find(...).sort().skip().limit().lean()` and return the chain. */
const mockFindChain = (result) => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  Product.find.mockReturnValue(chain);
  return chain;
};

/** Mock a query that ends with `.lean()` (findById / findByIdAndUpdate). */
const mockLean = (result) => ({ lean: jest.fn().mockResolvedValue(result) });
const mockLeanReject = (error) => ({ lean: jest.fn().mockRejectedValue(error) });

/** Fake MongoDB duplicate-key errors. */
const duplicateCodeError = () =>
  Object.assign(new Error('E11000 duplicate key (code)'), {
    code: 11000,
    keyPattern: { code: 1 },
  });
const duplicateNameUnitError = () =>
  Object.assign(new Error('E11000 duplicate key (name, unit)'), {
    code: 11000,
    keyPattern: { name: 1, unit: 1 },
  });

beforeEach(() => {
  jest.resetAllMocks();
});

/* -------------------------------------------------------------------------- */
/* listProducts                                                               */
/* -------------------------------------------------------------------------- */

describe('listProducts', () => {
  test('uses defaults (page 1, limit 20, newest first) when called without arguments', async () => {
    const items = [sampleProduct()];
    const chain = mockFindChain(items);
    Product.countDocuments.mockResolvedValue(1);

    const result = await productService.listProducts();

    expect(Product.find).toHaveBeenCalledWith({});
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.lean).toHaveBeenCalled();
    expect(result).toEqual({ items, total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  test('filters by category and status', async () => {
    mockFindChain([]);
    Product.countDocuments.mockResolvedValue(0);

    await productService.listProducts({ category: 'Vaccine', status: 'Inactive' });

    expect(Product.find).toHaveBeenCalledWith({ category: 'Vaccine', status: 'Inactive' });
  });

  test('uses the same filter for the count query as for the find query', async () => {
    mockFindChain([]);
    Product.countDocuments.mockResolvedValue(0);

    await productService.listProducts({ category: 'Retail', search: 'abc' });

    expect(Product.countDocuments).toHaveBeenCalledWith(Product.find.mock.calls[0][0]);
  });

  test('search matches name OR code, case-insensitively', async () => {
    mockFindChain([]);
    Product.countDocuments.mockResolvedValue(0);

    await productService.listProducts({ search: 'para' });

    const filter = Product.find.mock.calls[0][0];
    expect(filter.$or).toHaveLength(2);
    expect(filter.$or[0].name).toBeInstanceOf(RegExp);
    expect(filter.$or[1].code).toBeInstanceOf(RegExp);
    expect(filter.$or[0].name.flags).toBe('i');
    expect(filter.$or[0].name.test('PARACETAMOL')).toBe(true);
    expect(filter.$or[1].code.test('prd-para1')).toBe(true);
    expect(filter.$or[0].name.test('Ibuprofen')).toBe(false);
  });

  test('search escapes regex special characters (no regex injection)', async () => {
    mockFindChain([]);
    Product.countDocuments.mockResolvedValue(0);

    await productService.listProducts({ search: 'a.b(c)+' });

    const regex = Product.find.mock.calls[0][0].$or[0].name;
    expect(regex.test('a.b(c)+')).toBe(true); // literal match
    expect(regex.test('axb(c)+')).toBe(false); // "." must not act as wildcard
    expect(() => new RegExp(regex.source)).not.toThrow();
  });

  test('ignores an empty search string', async () => {
    mockFindChain([]);
    Product.countDocuments.mockResolvedValue(0);

    await productService.listProducts({ search: '' });

    expect(Product.find).toHaveBeenCalledWith({});
  });

  test('computes skip/limit from page and limit', async () => {
    const chain = mockFindChain([]);
    Product.countDocuments.mockResolvedValue(25);

    const result = await productService.listProducts({ page: 3, limit: 10 });

    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3); // ceil(25 / 10)
  });

  test('returns totalPages 0 when nothing matches', async () => {
    mockFindChain([]);
    Product.countDocuments.mockResolvedValue(0);

    const result = await productService.listProducts({});

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  test('propagates database errors', async () => {
    const chain = mockFindChain([]);
    chain.lean.mockRejectedValue(new Error('db down'));
    Product.countDocuments.mockResolvedValue(0);

    await expect(productService.listProducts()).rejects.toThrow('db down');
  });
});

/* -------------------------------------------------------------------------- */
/* getProductById                                                             */
/* -------------------------------------------------------------------------- */

describe('getProductById', () => {
  test('returns the product when found', async () => {
    const product = sampleProduct();
    Product.findById.mockReturnValue(mockLean(product));

    const result = await productService.getProductById(PRODUCT_ID);

    expect(Product.findById).toHaveBeenCalledWith(PRODUCT_ID);
    expect(result).toEqual(product);
  });

  test('throws 404 when the product does not exist', async () => {
    Product.findById.mockReturnValue(mockLean(null));

    await expect(productService.getProductById(PRODUCT_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
    });
  });

  test('propagates database errors', async () => {
    Product.findById.mockReturnValue(mockLeanReject(new Error('db down')));

    await expect(productService.getProductById(PRODUCT_ID)).rejects.toThrow('db down');
  });
});

/* -------------------------------------------------------------------------- */
/* createProduct                                                              */
/* -------------------------------------------------------------------------- */

describe('createProduct', () => {
  const input = {
    name: 'Paracetamol 500mg',
    category: 'Medicine',
    unit: 'Box',
    unitPrice: 15000,
  };

  /** Make Product.create resolve with a doc whose toObject() returns `obj`. */
  const mockCreateResolves = (obj) =>
    Product.create.mockResolvedValue({ toObject: () => obj });

  test('creates an Active product with the given fields and returns a plain object', async () => {
    const saved = sampleProduct();
    mockCreateResolves(saved);

    const result = await productService.createProduct(input);

    expect(Product.create).toHaveBeenCalledTimes(1);
    expect(Product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: input.name,
        category: input.category,
        unit: input.unit,
        unitPrice: input.unitPrice,
        status: 'Active',
      })
    );
    expect(result).toEqual(saved);
  });

  test('generates a code in the format PRD-XXXXXX using the unambiguous alphabet', async () => {
    mockCreateResolves(sampleProduct());

    await productService.createProduct(input);

    const { code } = Product.create.mock.calls[0][0];
    // Alphabet excludes 0, O, 1, I
    expect(code).toMatch(/^PRD-[A-HJ-NP-Z2-9]{6}$/);
  });

  test('generates different codes across calls', async () => {
    mockCreateResolves(sampleProduct());

    for (let i = 0; i < 20; i++) await productService.createProduct(input);

    const codes = Product.create.mock.calls.map(([doc]) => doc.code);
    expect(new Set(codes).size).toBeGreaterThan(1);
  });

  test('always sets status Active, ignoring any status passed in', async () => {
    mockCreateResolves(sampleProduct());

    await productService.createProduct({ ...input, status: 'Inactive', code: 'HACK' });

    const doc = Product.create.mock.calls[0][0];
    expect(doc.status).toBe('Active');
    expect(doc.code).not.toBe('HACK');
  });

  test('retries with a new code when the generated code collides', async () => {
    const saved = sampleProduct();
    Product.create
      .mockRejectedValueOnce(duplicateCodeError())
      .mockRejectedValueOnce(duplicateCodeError())
      .mockResolvedValueOnce({ toObject: () => saved });

    const result = await productService.createProduct(input);

    expect(Product.create).toHaveBeenCalledTimes(3);
    expect(result).toEqual(saved);
  });

  test('throws 500 after 5 consecutive code collisions', async () => {
    Product.create.mockRejectedValue(duplicateCodeError());

    await expect(productService.createProduct(input)).rejects.toMatchObject({
      statusCode: 500,
      message: 'Không thể tạo mã sản phẩm duy nhất, vui lòng thử lại',
    });
    expect(Product.create).toHaveBeenCalledTimes(5);
  });

  test('throws 409 (without retrying) when name + unit already exist', async () => {
    Product.create.mockRejectedValue(duplicateNameUnitError());

    await expect(productService.createProduct(input)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Sản phẩm với cùng tên và đơn vị tính đã tồn tại',
    });
    expect(Product.create).toHaveBeenCalledTimes(1);
  });

  test('treats a duplicate-key error without keyPattern as 409, not a code collision', async () => {
    Product.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    await expect(productService.createProduct(input)).rejects.toMatchObject({ statusCode: 409 });
    expect(Product.create).toHaveBeenCalledTimes(1);
  });

  test('rethrows other errors without retrying', async () => {
    const validationError = new Error('validation failed');
    Product.create.mockRejectedValue(validationError);

    await expect(productService.createProduct(input)).rejects.toBe(validationError);
    expect(Product.create).toHaveBeenCalledTimes(1);
  });

  test('works without unitPrice (optional field)', async () => {
    mockCreateResolves(sampleProduct({ unitPrice: undefined }));

    await productService.createProduct({ name: 'Gauze', category: 'Retail', unit: 'Pack' });

    expect(Product.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Gauze', category: 'Retail', unit: 'Pack' })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* updateProduct                                                              */
/* -------------------------------------------------------------------------- */

describe('updateProduct', () => {
  test('updates the given fields and returns the updated product', async () => {
    const updated = sampleProduct({ name: 'New name', unitPrice: 20000 });
    Product.findByIdAndUpdate.mockReturnValue(mockLean(updated));

    const result = await productService.updateProduct(PRODUCT_ID, {
      name: 'New name',
      category: 'Retail',
      unit: 'Bottle',
      unitPrice: 20000,
    });

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      PRODUCT_ID,
      { $set: { name: 'New name', category: 'Retail', unit: 'Bottle', unitPrice: 20000 } },
      { new: true, runValidators: true }
    );
    expect(result).toEqual(updated);
  });

  test('only sets fields that are provided (undefined fields are dropped)', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLean(sampleProduct()));

    await productService.updateProduct(PRODUCT_ID, { name: 'Only name' });

    expect(Product.findByIdAndUpdate.mock.calls[0][1]).toEqual({ $set: { name: 'Only name' } });
  });

  test('keeps falsy-but-defined values such as unitPrice 0', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLean(sampleProduct({ unitPrice: 0 })));

    await productService.updateProduct(PRODUCT_ID, { unitPrice: 0 });

    expect(Product.findByIdAndUpdate.mock.calls[0][1]).toEqual({ $set: { unitPrice: 0 } });
  });

  test('cannot change code or status through update', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLean(sampleProduct()));

    await productService.updateProduct(PRODUCT_ID, {
      name: 'X',
      code: 'PRD-HACKED',
      status: 'Inactive',
    });

    const { $set } = Product.findByIdAndUpdate.mock.calls[0][1];
    expect($set).toEqual({ name: 'X' });
    expect($set).not.toHaveProperty('code');
    expect($set).not.toHaveProperty('status');
  });

  test('runs schema validators and returns the new document', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLean(sampleProduct()));

    await productService.updateProduct(PRODUCT_ID, { name: 'X' });

    expect(Product.findByIdAndUpdate.mock.calls[0][2]).toEqual({
      new: true,
      runValidators: true,
    });
  });

  test('throws 404 when the product does not exist', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLean(null));

    await expect(productService.updateProduct(PRODUCT_ID, { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
    });
  });

  test('throws 409 when the update causes a duplicate name + unit', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLeanReject(duplicateNameUnitError()));

    await expect(productService.updateProduct(PRODUCT_ID, { name: 'Dup' })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Sản phẩm với cùng tên và đơn vị tính đã tồn tại',
    });
  });

  test('rethrows other errors unchanged', async () => {
    const castError = Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError' });
    Product.findByIdAndUpdate.mockReturnValue(mockLeanReject(castError));

    await expect(productService.updateProduct('bad-id', { name: 'X' })).rejects.toBe(castError);
  });
});

/* -------------------------------------------------------------------------- */
/* inactivateProduct                                                          */
/* -------------------------------------------------------------------------- */

describe('inactivateProduct', () => {
  test('sets status to Inactive and returns the updated product', async () => {
    const updated = sampleProduct({ status: 'Inactive' });
    Product.findByIdAndUpdate.mockReturnValue(mockLean(updated));

    const result = await productService.inactivateProduct(PRODUCT_ID);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      PRODUCT_ID,
      { $set: { status: 'Inactive' } },
      { new: true }
    );
    expect(result).toEqual(updated);
    expect(result.status).toBe('Inactive');
  });

  test('throws 404 when the product does not exist', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLean(null));

    await expect(productService.inactivateProduct(PRODUCT_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
    });
  });

  test('propagates database errors', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLeanReject(new Error('db down')));

    await expect(productService.inactivateProduct(PRODUCT_ID)).rejects.toThrow('db down');
  });
});

/* -------------------------------------------------------------------------- */
/* activateProduct                                                            */
/* -------------------------------------------------------------------------- */

describe('activateProduct', () => {
  test('sets status to Active and returns the updated product', async () => {
    const updated = sampleProduct({ status: 'Active' });
    Product.findByIdAndUpdate.mockReturnValue(mockLean(updated));

    const result = await productService.activateProduct(PRODUCT_ID);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      PRODUCT_ID,
      { $set: { status: 'Active' } },
      { new: true }
    );
    expect(result).toEqual(updated);
    expect(result.status).toBe('Active');
  });

  test('throws 404 when the product does not exist', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLean(null));

    await expect(productService.activateProduct(PRODUCT_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy sản phẩm',
    });
  });

  test('propagates database errors', async () => {
    Product.findByIdAndUpdate.mockReturnValue(mockLeanReject(new Error('db down')));

    await expect(productService.activateProduct(PRODUCT_ID)).rejects.toThrow('db down');
  });
});
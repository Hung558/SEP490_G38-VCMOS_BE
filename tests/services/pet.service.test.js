/**
 * Unit tests for pet.service.js (Jest)
 * Cloudinary and the Pet model are fully mocked: no network or database is touched.
 */

jest.mock('../../src/config/cloudinary', () => ({
  uploader: {
    upload: jest.fn(),
    upload_stream: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/models/Pet', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const cloudinary = require('../../src/config/cloudinary');
const Pet = require('../../src/models/Pet');
const petService = require('../../src/services/pet.service');

/* -------------------------------- helpers -------------------------------- */

const OWNER_ID = 'owner-1';
const PET_ID = 'pet-1';
const NEW_URL = 'https://res.cloudinary.com/demo/image/upload/v1699999999/pets/new123.jpg';
const OLD_URL = 'https://res.cloudinary.com/demo/image/upload/v1600000000/pets/old456.jpg';
const CODE_REGEX = /^PET-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

const duplicateCodeError = () => {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  err.keyPattern = { code: 1 };
  return err;
};

// A minimal stand-in for a Mongoose document.
const makePetDoc = (overrides = {}) => ({
  _id: PET_ID,
  ownerId: OWNER_ID,
  name: 'Milo',
  status: 'Active',
  code: 'PET-ABC234',
  photoUrl: undefined,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockUploadSuccess = (url = NEW_URL) =>
  cloudinary.uploader.upload.mockResolvedValue({ secure_url: url });

let consoleErrorSpy;

beforeEach(() => {
  jest.resetAllMocks();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

/* -------------------------------- createPet ------------------------------- */

describe('createPet', () => {
  it('creates a pet with whitelisted fields, owner id and a well-formed code', async () => {
    Pet.create.mockImplementation(async (doc) => ({ ...doc }));

    const result = await petService.createPet(OWNER_ID, {
      name: 'Milo',
      species: 'Dog',
      breed: 'Corgi',
      coatColor: 'Golden',
      notes: 'Friendly',
      dob: '2022-01-01',
      weight: 10,
    });

    expect(Pet.create).toHaveBeenCalledTimes(1);
    const arg = Pet.create.mock.calls[0][0];
    expect(arg).toMatchObject({
      name: 'Milo',
      species: 'Dog',
      breed: 'Corgi',
      coatColor: 'Golden',
      notes: 'Friendly',
      dob: '2022-01-01',
      weight: 10,
      ownerId: OWNER_ID,
    });
    expect(arg.code).toMatch(CODE_REGEX);
    expect(result.name).toBe('Milo');
  });

  it('ignores non-whitelisted fields such as status, code and ownerId from input', async () => {
    Pet.create.mockImplementation(async (doc) => ({ ...doc }));

    await petService.createPet(OWNER_ID, {
      name: 'Milo',
      status: 'Deleted',
      code: 'PET-HACKED',
      ownerId: 'someone-else',
      isAdmin: true,
    });

    const arg = Pet.create.mock.calls[0][0];
    expect(arg.ownerId).toBe(OWNER_ID);
    expect(arg.code).toMatch(CODE_REGEX);
    expect(arg.code).not.toBe('PET-HACKED');
    expect(arg).not.toHaveProperty('status');
    expect(arg).not.toHaveProperty('isAdmin');
  });

  it('skips fields that are undefined but keeps falsy values like 0 and empty string', async () => {
    Pet.create.mockImplementation(async (doc) => ({ ...doc }));

    await petService.createPet(OWNER_ID, { name: 'Milo', weight: 0, notes: '', breed: undefined });

    const arg = Pet.create.mock.calls[0][0];
    expect(arg.weight).toBe(0);
    expect(arg.notes).toBe('');
    expect(arg).not.toHaveProperty('breed');
  });

  it('does not upload anything and omits photoUrl when no photo is given', async () => {
    Pet.create.mockImplementation(async (doc) => ({ ...doc }));

    await petService.createPet(OWNER_ID, { name: 'Milo' });

    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    expect(Pet.create.mock.calls[0][0]).not.toHaveProperty('photoUrl');
  });

  it('uploads a string photo (path / URL / data URI) and stores its secure URL', async () => {
    mockUploadSuccess();
    Pet.create.mockImplementation(async (doc) => ({ ...doc }));

    await petService.createPet(OWNER_ID, { name: 'Milo' }, 'data:image/png;base64,AAA');

    expect(cloudinary.uploader.upload).toHaveBeenCalledWith('data:image/png;base64,AAA', {
      folder: 'pets',
      resource_type: 'image',
    });
    expect(Pet.create.mock.calls[0][0].photoUrl).toBe(NEW_URL);
  });

  it('uploads a Buffer photo through upload_stream', async () => {
    const buffer = Buffer.from('fake-image');
    const end = jest.fn();
    cloudinary.uploader.upload_stream.mockImplementation((options, cb) => {
      end.mockImplementation(() => cb(null, { secure_url: NEW_URL }));
      return { end };
    });
    Pet.create.mockImplementation(async (doc) => ({ ...doc }));

    await petService.createPet(OWNER_ID, { name: 'Milo' }, buffer);

    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      { folder: 'pets', resource_type: 'image' },
      expect.any(Function)
    );
    expect(end).toHaveBeenCalledWith(buffer);
    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
    expect(Pet.create.mock.calls[0][0].photoUrl).toBe(NEW_URL);
  });

  it('rejects and does not create a pet when a Buffer upload fails', async () => {
    const uploadError = new Error('stream failed');
    cloudinary.uploader.upload_stream.mockImplementation((options, cb) => ({
      end: () => cb(uploadError),
    }));

    await expect(
      petService.createPet(OWNER_ID, { name: 'Milo' }, Buffer.from('x'))
    ).rejects.toBe(uploadError);

    expect(Pet.create).not.toHaveBeenCalled();
  });

  it('rejects and does not create a pet when a string upload fails', async () => {
    const uploadError = new Error('upload failed');
    cloudinary.uploader.upload.mockRejectedValue(uploadError);

    await expect(petService.createPet(OWNER_ID, { name: 'Milo' }, 'some/path.jpg')).rejects.toBe(
      uploadError
    );

    expect(Pet.create).not.toHaveBeenCalled();
  });

  describe('code collisions', () => {
    it('retries on duplicate code errors and succeeds on a later attempt', async () => {
      Pet.create
        .mockRejectedValueOnce(duplicateCodeError())
        .mockRejectedValueOnce(duplicateCodeError())
        .mockImplementationOnce(async (doc) => ({ ...doc }));

      const result = await petService.createPet(OWNER_ID, { name: 'Milo' });

      expect(Pet.create).toHaveBeenCalledTimes(3);
      Pet.create.mock.calls.forEach(([doc]) => expect(doc.code).toMatch(CODE_REGEX));
      expect(result.name).toBe('Milo');
    });

    it('treats a duplicate error with no keyPattern but "code" in the message as a collision', async () => {
      const err = new Error('E11000 duplicate key error ... index: code_1 dup key');
      err.code = 11000;
      Pet.create.mockRejectedValueOnce(err).mockImplementationOnce(async (doc) => ({ ...doc }));

      await petService.createPet(OWNER_ID, { name: 'Milo' });

      expect(Pet.create).toHaveBeenCalledTimes(2);
    });

    it('throws a 500 error after 5 failed attempts', async () => {
      Pet.create.mockRejectedValue(duplicateCodeError());

      await expect(petService.createPet(OWNER_ID, { name: 'Milo' })).rejects.toMatchObject({
        statusCode: 500,
      });
      expect(Pet.create).toHaveBeenCalledTimes(5);
    });

    it('does not retry on a duplicate key error for a different field', async () => {
      const err = new Error('E11000 duplicate key error index: email_1');
      err.code = 11000;
      err.keyPattern = { email: 1 };
      Pet.create.mockRejectedValue(err);

      await expect(petService.createPet(OWNER_ID, { name: 'Milo' })).rejects.toBe(err);
      expect(Pet.create).toHaveBeenCalledTimes(1);
    });

    it('does not retry on non-duplicate errors (e.g. validation) and rethrows them', async () => {
      const err = new Error('Validation failed');
      err.name = 'ValidationError';
      Pet.create.mockRejectedValue(err);

      await expect(petService.createPet(OWNER_ID, {})).rejects.toBe(err);
      expect(Pet.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('orphaned photo cleanup', () => {
    it('removes the uploaded photo when creation fails', async () => {
      mockUploadSuccess();
      cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });
      const err = new Error('Validation failed');
      Pet.create.mockRejectedValue(err);

      await expect(petService.createPet(OWNER_ID, { name: 'Milo' }, 'photo.jpg')).rejects.toBe(err);

      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('pets/new123');
    });

    it('removes the uploaded photo when all code retries are exhausted', async () => {
      mockUploadSuccess();
      cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });
      Pet.create.mockRejectedValue(duplicateCodeError());

      await expect(
        petService.createPet(OWNER_ID, { name: 'Milo' }, 'photo.jpg')
      ).rejects.toMatchObject({ statusCode: 500 });

      expect(cloudinary.uploader.destroy).toHaveBeenCalledTimes(1);
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('pets/new123');
    });

    it('does not call destroy on failure when no photo was uploaded', async () => {
      Pet.create.mockRejectedValue(new Error('boom'));

      await expect(petService.createPet(OWNER_ID, { name: 'Milo' })).rejects.toThrow('boom');

      expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    });

    it('does not mask the original error when cleanup itself fails', async () => {
      mockUploadSuccess();
      cloudinary.uploader.destroy.mockRejectedValue(new Error('cloudinary down'));
      const original = new Error('Validation failed');
      Pet.create.mockRejectedValue(original);

      await expect(petService.createPet(OWNER_ID, { name: 'Milo' }, 'photo.jpg')).rejects.toBe(
        original
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('skips destroy when the uploaded URL has no extractable public id', async () => {
      mockUploadSuccess('not-a-cloudinary-url');
      Pet.create.mockRejectedValue(new Error('boom'));

      await expect(petService.createPet(OWNER_ID, { name: 'Milo' }, 'photo.jpg')).rejects.toThrow(
        'boom'
      );

      expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    });
  });
});

/* ------------------------------- getPetById ------------------------------- */

describe('getPetById', () => {
  it('returns the pet when it belongs to the owner', async () => {
    const pet = makePetDoc();
    Pet.findOne.mockResolvedValue(pet);

    const result = await petService.getPetById(OWNER_ID, PET_ID);

    expect(Pet.findOne).toHaveBeenCalledWith({ _id: PET_ID, ownerId: OWNER_ID });
    expect(result).toBe(pet);
  });

  it('throws a 404 error when the pet does not exist or belongs to someone else', async () => {
    Pet.findOne.mockResolvedValue(null);

    await expect(petService.getPetById(OWNER_ID, PET_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy thú cưng',
    });
  });
});

/* -------------------------------- listPets -------------------------------- */

describe('listPets', () => {
  const setupFind = (items = []) => {
    const query = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(items),
    };
    Pet.find.mockReturnValue(query);
    return query;
  };

  it('uses sensible defaults: Active status, page 1, limit 20, newest first', async () => {
    const items = [makePetDoc(), makePetDoc({ _id: 'pet-2' })];
    const query = setupFind(items);
    Pet.countDocuments.mockResolvedValue(2);

    const result = await petService.listPets(OWNER_ID);

    const expectedFilter = { ownerId: OWNER_ID, status: 'Active' };
    expect(Pet.find).toHaveBeenCalledWith(expectedFilter);
    expect(Pet.countDocuments).toHaveBeenCalledWith(expectedFilter);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(result).toEqual({ items, total: 2, page: 1, limit: 20, totalPages: 1 });
  });

  it('filters by the requested status', async () => {
    setupFind();
    Pet.countDocuments.mockResolvedValue(0);

    await petService.listPets(OWNER_ID, { status: 'Deleted' });

    expect(Pet.find).toHaveBeenCalledWith({ ownerId: OWNER_ID, status: 'Deleted' });
  });

  it('does not filter by status when status is "All"', async () => {
    setupFind();
    Pet.countDocuments.mockResolvedValue(0);

    await petService.listPets(OWNER_ID, { status: 'All' });

    const filter = Pet.find.mock.calls[0][0];
    expect(filter).toEqual({ ownerId: OWNER_ID });
    expect(filter).not.toHaveProperty('status');
  });

  it('calculates skip, limit and totalPages from page and limit', async () => {
    const query = setupFind();
    Pet.countDocuments.mockResolvedValue(25);

    const result = await petService.listPets(OWNER_ID, { page: 3, limit: 10 });

    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({ total: 25, page: 3, limit: 10, totalPages: 3 });
  });

  it('returns totalPages = 0 when there are no pets', async () => {
    setupFind([]);
    Pet.countDocuments.mockResolvedValue(0);

    const result = await petService.listPets(OWNER_ID);

    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(0);
  });

  it('propagates database errors', async () => {
    const query = setupFind();
    query.limit.mockRejectedValue(new Error('db error'));
    Pet.countDocuments.mockResolvedValue(0);

    await expect(petService.listPets(OWNER_ID)).rejects.toThrow('db error');
  });
});

/* -------------------------------- updatePet ------------------------------- */

describe('updatePet', () => {
  it('throws a 404 error when the pet is not found', async () => {
    Pet.findOne.mockResolvedValue(null);

    await expect(petService.updatePet(OWNER_ID, PET_ID, { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(Pet.findOne).toHaveBeenCalledWith({ _id: PET_ID, ownerId: OWNER_ID });
  });

  it('throws a 409 error when the pet has been soft-deleted, without saving', async () => {
    const pet = makePetDoc({ status: 'Deleted' });
    Pet.findOne.mockResolvedValue(pet);

    await expect(petService.updatePet(OWNER_ID, PET_ID, { name: 'X' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(pet.save).not.toHaveBeenCalled();
  });

  it('applies whitelisted fields, saves, and returns the pet', async () => {
    const pet = makePetDoc();
    Pet.findOne.mockResolvedValue(pet);

    const result = await petService.updatePet(OWNER_ID, PET_ID, {
      name: 'Buddy',
      species: 'Cat',
      breed: 'Persian',
      coatColor: 'White',
      notes: 'Updated',
      dob: '2021-05-05',
      weight: 4,
    });

    expect(pet).toMatchObject({
      name: 'Buddy',
      species: 'Cat',
      breed: 'Persian',
      coatColor: 'White',
      notes: 'Updated',
      dob: '2021-05-05',
      weight: 4,
    });
    expect(pet.save).toHaveBeenCalledTimes(1);
    expect(result).toBe(pet);
  });

  it('ignores protected fields (code, ownerId, status)', async () => {
    const pet = makePetDoc();
    Pet.findOne.mockResolvedValue(pet);

    await petService.updatePet(OWNER_ID, PET_ID, {
      name: 'Buddy',
      code: 'PET-HACKED',
      ownerId: 'someone-else',
      status: 'Deleted',
    });

    expect(pet.name).toBe('Buddy');
    expect(pet.code).toBe('PET-ABC234');
    expect(pet.ownerId).toBe(OWNER_ID);
    expect(pet.status).toBe('Active');
  });

  it('leaves fields untouched when they are undefined, but allows falsy values', async () => {
    const pet = makePetDoc({ breed: 'Corgi', weight: 10, notes: 'old' });
    Pet.findOne.mockResolvedValue(pet);

    await petService.updatePet(OWNER_ID, PET_ID, { breed: undefined, weight: 0, notes: '' });

    expect(pet.breed).toBe('Corgi');
    expect(pet.weight).toBe(0);
    expect(pet.notes).toBe('');
  });

  it('works when called without a data argument', async () => {
    const pet = makePetDoc();
    Pet.findOne.mockResolvedValue(pet);

    await expect(petService.updatePet(OWNER_ID, PET_ID)).resolves.toBe(pet);
    expect(pet.save).toHaveBeenCalledTimes(1);
  });

  it('does not touch Cloudinary when no photo is provided', async () => {
    Pet.findOne.mockResolvedValue(makePetDoc({ photoUrl: OLD_URL }));

    await petService.updatePet(OWNER_ID, PET_ID, { name: 'Buddy' });

    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it('replaces the photo: uploads the new one, saves, then removes the old one', async () => {
    const pet = makePetDoc({ photoUrl: OLD_URL });
    Pet.findOne.mockResolvedValue(pet);
    mockUploadSuccess();
    cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

    await petService.updatePet(OWNER_ID, PET_ID, {}, 'new-photo.jpg');

    expect(pet.photoUrl).toBe(NEW_URL);
    expect(pet.save).toHaveBeenCalledTimes(1);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledTimes(1);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('pets/old456');

    // Old photo must be deleted only after the save succeeded.
    const saveOrder = pet.save.mock.invocationCallOrder[0];
    const destroyOrder = cloudinary.uploader.destroy.mock.invocationCallOrder[0];
    expect(destroyOrder).toBeGreaterThan(saveOrder);
  });

  it('does not call destroy when the pet had no previous photo', async () => {
    const pet = makePetDoc({ photoUrl: undefined });
    Pet.findOne.mockResolvedValue(pet);
    mockUploadSuccess();

    await petService.updatePet(OWNER_ID, PET_ID, {}, 'new-photo.jpg');

    expect(pet.photoUrl).toBe(NEW_URL);
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it('removes the NEW photo (and keeps the old one) when saving fails', async () => {
    const saveError = new Error('save failed');
    const pet = makePetDoc({ photoUrl: OLD_URL, save: jest.fn().mockRejectedValue(saveError) });
    Pet.findOne.mockResolvedValue(pet);
    mockUploadSuccess();
    cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

    await expect(petService.updatePet(OWNER_ID, PET_ID, {}, 'new-photo.jpg')).rejects.toBe(
      saveError
    );

    expect(cloudinary.uploader.destroy).toHaveBeenCalledTimes(1);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('pets/new123');
  });

  it('does not call destroy when saving fails and no photo was uploaded', async () => {
    const pet = makePetDoc({ save: jest.fn().mockRejectedValue(new Error('save failed')) });
    Pet.findOne.mockResolvedValue(pet);

    await expect(petService.updatePet(OWNER_ID, PET_ID, { name: 'X' })).rejects.toThrow(
      'save failed'
    );
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it('propagates upload errors and does not save', async () => {
    const pet = makePetDoc({ photoUrl: OLD_URL });
    Pet.findOne.mockResolvedValue(pet);
    cloudinary.uploader.upload.mockRejectedValue(new Error('upload failed'));

    await expect(petService.updatePet(OWNER_ID, PET_ID, {}, 'new-photo.jpg')).rejects.toThrow(
      'upload failed'
    );
    expect(pet.save).not.toHaveBeenCalled();
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it('still returns the updated pet when removing the old photo fails', async () => {
    const pet = makePetDoc({ photoUrl: OLD_URL });
    Pet.findOne.mockResolvedValue(pet);
    mockUploadSuccess();
    cloudinary.uploader.destroy.mockRejectedValue(new Error('cloudinary down'));

    const result = await petService.updatePet(OWNER_ID, PET_ID, {}, 'new-photo.jpg');

    expect(result).toBe(pet);
    expect(pet.photoUrl).toBe(NEW_URL);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  describe('public id extraction (via old photo removal)', () => {
    const cases = [
      ['with version', 'https://res.cloudinary.com/demo/image/upload/v123/pets/abc.jpg', 'pets/abc'],
      ['without version', 'https://res.cloudinary.com/demo/image/upload/pets/abc.png', 'pets/abc'],
      [
        'with transformations',
        'https://res.cloudinary.com/demo/image/upload/w_200,h_200,c_fill/v123/pets/abc.webp',
        'pets/abc',
      ],
    ];

    it.each(cases)('extracts the public id %s', async (_label, oldUrl, expectedId) => {
      Pet.findOne.mockResolvedValue(makePetDoc({ photoUrl: oldUrl }));
      mockUploadSuccess();
      cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

      await petService.updatePet(OWNER_ID, PET_ID, {}, 'new-photo.jpg');

      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(expectedId);
    });

    it('skips destroy for URLs it cannot parse', async () => {
      Pet.findOne.mockResolvedValue(makePetDoc({ photoUrl: 'https://example.com/no-upload-segment' }));
      mockUploadSuccess();

      await petService.updatePet(OWNER_ID, PET_ID, {}, 'new-photo.jpg');

      expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    });
  });
});

/* -------------------------------- deletePet ------------------------------- */

describe('deletePet', () => {
  it('soft-deletes the pet by setting status to Deleted and returns the updated doc', async () => {
    const updated = makePetDoc({ status: 'Deleted' });
    Pet.findOneAndUpdate.mockResolvedValue(updated);

    const result = await petService.deletePet(OWNER_ID, PET_ID);

    expect(Pet.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: PET_ID, ownerId: OWNER_ID },
      { $set: { status: 'Deleted' } },
      { new: true }
    );
    expect(result).toBe(updated);
  });

  it('does not delete the photo (soft delete keeps it)', async () => {
    Pet.findOneAndUpdate.mockResolvedValue(makePetDoc({ status: 'Deleted', photoUrl: OLD_URL }));

    await petService.deletePet(OWNER_ID, PET_ID);

    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });

  it('is idempotent: deleting an already-deleted pet still succeeds', async () => {
    Pet.findOneAndUpdate.mockResolvedValue(makePetDoc({ status: 'Deleted' }));

    await expect(petService.deletePet(OWNER_ID, PET_ID)).resolves.toMatchObject({
      status: 'Deleted',
    });
  });

  it('throws a 404 error when the pet is not found for this owner', async () => {
    Pet.findOneAndUpdate.mockResolvedValue(null);

    await expect(petService.deletePet(OWNER_ID, PET_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Không tìm thấy thú cưng',
    });
  });
});
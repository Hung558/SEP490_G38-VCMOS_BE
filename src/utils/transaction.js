const mongoose = require('mongoose');

/**
 * Kiểm tra kết nối MongoDB hiện tại có hỗ trợ Transaction (Replica Set / Atlas / Sharded) hay không.
 * MongoDB standalone cài cục bộ (dùng cho test) không hỗ trợ multi-document transaction.
 */
const supportsMongoTransaction = () => {
  const topologyType = mongoose.connection?.client?.topology?.description?.type;
  return (
    typeof mongoose.startSession === 'function' &&
    (topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded')
  );
};

/**
 * Thực thi thao tác nhiều bước trong MongoDB Transaction nếu môi trường hỗ trợ;
 * ngược lại chạy tuần tự kèm rollback thủ công trong callback.
 */
const runWithTransaction = async (workFn) => {
  if (!supportsMongoTransaction()) {
    return workFn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await workFn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  supportsMongoTransaction,
  runWithTransaction,
};


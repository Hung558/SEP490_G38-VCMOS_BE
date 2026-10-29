const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const OTP_TTL_MS = 5 * 60 * 1000; // Mã OTP có hiệu lực trong 5 phút

// Tạo lỗi có kèm mã HTTP để controller biết trả status nào
const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Chỉ lấy các field được phép hiển thị (passwordHash và OTP đã có select: false trong model)
const PROFILE_FIELDS = 'code fullName phone email isEmailVerified role status createdAt';

// Gửi email OTP thật nếu đã cấu hình EMAIL_USER và EMAIL_PASS,
// ngược lại (môi trường dev/test chưa cấu hình Gmail) thì in ra console và báo chưa gửi mail thật.
const sendOtpEmail = async (toEmail, otp, purposeTitle = 'xác thực địa chỉ email') => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass || process.env.NODE_ENV === 'test') {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[DEV EMAIL OTP - ${purposeTitle}] Gửi tới ${toEmail} - Mã OTP: ${otp}`);
    }
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass },
  });

  await transporter.sendMail({
    from: `"VCMOS Veterinary Clinic" <${emailUser}>`,
    to: toEmail,
    subject: `[VCMOS] Mã OTP ${purposeTitle}`,
    text: `Mã OTP ${purposeTitle} tại VCMOS của bạn là: ${otp}. Mã có hiệu lực trong 5 phút.`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f7f6; padding: 32px 16px;">
        <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background-color: #0d9488; padding: 24px; text-align: center; color: #ffffff;">
            <div style="font-size: 28px; margin-bottom: 4px;">🐾</div>
            <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">PHÒNG KHÁM THÚ Y VCMOS</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Hệ thống Quản lý & Chăm sóc Thú cưng</p>
          </div>
          <div style="padding: 28px 24px; color: #1e293b; line-height: 1.6;">
            <p style="margin-top: 0;">Xin chào,</p>
            <p>Bạn vừa yêu cầu <strong>${purposeTitle}</strong> cho tài khoản tại <strong>Phòng khám Thú y VCMOS</strong>. Vui lòng sử dụng mã OTP dưới đây để hoàn tất:</p>
            <div style="margin: 24px 0; padding: 18px; background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 10px; text-align: center;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f766e;">${otp}</span>
            </div>
            <p style="font-size: 13.5px; color: #64748b; margin-bottom: 0;">
              ⏳ Mã xác thực có hiệu lực trong vòng <strong>5 phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.<br/>
            © VCMOS Veterinary Clinic Management System
          </div>
        </div>
      </div>
    `,
  });

  return true;
};

// Hàm dùng chung để sinh OTP 6 số, lưu bản băm vào DB và gửi mail
const createAndSendOtp = async (userId, toEmail, purposeTitle) => {
  const otp = String(crypto.randomInt(100000, 1000000)); // 6 chữ số từ 100000 đến 999999
  const emailOtpHash = await bcrypt.hash(otp, 10);
  const emailOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

  await User.findByIdAndUpdate(userId, {
    $set: { emailOtpHash, emailOtpExpiresAt },
  });

  const sentViaEmail = await sendOtpEmail(toEmail, otp, purposeTitle);
  return { sentViaEmail, devToken: sentViaEmail ? undefined : otp };
};

// Kiểm tra mã OTP có khớp và còn hạn không
const assertValidOtp = async (user, otp) => {
  if (!user.emailOtpHash || !user.emailOtpExpiresAt || user.emailOtpExpiresAt < new Date()) {
    throw httpError(400, 'Mã xác thực không hợp lệ hoặc đã hết hạn');
  }
  const isOtpCorrect = await bcrypt.compare(otp.trim(), user.emailOtpHash);
  if (!isOtpCorrect) {
    throw httpError(400, 'Mã xác thực không hợp lệ hoặc đã hết hạn');
  }
};

const getMyProfile = async (userId) => {
  const user = await User.findById(userId).select(PROFILE_FIELDS).lean();

  // Token vẫn hợp lệ nhưng tài khoản đã bị xoá khỏi DB
  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }

  return user;
};

// Cập nhật thông tin cá nhân:
// - Email gửi rỗng hoặc null thì xoá email khỏi document (để không đụng partial unique index).
// - Nếu người dùng đổi sang email khác hoặc xoá email thì đặt lại isEmailVerified = false.
const updateMyProfile = async (userId, fullName, phone, email) => {
  const currentUser = await User.findById(userId).select('email').lean();
  if (!currentUser) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }

  const fieldsToSet = {
    fullName: fullName.trim(),
    phone: phone.trim(),
  };

  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const updateQuery = { $set: fieldsToSet };

  if (trimmedEmail) {
    fieldsToSet.email = trimmedEmail;
    // Đổi sang địa chỉ email mới → bắt xác thực lại
    if (trimmedEmail !== currentUser.email) {
      fieldsToSet.isEmailVerified = false;
      updateQuery.$unset = { emailOtpHash: 1, emailOtpExpiresAt: 1 };
    }
  } else if (email !== undefined) {
    fieldsToSet.isEmailVerified = false;
    updateQuery.$unset = { email: 1, emailOtpHash: 1, emailOtpExpiresAt: 1 };
  }

  try {
    const user = await User.findByIdAndUpdate(userId, updateQuery, { returnDocument: 'after' })
      .select(PROFILE_FIELDS)
      .lean();

    return user;
  } catch (error) {
    // Trùng phone hoặc email với tài khoản khác (unique index chặn)
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const label = duplicateField === 'email' ? 'Email' : 'Số điện thoại';
      throw httpError(409, `${label} đã được sử dụng`);
    }
    throw error;
  }
};

// Bước 1 xác thực email: gửi OTP 6 số tới email đang lưu trong profile
const sendMyEmailOtp = async (userId) => {
  const user = await User.findById(userId).select('email isEmailVerified').lean();
  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }
  if (!user.email) {
    throw httpError(400, 'Tài khoản chưa cập nhật địa chỉ email');
  }
  if (user.isEmailVerified) {
    throw httpError(400, 'Email này đã được xác thực');
  }

  return createAndSendOtp(userId, user.email, 'xác thực địa chỉ email');
};

// Bước 2 xác thực email: kiểm tra mã OTP 6 số, đúng và còn hạn thì bật isEmailVerified = true
const verifyMyEmail = async (userId, otp) => {
  const user = await User.findById(userId)
    .select('+emailOtpHash +emailOtpExpiresAt email isEmailVerified')
    .lean();

  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }
  if (!user.email) {
    throw httpError(400, 'Tài khoản chưa cập nhật địa chỉ email');
  }
  if (user.isEmailVerified) {
    throw httpError(400, 'Email này đã được xác thực');
  }

  await assertValidOtp(user, otp);

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $set: { isEmailVerified: true },
      $unset: { emailOtpHash: 1, emailOtpExpiresAt: 1 },
    },
    { returnDocument: 'after' }
  )
    .select(PROFILE_FIELDS)
    .lean();

  return updatedUser;
};

// Quên mật khẩu - Bước 1: gửi OTP tới email ĐÃ XÁC THỰC
const forgotPassword = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select('email isEmailVerified status').lean();

  if (!user) {
    throw httpError(404, 'Không tìm thấy tài khoản với email này');
  }
  if (!user.isEmailVerified) {
    throw httpError(400, 'Email này chưa được xác thực nên không thể dùng để khôi phục mật khẩu');
  }
  if (user.status === 'Locked') {
    throw httpError(403, 'Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên');
  }

  return createAndSendOtp(user._id, user.email, 'khôi phục mật khẩu');
};

// Quên mật khẩu - Bước 2: kiểm tra OTP và đặt mật khẩu mới
const resetPassword = async (email, otp, newPassword) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail })
    .select('+emailOtpHash +emailOtpExpiresAt isEmailVerified')
    .lean();

  if (!user) {
    throw httpError(404, 'Không tìm thấy tài khoản với email này');
  }
  if (!user.isEmailVerified) {
    throw httpError(400, 'Email này chưa được xác thực');
  }

  await assertValidOtp(user, otp);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(user._id, {
    $set: { passwordHash },
    $unset: { emailOtpHash: 1, emailOtpExpiresAt: 1 },
  });
};

// Đổi mật khẩu khi đang đăng nhập - Bước 1: gửi OTP về email ĐÃ XÁC THỰC của mình
const sendChangePasswordOtp = async (userId) => {
  const user = await User.findById(userId).select('email isEmailVerified').lean();
  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }
  if (!user.email || !user.isEmailVerified) {
    throw httpError(400, 'Bạn cần xác thực địa chỉ email trước khi đổi mật khẩu');
  }

  return createAndSendOtp(userId, user.email, 'đổi mật khẩu');
};

// Đổi mật khẩu khi đang đăng nhập - Bước 2: kiểm tra mật khẩu cũ + OTP rồi lưu mật khẩu mới
const changeMyPassword = async (userId, currentPassword, newPassword, otp) => {
  const user = await User.findById(userId)
    .select('+passwordHash +emailOtpHash +emailOtpExpiresAt email isEmailVerified')
    .lean();

  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }
  if (!user.email || !user.isEmailVerified) {
    throw httpError(400, 'Bạn cần xác thực địa chỉ email trước khi đổi mật khẩu');
  }
  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw httpError(400, 'Mật khẩu hiện tại không chính xác');
  }

  await assertValidOtp(user, otp);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(userId, {
    $set: { passwordHash },
    $unset: { emailOtpHash: 1, emailOtpExpiresAt: 1 },
  });
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  sendMyEmailOtp,
  verifyMyEmail,
  forgotPassword,
  resetPassword,
  sendChangePasswordOtp,
  changeMyPassword,
};


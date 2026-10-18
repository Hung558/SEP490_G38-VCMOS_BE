// 1. Nạp biến môi trường từ tệp .env (BẮT BUỘC ĐẶT Ở DÒNG ĐẦU TIÊN)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/auth.routes');

const app = express();

// Cho phép FE gọi API
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
// Middleware để đọc dữ liệu JSON từ body request
app.use(express.json());

app.get('/', (req, res) => {
    res.send({ message: 'VCMOS API is running' });
});

app.use('/api/auth', authRoutes);

// Chỉ kết nối DB + mở port khi chạy trực tiếp (npm start); test sẽ require app mà không listen
if (require.main === module) {
    connectDB();
    const PORT = process.env.PORT || 9999;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;

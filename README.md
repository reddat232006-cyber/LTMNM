# SVTrọ Đà Nẵng — Hệ Thống Tìm Kiếm Phòng Trọ Sinh Viên & Người Lao Động (NestJS + MongoDB)

Website tìm kiếm phòng trọ toàn diện dành cho **Sinh viên** và **Người lao động (Công nhân Khu Công Nghiệp)** tại TP. Đà Nẵng, xây dựng theo kiến trúc **Full-stack** với **Backend NestJS (TypeScript)**, cơ sở dữ liệu **MongoDB (Mongoose + Geospatial `2dsphere` + Aggregation)**, **WebSocket (Socket.io)** và giao diện hiện đại hỗ trợ **Dark Mode & 4 ngôn ngữ**.

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
Ứng Dụng Nestjs vào Trang Web Tìm Kiếm Phòng Trọ/
│
├── backend/                     # 🚀 BACKEND NESTJS + MONGODB
│   ├── src/
│   │   ├── auth/                # Đăng ký (chờ Admin duyệt), Đăng nhập JWT, Bcrypt, Ghi nhật ký
│   │   ├── users/               # Phân quyền 4 vai trò, Hồ sơ cá nhân, Đổi mật khẩu, Nhật ký đăng nhập
│   │   ├── rooms/               # CRUD phòng, Multer upload ảnh thật, Lọc đa tiêu chí & Geospatial 2dsphere
│   │   ├── appointments/        # Đặt lịch xem phòng 2 chiều & Đăng ký chờ phòng trống (Waitlist)
│   │   ├── reviews/             # Đánh giá 1-5 sao & Báo cáo tin lừa đảo (Trust & Safety)
│   │   ├── stats/               # Thống kê tổng hợp & giá TB theo quận (MongoDB Aggregation)
│   │   ├── chat/                # Chat thời gian thực WebSocket (Socket.io) & Hộp thư Chủ trọ
│   │   ├── ai/                  # Trợ lý AI giải đáp & gợi ý phòng theo ngôn ngữ tự nhiên 24/7
│   │   ├── posts/               # Hệ thống Blog & Thông báo cập nhật mới (Admin xuất bản)
│   │   ├── common/              # Guards (JwtAuthGuard, RolesGuard) & Decorators (Roles, CurrentUser)
│   │   ├── seed/                # Script nạp dữ liệu mẫu ban đầu vào MongoDB
│   │   ├── app.module.ts        # Module gốc kết nối MongoDB
│   │   └── main.ts              # Khởi động NestJS, CORS, Static Uploads, Swagger UI
│   ├── uploads/                 # Thư mục lưu ảnh phòng & ảnh đại diện tải lên
│   ├── .env                     # Biến môi trường thực tế (không đẩy lên Git)
│   ├── .env.example             # Mẫu cấu hình biến môi trường
│   └── package.json             # Danh sách thư viện & scripts
│
├── index.html                   # 🎨 FRONTEND Giao diện chính (Tailwind CSS + Leaflet + Chart.js + Socket.io)
├── css/style.css                # Giao diện tùy chỉnh & Chế độ nền tối (Dark Mode)
├── js/
│   ├── data.js                  # Danh mục Quận, Trường ĐH & 5 Khu Công Nghiệp Đà Nẵng
│   └── app.js                   # Logic gọi NestJS API, WebSocket, Trợ lý AI, Blog, Đa ngôn ngữ
├── server.js                    # Web server tĩnh Node.js phục vụ Frontend (cổng 3000)
├── start.bat                    # ⚡ File khởi động nhanh 1 chạm (bật cả Backend + Frontend + Trình duyệt)
├── .gitignore                   # Bỏ qua node_modules, dist, .env khi đẩy Git
└── README.md                    # Tài liệu hướng dẫn dự án
```

---

## 🚀 Cách Khởi Chạy Dự Án

### Yêu cầu môi trường
* **Node.js** >= 18 (đã test tốt trên v20 LTS)
* **MongoDB Server** đang chạy tại `mongodb://localhost:27017`

### Cách 1: Khởi chạy nhanh 1 chạm (Khuyên dùng khi Demo)
1. Nhấp đúp chuột vào file **`start.bat`** trong thư mục gốc.
2. Hệ thống sẽ tự động mở **Backend NestJS (cổng 5000)**, **Frontend (cổng 3000)** và tự mở trình duyệt tại `http://localhost:3000`.

### Cách 2: Chạy thủ công bằng 2 cửa sổ Terminal
* **Terminal 1 — Chạy Backend NestJS (cổng `5000`):**
  ```powershell
  cd backend
  npm install        # Chỉ cần chạy lần đầu khi copy sang máy mới
  npm run start:dev
  ```
* **Terminal 2 — Chạy Frontend Web (cổng `3000`):**
  ```powershell
  node server.js
  ```

### Đường dẫn truy cập
* **Trang web chính:** [http://localhost:3000](http://localhost:3000) *(Góc trên sáng đèn **🟢 NestJS + MongoDB Live**)*
* **Tài liệu Swagger API:** [http://localhost:5000/api/docs](http://localhost:5000/api/docs)
* **Nạp lại dữ liệu mẫu (nếu cần):** chạy `npm run seed` trong thư mục `backend`

---

## 🔐 Tài Khoản Phân Quyền Mẫu (3 Vai Trò — Mật khẩu chung: `123456`)

| Vai trò | Email | Quyền hạn chính |
| :--- | :--- | :--- |
| **👑 Admin** (Phù Quốc Đạt — `0359433923`) | `admin@svtro.vn` | Toàn quyền (không thể bị khóa): Duyệt tài khoản mới, đổi quyền/khóa tài khoản khác, xem biểu đồ thống kê, xử lý báo cáo lừa đảo, viết Blog, quản lý phòng & lịch hẹn. |
| **🏠 Chủ trọ** (`landlord`) | `chutro@svtro.vn` | Đăng tin + upload ảnh thật, sửa phòng, chỉnh số điện cố định (kWh), đổi trạng thái Còn/Hết, duyệt lịch hẹn, hộp thư Chat, tính hóa đơn điện nước + mã VietQR. |
| **👤 Người thuê** (`tenant` — Gộp Sinh viên & Người lao động) | `nguoithue@svtro.vn` | Tìm phòng gần Trường ĐH & 5 KCN Đà Nẵng, tìm quanh tôi 3km, lọc ở ghép hợp gu, so sánh phòng, tính tiền chia đầu người, đặt lịch & theo dõi lịch hẹn, đăng ký chờ phòng trống, chat trực tiếp, tạo hợp đồng mẫu PDF, đánh giá/báo cáo lừa đảo và thả tim/bình luận Blog. |

> *Lưu ý: Mọi tài khoản đăng ký mới đều ở trạng thái **Chờ duyệt (`pending`)** và cần **Admin phê duyệt** trước khi được đăng nhập.*

---

## ✨ Danh Sách Tính Năng Đầy Đủ

1. **Tìm kiếm & Bộ lọc toàn diện:** Từ khóa, Quận/Huyện, Trường ĐH, **5 Khu Công Nghiệp Đà Nẵng** (*Hòa Khánh, Hòa Cầm, An Đồn, Thọ Quang, Khu Công Nghệ Cao*), mức giá, loại hình, tình trạng Còn/Hết, tiện ích đi làm ca, **Tìm quanh tôi 3km (MongoDB 2dsphere)** và **Tìm ở ghép hợp gu**.
2. **Bản đồ tương tác trong từng bài đăng:** Giao diện trang chủ 3 cột thoáng rộng; bấm **Chi tiết** phòng sẽ hiện bản đồ Đường phố / Vệ tinh phóng đúng vị trí phòng kèm ghim Trường ĐH/KCN và chỉ đường Google Maps.
3. **Phân quyền 4 vai trò (RBAC) & Bảo mật:** JWT + Bcrypt, luồng đăng ký gửi Admin duyệt, bảo vệ tài khoản Admin không thể bị khóa, siết chặt quyền đăng tin & chỉnh số điện chỉ cho Chủ nhà và Admin.
4. **Hồ sơ cá nhân & Nhật ký đăng nhập:** Upload ảnh đại diện thật từ máy, cập nhật thông tin, đổi mật khẩu bảo mật và xem lịch sử 20 lần đăng nhập gần nhất (Thời gian, IP, thiết bị, trạng thái).
5. **Tiện ích thực tế cho người thuê & chủ trọ:**
   * **⚖️ So sánh 2–3 phòng** cạnh nhau + **🧮 Máy tính dự toán chi phí / người**.
   * **📝 Tạo & In Hợp đồng thuê trọ mẫu (PDF)** 1 chạm.
   * **🧾 Tính hóa đơn điện nước hàng tháng + Mã QR VietQR** (copy gửi Zalo / in phiếu thu).
   * **📅 Đặt lịch hẹn 2 chiều** + **🔔 Đăng ký chờ phòng trống (Waitlist)**.
6. **Tương tác & Thông minh:**
   * **💬 Chat trực tiếp thời gian thực** (NestJS WebSocket / Socket.io) + Hộp thư tập trung cho Chủ trọ.
   * **🤖 Trợ lý AI 24/7** tư vấn phòng theo ngôn ngữ tự nhiên từ MongoDB & giải đáp thắc mắc.
   * **📰 Hệ thống Blog & Thông báo cập nhật** (Admin xuất bản, ghim bài, upload ảnh bìa).
   * **📊 Biểu đồ thống kê Admin** (MongoDB Aggregation + Chart.js).
7. **Trải nghiệm người dùng:** **☰ Menu Tổng Hợp** đóng/mở tiện lợi, **Avatar dropdown** hỗ trợ chuyển đổi tài khoản nhanh, **Chế độ Sáng/Tối (Dark Mode)** và **4 ngôn ngữ** (*Tiếng Việt, English, 한국어, 日本語*).

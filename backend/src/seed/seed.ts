import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phong_tro';

// Schema User thu nhỏ cho seed
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  fullName: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'student' },
  approvalStatus: { type: String, default: 'approved' },
  registerReason: { type: String, default: '' },
  avatar: { type: String, default: '' },
  isVerified: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Schema Room thu nhỏ cho seed
const RoomSchema = new mongoose.Schema({
  title: String,
  price: Number,
  area: Number,
  district: String,
  districtName: String,
  address: String,
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number], // [lng, lat]
  },
  targetAudience: { type: String, default: 'all' },
  nearPlaceId: String,
  nearPlaceName: String,
  distance: String,
  type: String,
  status: { type: String, default: 'available' },
  availableCount: { type: Number, default: 1 },
  amenities: [String],
  images: [String],
  phone: String,
  zalo: String,
  electricity: String,
  water: String,
  description: String,
  verified: Boolean,
  isHot: Boolean,
  isApproved: { type: Boolean, default: true },
  landlordId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });

RoomSchema.index({ location: '2dsphere' });

async function seedData() {
  console.log(`📡 Đang kết nối tới MongoDB: ${MONGODB_URI} ...`);
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Đã kết nối MongoDB thành công!');

  const User = mongoose.model('User', UserSchema);
  const Room = mongoose.model('Room', RoomSchema);

  // Xóa dữ liệu cũ nếu muốn làm mới
  await User.deleteMany({});
  await Room.deleteMany({});
  console.log('🧹 Đã dọn dẹp các collection cũ.');

  const passwordHash = await bcrypt.hash('123456', 10);

  // 1. Tạo đầy đủ 4 nhóm tài khoản phân quyền (Admin, Chủ trọ, Sinh viên, Người lao động)
  const adminUser = await User.create({
    email: 'admin@svtro.vn',
    phone: '0359433923',
    fullName: 'Phù Quốc Đạt',
    passwordHash,
    role: 'admin',
    approvalStatus: 'approved',
    isVerified: true,
  });

  const landlordUser = await User.create({
    email: 'chutro@svtro.vn',
    phone: '0905123456',
    fullName: 'Cô Mai - Chủ Trọ Đà Nẵng',
    passwordHash,
    role: 'landlord',
    isVerified: true,
  });

  const tenantUser = await User.create({
    email: 'nguoithue@svtro.vn',
    phone: '0914222333',
    fullName: 'Nguyễn Minh Quân (Người thuê)',
    passwordHash,
    role: 'tenant',
    approvalStatus: 'approved',
    isVerified: true,
  });

  // Tài khoản mẫu đang chờ Admin duyệt
  await User.create({
    email: 'chutro.moi@gmail.com',
    phone: '0905666777',
    fullName: 'Chú Tám - Dãy trọ Hòa Khánh',
    passwordHash,
    role: 'landlord',
    approvalStatus: 'pending',
    registerReason: 'Tôi có dãy trọ 12 phòng mới xây gần KCN Hòa Khánh, muốn đăng ký tài khoản để đăng tin cho thuê.',
    isVerified: false,
  });

  console.log('👤 Đã tạo 3 tài khoản đã duyệt (Admin, Chủ trọ, Người thuê) + 1 yêu cầu chờ duyệt (mật khẩu: 123456)');
  console.log('   - Admin:      admin@svtro.vn / 123456');
  console.log('   - Chủ trọ:    chutro@svtro.vn / 123456');
  console.log('   - Người thuê: nguoithue@svtro.vn / 123456');

  // 2. Tạo danh sách phòng mẫu (Cả Sinh viên và Người lao động / KCN)
  const sampleRooms = [
    // --- PHÒNG DÀNH CHO SINH VIÊN (Gần các trường ĐH) ---
    {
      title: 'Căn hộ Studio Full đồ kiệt Xô Viết Nghệ Tĩnh - Sát vách ĐH Đông Á & Kiến Trúc',
      price: 2800000,
      area: 28,
      district: 'hai-chau',
      districtName: 'Quận Hải Châu',
      address: 'Kiệt 48 Xô Viết Nghệ Tĩnh, P. Hòa Cường Nam, Q. Hải Châu, TP. Đà Nẵng',
      location: { type: 'Point', coordinates: [108.2205, 16.0318] },
      targetAudience: 'student',
      nearPlaceId: 'uda',
      nearPlaceName: 'ĐH Đông Á (UDA)',
      distance: '180m',
      type: 'studio',
      status: 'available',
      availableCount: 2,
      amenities: ['may-lanh', 'may-giat', 'tu-lanh', 've-sinh-rieng', 'ban-cong', 'gio-tu-do', 'wifi', 'khoa-van-tay'],
      images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80'],
      phone: '0905.334.889',
      zalo: '0905334889',
      electricity: '3.200đ / kWh',
      water: '50.000đ / người',
      description: 'Căn hộ Studio thiết kế phong cách hiện đại, bếp nấu ăn riêng biệt không ám mùi, máy giặt riêng, giường nệm cao su non. Đi bộ 2 phút đến giảng đường ĐH Đông Á và ĐH Kiến Trúc Đà Nẵng. Siêu gần Lotte Mart.',
      verified: true,
      isHot: true,
      landlordId: landlordUser._id,
    },
    {
      title: 'Phòng trọ gác lửng đúc kiệt Nguyễn Lương Bằng - Đi bộ 3 phút sang Bách Khoa',
      price: 1600000,
      area: 20,
      district: 'lien-chieu',
      districtName: 'Quận Liên Chiểu',
      address: 'Kiệt 54 Nguyễn Lương Bằng, P. Hòa Khánh Bắc, Q. Liên Chiểu, TP. Đà Nẵng',
      location: { type: 'Point', coordinates: [108.1518, 16.0772] },
      targetAudience: 'student',
      nearPlaceId: 'dut',
      nearPlaceName: 'ĐH Bách Khoa (DUT)',
      distance: '250m',
      type: 'phong-tro',
      status: 'available',
      availableCount: 3,
      amenities: ['gac-lung', 'may-lanh', 've-sinh-rieng', 'gio-tu-do', 'wifi', 'khoa-van-tay'],
      images: ['https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80'],
      phone: '0905.123.456',
      zalo: '0905123456',
      electricity: '3.000đ / kWh',
      water: '50.000đ / người',
      description: 'Phòng trọ sinh viên mới sơn sửa, gác lửng đúc kiên cố đứng thoải mái. Khóa cổng vân tay camera an ninh 24/7. Cực gần chợ Hòa Khánh và cổng trường Bách Khoa, không ngập nước mùa mưa.',
      verified: true,
      isHot: true,
      landlordId: landlordUser._id,
    },
    {
      title: 'Studio tiện nghi ban công đón nắng Núi Thành - Gần ĐH Đông Á & Kiến Trúc',
      price: 3200000,
      area: 32,
      district: 'hai-chau',
      districtName: 'Quận Hải Châu',
      address: 'Kiệt 512 Núi Thành, P. Hòa Cường Nam, Q. Hải Châu, TP. Đà Nẵng',
      location: { type: 'Point', coordinates: [108.2225, 16.0331] },
      targetAudience: 'student',
      nearPlaceId: 'dau',
      nearPlaceName: 'ĐH Kiến Trúc Đà Nẵng',
      distance: '200m',
      type: 'studio',
      status: 'available',
      availableCount: 1,
      amenities: ['may-lanh', 'may-giat', 'tu-lanh', 've-sinh-rieng', 'ban-cong', 'gio-tu-do', 'wifi', 'thang-may'],
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80'],
      phone: '0914.556.778',
      zalo: '0914556778',
      electricity: '3.500đ / kWh',
      water: '60.000đ / người',
      description: 'Căn hộ Studio thoáng đãng, ban công view thành phố lộng gió. Đầy đủ bếp từ, hút mùi, sofa tiếp khách nhỏ.',
      verified: true,
      isHot: false,
      landlordId: landlordUser._id,
    },
    {
      title: 'Phòng trọ khép kín Nam Kỳ Khởi Nghĩa - Sát ĐH CNTT Việt Hàn (VKU) & FPT',
      price: 1300000,
      area: 18,
      district: 'ngu-hanh-son',
      districtName: 'Quận Ngũ Hành Sơn',
      address: 'Đường Nam Kỳ Khởi Nghĩa, P. Hòa Quý, Q. Ngũ Hành Sơn, TP. Đà Nẵng',
      location: { type: 'Point', coordinates: [108.2515, 15.9760] },
      targetAudience: 'student',
      nearPlaceId: 'vku',
      nearPlaceName: 'ĐH CNTT & TT Việt - Hàn (VKU)',
      distance: '300m',
      type: 'phong-tro',
      status: 'available',
      availableCount: 2,
      amenities: ['gac-lung', 've-sinh-rieng', 'gio-tu-do', 'wifi', 'cho-de-xe'],
      images: ['https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80'],
      phone: '0905.889.900',
      zalo: '0905889900',
      electricity: '3.000đ / kWh',
      water: '40.000đ / người',
      description: 'Phòng trọ giá rẻ sinh viên VKU & FPT, khu vực yên tĩnh thoáng mát, an ninh cực kỳ đảm bảo, có sân phơi đồ rộng.',
      verified: true,
      isHot: false,
      landlordId: landlordUser._id,
    },

    // --- PHÒNG DÀNH CHO NGƯỜI LAO ĐỘNG & CÔNG NHÂN (Gần các Khu Công Nghiệp) ---
    {
      title: 'Dãy trọ công nhân kiệt Âu Cơ - Cách KCN Hòa Khánh chỉ 500m, giờ giấc tự do',
      price: 1200000,
      area: 18,
      district: 'lien-chieu',
      districtName: 'Quận Liên Chiểu',
      address: 'Kiệt 120 Âu Cơ, P. Hòa Khánh Bắc, Q. Liên Chiểu, TP. Đà Nẵng',
      location: { type: 'Point', coordinates: [108.1402, 16.0815] },
      targetAudience: 'worker',
      nearPlaceId: 'kcn-hoa-khanh',
      nearPlaceName: 'KCN Hòa Khánh',
      distance: '500m',
      type: 'phong-tro',
      status: 'available',
      availableCount: 4,
      amenities: ['gac-lung', 've-sinh-rieng', 'gio-tu-do', 'wifi', 'khoa-van-tay'],
      images: ['https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80'],
      phone: '0905.777.666',
      zalo: '0905777666',
      electricity: '2.800đ / kWh',
      water: '40.000đ / người',
      description: 'Phòng trọ chuyên phục vụ anh chị em công nhân làm ca tại KCN Hòa Khánh. Giờ giấc tự do 24/24, cổng vân tay an toàn, sân để xe máy rộng rãi.',
      verified: true,
      isHot: true,
      landlordId: landlordUser._id,
    },
    {
      title: 'Phòng trọ gác đúc kiệt Cách Mạng Tháng 8 - Ngay sát KCN Hòa Cầm & ĐH Ngoại Ngữ',
      price: 1500000,
      area: 22,
      district: 'cam-le',
      districtName: 'Quận Cẩm Lệ',
      address: 'Kiệt 890 Cách Mạng Tháng 8, P. Hòa Thọ Tây, Q. Cẩm Lệ, TP. Đà Nẵng',
      location: { type: 'Point', coordinates: [108.1905, 16.0140] },
      targetAudience: 'worker',
      nearPlaceId: 'kcn-hoa-cam',
      nearPlaceName: 'KCN Hòa Cầm',
      distance: '600m',
      type: 'phong-tro',
      status: 'available',
      availableCount: 2,
      amenities: ['gac-lung', 'may-lanh', 've-sinh-rieng', 'gio-tu-do', 'wifi'],
      images: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80'],
      phone: '0935.222.333',
      zalo: '0935222333',
      electricity: '3.000đ / kWh',
      water: '50.000đ / người',
      description: 'Vị trí đắc địa ngay cạnh Khu Công Nghiệp Hòa Cầm, tiện cho người lao động đi làm. Đường bê tông 4m thông thoáng, không ngập úng.',
      verified: true,
      isHot: false,
      landlordId: landlordUser._id,
    },
    {
      title: 'Căn hộ mini 1PN Ngô Quyền - Gần KCN An Đồn & KCN Dịch vụ Thủy sản Thọ Quang',
      price: 2400000,
      area: 30,
      district: 'son-tra',
      districtName: 'Quận Sơn Trà',
      address: 'Đường Ngô Quyền, P. An Hải Bắc, Q. Sơn Trà, TP. Đà Nẵng',
      location: { type: 'Point', coordinates: [108.2410, 16.0730] },
      targetAudience: 'worker',
      nearPlaceId: 'kcn-an-don',
      nearPlaceName: 'KCN An Đồn',
      distance: '400m',
      type: 'ccmn',
      status: 'available',
      availableCount: 1,
      amenities: ['may-lanh', 'may-giat', 've-sinh-rieng', 'gio-tu-do', 'wifi', 'thang-may'],
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80'],
      phone: '0905.444.555',
      zalo: '0905444555',
      electricity: '3.200đ / kWh',
      water: '50.000đ / người',
      description: 'Căn hộ mini phù hợp cho gia đình trẻ hoặc nhân viên văn phòng, người lao động làm việc tại KCN An Đồn và Thọ Quang. Gần cầu sông Hàn.',
      verified: true,
      isHot: false,
      landlordId: landlordUser._id,
    },
  ];

  await Room.insertMany(sampleRooms);
  console.log(`🏠 Đã nạp thành công ${sampleRooms.length} phòng trọ (cả Sinh viên & Người lao động / KCN) vào MongoDB!`);

  console.log('🎉 Hoàn thành nạp dữ liệu mẫu!');
  await mongoose.disconnect();
}

seedData().catch((err) => {
  console.error('❌ Lỗi nạp seed data:', err);
  process.exit(1);
});

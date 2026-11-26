import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument } from '../rooms/schemas/room.schema';

@Injectable()
export class AiService {
  constructor(@InjectModel(Room.name) private roomModel: Model<RoomDocument>) {}

  // Chuẩn hóa tiếng Việt không dấu để phân tích câu hỏi chính xác
  private normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
  }

  // Trích xuất ngân sách tối đa từ câu hỏi (vd: "dưới 2 triệu", "1.5tr", "2tr5")
  private extractMaxPrice(norm: string): number | null {
    // Dạng "2tr5", "1tr8"
    const mShort = norm.match(/(\d+)\s*tr\s*(\d)/);
    if (mShort) {
      return parseInt(mShort[1], 10) * 1000000 + parseInt(mShort[2], 10) * 100000;
    }
    // Dạng "1.5 trieu", "2 trieu", "2,5tr"
    const mDec = norm.match(/(\d+(?:[.,]\d+)?)\s*(trieu|tr\b)/);
    if (mDec) {
      return Math.round(parseFloat(mDec[1].replace(',', '.')) * 1000000);
    }
    // Dạng "1500k", "1800k"
    const mK = norm.match(/(\d{3,4})\s*k\b/);
    if (mK) {
      return parseInt(mK[1], 10) * 1000;
    }
    return null;
  }

  async handleChat(question: string) {
    const raw = (question || '').trim();
    const norm = this.normalize(raw);

    if (!raw) {
      return {
        reply: 'Xin chào! Bạn cần tìm phòng trọ ở khu vực nào, mức giá bao nhiêu hay cần hỗ trợ sử dụng web SVTrọ Đà Nẵng?',
        suggestedRooms: [],
      };
    }

    // 1. Chào hỏi
    if (/^(xin chao|chao|hello|hi|hey|alo)\b/.test(norm) && norm.length < 25) {
      return {
        reply:
          '👋 Xin chào bạn đến với **SVTrọ Đà Nẵng**! Tôi là Trợ lý AI hỗ trợ 24/7.\n\nBạn có thể hỏi tôi:\n• Tìm phòng theo trường ĐH / Khu Công Nghiệp & mức giá (VD: *"Tìm trọ gần KCN Hòa Khánh dưới 1.5 triệu"*)\n• Phòng nào đang rẻ nhất / còn trống\n• Hướng dẫn đăng ký tài khoản, đặt lịch xem phòng hoặc mẹo tránh lừa đảo cọc trọ!',
        suggestedRooms: [],
      };
    }

    // 2. Giải đáp về Lừa đảo / Cọc ảo / Báo cáo
    if (norm.includes('lua dao') || norm.includes('coc') || norm.includes('bao cao') || norm.includes('scam') || norm.includes('an toan')) {
      return {
        reply:
          '🛡️ **Mẹo phòng tránh lừa đảo khi thuê trọ tại Đà Nẵng:**\n1. **Tuyệt đối không chuyển tiền cọc trước** khi chưa đến xem phòng trực tiếp và gặp đúng chủ nhà.\n2. Kiểm tra kỹ hợp đồng, ghi rõ giá điện, giá nước và điều kiện trả cọc.\n3. Trên SVTrọ, bạn có thể bấm nút **🛡️ (khiên)** trong chi tiết phòng để xem đánh giá thực tế hoặc **Báo cáo tin lừa đảo** gửi thẳng cho Admin xử lý ngay lập tức.',
        suggestedRooms: [],
      };
    }

    // 3. Giải đáp về Đăng ký tài khoản / Admin duyệt / Đăng tin
    if (norm.includes('dang ky') || norm.includes('tao tai khoan') || norm.includes('duyet') || norm.includes('dang tin')) {
      return {
        reply:
          '📝 **Hướng dẫn đăng ký tài khoản & đăng tin trên SVTrọ:**\n1. Bấm nút **Đăng nhập** ở góc trên bên phải → chọn tab **Đăng ký tài khoản**.\n2. Chọn vai trò (**Chủ trọ / Sinh viên / Người lao động**), điền thông tin và **thông tin xác minh** rồi bấm gửi.\n3. Yêu cầu sẽ được chuyển tới **Admin phê duyệt** (để đảm bảo chống tin rác & lừa đảo). Sau khi Admin duyệt, bạn có thể đăng nhập và bấm **+ Đăng tin** (hỗ trợ tải tối đa 5 ảnh thật từ máy tính).',
        suggestedRooms: [],
      };
    }

    // 4. Giải đáp về Đặt lịch xem phòng / Chat trực tiếp / So sánh / Dự toán
    if (norm.includes('dat lich') || norm.includes('hen xem') || norm.includes('so sanh') || norm.includes('tinh chi phi') || norm.includes('chat')) {
      return {
        reply:
          '✨ **Các tiện ích hỗ trợ bạn tìm phòng nhanh trên SVTrọ:**\n• **📅 Đặt lịch xem:** Mở chi tiết phòng → bấm **Đặt lịch** để chọn ngày giờ, sau đó theo dõi trạng thái xác nhận ở mục **Lịch hẹn** trên thanh menu.\n• **💬 Chat trực tiếp:** Nhắn tin thời gian thực với chủ trọ ngay trên web.\n• **⚖️ So sánh phòng:** Bấm biểu tượng cân trên 2–3 phòng để so sánh giá, diện tích và tiện ích song song.\n• **🧮 Dự toán chi phí:** Có sẵn máy tính chia tiền phòng + điện + nước theo số người ở ngay trong chi tiết phòng.',
        suggestedRooms: [],
      };
    }

    // 5. Truy vấn dữ liệu phòng trọ THỰC TẾ từ MongoDB theo ngôn ngữ tự nhiên
    const allRooms = await this.roomModel.find({ isApproved: true }).exec();
    const maxPrice = this.extractMaxPrice(norm);

    // Map từ khóa khu vực / Trường ĐH / KCN
    const placeKeywords: { keys: string[]; placeId?: string; district?: string; label: string }[] = [
      { keys: ['bach khoa', 'dut'], placeId: 'dut', label: 'ĐH Bách Khoa (DUT)' },
      { keys: ['kinh te', 'due'], placeId: 'due', label: 'ĐH Kinh Tế (DUE)' },
      { keys: ['dong a', 'uda'], placeId: 'uda', label: 'ĐH Đông Á (UDA)' },
      { keys: ['kien truc', 'dau'], placeId: 'dau', label: 'ĐH Kiến Trúc (DAU)' },
      { keys: ['su pham', 'ued'], placeId: 'ued', label: 'ĐH Sư Phạm (UED)' },
      { keys: ['duy tan', 'dtu'], placeId: 'dtu', label: 'ĐH Duy Tân (DTU)' },
      { keys: ['ngoai ngu', 'ufls'], placeId: 'ufls', label: 'ĐH Ngoại Ngữ (UFLS)' },
      { keys: ['viet han', 'vku', 'fpt'], placeId: 'vku', label: 'ĐH Việt - Hàn (VKU) & FPT' },
      { keys: ['hoa khanh'], placeId: 'kcn-hoa-khanh', label: 'KCN Hòa Khánh' },
      { keys: ['hoa cam'], placeId: 'kcn-hoa-cam', label: 'KCN Hòa Cầm' },
      { keys: ['an don'], placeId: 'kcn-an-don', label: 'KCN An Đồn' },
      { keys: ['tho quang'], placeId: 'kcn-tho-quang', label: 'KCN Thọ Quang' },
      { keys: ['lien chieu'], district: 'lien-chieu', label: 'Quận Liên Chiểu' },
      { keys: ['hai chau'], district: 'hai-chau', label: 'Quận Hải Châu' },
      { keys: ['cam le'], district: 'cam-le', label: 'Quận Cẩm Lệ' },
      { keys: ['son tra'], district: 'son-tra', label: 'Quận Sơn Trà' },
      { keys: ['ngu hanh son'], district: 'ngu-hanh-son', label: 'Quận Ngũ Hành Sơn' },
      { keys: ['thanh khe'], district: 'thanh-khe', label: 'Quận Thanh Khê' },
    ];

    const matchedPlace = placeKeywords.find((p) => p.keys.some((k) => norm.includes(k)));
    const wantWorker = norm.includes('cong nhan') || norm.includes('lao dong') || norm.includes('kcn') || norm.includes('khu cong nghiep');
    const wantStudent = norm.includes('sinh vien') || norm.includes('sv ') || norm.includes('dai hoc');
    const wantStudio = norm.includes('studio');
    const wantCheapest = norm.includes('re nhat') || norm.includes('gia re') || norm.includes('tiet kiem');
    const wantAC = norm.includes('may lanh') || norm.includes('dieu hoa');
    const wantLoft = norm.includes('gac lung') || norm.includes('gac duc') || norm.includes('co gac');

    // Chấm điểm từng phòng theo độ khớp yêu cầu
    let candidates = allRooms.filter((r) => r.status !== 'full');

    if (matchedPlace) {
      const byPlace = candidates.filter(
        (r) =>
          (matchedPlace.placeId && r.nearPlaceId === matchedPlace.placeId) ||
          (matchedPlace.district && r.district === matchedPlace.district),
      );
      if (byPlace.length > 0) candidates = byPlace;
    }

    if (wantWorker && !matchedPlace) {
      const byWorker = candidates.filter((r) => r.targetAudience === 'worker' || (r.nearPlaceId || '').startsWith('kcn'));
      if (byWorker.length > 0) candidates = byWorker;
    } else if (wantStudent && !matchedPlace) {
      const byStudent = candidates.filter((r) => r.targetAudience === 'student');
      if (byStudent.length > 0) candidates = byStudent;
    }

    if (wantStudio) {
      const byStudio = candidates.filter((r) => r.type === 'studio');
      if (byStudio.length > 0) candidates = byStudio;
    }

    if (maxPrice) {
      const byPrice = candidates.filter((r) => r.price <= maxPrice);
      if (byPrice.length > 0) candidates = byPrice;
    }

    if (wantAC) {
      const byAc = candidates.filter((r) => (r.amenities || []).includes('may-lanh'));
      if (byAc.length > 0) candidates = byAc;
    }

    if (wantLoft) {
      const byLoft = candidates.filter((r) => (r.amenities || []).includes('gac-lung'));
      if (byLoft.length > 0) candidates = byLoft;
    }

    // Sắp xếp theo giá tăng dần nếu hỏi rẻ nhất hoặc có ngân sách
    if (wantCheapest || maxPrice) {
      candidates = [...candidates].sort((a, b) => a.price - b.price);
    }

    const topRooms = candidates.slice(0, 3).map((r) => ({
      id: r._id,
      title: r.title,
      price: r.price,
      area: r.area,
      nearPlaceName: r.nearPlaceName,
      distance: r.distance,
      image: (r.images && r.images[0]) || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=400&q=80',
    }));

    // Nếu người dùng có ý định tìm phòng / hỏi giá / hỏi khu vực
    const isRoomIntent =
      matchedPlace ||
      maxPrice ||
      wantWorker ||
      wantStudent ||
      wantStudio ||
      wantCheapest ||
      wantAC ||
      wantLoft ||
      norm.includes('tim phong') ||
      norm.includes('phong tro') ||
      norm.includes('goi y') ||
      norm.includes('bao nhieu tien') ||
      norm.includes('con phong');

    if (isRoomIntent && topRooms.length > 0) {
      const criteria: string[] = [];
      if (matchedPlace) criteria.push(`khu vực **${matchedPlace.label}**`);
      if (wantWorker && !matchedPlace) criteria.push('đối tượng **Người lao động / KCN**');
      if (wantStudio) criteria.push('loại **Studio**');
      if (maxPrice) criteria.push(`ngân sách **≤ ${(maxPrice / 1000000).toFixed(1).replace('.0', '')} triệu/tháng**`);
      if (wantCheapest) criteria.push('**giá rẻ tiết kiệm nhất**');
      if (wantAC) criteria.push('có **máy lạnh**');
      if (wantLoft) criteria.push('có **gác lửng**');

      const summary = criteria.length > 0 ? `theo tiêu chí ${criteria.join(', ')}` : 'đang còn trống tốt nhất hiện tại';

      return {
        reply: `🤖 Dựa trên dữ liệu thực tế từ MongoDB, tôi gợi ý cho bạn **${topRooms.length} phòng phù hợp nhất** ${summary}. Bạn bấm trực tiếp vào thẻ phòng bên dưới để xem chi tiết nhé:`,
        suggestedRooms: topRooms,
      };
    }

    // Câu trả lời mặc định thông minh kèm gợi ý
    return {
      reply:
        `🤖 Tôi đã ghi nhận câu hỏi: *"${raw}"*.\n\nHiện tại hệ thống đang có **${allRooms.filter((r) => r.status !== 'full').length} phòng còn trống** tại Đà Nẵng (từ **1.2 triệu – 3.2 triệu/tháng**). Bạn hãy thử hỏi cụ thể hơn nhé, ví dụ:\n• *"Tìm trọ gần Bách Khoa dưới 2 triệu"*\n• *"Phòng cho công nhân gần KCN Hòa Khánh"*\n• *"Làm sao đặt lịch xem phòng?"*\n• *"Mẹo tránh lừa đảo cọc trọ"*`,
      suggestedRooms: topRooms.slice(0, 2),
    };
  }
}

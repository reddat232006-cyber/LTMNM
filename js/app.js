// Cấu hình kết nối Backend NestJS & MongoDB
const API_BASE_URL = "http://localhost:5000/api";
let isBackendOnline = false;

// Trạng thái xác thực & phân quyền (JWT)
let authToken = localStorage.getItem("svtro_token") || null;
let currentUser = JSON.parse(localStorage.getItem("svtro_user") || "null");

const roleMeta = {
  admin: { label: "👑 Admin", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  landlord: { label: "🏠 Chủ trọ", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  tenant: { label: "👤 Người thuê", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  student: { label: "👤 Người thuê", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  worker: { label: "👤 Người thuê", cls: "bg-blue-100 text-blue-700 border-blue-200" }
};

function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

function canManageRooms() {
  return currentUser && (currentUser.role === "admin" || currentUser.role === "landlord");
}

function canEditRoom(room) {
  if (!currentUser || !room) return false;
  if (currentUser.role === "admin") return true;
  if (currentUser.role !== "landlord") return false;
  const ownerId = room.landlordId && typeof room.landlordId === "object"
    ? (room.landlordId._id || room.landlordId.id)
    : room.landlordId;
  return !!ownerId && String(ownerId) === String(currentUser.id);
}

// Khởi tạo trạng thái ứng dụng cho khu vực ĐÀ NẴNG
let rooms = [];
let map = null;
let markersLayer = null;
let uniMarkersLayer = null;
let indZoneMarkersLayer = null;
let savedFavorites = JSON.parse(localStorage.getItem("svtro_favorites") || "[]");

// Tên hiển thị các tiện ích
const amenityLabels = {
  "may-lanh": { name: "Máy lạnh", icon: "fa-snowflake" },
  "gac-lung": { name: "Gác lửng", icon: "fa-arrow-up-right-dots" },
  "may-giat": { name: "Máy giặt", icon: "fa-soap" },
  "tu-lanh": { name: "Tủ lạnh", icon: "fa-cube" },
  "ve-sinh-rieng": { name: "WC riêng", icon: "fa-bath" },
  "gio-tu-do": { name: "Giờ tự do", icon: "fa-clock" },
  "wifi": { name: "Wifi tốc độ cao", icon: "fa-wifi" },
  "khoa-van-tay": { name: "Khóa vân tay", icon: "fa-fingerprint" },
  "ban-cong": { name: "Ban công", icon: "fa-sun" },
  "thang-may": { name: "Thang máy", icon: "fa-elevator" },
  "cho-de-xe": { name: "Chỗ để xe", icon: "fa-motorcycle" },
  "tu-do-ca-nhan": { name: "Tủ đồ cá nhân", icon: "fa-lock" }
};

const roomTypeLabels = {
  "all": "Tất cả loại phòng",
  "studio": "Căn hộ Studio",
  "phong-tro": "Phòng trọ khép kín",
  "ccmn": "Chung cư mini / 2PN",
  "ktx": "Ký túc xá / Sleepbox",
  "o-ghep": "Tìm ở ghép"
};

// Hàm định dạng tiền tệ VNĐ
function formatCurrency(amount) {
  if (amount >= 1000000) {
    const millions = (amount / 1000000).toFixed(1).replace('.0', '');
    return `${millions} triệu/tháng`;
  }
  return `${amount.toLocaleString('vi-VN')} đ/tháng`;
}

// Tạo link dẫn đường Google Maps từ tọa độ thực tế
function getGoogleMapsUrl(lat, lng, address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Tạo huy hiệu tình trạng phòng
function getStatusBadge(status, count) {
  if (status === "full") {
    return `<span class="bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1"><i class="fa-solid fa-circle-xmark text-[10px]"></i> Đã hết phòng</span>`;
  } else if (status === "available-soon") {
    return `<span class="bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1"><i class="fa-solid fa-clock text-[10px]"></i> Sắp trống</span>`;
  } else {
    return `<span class="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> Còn ${count || 1} phòng</span>`;
  }
}

// Khởi tạo ứng dụng khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", async () => {
  const storedRooms = localStorage.getItem("svtro_rooms_danang_v4");
  rooms = storedRooms ? JSON.parse(storedRooms) : [...initialRooms];

  populateSelects();
  applySavedTheme();
  applySavedLanguage();
  renderAuthHeader();
  updateTimeGreeting();
  renderSkeletonRooms();
  initMap();
  setupEventListeners();
  updateFavoritesCount();

  // Kiểm tra kết nối Backend NestJS & tải dữ liệu MongoDB
  await checkBackendHealthAndLoad();
  if (!isBackendOnline) renderRooms(rooms);
  renderRecentRooms();
  await loadRoomRequests();
  await loadBlogPosts();
  await loadNotifications();
  setInterval(loadNotifications, 30000);

  // Đảm bảo bản đồ load đầy đủ mảnh gạch (tile) không bị trắng xám
  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 350);
});

// Kiểm tra sức khỏe Backend NestJS và nạp dữ liệu từ MongoDB
async function checkBackendHealthAndLoad() {
  const pill = document.getElementById("backend-status-pill");
  const dot = document.getElementById("backend-status-dot");
  const text = document.getElementById("backend-status-text");

  try {
    const res = await fetch(`${API_BASE_URL}/rooms`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      isBackendOnline = true;

      if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-ping";
      if (pill) pill.className = "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300";
      if (text) text.innerHTML = `<i class="fa-solid fa-server text-emerald-600"></i> NestJS + MongoDB Live`;

      if (data && data.rooms && data.rooms.length > 0) {
        rooms = data.rooms.map(r => ({
          id: r._id,
          title: r.title,
          price: r.price,
          area: r.area,
          district: r.district,
          districtName: r.districtName,
          address: r.address,
          nearUni: r.nearPlaceId || 'all',
          nearUniName: r.nearPlaceName || 'Đà Nẵng',
          distance: r.distance || 'Gần',
          lat: (r.location && r.location.coordinates) ? r.location.coordinates[1] : 16.0544,
          lng: (r.location && r.location.coordinates) ? r.location.coordinates[0] : 108.2022,
          type: r.type,
          status: r.status,
          targetAudience: r.targetAudience || 'all',
          availableCount: r.availableCount || 1,
          amenities: r.amenities || [],
          images: (r.images && r.images.length > 0) ? r.images : ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80"],
          image: (r.images && r.images.length > 0) ? r.images[0] : "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
          phone: r.phone,
          zalo: r.zalo,
          electricity: r.electricity || '3.200đ / kWh',
          estimatedKwh: r.estimatedKwh || 80,
          water: r.water || '50.000đ / người',
          description: r.description || '',
          verified: r.verified !== false,
          isHot: !!r.isHot,
          landlordId: r.landlordId && typeof r.landlordId === 'object' ? (r.landlordId._id || '') : (r.landlordId || ''),
          landlordName: r.landlordId && typeof r.landlordId === 'object' ? (r.landlordId.fullName || '') : ''
        }));
        renderRooms(rooms);
      }
      return;
    }
  } catch (err) {
    // Backend chưa bật
  }

  if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400";
  if (pill) pill.className = "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200";
  if (text) text.innerHTML = `<i class="fa-solid fa-database text-amber-600"></i> Chế độ Offline (Cục bộ)`;
}

// Điền danh sách trường & khu công nghiệp & quận huyện Đà Nẵng
function populateSelects() {
  const uniSelect = document.getElementById("select-university");
  const modalUniSelect = document.getElementById("modal-room-uni");
  const districtSelect = document.getElementById("select-district");
  
  if (uniSelect) {
    let html = `<option value="all">Tất cả các trường & KCN</option>`;
    html += `<optgroup label="🎓 Trường Đại Học Đà Nẵng">`;
    html += universities.filter(u => u.id !== "all").map(u => `<option value="${u.id}">${u.name}</option>`).join("");
    html += `</optgroup>`;
    
    if (typeof industrialZones !== 'undefined') {
      html += `<optgroup label="🏭 Khu Công Nghiệp (Cho Người Lao Động)">`;
      html += industrialZones.map(k => `<option value="${k.id}">${k.name}</option>`).join("");
      html += `</optgroup>`;
    }
    uniSelect.innerHTML = html;
  }

  if (modalUniSelect) {
    let modalHtml = `<optgroup label="🎓 Trường Đại Học">`;
    modalHtml += universities.filter(u => u.id !== "all").map(u => `<option value="${u.id}">${u.name}</option>`).join("");
    modalHtml += `</optgroup>`;
    if (typeof industrialZones !== 'undefined') {
      modalHtml += `<optgroup label="🏭 Khu Công Nghiệp">`;
      modalHtml += industrialZones.map(k => `<option value="${k.id}">${k.name}</option>`).join("");
      modalHtml += `</optgroup>`;
    }
    modalUniSelect.innerHTML = modalHtml;
  }

  if (districtSelect) {
    districtSelect.innerHTML = daNangDistricts.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  }
}

// Khởi tạo bản đồ VỆ TINH GOOGLE MAPS thực tế
function initMap() {
  const mapContainer = document.getElementById("leaflet-map");
  if (!mapContainer) return;

  // 1. LỚP VỆ TINH GOOGLE MAPS HYBRID (Bao gồm ảnh vệ tinh thực tế + Tên đường + Sông Hàn...)
  const googleSatellite = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: 'Dữ liệu vệ tinh © Google Maps'
  });

  // 2. LỚP ĐƯỜNG PHỐ GOOGLE MAPS
  const googleRoadmap = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: 'Bản đồ đường phố © Google Maps'
  });

  // 3. LỚP OPENSTREETMAP DỰ PHÒNG
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  });

  // Tọa độ trung tâm TP. ĐÀ NẴNG
  map = L.map("leaflet-map", {
    center: [16.0544, 108.2022],
    zoom: 13,
    layers: [googleSatellite] // Mặc định mở ngay ảnh VỆ TINH GOOGLE MAPS sắc nét
  });

  // Bảng chuyển đổi chế độ bản đồ góc trên bên phải
  const baseLayers = {
    "🛰️ Vệ tinh Google": googleSatellite,
    "🗺️ Đường phố Google": googleRoadmap,
    "🌐 OpenStreetMap": osmLayer
  };
  L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  uniMarkersLayer = L.layerGroup().addTo(map);
  indZoneMarkersLayer = L.layerGroup().addTo(map);

  renderUniversityMarkers();
  renderIndustrialZoneMarkers();

  // Khắc phục lỗi Leaflet bị xám trắng khi kích thước layout thay đổi
  window.addEventListener('resize', () => {
    if (map) map.invalidateSize();
  });
}

// Vẽ ghim các trường đại học tại Đà Nẵng (Ghim Đỏ)
function renderUniversityMarkers() {
  uniMarkersLayer.clearLayers();

  universities.filter(u => u.id !== "all").forEach(uni => {
    const uniIcon = L.divIcon({
      className: "custom-uni-pin",
      html: `
        <div class="uni-marker-icon" style="width: 34px; height: 34px; font-size: 14px; background: #dc2626; border: 2.5px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
          <i class="fa-solid fa-graduation-cap text-white"></i>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const marker = L.marker([uni.lat, uni.lng], { icon: uniIcon });
    marker.bindPopup(`
      <div class="p-3 text-center font-sans">
        <span class="inline-block px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded mb-1">Đại Học tại Đà Nẵng</span>
        <h4 class="font-bold text-sm text-gray-800">${uni.name}</h4>
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(uni.name + ' Đà Nẵng')}" target="_blank" class="mt-2 inline-block text-[11px] text-blue-600 hover:underline font-bold">
          <i class="fa-brands fa-google text-blue-500"></i> Xem vị trí trên Google Maps
        </a>
      </div>
    `);
    uniMarkersLayer.addLayer(marker);
  });
}

// Vẽ ghim các Khu Công Nghiệp tại Đà Nẵng (Ghim Cam Công Nghiệp cho Người Lao Động)
function renderIndustrialZoneMarkers() {
  if (!map || !indZoneMarkersLayer) return;
  indZoneMarkersLayer.clearLayers();

  if (typeof industrialZones !== "undefined") {
    industrialZones.forEach(kcn => {
      const kcnIcon = L.divIcon({
        className: "custom-kcn-pin",
        html: `
          <div class="kcn-marker-icon" style="width: 34px; height: 34px; font-size: 13px; background: #d97706; border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
            <i class="fa-solid fa-industry text-white"></i>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker([kcn.lat, kcn.lng], { icon: kcnIcon });
      marker.bindPopup(`
        <div class="p-3 text-center font-sans">
          <span class="inline-block px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded mb-1">Khu Công Nghiệp Đà Nẵng</span>
          <h4 class="font-bold text-sm text-gray-800">${kcn.name}</h4>
          <p class="text-xs text-slate-500 mt-1">Khu vực tập trung nhiều nhà máy & phòng trọ công nhân</p>
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kcn.name + ' Đà Nẵng')}" target="_blank" class="mt-2 inline-block text-[11px] text-blue-600 hover:underline font-bold">
            <i class="fa-brands fa-google text-blue-500"></i> Xem vị trí trên Google Maps
          </a>
        </div>
      `);
      indZoneMarkersLayer.addLayer(marker);
    });
  }
}

// Cập nhật ghim phòng trọ trên bản đồ vệ tinh
function updateMapMarkers(displayedRooms) {
  if (!map || !markersLayer) return;
  markersLayer.clearLayers();

  if (displayedRooms.length === 0) return;

  const bounds = [];

  displayedRooms.forEach(room => {
    const isFull = room.status === "full";
    const isSoon = room.status === "available-soon";
    
    let markerBg = "#059669"; // Xanh ngọc nổi trên nền vệ tinh
    let markerIcon = "fa-door-open";

    if (isFull) {
      markerBg = "#e11d48"; // Đỏ rose
      markerIcon = "fa-door-closed";
    } else if (isSoon) {
      markerBg = "#f59e0b"; // Vàng
      markerIcon = "fa-clock";
    } else if (room.type === "studio") {
      markerBg = "#7c3aed"; // Tím cho studio
      markerIcon = "fa-gem";
    }

    const roomIcon = L.divIcon({
      className: "custom-room-pin",
      html: `
        <div class="room-marker-icon" style="background-color: ${markerBg}; width: 32px; height: 32px; font-size: 13px; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
          <i class="fa-solid ${markerIcon} text-white"></i>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([room.lat, room.lng], { icon: roomIcon });
    marker.bindPopup(`
      <div class="w-60 font-sans">
        <img src="${room.image}" alt="${room.title}" class="w-full h-24 object-cover ${isFull ? 'filter grayscale' : ''}">
        <div class="p-2.5 bg-white">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-blue-600">${formatCurrency(room.price)}</span>
            ${getStatusBadge(room.status, room.availableCount)}
          </div>
          <h4 class="font-semibold text-xs text-gray-800 line-clamp-2 mt-1">${room.title}</h4>
          <p class="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
            <i class="fa-solid fa-location-dot text-red-500"></i> ${room.distance} đến ${room.nearUniName}
          </p>
          <div class="mt-2 flex flex-col gap-1">
            <button onclick="openRoomModal('${room.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] py-1.5 px-2 rounded-lg font-medium">
              Xem chi tiết phòng
            </button>
            <a href="${getGoogleMapsUrl(room.lat, room.lng, room.address)}" target="_blank" class="w-full text-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] py-1.5 px-2 rounded-lg font-medium border border-emerald-200 flex items-center justify-center gap-1">
              <i class="fa-solid fa-diamond-turn-right text-emerald-600"></i> Chỉ đường Google Maps
            </a>
          </div>
        </div>
      </div>
    `);

    markersLayer.addLayer(marker);
    bounds.push([room.lat, room.lng]);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }

  // Luôn kích hoạt render lại bản đồ
  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 200);
}

// Hiển thị danh sách card phòng trọ Đà Nẵng
function renderRooms(roomsToDisplay) {
  const container = document.getElementById("rooms-grid");
  const countBadge = document.getElementById("results-count");

  const availableCount = roomsToDisplay.filter(r => r.status === "available").length;
  const fullCount = roomsToDisplay.filter(r => r.status === "full").length;

  if (countBadge) {
    countBadge.innerHTML = `
      <span>${roomsToDisplay.length} kết quả</span>
      <span class="text-xs font-normal text-slate-500 ml-2">(${availableCount} còn phòng • ${fullCount} đã hết)</span>
    `;
  }

  if (!container) return;

  if (roomsToDisplay.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div class="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          <i class="fa-solid fa-door-closed text-slate-400"></i>
        </div>
        <h3 class="text-lg font-bold text-gray-800 mb-1">Không tìm thấy phòng phù hợp</h3>
        <p class="text-gray-500 text-sm max-w-md mx-auto mb-4">Bạn thử đổi bộ lọc "Tình trạng phòng" sang "Tất cả tình trạng" xem nhé.</p>
        <button onclick="resetFilters()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition">
          Đặt lại bộ lọc
        </button>
      </div>
    `;
    updateMapMarkers([]);
    return;
  }

  container.innerHTML = roomsToDisplay.map(room => {
    const isFav = savedFavorites.map(String).includes(String(room.id));
    const isCompared = (typeof compareList !== "undefined") && compareList.includes(String(room.id));
    const isStudio = room.type === "studio";
    const isFull = room.status === "full";

    const badgesHtml = `
      ${getStatusBadge(room.status, room.availableCount)}
      ${isStudio ? '<span class="bg-violet-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1"><i class="fa-solid fa-gem text-[10px]"></i> Studio</span>' : ''}
    `;

    const amenitiesHtml = room.amenities.slice(0, 3).map(amKey => {
      const am = amenityLabels[amKey];
      if (!am) return '';
      return `
        <span class="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
          <i class="fa-solid ${am.icon} text-slate-500 text-[10px]"></i> ${am.name}
        </span>
      `;
    }).join("");

    const ggMapsUrl = getGoogleMapsUrl(room.lat, room.lng, room.address);

    return `
      <div class="room-card bg-white rounded-2xl overflow-hidden border ${isFull ? 'border-rose-100 opacity-90' : 'border-gray-100'} shadow-sm flex flex-col justify-between">
        <!-- Ảnh & Badges -->
        <div class="relative h-48 overflow-hidden group">
          <img src="${room.image}" alt="${room.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500 ${isFull ? 'filter grayscale-[30%]' : ''}">
          <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
            ${badgesHtml}
          </div>
          <div class="absolute top-3 right-3 flex items-center gap-1.5">
            <button onclick="toggleCompare('${room.id}', event)" class="w-8 h-8 rounded-full ${isCompared ? 'bg-amber-500 text-white' : 'bg-white/90 hover:bg-white text-gray-700'} flex items-center justify-center shadow transition hover:scale-110" title="So sánh phòng này">
              <i class="fa-solid fa-scale-balanced text-xs"></i>
            </button>
            ${!canManageRooms() ? `
              <button onclick="toggleFavorite('${room.id}', event)" class="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center shadow transition hover:scale-110" title="Lưu phòng yêu thích">
                <i class="${isFav ? 'fa-solid text-red-500' : 'fa-regular'} fa-heart text-sm"></i>
              </button>
            ` : ''}
          </div>
          <div class="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1">
            <i class="fa-solid fa-graduation-cap text-yellow-400"></i> ${room.distance} đến ${room.nearUniName}
          </div>
        </div>

        <!-- Nội dung thông tin -->
        <div class="p-4 flex-1 flex flex-col justify-between">
          <div>
            <div class="flex items-baseline justify-between mb-2">
              <span class="text-xl font-extrabold ${isStudio ? 'text-violet-700' : 'text-blue-600'}">${formatCurrency(room.price)}</span>
              <span class="text-xs font-semibold text-gray-500">${room.area} m²</span>
            </div>
            
            <h3 class="font-bold text-gray-900 text-sm line-clamp-2 hover:text-blue-600 cursor-pointer transition mb-2" onclick="openRoomModal('${room.id}')">
              ${room.title}
            </h3>

            <!-- Địa chỉ thực tế + icon Google Maps -->
            <a href="${ggMapsUrl}" target="_blank" class="text-xs text-gray-600 hover:text-emerald-700 flex items-center gap-1.5 line-clamp-1 mb-3 group/map transition" title="Bấm để mở Google Maps dẫn đường">
              <i class="fa-solid fa-location-dot text-red-500 shrink-0"></i>
              <span class="group-hover/map:underline">${room.address}</span>
            </a>

            <!-- Tiện ích tóm tắt -->
            <div class="flex flex-wrap gap-1.5 mb-3">
              ${amenitiesHtml}
              ${room.amenities.length > 3 ? `<span class="text-[11px] text-gray-400">+${room.amenities.length - 3}</span>` : ''}
            </div>
          </div>

          <!-- Nút hành động -->
          <div class="pt-3 border-t border-gray-100 flex items-center gap-2">
            <button onclick="openRoomModal('${room.id}')" class="flex-1 ${isFull ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'} font-bold py-2 rounded-xl text-xs transition text-center">
              ${isFull ? 'Xem chi tiết (Đã hết)' : 'Chi tiết'}
            </button>
            <a href="${ggMapsUrl}" target="_blank" class="px-2.5 py-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition border border-slate-200 hover:border-emerald-300" title="Chỉ đường Google Maps">
              <i class="fa-solid fa-diamond-turn-right text-emerald-600"></i> <span class="hidden sm:inline">Chỉ đường</span>
            </a>
            <a href="tel:${room.phone.replace(/[^0-9]/g, '')}" class="px-2.5 py-2 ${isFull ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition" title="${isFull ? 'Phòng đã hết' : 'Gọi điện'}">
              <i class="fa-solid fa-phone"></i>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");

  updateMapMarkers(roomsToDisplay);
}

// Xử lý bộ lọc tìm kiếm Đà Nẵng
function applyFilters() {
  const keyword = document.getElementById("search-keyword")?.value.toLowerCase().trim() || "";
  const selectedDistrict = document.getElementById("select-district")?.value || "all";
  const selectedUni = document.getElementById("select-university")?.value || "all";
  const selectedPrice = document.getElementById("select-price")?.value || "all";
  const selectedType = document.getElementById("select-type")?.value || "all";
  const selectedStatus = document.getElementById("select-status")?.value || "all";

  const checkedAmenities = Array.from(document.querySelectorAll(".filter-amenity:checked")).map(cb => cb.value);

  const filtered = rooms.filter(room => {
    if (selectedStatus !== "all" && room.status !== selectedStatus) {
      return false;
    }
    if (keyword) {
      const matchKeyword = room.title.toLowerCase().includes(keyword) || 
                           room.address.toLowerCase().includes(keyword) ||
                           room.description.toLowerCase().includes(keyword);
      if (!matchKeyword) return false;
    }
    if (selectedDistrict !== "all" && room.district !== selectedDistrict) {
      return false;
    }
    if (selectedUni !== "all" && room.nearUni !== selectedUni) {
      return false;
    }
    if (selectedPrice !== "all") {
      if (selectedPrice === "under-1m" && room.price >= 1000000) return false;
      if (selectedPrice === "1m-1.5m" && (room.price < 1000000 || room.price > 1500000)) return false;
      if (selectedPrice === "1.5m-2m" && (room.price < 1500000 || room.price > 2000000)) return false;
      if (selectedPrice === "2m-2.5m" && (room.price < 2000000 || room.price > 2500000)) return false;
      if (selectedPrice === "2.5m-3.5m" && (room.price < 2500000 || room.price > 3500000)) return false;
      if (selectedPrice === "3.5m-5m" && (room.price < 3500000 || room.price > 5000000)) return false;
      if (selectedPrice === "above-5m" && room.price <= 5000000) return false;
    }
    if (selectedType !== "all" && room.type !== selectedType) {
      return false;
    }
    if (checkedAmenities.length > 0) {
      const hasAll = checkedAmenities.every(a => room.amenities.includes(a));
      if (!hasAll) return false;
    }
    return true;
  });

  renderRooms(filtered);
}

// Đặt lại bộ lọc
function resetFilters() {
  document.getElementById("search-keyword").value = "";
  if (document.getElementById("select-district")) document.getElementById("select-district").value = "all";
  document.getElementById("select-university").value = "all";
  document.getElementById("select-price").value = "all";
  document.getElementById("select-type").value = "all";
  if (document.getElementById("select-status")) document.getElementById("select-status").value = "all";
  document.querySelectorAll(".filter-amenity").forEach(cb => cb.checked = false);
  
  document.querySelectorAll(".quick-filter-btn").forEach(b => {
    b.classList.remove("bg-blue-600", "text-white");
    b.classList.add("bg-white", "text-slate-700");
  });
  document.querySelector(".quick-filter-btn[data-filter='all']")?.classList.add("bg-blue-600", "text-white");

  renderRooms(rooms);
  showToast("Đã đặt lại toàn bộ bộ lọc!", "info");
}

// Thiết lập sự kiện
function setupEventListeners() {
  document.getElementById("search-keyword")?.addEventListener("input", debounce(applyFilters, 200));
  document.getElementById("select-district")?.addEventListener("change", applyFilters);
  document.getElementById("select-university")?.addEventListener("change", applyFilters);
  document.getElementById("select-price")?.addEventListener("change", applyFilters);
  document.getElementById("select-type")?.addEventListener("change", applyFilters);
  document.getElementById("select-status")?.addEventListener("change", applyFilters);
  
  document.querySelectorAll(".filter-amenity").forEach(cb => {
    cb.addEventListener("change", applyFilters);
  });

  // Reset thầm lặng các ô lọc trước khi áp dụng 1 nút Lọc nhanh mới (tránh bị dính lọc cũ)
  const clearSelectFiltersSilent = () => {
    showingFavoritesOnly = false;
    document.getElementById("fav-filter-btn")?.classList.remove("bg-rose-50", "text-red-500", "ring-2", "ring-rose-200");
    if (userRadiusCircle && map) {
      map.removeLayer(userRadiusCircle);
      userRadiusCircle = null;
    }
    const kw = document.getElementById("search-keyword");
    if (kw) kw.value = "";
    ["select-district", "select-university", "select-price", "select-type", "select-status"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "all";
    });
    document.querySelectorAll(".filter-amenity").forEach(cb => cb.checked = false);
  };

  document.querySelectorAll(".quick-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".quick-filter-btn").forEach(b => {
        b.classList.remove("bg-blue-600", "text-white");
        b.classList.add("bg-white", "text-slate-700");
      });
      btn.classList.remove("bg-white", "text-slate-700");
      btn.classList.add("bg-blue-600", "text-white");

      clearSelectFiltersSilent();

      const filterType = btn.dataset.filter;
      if (filterType === "all") {
        renderRooms(rooms);
      } else if (filterType === "available") {
        document.getElementById("select-status").value = "available";
        applyFilters();
      } else if (filterType === "full") {
        document.getElementById("select-status").value = "full";
        applyFilters();
      } else if (filterType === "studio") {
        document.getElementById("select-type").value = "studio";
        applyFilters();
      } else if (filterType === "worker") {
        const workerRooms = rooms.filter(r => r.targetAudience === "worker" || (r.nearUni && r.nearUni.startsWith("kcn")));
        renderRooms(workerRooms);
        showToast(`👷 Đang hiển thị ${workerRooms.length} phòng cho Người Lao Động & KCN`, "info");
      } else if (filterType === "kcn-hoa-khanh") {
        document.getElementById("select-university").value = "kcn-hoa-khanh";
        applyFilters();
      } else if (filterType === "kcn-hoa-cam") {
        document.getElementById("select-university").value = "kcn-hoa-cam";
        applyFilters();
      } else if (filterType === "uda") {
        document.getElementById("select-university").value = "uda";
        applyFilters();
      } else if (filterType === "dut") {
        document.getElementById("select-university").value = "dut";
        applyFilters();
      } else if (filterType === "due") {
        document.getElementById("select-university").value = "due";
        applyFilters();
      }
    });
  });

  const addRoomForm = document.getElementById("add-room-form");
  if (addRoomForm) {
    addRoomForm.addEventListener("submit", handleAddRoomSubmit);
  }
}

// Chuyển đổi trạng thái phòng (Chỉ Chủ trọ chính chủ & Admin mới có quyền)
async function toggleRoomStatus(roomId) {
  if (!canManageRooms()) {
    showToast("🔒 Chỉ tài khoản Chủ trọ hoặc Admin mới được đổi trạng thái phòng!", "info");
    openAuthModal("login");
    return;
  }

  const room = rooms.find(r => String(r.id) === String(roomId));
  if (!room) return;
  if (!canEditRoom(room)) {
    showToast("🔒 Bạn chỉ được cập nhật trạng thái phòng do chính bạn đăng!", "info");
    return;
  }

  const newStatus = room.status === "available" ? "full" : "available";
  const newCount = newStatus === "full" ? 0 : 1;

  if (isBackendOnline && String(roomId).length === 24) {
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus, availableCount: newCount })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.message || "Bạn không có quyền đổi trạng thái phòng!", "info");
        return;
      }
    } catch (err) {
      console.error(err);
    }
  } else {
    localStorage.setItem("svtro_rooms_danang_v4", JSON.stringify(rooms));
  }

  room.status = newStatus;
  room.availableCount = newCount;

  showToast(
    newStatus === "full" ? `Đã chuyển sang: Hết phòng!` : `Đã chuyển sang: Còn phòng!`,
    newStatus === "full" ? "info" : "success"
  );
  const detailModal = document.getElementById("room-detail-modal");
  if (detailModal && !detailModal.classList.contains("hidden")) {
    openRoomModal(roomId);
  }
  applyFilters();
}

// Xóa phòng trọ (Chỉ Admin / Chủ trọ chính chủ)
async function deleteRoom(roomId) {
  if (!canManageRooms()) {
    showToast("🔒 Chỉ Admin hoặc Chủ trọ mới có quyền xóa phòng!", "info");
    return;
  }
  const targetRoom = rooms.find(r => String(r.id) === String(roomId));
  if (targetRoom && !canEditRoom(targetRoom)) {
    showToast("🔒 Bạn không thể xóa phòng của chủ trọ khác!", "info");
    return;
  }
  const roomLabel = targetRoom ? `\n"${targetRoom.title}"` : "";
  if (!confirm(`Bạn có chắc chắn muốn xóa bài đăng phòng trọ này không?${roomLabel}`)) return;

  if (isBackendOnline && String(roomId).length === 24) {
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.message || "Không thể xóa phòng!", "info");
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }

  rooms = rooms.filter(r => String(r.id) !== String(roomId));
  closeModal("room-detail-modal");
  applyFilters();
  showToast("🗑️ Đã xóa phòng trọ thành công!", "success");
}

// Mở Modal chi tiết phòng
function openRoomModal(roomId) {
  const room = rooms.find(r => String(r.id) === String(roomId));
  if (!room) return;

  const modal = document.getElementById("room-detail-modal");
  const modalContent = document.getElementById("modal-room-content");

  const amenitiesList = room.amenities.map(a => {
    const item = amenityLabels[a];
    if (!item) return '';
    return `
      <div class="flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-50 p-2 rounded-lg border border-gray-100">
        <i class="fa-solid ${item.icon} text-blue-600"></i> ${item.name}
      </div>
    `;
  }).join("");

  const ggMapsUrl = getGoogleMapsUrl(room.lat, room.lng, room.address);
  const isFull = room.status === "full";
  const gallery = (room.images && room.images.length > 0) ? room.images : [room.image];
  window._modalGallery = gallery;
  window._modalGalleryIdx = 0;

  // Lưu vào danh sách "Phòng đã xem gần đây"
  addRecentRoom(room);

  modalContent.innerHTML = `
    <!-- Trình xem nhiều ảnh dạng Slider mượt mà -->
    <div class="relative h-64 md:h-80 w-full overflow-hidden bg-slate-900">
      <img id="modal-slider-img" src="${gallery[0]}" alt="${room.title}" class="w-full h-full object-cover transition duration-300 ${isFull ? 'filter grayscale-[30%]' : ''}">
      ${gallery.length > 1 ? `
        <button onclick="slideModalImage(-1)" class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/75 text-white rounded-full flex items-center justify-center transition">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <button onclick="slideModalImage(1)" class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/75 text-white rounded-full flex items-center justify-center transition">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
        <div id="modal-slider-counter" class="absolute bottom-4 right-4 bg-black/65 text-white text-xs font-bold px-2.5 py-1 rounded-full">1 / ${gallery.length}</div>
      ` : ''}
      <div class="absolute bottom-4 left-4 bg-blue-600 text-white font-extrabold text-lg px-3 py-1.5 rounded-xl shadow-lg">
        ${formatCurrency(room.price)}
      </div>
    </div>
    ${gallery.length > 1 ? `
      <div class="flex items-center gap-2 px-6 pt-3 overflow-x-auto no-scrollbar">
        ${gallery.map((url, i) => `
          <img onclick="setModalImage(${i})" src="${url}" class="w-16 h-12 object-cover rounded-lg cursor-pointer border-2 ${i === 0 ? 'border-blue-600' : 'border-transparent opacity-70 hover:opacity-100'} transition modal-thumb-item shrink-0">
        `).join("")}
      </div>
    ` : ''}

    <!-- Chi tiết -->
    <div class="p-6">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        ${getStatusBadge(room.status, room.availableCount)}
        <span class="bg-violet-100 text-violet-800 text-xs font-bold px-2.5 py-1 rounded-md">
          ${roomTypeLabels[room.type] || "Phòng trọ"}
        </span>
        <span class="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-md">
          ${room.districtName || 'Đà Nẵng'}
        </span>
        <span class="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
          <i class="fa-solid fa-graduation-cap"></i> Cách ${room.nearUniName} ${room.distance}
        </span>
      </div>

      <h2 class="text-xl font-bold text-gray-900 mb-2">${room.title}</h2>
      
      <!-- Box Địa chỉ thực tế + Bản đồ vị trí từng phòng + Chỉ đường Google Maps -->
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm text-gray-700">
            <i class="fa-solid fa-location-dot text-red-500 text-base shrink-0"></i>
            <div>
              <span class="font-bold block text-xs text-gray-500 uppercase">Địa chỉ &amp; Bản đồ vị trí phòng:</span>
              <span>${room.address}</span>
            </div>
          </div>
          <a href="${ggMapsUrl}" target="_blank" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition shrink-0">
            <i class="fa-solid fa-diamond-turn-right"></i> Dẫn đường Google Maps
          </a>
        </div>
        <!-- Bản đồ Leaflet hiển thị ngay trong từng bài đăng phòng -->
        <div id="modal-room-map" class="h-56 w-full rounded-xl overflow-hidden border border-slate-200 mt-3 z-10"></div>
        <!-- Khám phá nhanh tiện ích đời thường quanh phòng -->
        <div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span class="font-bold text-slate-500 mr-1">🧭 Quanh đây có gì:</span>
          <a href="https://www.google.com/maps/search/quán+cơm+bình+dân/@${room.lat},${room.lng},16z" target="_blank" class="px-2.5 py-1 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-700 border border-slate-200 rounded-lg font-semibold transition">🍚 Quán cơm SV</a>
          <a href="https://www.google.com/maps/search/chợ+siêu+thị/@${room.lat},${room.lng},16z" target="_blank" class="px-2.5 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 rounded-lg font-semibold transition">🛒 Chợ / Siêu thị</a>
          <a href="https://www.google.com/maps/search/trạm+xe+buýt/@${room.lat},${room.lng},16z" target="_blank" class="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg font-semibold transition">🚌 Trạm xe buýt</a>
          <a href="https://www.google.com/maps/search/nhà+thuốc/@${room.lat},${room.lng},16z" target="_blank" class="px-2.5 py-1 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 rounded-lg font-semibold transition">🏥 Nhà thuốc</a>
        </div>
      </div>

      <!-- Khung kiểm tra tình trạng phòng & Nút cập nhật dành cho chủ trọ -->
      <div class="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between gap-3 mb-5">
        <div class="flex items-center gap-2">
          <i class="fa-solid ${isFull ? 'fa-door-closed text-rose-600' : 'fa-door-open text-emerald-600'} text-xl"></i>
          <div>
            <span class="text-xs text-gray-500 block">Tình trạng thực tế khu trọ:</span>
            <span class="text-sm font-bold ${isFull ? 'text-rose-600' : 'text-emerald-700'}">
              ${isFull ? 'Khu trọ hiện đã ĐỦ KHÁCH (Hết phòng)' : `Hiện đang còn ${room.availableCount || 1} phòng trống sẵn sàng dọn vào`}
            </span>
          </div>
        </div>
        ${canEditRoom(room) ? `
          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="openEditRoomModal('${room.id}')" class="text-xs bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1.5 rounded-lg transition shadow-sm" title="Chỉnh sửa thông tin phòng">
              <i class="fa-solid fa-pen-to-square"></i> Sửa
            </button>
            <button onclick="toggleRoomStatus('${room.id}')" class="text-xs bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg transition shadow-sm" title="Dành cho Chủ trọ chính chủ / Admin">
              <i class="fa-solid fa-arrows-rotate mr-1"></i> Đổi trạng thái
            </button>
            <button onclick="deleteRoom('${room.id}')" class="text-xs bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold px-2.5 py-1.5 rounded-lg transition shadow-sm" title="Xóa tin đăng">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        ` : `
          <span class="text-[11px] text-slate-500 italic shrink-0">${currentUser && currentUser.role === 'landlord' ? '🔒 Phòng của chủ trọ khác' : 'Đăng nhập Chủ trọ để cập nhật'}</span>
        `}
      </div>

      <!-- Bảng giá dịch vụ Đà Nẵng -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 mb-4">
        <div>
          <span class="text-[11px] text-gray-500 block">Diện tích</span>
          <span class="text-sm font-bold text-gray-800">${room.area} m²</span>
        </div>
        <div>
          <span class="text-[11px] text-gray-500 block">Tiền điện</span>
          <span class="text-sm font-bold text-blue-700">${room.electricity || '3.200đ/kWh'}</span>
        </div>
        <div>
          <span class="text-[11px] text-gray-500 block">Tiền nước</span>
          <span class="text-sm font-bold text-blue-700">${room.water || '50.000đ/người'}</span>
        </div>
        <div>
          <span class="text-[11px] text-gray-500 block">Giờ giấc</span>
          <span class="text-sm font-bold text-emerald-600">Tự do 24/7</span>
        </div>
      </div>

      <!-- Máy tính dự toán chi phí thực tế / người -->
      <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 mb-5 text-xs">
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-emerald-900 flex items-center gap-1.5">
            <i class="fa-solid fa-calculator text-emerald-600"></i> Dự tính chi phí thực tế / tháng
          </span>
          <span class="text-[11px] text-emerald-700">Phòng + Điện + Nước</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2.5">
          <div>
            <label class="block text-[11px] font-semibold text-slate-600 mb-1">Số người ở cùng:</label>
            <select id="calc-people" onchange="recalcRoomCost(${room.price}, '${(room.electricity || '3200').replace(/'/g, '')}', '${(room.water || '50000').replace(/'/g, '')}')" class="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800">
              <option value="1">1 người (Ở riêng)</option>
              <option value="2" selected>2 người (Chia đôi)</option>
              <option value="3">3 người (Chia 3)</option>
              <option value="4">4 người (Chia 4)</option>
            </select>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[11px] font-semibold text-slate-600">Số điện: <strong id="calc-kwh-label" class="text-blue-700">${room.estimatedKwh || 80} kWh</strong>/tháng</label>
              ${canEditRoom(room) ? `
                <button type="button" onclick="saveRoomKwh('${room.id}')" class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-xs transition">
                  💾 Lưu số điện
                </button>
              ` : ''}
            </div>
            ${canEditRoom(room) ? `
              <input type="range" id="calc-kwh" min="20" max="250" step="10" value="${room.estimatedKwh || 80}" oninput="recalcRoomCost(${room.price}, '${(room.electricity || '3200').replace(/'/g, '')}', '${(room.water || '50000').replace(/'/g, '')}')" class="w-full accent-emerald-600 cursor-pointer">
            ` : `
              <input type="hidden" id="calc-kwh" value="${room.estimatedKwh || 80}">
              <div class="bg-white/80 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 font-semibold flex items-center gap-1.5">
                <i class="fa-solid fa-lock text-emerald-600"></i> Cố định do Chủ nhà / Admin thiết lập
              </div>
            `}
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-200/70">
          <span class="text-slate-600">Tổng cả phòng: <strong id="calc-total-room" class="text-slate-900">...</strong></span>
          <span class="text-emerald-800 font-bold text-sm">Mỗi người chỉ: <strong id="calc-per-person" class="text-emerald-700 text-base">...</strong>/tháng</span>
        </div>
      </div>

      <!-- Mô tả -->
      <h4 class="text-sm font-bold text-gray-800 mb-2">Mô tả chi tiết</h4>
      <p class="text-sm text-gray-600 leading-relaxed mb-5">${room.description}</p>

      <!-- Tiện nghi -->
      <h4 class="text-sm font-bold text-gray-800 mb-2">Tiện ích phòng</h4>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        ${amenitiesList}
      </div>

      <!-- Danh sách Đánh giá thực tế từ MongoDB -->
      <div class="mb-5 pt-4 border-t border-gray-100">
        <div class="flex items-center justify-between mb-2.5">
          <h4 class="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <i class="fa-solid fa-star text-amber-400"></i> Đánh giá từ người thuê
          </h4>
          <button onclick="openReviewModal('${room.id}', '${room.title.replace(/'/g, "\\'")}')" class="text-xs font-bold text-blue-600 hover:underline">
            + Viết đánh giá
          </button>
        </div>
        <div id="modal-room-reviews" class="space-y-2 text-xs text-slate-500">
          Đang tải đánh giá...
        </div>
      </div>

      <!-- Khung liên hệ & Đặt lịch & Báo cáo -->
      ${isFull ? `
        <div class="mb-4 p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div>
            <div class="font-bold text-amber-900">🔔 Phòng này hiện đã hết — Bạn muốn nhận báo khi có người chuyển đi?</div>
            <div class="text-amber-700 text-[11px]">Để lại SĐT để chủ trọ gọi báo bạn đầu tiên ngay khi trống phòng.</div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <input type="text" id="waitlist-phone-input" value="${currentUser ? (currentUser.phone || '') : ''}" placeholder="Nhập SĐT 10 số..." class="bg-white border border-amber-300 rounded-xl px-2.5 py-1.5 text-xs w-36 focus:outline-none">
            <button onclick="submitWaitlistAlert('${room.id}')" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow transition">
              Báo tôi
            </button>
          </div>
        </div>
      ` : ''}

      <div class="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <span class="text-xs text-gray-500 block">Liên hệ chủ nhà:</span>
          <span class="text-base font-bold text-gray-800">${room.phone}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <a href="tel:${room.phone.replace(/[^0-9]/g, '')}" class="flex-1 sm:flex-none px-3 py-2.5 ${isFull ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow transition">
            <i class="fa-solid fa-phone"></i> ${isFull ? 'Đã hết' : 'Gọi'}
          </a>
          <a href="https://zalo.me/${room.zalo}" target="_blank" class="flex-1 sm:flex-none px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow transition">
            <i class="fa-solid fa-comment-dots"></i> Zalo
          </a>
          <button onclick="openChatModal('${room.id}', '${room.title.replace(/'/g, "\\'")}')" class="flex-1 sm:flex-none px-3 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow transition">
            <i class="fa-solid fa-comments"></i> Chat
          </button>
          <button onclick="openAppointmentModal('${room.id}', '${room.title.replace(/'/g, "\\'")}')" class="flex-1 sm:flex-none px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow transition">
            <i class="fa-solid fa-calendar-check"></i> Đặt lịch
          </button>
          <button onclick="openContractModal('${room.id}')" class="px-3 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow transition" title="Tạo & In Hợp đồng thuê mẫu (PDF)">
            <i class="fa-solid fa-file-contract"></i> HĐ mẫu
          </button>
          <button onclick="openReviewModal('${room.id}', '${room.title.replace(/'/g, "\\'")}')" class="px-3 py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition border border-slate-200" title="Đánh giá hoặc Báo cáo lừa đảo">
            <i class="fa-solid fa-shield-halved"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  loadRoomReviews(room.id);
  recalcRoomCost(room.price, room.electricity || "3200", room.water || "50000");
  initModalRoomMap(room);
}

let modalRoomMap = null;

// Khởi tạo bản đồ vị trí ngay bên trong từng bài đăng phòng
function initModalRoomMap(room) {
  const mapEl = document.getElementById("modal-room-map");
  if (!mapEl || typeof L === "undefined") return;

  if (modalRoomMap) {
    modalRoomMap.remove();
    modalRoomMap = null;
  }

  const lat = Number(room.lat) || 16.0544;
  const lng = Number(room.lng) || 108.2022;

  const googleSat = L.tileLayer("https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
    attribution: "© Google Maps"
  });
  const googleRoad = L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 20,
    attribution: "© Google Maps"
  });

  modalRoomMap = L.map("modal-room-map", {
    center: [lat, lng],
    zoom: 16,
    layers: [googleRoad]
  });

  L.control.layers({ "🗺️ Đường phố": googleRoad, "🛰️ Vệ tinh": googleSat }, null, { position: "topright" }).addTo(modalRoomMap);

  const markerBg = room.status === "full" ? "#e11d48" : "#059669";
  const pinIcon = L.divIcon({
    className: "custom-room-pin",
    html: `<div style="background:${markerBg};width:34px;height:34px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-house text-white text-xs"></i></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  L.marker([lat, lng], { icon: pinIcon })
    .addTo(modalRoomMap)
    .bindPopup(`<div class="font-sans text-xs"><strong>${room.title}</strong><br><span class="text-slate-600">${room.address}</span></div>`)
    .openPopup();

  // Ghim thêm Trường ĐH / KCN gần nhất để dễ hình dung khoảng cách
  const nearPlace =
    universities.find(u => u.id === room.nearUni) ||
    (typeof industrialZones !== "undefined" ? industrialZones.find(k => k.id === room.nearUni) : null);

  if (nearPlace && nearPlace.id !== "all") {
    const isKcn = nearPlace.id.startsWith("kcn");
    const placeIcon = L.divIcon({
      className: "custom-place-pin",
      html: `<div style="background:${isKcn ? '#d97706' : '#dc2626'};width:28px;height:28px;border-radius:50%;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><i class="fa-solid ${isKcn ? 'fa-industry' : 'fa-graduation-cap'} text-white text-[11px]"></i></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    L.marker([nearPlace.lat, nearPlace.lng], { icon: placeIcon })
      .addTo(modalRoomMap)
      .bindPopup(`<div class="font-sans text-xs font-bold">${nearPlace.name}</div>`);
  }

  setTimeout(() => {
    if (modalRoomMap) modalRoomMap.invalidateSize();
  }, 220);
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function openAddRoomModal() {
  const modal = document.getElementById("add-room-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

// Mở modal Đặt lịch xem phòng
function openAppointmentModal(roomId, roomTitle) {
  document.getElementById("appt-room-id").value = roomId;
  document.getElementById("appt-room-title-display").textContent = roomTitle || "Phòng trọ";
  if (currentUser) {
    const nameEl = document.getElementById("appt-tenant-name");
    const phoneEl = document.getElementById("appt-tenant-phone");
    if (nameEl && !nameEl.value) nameEl.value = currentUser.fullName || "";
    if (phoneEl && !phoneEl.value) phoneEl.value = currentUser.phone || "";
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateInput = document.getElementById("appt-date");
  if (dateInput) {
    dateInput.value = tomorrow.toISOString().split("T")[0];
    dateInput.min = new Date().toISOString().split("T")[0];
  }
  const modal = document.getElementById("appointment-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

// Xử lý gửi Đặt lịch xem phòng (Gọi NestJS API hoặc fallback)
async function handleAppointmentSubmit(e) {
  e.preventDefault();
  const roomId = document.getElementById("appt-room-id").value;
  const tenantName = document.getElementById("appt-tenant-name").value;
  const tenantPhone = document.getElementById("appt-tenant-phone").value;
  const tenantEmail = currentUser ? currentUser.email : "";
  const appointmentDate = document.getElementById("appt-date").value;
  const appointmentTime = document.getElementById("appt-time").value;
  const note = document.getElementById("appt-note").value;

  if (isBackendOnline && roomId && roomId.length === 24) {
    try {
      const res = await fetch(`${API_BASE_URL}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, tenantName, tenantPhone, tenantEmail, appointmentDate, appointmentTime, note })
      });
      if (res.ok) {
        showToast("🎉 Đã lưu lịch hẹn vào MongoDB! Chủ trọ sẽ liên hệ bạn sớm.", "success");
        closeModal("appointment-modal");
        document.getElementById("appointment-form").reset();
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }

  showToast("🎉 Đã gửi lịch hẹn xem phòng thành công! Chủ trọ sẽ liên hệ bạn.", "success");
  closeModal("appointment-modal");
  document.getElementById("appointment-form").reset();
}

// Mở modal Đánh giá & Báo cáo lừa đảo
function openReviewModal(roomId, roomTitle) {
  document.getElementById("review-room-id").value = roomId;
  document.getElementById("review-room-title-display").textContent = roomTitle || "Phòng trọ";
  const modal = document.getElementById("review-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function toggleScamInput(checked) {
  const box = document.getElementById("scam-reason-box");
  if (box) {
    if (checked) box.classList.remove("hidden");
    else box.classList.add("hidden");
  }
}

// Xử lý gửi Đánh giá / Báo cáo (Gọi NestJS API hoặc fallback)
async function handleReviewSubmit(e) {
  e.preventDefault();
  const roomId = document.getElementById("review-room-id").value;
  const authorName = document.getElementById("review-author-name").value;
  const rating = parseInt(document.getElementById("review-rating").value);
  const comment = document.getElementById("review-comment").value;
  const isScamReport = document.getElementById("review-is-scam").checked;
  const reportReason = document.getElementById("review-scam-reason")?.value || "";

  if (isBackendOnline && roomId && roomId.length === 24) {
    try {
      const res = await fetch(`${API_BASE_URL}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, authorName, rating, comment, isScamReport, reportReason })
      });
      if (res.ok) {
        showToast(isScamReport ? "🚨 Báo cáo lừa đảo đã gửi tới Admin kiểm duyệt!" : "⭐ Cảm ơn bạn đã gửi đánh giá vào MongoDB!", "success");
        closeModal("review-modal");
        document.getElementById("review-form").reset();
        loadRoomReviews(roomId);
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }

  showToast(isScamReport ? "🚨 Báo cáo lừa đảo đã được ghi nhận!" : "⭐ Cảm ơn bạn đã gửi đánh giá!", "success");
  closeModal("review-modal");
  document.getElementById("review-form").reset();
}

// Xử lý khi đăng tin trọ mới tại Đà Nẵng
async function handleAddRoomSubmit(e) {
  e.preventDefault();

  const title = document.getElementById("room-title").value;
  const price = parseInt(document.getElementById("room-price").value);
  const area = parseInt(document.getElementById("room-area").value);
  const status = document.getElementById("modal-room-status").value;
  const availableCount = parseInt(document.getElementById("modal-room-count").value) || 1;
  const address = document.getElementById("room-address").value;
  const nearUniId = document.getElementById("modal-room-uni").value;
  
  // Tìm trường ĐH hoặc KCN
  let placeObj = universities.find(u => u.id === nearUniId);
  if (!placeObj && typeof industrialZones !== "undefined") {
    placeObj = industrialZones.find(k => k.id === nearUniId);
  }

  const distance = document.getElementById("room-distance").value || "300m";
  const type = document.getElementById("room-type").value;
  const phone = document.getElementById("room-phone").value;
  const description = document.getElementById("room-desc").value;

  const checkedAmenities = Array.from(document.querySelectorAll(".add-amenity:checked")).map(cb => cb.value);

  const lat = placeObj ? placeObj.lat + (Math.random() - 0.5) * 0.005 : 16.0544;
  const lng = placeObj ? placeObj.lng + (Math.random() - 0.5) * 0.005 : 108.2022;

  // Nếu Backend NestJS đang chạy: Upload ảnh thật (nếu có) rồi lưu vào MongoDB
  if (isBackendOnline) {
    try {
      let uploadedImages = [];
      const fileInput = document.getElementById("room-images-input");
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const formData = new FormData();
        Array.from(fileInput.files).slice(0, 5).forEach(f => formData.append("images", f));
        const uploadRes = await fetch(`${API_BASE_URL}/rooms/upload`, {
          method: "POST",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          body: formData
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedImages = uploadData.urls || [];
        }
      }

      const payload = {
        title,
        price,
        area,
        district: placeObj ? placeObj.district : "hai-chau",
        districtName: "Đà Nẵng",
        address,
        lng,
        lat,
        targetAudience: nearUniId.startsWith("kcn") ? "worker" : "student",
        nearPlaceId: nearUniId,
        nearPlaceName: placeObj ? placeObj.name : "Đà Nẵng",
        distance,
        type,
        status,
        availableCount: status === "full" ? 0 : availableCount,
        amenities: checkedAmenities.length > 0 ? checkedAmenities : ["may-lanh", "gio-tu-do", "wifi"],
        images: uploadedImages.length > 0 ? uploadedImages : [
          type === "studio"
            ? "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80"
            : "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80"
        ],
        phone,
        zalo: phone.replace(/[^0-9]/g, ""),
        description
      };

      const res = await fetch(`${API_BASE_URL}/rooms`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await res.json();
        showToast("🎉 Đã lưu bài đăng & ảnh thật vào MongoDB thành công!", "success");
        closeModal("add-room-modal");
        document.getElementById("add-room-form").reset();
        const preview = document.getElementById("room-images-preview");
        if (preview) preview.innerHTML = "";
        await checkBackendHealthAndLoad();
        const dashModal = document.getElementById("dashboard-modal");
        if (dashModal && !dashModal.classList.contains("hidden")) {
          loadDashboardTab("myrooms");
        }
        refreshManagerViews("myrooms");
        return;
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.message || "🔒 Vui lòng đăng nhập tài khoản Chủ trọ hoặc Admin để đăng tin!", "info");
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Fallback nếu chạy offline
  const newRoom = {
    id: Date.now(),
    title,
    price,
    area,
    status,
    availableCount: status === "full" ? 0 : availableCount,
    district: placeObj ? placeObj.district : "hai-chau",
    districtName: "Đà Nẵng",
    address,
    nearUni: nearUniId,
    nearUniName: placeObj ? placeObj.name : "Đà Nẵng",
    distance,
    lat,
    lng,
    type,
    amenities: checkedAmenities.length > 0 ? checkedAmenities : ["may-lanh", "gio-tu-do", "wifi"],
    image: type === "studio" 
      ? "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80"
      : "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80",
    phone,
    zalo: phone.replace(/[^0-9]/g, ""),
    verified: true,
    isHot: false,
    electricity: "3.200đ / kWh",
    water: "50.000đ / người",
    description
  };

  rooms.unshift(newRoom);
  localStorage.setItem("svtro_rooms_danang_v4", JSON.stringify(rooms));

  closeModal("add-room-modal");
  renderRooms(rooms);
  showToast("🎉 Đăng tin trọ mới tại Đà Nẵng thành công!", "success");
  document.getElementById("add-room-form").reset();
}

function toggleFavorite(roomId, event) {
  event.stopPropagation();
  const strId = String(roomId);
  savedFavorites = savedFavorites.map(String);
  const idx = savedFavorites.indexOf(strId);
  if (idx > -1) {
    savedFavorites.splice(idx, 1);
    showToast("Đã bỏ khỏi danh sách yêu thích", "info");
  } else {
    savedFavorites.push(strId);
    showToast("❤️ Đã lưu vào danh sách yêu thích!", "success");
  }
  localStorage.setItem("svtro_favorites", JSON.stringify(savedFavorites));
  updateFavoritesCount();
  const favModal = document.getElementById("favorites-page-modal");
  if (favModal && !favModal.classList.contains("hidden")) {
    renderFavoritesPage();
  }
  if (showingFavoritesOnly) {
    renderRooms(rooms.filter(r => savedFavorites.includes(String(r.id))));
  } else {
    renderRooms(rooms);
  }
}

function updateFavoritesCount() {
  const badge = document.getElementById("fav-count-badge");
  if (badge) {
    badge.textContent = savedFavorites.length;
    badge.style.display = savedFavorites.length > 0 ? "inline-flex" : "none";
  }
}

function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toast-container");
  if (!toastContainer) return;

  const toast = document.createElement("div");
  const bg = type === "success" ? "bg-emerald-600" : "bg-blue-600";
  toast.className = `${bg} text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-info'}"></i>
    <span>${message}</span>
  `;

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove("translate-y-4", "opacity-0");
  }, 10);

  setTimeout(() => {
    toast.classList.add("translate-y-4", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}


// =========================================================================
// HỆ THỐNG ĐĂNG NHẬP, ĐĂNG KÝ & PHÂN QUYỀN (ADMIN, CHỦ TRỌ, SV, NLĐ)
// =========================================================================

function renderAuthHeader() {
  const container = document.getElementById("auth-header-area");
  const addRoomBtn = document.getElementById("btn-add-room");
  const myLandlordBtn = document.getElementById("btn-my-landlord-page");
  const myLandlordBtnText = document.getElementById("btn-my-landlord-page-text");
  const addBlogBtn = document.getElementById("btn-add-blog");
  const menuAdminGroup = document.getElementById("menu-admin-group");
  const menuLandlordGroup = document.getElementById("menu-landlord-group");
  const menuTenantGroup = document.getElementById("menu-tenant-group");
  const favFilterBtn = document.getElementById("fav-filter-btn");
  const menuFavBtn = document.getElementById("menu-fav-btn");
  if (!container) return;

  const hideFav = canManageRooms(); // Ẩn chức năng Yêu thích đối với Chủ trọ & Admin
  if (favFilterBtn) favFilterBtn.classList.toggle("hidden", !!hideFav);
  if (menuFavBtn) menuFavBtn.classList.toggle("hidden", !!hideFav);
  if (hideFav) closeFavoritesPage();
  if (typeof rooms !== "undefined" && rooms.length > 0 && isBackendOnline) {
    renderRooms(rooms);
  }

  if (addBlogBtn) {
    if (currentUser && currentUser.role === "admin") addBlogBtn.classList.remove("hidden");
    else addBlogBtn.classList.add("hidden");
  }
  if (menuAdminGroup) {
    if (currentUser && currentUser.role === "admin") menuAdminGroup.classList.remove("hidden");
    else menuAdminGroup.classList.add("hidden");
  }
  if (menuLandlordGroup) {
    if (currentUser && currentUser.role === "landlord") menuLandlordGroup.classList.remove("hidden");
    else menuLandlordGroup.classList.add("hidden");
  }
  if (menuTenantGroup) {
    if (currentUser && currentUser.role !== "admin" && currentUser.role !== "landlord") menuTenantGroup.classList.remove("hidden");
    else menuTenantGroup.classList.add("hidden");
  }
  if (typeof cachedBlogPosts !== "undefined" && cachedBlogPosts.length > 0) {
    renderBlogPosts(cachedBlogPosts);
  }
  if (typeof cachedRoomRequests !== "undefined" && cachedRoomRequests.length > 0) {
    renderRoomRequests(cachedRoomRequests);
  }
  if (typeof renderMenuUserCard === "function") {
    renderMenuUserCard();
  }
  if (typeof loadNotifications === "function") {
    loadNotifications();
  }

  if (!currentUser || !authToken) {
    container.innerHTML = `
      <button onclick="openAuthModal('login')" class="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl shadow transition">
        <i class="fa-solid fa-user-shield"></i>
        <span>Đăng nhập</span>
      </button>
    `;
    if (addRoomBtn) addRoomBtn.classList.add("hidden"); // Chưa đăng nhập không hiện nút Đăng tin
    if (myLandlordBtn) myLandlordBtn.classList.add("hidden");
    return;
  }

  const meta = roleMeta[currentUser.role] || roleMeta.tenant;
  const isManager = canManageRooms();

  if (addRoomBtn) {
    if (isManager) addRoomBtn.classList.remove("hidden"); // CHỈ Chủ trọ & Admin mới được đăng tin
    else addRoomBtn.classList.add("hidden");
  }
  if (myLandlordBtn) {
    myLandlordBtn.classList.remove("hidden");
    if (currentUser.role === "admin") {
      myLandlordBtn.setAttribute("onclick", "openAdminPage('overview')");
      if (myLandlordBtnText) myLandlordBtnText.textContent = "Trang Admin";
    } else if (currentUser.role === "landlord") {
      myLandlordBtn.setAttribute("onclick", "openLandlordPage('myrooms')");
      if (myLandlordBtnText) myLandlordBtnText.textContent = "Trang Chủ Trọ";
    } else {
      myLandlordBtn.setAttribute("onclick", "openTenantPage('appointments')");
      if (myLandlordBtnText) myLandlordBtnText.textContent = "Trang Của Tôi";
    }
  }

  const avatarBtnContent = currentUser.avatar
    ? `<img src="${currentUser.avatar}" alt="${currentUser.fullName}" class="w-full h-full object-cover">`
    : `<i class="fa-solid fa-user text-white text-base"></i>`;

  container.innerHTML = `
    <div class="relative" id="user-avatar-menu-wrapper">
      <button onclick="toggleUserDropdown(event)" class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 hover:ring-4 hover:ring-blue-500/30 flex items-center justify-center overflow-hidden border-2 border-white shadow-md transition active:scale-95" title="${currentUser.fullName} (${meta.label})">
        ${avatarBtnContent}
      </button>

      <!-- Menu thả xuống khi bấm vào Logo Avatar -->
      <div id="user-avatar-dropdown" class="hidden absolute right-0 mt-2.5 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 text-xs">
        <!-- Thông tin tài khoản -->
        <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center overflow-hidden shrink-0 border border-white shadow-sm">
            ${avatarBtnContent}
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-slate-900 text-xs truncate">${currentUser.fullName}</div>
            <div class="text-[10px] text-slate-500 truncate">${currentUser.email}</div>
            <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.cls}">${meta.label}</span>
          </div>
        </div>

        <!-- Các mục chức năng -->
        <div class="p-2 space-y-1">
          <button onclick="switchAccount()" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-violet-50 hover:text-violet-700 text-slate-700 font-semibold transition text-left">
            <i class="fa-solid fa-repeat w-4 text-violet-600"></i> Chuyển đổi tài khoản khác
          </button>

          <button onclick="closeUserDropdown(); logoutUser()" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-50 hover:text-rose-600 text-rose-600 font-bold transition text-left">
            <i class="fa-solid fa-right-from-bracket w-4"></i> Đăng xuất
          </button>
        </div>
      </div>
    </div>
  `;
}

function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const dd = document.getElementById("user-avatar-dropdown");
  if (dd) dd.classList.toggle("hidden");
}

function closeUserDropdown() {
  const dd = document.getElementById("user-avatar-dropdown");
  if (dd) dd.classList.add("hidden");
}

function switchAccount() {
  closeUserDropdown();
  openAuthModal("login");
  showToast("🔄 Chọn hoặc nhập tài khoản khác để chuyển đổi nhanh!", "info");
}

document.addEventListener("click", (e) => {
  const wrapper = document.getElementById("user-avatar-menu-wrapper");
  if (wrapper && !wrapper.contains(e.target)) {
    closeUserDropdown();
  }
  const notifWrapper = document.getElementById("notif-bell-wrapper");
  if (notifWrapper && !notifWrapper.contains(e.target)) {
    closeNotifDropdown();
  }
});

function handleAddRoomClick() {
  if (!canManageRooms()) {
    showToast("🔒 Chỉ tài khoản Chủ nhà (Chủ trọ) hoặc Admin mới có quyền đăng tin phòng trọ!", "info");
    return;
  }
  openAddRoomModal();
}

function openAuthModal(tab = "login") {
  switchAuthTab(tab);
  const modal = document.getElementById("auth-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById("login-form");
  const regForm = document.getElementById("register-form");
  const loginBtn = document.getElementById("tab-login-btn");
  const regBtn = document.getElementById("tab-register-btn");
  const landlordBtn = document.getElementById("tab-landlord-reg-btn");
  const roleInput = document.getElementById("reg-role");

  [loginBtn, regBtn, landlordBtn].forEach(b => {
    if (!b) return;
    b.classList.remove("bg-white", "text-blue-600", "text-amber-600", "shadow-sm");
    b.classList.add("text-slate-600");
  });

  if (tab === "login") {
    loginForm?.classList.remove("hidden");
    regForm?.classList.add("hidden");
    loginBtn?.classList.add("bg-white", "text-blue-600", "shadow-sm");
    loginBtn?.classList.remove("text-slate-600");
  } else if (tab === "register-landlord") {
    loginForm?.classList.add("hidden");
    regForm?.classList.remove("hidden");
    if (roleInput) roleInput.value = "landlord";
    landlordBtn?.classList.add("bg-white", "text-amber-600", "shadow-sm");
    landlordBtn?.classList.remove("text-slate-600");
    toggleRegisterRoleFields();
  } else {
    loginForm?.classList.add("hidden");
    regForm?.classList.remove("hidden");
    if (roleInput) roleInput.value = "tenant";
    regBtn?.classList.add("bg-white", "text-blue-600", "shadow-sm");
    regBtn?.classList.remove("text-slate-600");
    toggleRegisterRoleFields();
  }
}

function quickFillLogin(email) {
  document.getElementById("login-email").value = email;
  document.getElementById("login-password").value = "123456";
  document.getElementById("login-form").requestSubmit();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(`❌ ${data.message || "Đăng nhập thất bại"}`, "info");
      return;
    }

    authToken = data.accessToken;
    currentUser = data.user;
    localStorage.setItem("svtro_token", authToken);
    localStorage.setItem("svtro_user", JSON.stringify(currentUser));

    renderAuthHeader();
    closeModal("auth-modal");
    const meta = roleMeta[currentUser.role] || roleMeta.tenant;
    showToast(`✅ Xin chào ${currentUser.fullName} (${meta.label})!`, "success");
  } catch (err) {
    showToast("❌ Không kết nối được Backend NestJS (port 5000)!", "info");
  }
}

function toggleRegisterRoleFields() {
  const role = document.getElementById("reg-role")?.value || "tenant";
  const isLandlord = role === "landlord";
  const reasonWrap = document.getElementById("reg-reason-wrapper");
  const reasonInput = document.getElementById("reg-reason");
  const notice = document.getElementById("reg-role-notice");
  const btn = document.getElementById("reg-submit-btn");

  if (reasonWrap) reasonWrap.classList.toggle("hidden", !isLandlord);
  if (reasonInput) reasonInput.required = isLandlord;

  if (notice) {
    if (isLandlord) {
      notice.className = "bg-amber-500/15 border border-amber-500/40 text-amber-600 rounded-xl p-2.5 text-[11px] leading-relaxed font-semibold";
      notice.innerHTML = `<i class="fa-solid fa-shield-halved text-amber-500 mr-1"></i> Tài khoản <strong>Chủ trọ</strong> cần gửi thông tin xác minh để <strong>Admin phê duyệt</strong> trước khi đăng phòng.`;
    } else {
      notice.className = "bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 rounded-xl p-2.5 text-[11px] leading-relaxed font-semibold";
      notice.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i> Tài khoản <strong>Người thuê</strong> đăng ký được <strong>kích hoạt ngay lập tức</strong> không cần chờ duyệt.`;
    }
  }

  if (btn) {
    btn.className = isLandlord
      ? "w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl transition shadow-md shadow-amber-600/20 text-sm flex items-center justify-center gap-1.5"
      : "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl transition shadow-md shadow-emerald-600/20 text-sm flex items-center justify-center gap-1.5";
    btn.innerHTML = isLandlord
      ? `<i class="fa-solid fa-paper-plane"></i> Gửi yêu cầu Chủ trọ cho Admin duyệt`
      : `<i class="fa-solid fa-user-plus"></i> Đăng ký &amp; Sử dụng ngay`;
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const role = document.getElementById("reg-role").value;
  const fullName = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const phone = document.getElementById("reg-phone").value.trim();
  const password = document.getElementById("reg-password").value;
  const registerReason = role === "landlord" ? (document.getElementById("reg-reason")?.value.trim() || "") : "";

  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, fullName, email, phone, password, registerReason })
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message[0] : data.message;
      showToast(`❌ ${msg || "Đăng ký tài khoản thất bại"}`, "info");
      return;
    }

    document.getElementById("register-form").reset();
    toggleRegisterRoleFields();

    // Người thuê được cấp token và đăng nhập ngay lập tức
    if (data.accessToken && data.user) {
      authToken = data.accessToken;
      currentUser = data.user;
      localStorage.setItem("svtro_token", authToken);
      localStorage.setItem("svtro_user", JSON.stringify(currentUser));
      renderAuthHeader();
      closeModal("auth-modal");
      showToast(`🎉 Chào mừng ${currentUser.fullName}! Tài khoản Người thuê đã sẵn sàng sử dụng ngay.`, "success");
      return;
    }

    // Chủ trọ: chuyển sang tab đăng nhập và báo chờ Admin duyệt
    switchAuthTab("login");
    showToast("📩 Đã gửi yêu cầu đăng ký Chủ trọ cho Admin duyệt! Sau khi được duyệt bạn có thể đăng nhập.", "success");
  } catch (err) {
    showToast("❌ Không kết nối được Backend NestJS (port 5000)!", "info");
  }
}

function logoutUser() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem("svtro_token");
  localStorage.removeItem("svtro_user");
  renderAuthHeader();
  closeModal("dashboard-modal");
  showToast("👋 Đã đăng xuất tài khoản!", "info");
}

// =========================================================================
// BẢNG ĐIỀU KHIỂN QUẢN LÝ (ADMIN & CHỦ TRỌ)
// =========================================================================

function openDashboardModal(defaultTab) {
  if (!canManageRooms()) {
    showToast("🔒 Bạn không có quyền truy cập trang Quản lý!", "info");
    return;
  }

  const isAdmin = currentUser.role === "admin";
  document.getElementById("dashboard-title").innerHTML = isAdmin
    ? `<i class="fa-solid fa-crown text-rose-500"></i> Bảng Điều Khiển Quản Trị Viên (Admin)`
    : `<i class="fa-solid fa-house-user text-amber-600"></i> Trang Quản Lý Riêng — ${currentUser.fullName}`;
  document.getElementById("dashboard-subtitle").textContent = isAdmin
    ? "Phê duyệt yêu cầu tạo tài khoản mới, phân quyền, quản lý toàn bộ phòng và xử lý báo cáo"
    : "Không gian riêng biệt chỉ hiển thị phòng do bạn đăng — dễ dàng đăng, sửa, xóa mà không nhầm với chủ trọ khác";

  const statsTab = document.getElementById("dash-tab-stats");
  const pendingTab = document.getElementById("dash-tab-pending");
  const myRoomsTab = document.getElementById("dash-tab-myrooms");
  const usersTab = document.getElementById("dash-tab-users");
  const scamsTab = document.getElementById("dash-tab-scams");
  if (myRoomsTab) {
    myRoomsTab.innerHTML = isAdmin ? "🏠 Tất cả phòng" : "🏠 Phòng của tôi";
  }
  if (isAdmin) {
    statsTab?.classList.remove("hidden");
    pendingTab?.classList.remove("hidden");
    usersTab?.classList.remove("hidden");
    scamsTab?.classList.remove("hidden");
  } else {
    statsTab?.classList.add("hidden");
    pendingTab?.classList.add("hidden");
    usersTab?.classList.add("hidden");
    scamsTab?.classList.add("hidden");
  }

  const modal = document.getElementById("dashboard-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  const initialTab = defaultTab || (isAdmin ? "stats" : "myrooms");
  loadDashboardTab(initialTab);
}

async function loadDashboardTab(tab, customContent = null) {
  const content = customContent || document.getElementById("dashboard-content");
  if (!content) return;

  ["stats", "pending", "myrooms", "appointments", "inbox", "billing", "users", "scams"].forEach(t => {
    const btn = document.getElementById(`dash-tab-${t}`);
    if (!btn) return;
    if (t === tab) {
      btn.classList.add("border-blue-600", "text-blue-600");
      btn.classList.remove("border-transparent", "text-slate-500");
    } else {
      btn.classList.remove("border-blue-600", "text-blue-600");
      btn.classList.add("border-transparent", "text-slate-500");
    }
  });

  content.innerHTML = `<div class="py-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải dữ liệu từ MongoDB...</div>`;

  try {
    if (tab === "stats") {
      const res = await fetch(`${API_BASE_URL}/stats/admin`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Không thể tải thống kê");

      const ov = data.overview;
      content.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
            <div class="text-[11px] text-blue-600 font-bold">Tổng số phòng</div>
            <div class="text-2xl font-extrabold text-blue-900 mt-1">${ov.totalRooms}</div>
          </div>
          <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <div class="text-[11px] text-emerald-600 font-bold">Tài khoản (${ov.pendingUsers} chờ duyệt)</div>
            <div class="text-2xl font-extrabold text-emerald-900 mt-1">${ov.totalUsers}</div>
          </div>
          <div class="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
            <div class="text-[11px] text-indigo-600 font-bold">Lịch hẹn xem phòng</div>
            <div class="text-2xl font-extrabold text-indigo-900 mt-1">${ov.totalAppointments}</div>
          </div>
          <div class="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
            <div class="text-[11px] text-rose-600 font-bold">Báo cáo lừa đảo</div>
            <div class="text-2xl font-extrabold text-rose-900 mt-1">${ov.totalScamReports}</div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-white border border-slate-200 rounded-2xl">
            <h4 class="font-bold text-slate-800 mb-2 text-xs">📊 Giá thuê TB (triệu) & Số phòng theo Quận</h4>
            <canvas id="chart-district" height="200"></canvas>
          </div>
          <div class="p-4 bg-white border border-slate-200 rounded-2xl">
            <h4 class="font-bold text-slate-800 mb-2 text-xs">👥 Phân bổ tài khoản theo vai trò</h4>
            <canvas id="chart-roles" height="200"></canvas>
          </div>
        </div>
      `;

      if (typeof Chart !== "undefined") {
        const dCtx = document.getElementById("chart-district");
        if (dCtx) {
          new Chart(dCtx, {
            type: "bar",
            data: {
              labels: data.roomsByDistrict.map(d => d.district.replace("Quận ", "")),
              datasets: [
                {
                  label: "Giá TB (triệu VNĐ)",
                  data: data.roomsByDistrict.map(d => +(d.avgPrice / 1000000).toFixed(2)),
                  backgroundColor: "#3b82f6",
                  borderRadius: 6
                },
                {
                  label: "Số lượng phòng",
                  data: data.roomsByDistrict.map(d => d.count),
                  backgroundColor: "#10b981",
                  borderRadius: 6
                }
              ]
            },
            options: { responsive: true, plugins: { legend: { position: "bottom" } } }
          });
        }

        const rCtx = document.getElementById("chart-roles");
        if (rCtx) {
          const roleNameMap = { admin: "Admin", landlord: "Chủ trọ", student: "Sinh viên", worker: "Người lao động", tenant: "Khách" };
          new Chart(rCtx, {
            type: "doughnut",
            data: {
              labels: data.usersByRole.map(u => roleNameMap[u._id] || u._id),
              datasets: [{
                data: data.usersByRole.map(u => u.count),
                backgroundColor: ["#e11d48", "#f59e0b", "#2563eb", "#10b981", "#64748b"]
              }]
            },
            options: { responsive: true, plugins: { legend: { position: "bottom" } } }
          });
        }
      }
    } else if (tab === "myrooms") {
      const res = await fetch(`${API_BASE_URL}/rooms/my-rooms`, { headers: getAuthHeaders() });
      const myRooms = await res.json();
      if (!res.ok) throw new Error(myRooms.message || "Không thể tải danh sách phòng");

      const isAdmin = currentUser && currentUser.role === "admin";
      const availCount = myRooms.filter(r => r.status !== "full").length;
      const fullCount = myRooms.length - availCount;

      content.innerHTML = `
        <!-- Banner không gian riêng của Chủ trọ (tương phản rõ cả nền Sáng & Tối) -->
        <div class="p-4 rounded-2xl bg-slate-900 text-white border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div>
            <div class="font-extrabold text-white text-sm flex items-center gap-1.5">
              <i class="fa-solid ${isAdmin ? 'fa-crown text-rose-400' : 'fa-shield-halved text-amber-400'}"></i>
              ${isAdmin ? 'Quản lý toàn bộ phòng trên hệ thống (Quyền Admin)' : `Không gian quản lý riêng của ${currentUser.fullName}`}
            </div>
            <p class="text-[11px] text-slate-300 mt-0.5">
              ${isAdmin
                ? 'Admin có thể xem tên chủ sở hữu từng bài đăng và hỗ trợ chỉnh sửa/xóa khi cần.'
                : 'Chỉ hiển thị các phòng do chính bạn đăng tải — tách biệt hoàn toàn với chủ trọ khác để tránh sửa hoặc xóa nhầm.'}
            </p>
          </div>
          <button onclick="openAddRoomModal()" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition shrink-0 flex items-center gap-1.5">
            <i class="fa-solid fa-plus"></i> Đăng phòng mới
          </button>
        </div>

        <!-- Thống kê nhanh của riêng chủ trọ -->
        <div class="grid grid-cols-3 gap-2.5">
          <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <div class="text-[11px] text-slate-500 font-semibold">${isAdmin ? 'Tổng toàn hệ thống' : 'Phòng của bạn'}</div>
            <div class="text-lg font-extrabold text-slate-900">${myRooms.length}</div>
          </div>
          <div class="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
            <div class="text-[11px] text-emerald-700 font-semibold">Đang còn trống</div>
            <div class="text-lg font-extrabold text-emerald-700">${availCount}</div>
          </div>
          <div class="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-center">
            <div class="text-[11px] text-rose-700 font-semibold">Đã hết phòng</div>
            <div class="text-lg font-extrabold text-rose-700">${fullCount}</div>
          </div>
        </div>

        ${myRooms.length > 0 ? `
          <div>
            <input type="text" id="my-rooms-search-input" oninput="filterMyRoomsList(this.value)" placeholder="🔍 Tìm nhanh theo tên phòng hoặc địa chỉ của bạn..." class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none">
          </div>
          <div id="my-rooms-list" class="space-y-2.5">
            ${myRooms.map(r => {
              const ownerName = r.landlordId && typeof r.landlordId === "object" ? r.landlordId.fullName : "";
              return `
                <div class="my-room-item p-3 bg-white border border-slate-200 hover:border-blue-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition shadow-2xs" data-search="${(r.title + ' ' + r.address + ' ' + ownerName).toLowerCase()}">
                  <div class="flex items-center gap-3 min-w-0">
                    <img src="${(r.images && r.images[0]) || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=200&q=80'}" class="w-16 h-12 object-cover rounded-lg shrink-0 border border-slate-200">
                    <div class="min-w-0">
                      <div class="font-bold text-slate-900 text-xs line-clamp-1">${r.title}</div>
                      <div class="text-blue-600 font-bold text-xs">${formatCurrency(r.price)} • ${r.area}m² • ${r.status === 'full' ? '🔴 Đã hết' : `🟢 Còn ${r.availableCount || 1} phòng`}</div>
                      <div class="text-[11px] text-slate-500 line-clamp-1">
                        ${r.address} ${isAdmin && ownerName ? `<span class="ml-1 px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">👤 ${ownerName}</span>` : ''}
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button onclick="quickToggleMyRoomStatus('${r._id}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px]" title="Đổi nhanh Còn/Hết phòng">🔄 ${r.status === 'full' ? 'Mở lại' : 'Báo hết'}</button>
                    <button onclick="closeModal('dashboard-modal'); closeLandlordPage(); openRoomModal('${r._id}')" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold text-[11px]">👁️ Xem</button>
                    <button onclick="openEditRoomModal('${r._id}')" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px]">✏️ Sửa</button>
                    <button onclick="deleteRoom('${r._id}').then(() => refreshManagerViews('myrooms'))" class="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-bold text-[11px]">🗑️ Xóa</button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        ` : `
          <div class="py-10 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
            <div class="text-3xl mb-2">🏠</div>
            <div class="font-bold text-slate-700 text-sm mb-1">Bạn chưa đăng phòng trọ nào trong trang riêng của mình</div>
            <p class="text-xs text-slate-500 mb-3">Mọi phòng bạn đăng sẽ chỉ hiển thị tại đây để bạn dễ quản lý và không bị lẫn với chủ trọ khác.</p>
            <button onclick="openAddRoomModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow">+ Đăng phòng đầu tiên ngay</button>
          </div>
        `}
      `;
    } else if (tab === "pending") {
      const res = await fetch(`${API_BASE_URL}/users/pending`, { headers: getAuthHeaders() });
      const pendingUsers = await res.json();
      if (!res.ok) throw new Error(pendingUsers.message || "Không thể tải danh sách chờ duyệt");

      const badge = document.getElementById("pending-users-badge");
      if (badge) {
        badge.textContent = pendingUsers.length;
        if (pendingUsers.length > 0) badge.classList.remove("hidden");
        else badge.classList.add("hidden");
      }

      if (!pendingUsers.length) {
        content.innerHTML = `<div class="py-10 text-center text-emerald-600 font-semibold">✅ Hiện không có yêu cầu đăng ký tài khoản nào đang chờ duyệt.</div>`;
        return;
      }

      content.innerHTML = `
        <div class="text-slate-500 mb-2">Có <strong class="text-rose-600">${pendingUsers.length}</strong> yêu cầu tạo tài khoản đang chờ Admin phê duyệt:</div>
        <div class="space-y-3">
          ${pendingUsers.map(u => {
            const meta = roleMeta[u.role] || roleMeta.student;
            return `
              <div class="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.cls}">${meta.label}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">⏳ Chờ duyệt</span>
                  </div>
                  <div class="font-bold text-slate-900 text-sm">${u.fullName}</div>
                  <div class="text-slate-600 text-[11px] mt-0.5"><i class="fa-solid fa-envelope mr-1"></i>${u.email} • <i class="fa-solid fa-phone mr-1"></i>${u.phone}</div>
                  ${u.registerReason ? `<div class="mt-1.5 text-[11px] bg-white border border-amber-200/80 rounded-lg p-2 text-slate-700"><strong>Thông tin xác minh:</strong> ${u.registerReason}</div>` : ""}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button onclick="approvePendingUser('${u._id}')" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow transition flex items-center gap-1">
                    <i class="fa-solid fa-check"></i> Duyệt TK
                  </button>
                  <button onclick="rejectPendingUser('${u._id}')" class="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl font-bold text-xs transition flex items-center gap-1">
                    <i class="fa-solid fa-xmark"></i> Từ chối
                  </button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else if (tab === "users") {
      const res = await fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() });
      const users = await res.json();
      if (!res.ok) throw new Error(users.message || "Không thể tải danh sách tài khoản");

      content.innerHTML = `
        <div class="text-slate-500 mb-2">Tổng số tài khoản trong MongoDB: <strong class="text-slate-800">${users.length}</strong> (Admin có thể đổi quyền hoặc khóa tài khoản trực tiếp)</div>
        <div class="space-y-2.5">
          ${users.map(u => {
            const isSelf = currentUser && (String(u._id) === String(currentUser.id) || u.email === currentUser.email);
            const isAdminAccount = u.role === "admin";
            const isRootAdmin = u.email === "admin@svtro.vn";
            const isLocked = !isAdminAccount && u.isActive === false;
            return `
              <div class="p-3 ${isLocked ? 'bg-rose-50/60 border-rose-200' : 'bg-slate-50 border-slate-200'} border rounded-xl flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <div class="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>${u.fullName}</span>
                    ${isLocked ? '<span class="px-1.5 py-0.5 text-[10px] rounded bg-rose-600 text-white font-bold">Đã khóa</span>' : ''}
                    ${isSelf ? '<span class="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-bold">Bạn</span>' : ''}
                  </div>
                  <div class="text-slate-500 text-[11px]"><i class="fa-solid fa-envelope mr-1"></i>${u.email} • <i class="fa-solid fa-phone mr-1"></i>${u.phone}</div>
                </div>
                <div class="flex items-center gap-2">
                  <select onchange="changeUserRole('${u._id}', this.value)" ${(isSelf || isRootAdmin) ? 'disabled' : ''} class="bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 ${(isSelf || isRootAdmin) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}">
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
                    <option value="landlord" ${u.role === 'landlord' ? 'selected' : ''}>🏠 Chủ trọ</option>
                    <option value="tenant" ${(u.role === 'tenant' || u.role === 'student' || u.role === 'worker') ? 'selected' : ''}>👤 Người thuê</option>
                  </select>
                  ${isAdminAccount ? `
                    <span class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1" title="Tài khoản Admin không thể bị khóa">
                      <i class="fa-solid fa-shield-halved"></i> Bảo vệ
                    </span>
                  ` : `
                    <button onclick="toggleUserLock('${u._id}', ${!isLocked})" class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${isLocked ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}" title="${isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}">
                      <i class="fa-solid ${isLocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${isLocked ? 'Mở' : 'Khóa'}
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else if (tab === "appointments") {
      const res = await fetch(`${API_BASE_URL}/appointments`, { headers: getAuthHeaders() });
      const list = await res.json();
      if (!res.ok) throw new Error(list.message || "Không thể tải lịch hẹn");

      if (!list.length) {
        content.innerHTML = `<div class="py-10 text-center text-slate-400">Chưa có lịch hẹn xem phòng nào.</div>`;
        return;
      }

      content.innerHTML = list.map(a => {
        const statusBadge = a.status === "confirmed"
          ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">✅ Đã xác nhận</span>`
          : a.status === "cancelled"
          ? `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">❌ Đã hủy</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">⏳ Chờ xác nhận</span>`;

        return `
          <div class="p-3.5 ${a.isWaitlist ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200'} border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2 mb-1">
                ${a.isWaitlist ? '<span class="px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold">🔔 Chờ phòng trống</span>' : ''}
                ${statusBadge}
                <span class="font-bold text-slate-800">${a.appointmentDate} (${a.appointmentTime})</span>
              </div>
              <div class="font-bold text-blue-700">${a.roomTitle}</div>
              <div class="text-slate-600 mt-0.5">Khách: <strong>${a.tenantName}</strong> - SĐT: <a href="tel:${a.tenantPhone}" class="text-blue-600 underline">${a.tenantPhone}</a></div>
              ${a.note ? `<div class="text-slate-500 italic mt-0.5">"${a.note}"</div>` : ""}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button onclick="updateAppointmentStatus('${a._id}', 'confirmed')" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold">Xác nhận</button>
              <button onclick="updateAppointmentStatus('${a._id}', 'cancelled')" class="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-bold">Hủy</button>
            </div>
          </div>
        `;
      }).join("");
    } else if (tab === "inbox") {
      const res = await fetch(`${API_BASE_URL}/chat/conversations`, { headers: getAuthHeaders() });
      const convs = await res.json();
      if (!res.ok) throw new Error(convs.message || "Không thể tải hộp thư tin nhắn");

      if (!convs.length) {
        content.innerHTML = `<div class="py-10 text-center text-slate-400">💬 Chưa có khách hàng nào nhắn tin qua hệ thống Chat trực tiếp.</div>`;
        return;
      }

      content.innerHTML = `
        <div class="text-slate-500 mb-2">Hộp thư tập trung (<strong class="text-slate-800">${convs.length}</strong> phòng có tin nhắn — bấm vào để trả lời ngay):</div>
        <div class="space-y-2.5">
          ${convs.map(c => {
            const matchedRoom = rooms.find(r => String(r.id) === String(c._id));
            const roomTitle = matchedRoom ? matchedRoom.title : `Phòng #${c._id}`;
            const timeStr = c.lastTime ? new Date(c.lastTime).toLocaleString("vi-VN") : "";
            return `
              <div onclick="openChatModal('${c._id}', '${roomTitle.replace(/'/g, "\\'")}')" class="p-3.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-bold text-blue-700 text-xs truncate">${roomTitle}</div>
                  <div class="text-slate-800 text-xs mt-1 truncate"><strong>${c.lastSender}:</strong> ${c.lastMessage}</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">${timeStr} • ${c.messageCount} tin nhắn</div>
                </div>
                <span class="px-3 py-1.5 bg-sky-600 text-white rounded-lg font-bold text-[11px] shrink-0">Trả lời</span>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else if (tab === "billing") {
      // Tải danh sách phòng RIÊNG của chủ trọ này (Admin thấy toàn bộ)
      let billRooms = rooms;
      try {
        const myRes = await fetch(`${API_BASE_URL}/rooms/my-rooms`, { headers: getAuthHeaders() });
        if (myRes.ok) {
          const myList = await myRes.json();
          if (Array.isArray(myList) && myList.length > 0) {
            billRooms = myList.map(r => ({
              id: r._id,
              title: r.title,
              price: r.price,
              area: r.area,
              address: r.address,
              electricity: r.electricity || "3.200đ / kWh",
              estimatedKwh: r.estimatedKwh || 80,
              water: r.water || "50.000đ / người",
              status: r.status
            }));
          }
        }
      } catch (e) {
        console.warn(e);
      }

      window._billingRooms = billRooms;
      const savedMeters = getSavedBillingMeters();
      const firstId = window._selectedBillingRoomId && billRooms.some(r => String(r.id) === String(window._selectedBillingRoomId))
        ? window._selectedBillingRoomId
        : (billRooms[0]?.id || "");
      window._selectedBillingRoomId = firstId;

      let overdueWeekCount = 0;
      let unpaidCount = 0;
      let paidCount = 0;
      billRooms.forEach((r, idx) => {
        const m = savedMeters[String(r.id)] || getDefaultBillingMeter(r, idx);
        const info = getBillingOverdueInfo(m);
        if (info.state === "paid") paidCount++;
        else {
          unpaidCount++;
          if (info.state === "overdue-week") overdueWeekCount++;
        }
      });

      content.innerHTML = `
        <!-- Thanh lọc & Cảnh báo quá hạn thanh toán > 1 tuần (7 ngày) -->
        <div class="p-3.5 rounded-2xl ${overdueWeekCount > 0 ? 'bg-rose-50 border-rose-300' : 'bg-emerald-50 border-emerald-200'} border flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-center gap-2 text-xs font-extrabold ${overdueWeekCount > 0 ? 'text-rose-700' : 'text-emerald-700'}">
            <i class="fa-solid ${overdueWeekCount > 0 ? 'fa-triangle-exclamation text-rose-600' : 'fa-circle-check text-emerald-600'} text-base"></i>
            <span>${overdueWeekCount > 0 ? `Cảnh báo: Có ${overdueWeekCount} phòng đã quá hạn thanh toán trên 1 tuần (≥ 7 ngày)!` : 'Tốt! Hiện chưa có phòng nào quá hạn thanh toán trên 1 tuần.'}</span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            <button onclick="filterBillingRoomsByStatus('all', this)" class="bill-filter-btn px-2.5 py-1 rounded-lg bg-blue-600 text-white transition">📋 Tất cả (${billRooms.length})</button>
            <button onclick="filterBillingRoomsByStatus('overdue-week', this)" class="bill-filter-btn px-2.5 py-1 rounded-lg bg-white text-rose-700 border border-rose-200 hover:bg-rose-100 transition">🚨 Quá hạn > 1 tuần (${overdueWeekCount})</button>
            <button onclick="filterBillingRoomsByStatus('unpaid', this)" class="bill-filter-btn px-2.5 py-1 rounded-lg bg-white text-amber-800 border border-amber-200 hover:bg-amber-100 transition">⏳ Chưa đóng (${unpaidCount})</button>
            <button onclick="filterBillingRoomsByStatus('paid', this)" class="bill-filter-btn px-2.5 py-1 rounded-lg bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition">✅ Đã đóng (${paidCount})</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <!-- Cột 1: Danh sách phòng thuê (Bấm chọn từng phòng để xem mức tiêu thụ & lập hóa đơn) -->
          <div class="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                <i class="fa-solid fa-door-open text-blue-600"></i> Danh sách phòng thuê (${billRooms.length})
              </div>
              <button onclick="exportAllRoomsExcel()" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] shadow-2xs transition" title="Xuất bảng tổng hợp Excel tất cả phòng">
                📑 Xuất tất cả (.xlsx)
              </button>
            </div>
            <p class="text-[10px] text-slate-500">Bấm từng phòng để xem mức tiêu thụ, hạn thanh toán và cộng tiền theo hợp đồng.</p>

            <div id="billing-room-list" class="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              ${billRooms.map((r, idx) => {
                const m = savedMeters[String(r.id)] || getDefaultBillingMeter(r, idx);
                const kwh = Math.max(0, (m.elecNew || 0) - (m.elecOld || 0));
                const info = getBillingOverdueInfo(m);
                const isSel = String(r.id) === String(firstId);
                return `
                  <div onclick="selectBillingRoom('${r.id}')" id="bill-room-card-${r.id}" data-pay-state="${info.state}" class="bill-room-card p-3 rounded-xl border cursor-pointer transition ${isSel ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-100' : (info.state === 'overdue-week' ? 'bg-rose-50/70 border-rose-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100')}">
                    <div class="flex items-center justify-between gap-1.5">
                      <div class="font-bold text-slate-900 text-xs line-clamp-1">${r.title}</div>
                    </div>
                    <div class="mt-1">
                      <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${info.badgeCls}">${info.badgeText}</span>
                    </div>
                    <div class="flex items-center justify-between gap-1 mt-1.5 text-[11px]">
                      <span class="font-extrabold text-blue-600">${formatCurrency(r.price)}</span>
                      <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">⚡ ${kwh} kWh • 💧 ${m.people || 2} ng</span>
                    </div>
                    <div class="text-[10px] text-slate-500 mt-1 truncate">HĐ: Điện ${r.electricity} • Nước ${r.water}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- Cột 2: Mức độ tiêu thụ & Thông số theo hợp đồng -->
          <div class="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
            <input type="hidden" id="bill-room-select" value="${firstId}">
            <div id="bill-contract-summary" class="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] space-y-1">
              <!-- Tóm tắt đơn giá theo hợp đồng -->
            </div>

            <!-- Thanh mức độ tiêu thụ điện -->
            <div id="bill-usage-meter" class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
              <!-- Hiển thị mức độ tiêu thụ -->
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Tên người thuê</label>
                <input type="text" id="bill-tenant-name" placeholder="Nguyễn Minh Quân" oninput="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">SĐT người thuê</label>
                <input type="text" id="bill-tenant-phone" placeholder="0914222333" oninput="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">📅 Hạn thanh toán</label>
                <input type="date" id="bill-due-date" onchange="recalcBillingReceipt(true)" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Trạng thái đóng tiền</label>
                <select id="bill-pay-status" onchange="recalcBillingReceipt(true)" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold">
                  <option value="unpaid">⏳ Chưa thanh toán</option>
                  <option value="paid">✅ Đã thanh toán</option>
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Số điện cũ (kWh)</label>
                <input type="number" id="bill-elec-old" value="1200" oninput="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Số điện mới (kWh)</label>
                <input type="number" id="bill-elec-new" value="1285" oninput="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Số người ở (tính nước)</label>
                <input type="number" id="bill-people" value="2" min="1" max="10" oninput="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Phí Wifi / Rác (VNĐ)</label>
                <input type="number" id="bill-extra" value="100000" step="10000" oninput="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Ngân hàng (VietQR)</label>
                <select id="bill-bank" onchange="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold">
                  <option value="MB">MB Bank</option>
                  <option value="VCB">Vietcombank</option>
                  <option value="TCB">Techcombank</option>
                  <option value="BIDV">BIDV</option>
                  <option value="ACB">ACB</option>
                  <option value="VPB">VPBank</option>
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Số tài khoản</label>
                <input type="text" id="bill-account" value="${currentUser?.phone || '0905123456'}" oninput="recalcBillingReceipt()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-1">
              <button onclick="exportSingleRoomExcel()" class="col-span-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-file-excel"></i> Xuất file Excel (.xlsx) gửi người thuê
              </button>
              <button onclick="copyOverdueReminderForZalo()" class="col-span-2 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow transition">
                📢 Copy tin nhắc đóng tiền / Quá hạn gửi Zalo
              </button>
              <button onclick="copyBillForZalo()" class="py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow transition">📋 Copy phiếu thu</button>
              <button onclick="printBillReceipt()" class="py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold shadow transition">🖨️ In phiếu thu</button>
            </div>
          </div>

          <!-- Cột 3: Phiếu thu chi tiết & Mã VietQR -->
          <div class="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between" id="bill-receipt-preview">
            <!-- Phiếu thu & VietQR -->
          </div>
        </div>
      `;
      selectBillingRoom(firstId);
    } else if (tab === "scams") {
      const res = await fetch(`${API_BASE_URL}/reviews/scams`, { headers: getAuthHeaders() });
      const list = await res.json();
      if (!res.ok) throw new Error(list.message || "Không thể tải báo cáo lừa đảo");

      if (!list.length) {
        content.innerHTML = `<div class="py-10 text-center text-emerald-600 font-semibold">🎉 Tuyệt vời! Chưa có báo cáo lừa đảo nào.</div>`;
        return;
      }

      content.innerHTML = list.map(r => `
        <div class="p-3.5 bg-rose-50 border border-rose-200 rounded-xl">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-rose-700">🚨 Báo cáo từ: ${r.authorName}</span>
            <span class="text-[11px] text-rose-600 font-bold">${r.rating} ⭐</span>
          </div>
          <div class="font-bold text-slate-800">Lý do: ${r.reportReason || "Nghi ngờ lừa đảo / cọc ảo"}</div>
          <div class="text-slate-600 mt-1">${r.comment}</div>
        </div>
      `).join("");
    }
  } catch (err) {
    content.innerHTML = `<div class="py-8 text-center text-rose-600 font-bold">❌ ${err.message}</div>`;
  }
}

async function updateAppointmentStatus(id, status) {
  try {
    const res = await fetch(`${API_BASE_URL}/appointments/${id}/status`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      showToast(status === "confirmed" ? "✅ Đã xác nhận lịch hẹn!" : "❌ Đã hủy lịch hẹn!", "success");
      refreshManagerViews("appointments");
    }
  } catch (err) {
    showToast("❌ Lỗi cập nhật trạng thái lịch hẹn", "info");
  }
}


async function changeUserRole(userId, newRole) {
  try {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/role`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) {
      const meta = roleMeta[newRole] || roleMeta.tenant;
      showToast(`✅ Đã cập nhật phân quyền sang ${meta.label} trong MongoDB!`, "success");
      loadDashboardTab("users");
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể đổi quyền"}`, "info");
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

async function toggleUserLock(userId, shouldLock) {
  const newIsActive = !shouldLock;
  try {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/status`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ isActive: newIsActive })
    });
    if (res.ok) {
      showToast(shouldLock ? "🔒 Đã khóa tài khoản thành công!" : "🔓 Đã mở khóa tài khoản!", "success");
      loadDashboardTab("users");
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể cập nhật trạng thái"}`, "info");
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}


async function approvePendingUser(userId) {
  try {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/approve`, {
      method: "PATCH",
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast("✅ Đã phê duyệt tài khoản! Người dùng đã có thể đăng nhập & đăng tin.", "success");
      loadDashboardTab("pending");
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể duyệt tài khoản"}`, "info");
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

async function rejectPendingUser(userId) {
  if (!confirm("Bạn có chắc chắn muốn từ chối yêu cầu đăng ký tài khoản này?")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/users/${userId}/reject`, {
      method: "PATCH",
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast("❌ Đã từ chối yêu cầu đăng ký tài khoản!", "info");
      loadDashboardTab("pending");
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể từ chối tài khoản"}`, "info");
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}


// =========================================================================
// 5 TÍNH NĂNG MỞ RỘNG: UPLOAD ẢNH, XEM REVIEWS, YÊU THÍCH, SỬA PHÒNG, TÌM QUANH TÔI
// =========================================================================

let showingFavoritesOnly = false;
let userRadiusCircle = null;

// 1. Xem trước ảnh thật trước khi upload
function previewRoomImages(event) {
  const preview = document.getElementById("room-images-preview");
  if (!preview) return;
  preview.innerHTML = "";
  const files = Array.from(event.target.files || []).slice(0, 5);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.src = e.target.result;
      img.className = "w-full h-14 object-cover rounded-lg border border-slate-200 shadow-sm";
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// 2. Tải & hiển thị danh sách Đánh giá (Reviews) từ MongoDB ngay trong Chi tiết phòng
async function loadRoomReviews(roomId) {
  const container = document.getElementById("modal-room-reviews");
  if (!container) return;

  if (!isBackendOnline || !roomId || String(roomId).length !== 24) {
    container.innerHTML = `<div class="text-slate-400 italic">Chưa có đánh giá nào cho phòng này.</div>`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/reviews/room/${roomId}`);
    if (!res.ok) throw new Error();
    const list = await res.json();

    if (!list || list.length === 0) {
      container.innerHTML = `<div class="text-slate-400 italic bg-slate-50 p-3 rounded-xl">Chưa có đánh giá nào. Hãy là người đầu tiên chia sẻ trải nghiệm thực tế!</div>`;
      return;
    }

    const avg = (list.reduce((sum, r) => sum + (r.rating || 5), 0) / list.length).toFixed(1);

    container.innerHTML = `
      <div class="flex items-center gap-2 mb-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
        <span class="text-base font-extrabold text-amber-600">⭐ ${avg} / 5</span>
        <span class="text-xs text-amber-800 font-semibold">(${list.length} đánh giá thực tế)</span>
      </div>
      ${list.map(r => `
        <div class="p-3 rounded-xl border ${r.isScamReport ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-slate-800">${r.authorName}</span>
            <span class="text-amber-500 font-bold">${'⭐'.repeat(r.rating || 5)}</span>
          </div>
          ${r.isScamReport ? `<div class="text-[11px] font-bold text-rose-700 mb-1">🚨 Cảnh báo lừa đảo: ${r.reportReason || 'Nghi ngờ sai sự thật'}</div>` : ""}
          <p class="text-slate-600 leading-relaxed">${r.comment}</p>
        </div>
      `).join("")}
    `;
  } catch (err) {
    container.innerHTML = `<div class="text-slate-400 italic">Không thể tải đánh giá.</div>`;
  }
}

// 3. Bấm nút Trái tim ❤️ trên Header để xem danh sách "Phòng đã lưu (Yêu thích)"
function toggleShowFavorites() {
  const btn = document.getElementById("fav-filter-btn");
  showingFavoritesOnly = !showingFavoritesOnly;

  if (showingFavoritesOnly) {
    btn?.classList.add("bg-rose-50", "text-red-500", "ring-2", "ring-rose-200");
    const favRooms = rooms.filter(r => savedFavorites.map(String).includes(String(r.id)));
    renderRooms(favRooms);
    showToast(`❤️ Đang xem ${favRooms.length} phòng bạn đã lưu! (Bấm lại để xem tất cả)`, "info");
  } else {
    btn?.classList.remove("bg-rose-50", "text-red-500", "ring-2", "ring-rose-200");
    applyFilters();
    showToast("Hiển thị lại toàn bộ danh sách phòng trọ", "info");
  }
}

// 4. Mở Modal Chỉnh sửa phòng trọ (Edit Room)
function openEditRoomModal(roomId) {
  if (!canManageRooms()) {
    showToast("🔒 Chỉ Chủ trọ hoặc Admin mới được sửa thông tin phòng!", "info");
    return;
  }
  const room = rooms.find(r => String(r.id) === String(roomId));
  if (!room) {
    showToast("Không tìm thấy thông tin phòng để sửa", "info");
    return;
  }
  if (!canEditRoom(room)) {
    showToast("🔒 Bạn chỉ được chỉnh sửa phòng do chính bạn đăng!", "info");
    return;
  }

  document.getElementById("edit-room-id").value = room.id;
  document.getElementById("edit-room-title").value = room.title || "";
  document.getElementById("edit-room-price").value = room.price || 0;
  document.getElementById("edit-room-area").value = room.area || 20;
  document.getElementById("edit-room-electricity").value = room.electricity || "3.200đ / kWh";
  document.getElementById("edit-room-water").value = room.water || "50.000đ / người";
  document.getElementById("edit-room-status").value = room.status || "available";
  document.getElementById("edit-room-count").value = room.availableCount ?? 1;
  document.getElementById("edit-room-address").value = room.address || "";
  document.getElementById("edit-room-desc").value = room.description || "";

  closeModal("room-detail-modal");
  const modal = document.getElementById("edit-room-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

async function handleEditRoomSubmit(e) {
  e.preventDefault();
  const roomId = document.getElementById("edit-room-id").value;
  const payload = {
    title: document.getElementById("edit-room-title").value.trim(),
    price: parseInt(document.getElementById("edit-room-price").value),
    area: parseInt(document.getElementById("edit-room-area").value),
    electricity: document.getElementById("edit-room-electricity").value.trim(),
    water: document.getElementById("edit-room-water").value.trim(),
    status: document.getElementById("edit-room-status").value,
    availableCount: parseInt(document.getElementById("edit-room-count").value) || 0,
    address: document.getElementById("edit-room-address").value.trim(),
    description: document.getElementById("edit-room-desc").value.trim()
  };

  if (isBackendOnline && String(roomId).length === 24) {
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ ${err.message || "Không thể lưu thay đổi"}`, "info");
        return;
      }
      closeModal("edit-room-modal");
      showToast("💾 Đã cập nhật thông tin phòng vào MongoDB thành công!", "success");
      await checkBackendHealthAndLoad();
      const dashModal = document.getElementById("dashboard-modal");
      if (dashModal && !dashModal.classList.contains("hidden")) {
        loadDashboardTab("myrooms");
      }
      const adminModal = document.getElementById("admin-page-modal");
      if (adminModal && !adminModal.classList.contains("hidden")) {
        loadAdminSection(window._activeAdminSection || "landlords");
      }
      refreshManagerViews("myrooms");
      return;
    } catch (err) {
      showToast("❌ Lỗi kết nối Backend NestJS", "info");
      return;
    }
  }

  // Fallback offline
  const room = rooms.find(r => String(r.id) === String(roomId));
  if (room) Object.assign(room, payload);
  closeModal("edit-room-modal");
  renderRooms(rooms);
  showToast("💾 Đã cập nhật thông tin phòng!", "success");
}

function filterMyRoomsList(keyword) {
  const q = (keyword || "").trim().toLowerCase();
  document.querySelectorAll("#my-rooms-list .my-room-item").forEach(el => {
    const hay = el.getAttribute("data-search") || "";
    el.style.display = (!q || hay.includes(q)) ? "" : "none";
  });
}

async function quickToggleMyRoomStatus(roomId) {
  await toggleRoomStatus(roomId);
  await checkBackendHealthAndLoad();
  refreshManagerViews("myrooms");
}

// 5. Tìm phòng theo bán kính GPS 3km quanh vị trí người dùng (MongoDB 2dsphere)
async function findRoomsNearMe() {
  showToast("📍 Đang định vị tọa độ GPS của bạn...", "info");

  const runGeoQuery = async (lat, lng, label) => {
    // Vẽ vòng tròn bán kính 3km trên bản đồ Leaflet
    if (map) {
      if (userRadiusCircle) map.removeLayer(userRadiusCircle);
      userRadiusCircle = L.circle([lat, lng], {
        radius: 3000,
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 0.12,
        weight: 2
      }).addTo(map);
      map.setView([lat, lng], 13);
    }

    if (isBackendOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/rooms?lat=${lat}&lng=${lng}&radiusInKm=3`);
        if (res.ok) {
          const data = await res.json();
          const mapped = (data.rooms || []).map(r => ({
            id: r._id,
            title: r.title,
            price: r.price,
            area: r.area,
            district: r.district,
            districtName: r.districtName,
            address: r.address,
            nearUni: r.nearPlaceId || "all",
            nearUniName: r.nearPlaceName || "Đà Nẵng",
            distance: r.distance || "Trong 3km",
            lat: (r.location && r.location.coordinates) ? r.location.coordinates[1] : lat,
            lng: (r.location && r.location.coordinates) ? r.location.coordinates[0] : lng,
            type: r.type,
            status: r.status,
            targetAudience: r.targetAudience || "all",
            availableCount: r.availableCount || 1,
            amenities: r.amenities || [],
            image: (r.images && r.images.length > 0) ? r.images[0] : "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
            phone: r.phone,
            zalo: r.zalo,
            electricity: r.electricity || "3.200đ / kWh",
            water: r.water || "50.000đ / người",
            description: r.description || ""
          }));
          renderRooms(mapped);
          showToast(`📍 Tìm thấy ${mapped.length} phòng trong bán kính 3km quanh ${label} (MongoDB 2dsphere)!`, "success");
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }
    showToast("📍 Đã hiển thị khu vực bán kính 3km trên bản đồ", "info");
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => runGeoQuery(pos.coords.latitude, pos.coords.longitude, "vị trí của bạn"),
      () => runGeoQuery(16.0544, 108.2022, "trung tâm TP. Đà Nẵng"),
      { timeout: 5000 }
    );
  } else {
    runGeoQuery(16.0544, 108.2022, "trung tâm TP. Đà Nẵng");
  }
}


// =========================================================================
// 5 TÍNH NĂNG NÂNG CAO: SO SÁNH PHÒNG, DỰ TOÁN CHI PHÍ, LỊCH HẸN CỦA TÔI, CHAT WEBSOCKET
// =========================================================================

// 1. SO SÁNH 2–3 PHÒNG TRỌ CẠNH NHAU
let compareList = [];

function toggleCompare(roomId, event) {
  event.stopPropagation();
  const strId = String(roomId);
  const idx = compareList.indexOf(strId);
  if (idx > -1) {
    compareList.splice(idx, 1);
    showToast("Đã bỏ phòng khỏi danh sách so sánh", "info");
  } else {
    if (compareList.length >= 3) {
      showToast("⚠️ Chỉ có thể so sánh tối đa 3 phòng cùng lúc!", "info");
      return;
    }
    compareList.push(strId);
    showToast(`⚖️ Đã thêm vào so sánh (${compareList.length}/3)`, "success");
  }
  updateCompareBar();
  applyFilters();
}

function updateCompareBar() {
  const bar = document.getElementById("compare-bar");
  const txt = document.getElementById("compare-bar-text");
  if (!bar || !txt) return;
  if (compareList.length > 0) {
    bar.classList.remove("hidden");
    txt.textContent = `Đã chọn ${compareList.length}/3 phòng để so sánh`;
  } else {
    bar.classList.add("hidden");
  }
}

function clearCompareList() {
  compareList = [];
  updateCompareBar();
  applyFilters();
}

function openCompareModal() {
  if (compareList.length < 2) {
    showToast("⚠️ Hãy chọn ít nhất 2 phòng để so sánh cạnh nhau!", "info");
    return;
  }
  const selected = compareList.map(id => rooms.find(r => String(r.id) === id)).filter(Boolean);
  if (selected.length < 2) return;

  const minPrice = Math.min(...selected.map(r => r.price));
  const maxArea = Math.max(...selected.map(r => r.area));

  const content = document.getElementById("compare-modal-content");
  if (!content) return;

  content.innerHTML = `
    <table class="w-full border-collapse text-left">
      <thead>
        <tr>
          <th class="p-3 bg-slate-100 border border-slate-200 w-32 font-bold text-slate-700">Tiêu chí</th>
          ${selected.map(r => `
            <th class="p-3 bg-slate-50 border border-slate-200 align-top">
              <img src="${r.image}" class="w-full h-28 object-cover rounded-xl mb-2">
              <div class="font-bold text-slate-900 line-clamp-2 text-xs">${r.title}</div>
            </th>
          `).join("")}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="p-3 font-bold bg-slate-50 border border-slate-200">Giá thuê</td>
          ${selected.map(r => `
            <td class="p-3 border border-slate-200 font-extrabold text-sm ${r.price === minPrice ? 'bg-emerald-50 text-emerald-700' : 'text-blue-600'}">
              ${formatCurrency(r.price)} ${r.price === minPrice ? '<span class="ml-1 text-[10px] px-1.5 py-0.5 bg-emerald-600 text-white rounded">Rẻ nhất</span>' : ''}
            </td>
          `).join("")}
        </tr>
        <tr>
          <td class="p-3 font-bold bg-slate-50 border border-slate-200">Diện tích</td>
          ${selected.map(r => `
            <td class="p-3 border border-slate-200 font-bold ${r.area === maxArea ? 'bg-emerald-50 text-emerald-700' : ''}">
              ${r.area} m² ${r.area === maxArea ? '<span class="ml-1 text-[10px] px-1.5 py-0.5 bg-emerald-600 text-white rounded">Rộng nhất</span>' : ''}
            </td>
          `).join("")}
        </tr>
        <tr>
          <td class="p-3 font-bold bg-slate-50 border border-slate-200">Tiền điện / nước</td>
          ${selected.map(r => `
            <td class="p-3 border border-slate-200">
              <div>⚡ ${r.electricity || '3.200đ/kWh'}</div>
              <div>💧 ${r.water || '50.000đ/người'}</div>
            </td>
          `).join("")}
        </tr>
        <tr>
          <td class="p-3 font-bold bg-slate-50 border border-slate-200">Vị trí gần</td>
          ${selected.map(r => `
            <td class="p-3 border border-slate-200">
              <div class="font-bold text-slate-800">${r.nearUniName}</div>
              <div class="text-slate-500">Cách ${r.distance}</div>
            </td>
          `).join("")}
        </tr>
        <tr>
          <td class="p-3 font-bold bg-slate-50 border border-slate-200">Tình trạng</td>
          ${selected.map(r => `<td class="p-3 border border-slate-200">${getStatusBadge(r.status, r.availableCount)}</td>`).join("")}
        </tr>
        <tr>
          <td class="p-3 font-bold bg-slate-50 border border-slate-200">Tiện ích</td>
          ${selected.map(r => `
            <td class="p-3 border border-slate-200">
              <div class="flex flex-wrap gap-1">
                ${(r.amenities || []).map(a => amenityLabels[a] ? `<span class="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">${amenityLabels[a].name}</span>` : "").join("")}
              </div>
            </td>
          `).join("")}
        </tr>
        <tr>
          <td class="p-3 font-bold bg-slate-50 border border-slate-200">Hành động</td>
          ${selected.map(r => `
            <td class="p-3 border border-slate-200">
              <button onclick="closeModal('compare-modal'); openRoomModal('${r.id}')" class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs">
                Xem chi tiết
              </button>
            </td>
          `).join("")}
        </tr>
      </tbody>
    </table>
  `;

  const modal = document.getElementById("compare-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

// 2. MÁY TÍNH DỰ TOÁN CHI PHÍ THỰC TẾ / NGƯỜI
function parseVndNumber(str, fallback) {
  if (!str) return fallback;
  const cleaned = String(str).replace(/\./g, "").replace(/,/g, "");
  const match = cleaned.match(/\d+/);
  return match ? parseInt(match[0], 10) : fallback;
}

function recalcRoomCost(roomPrice, elecStr, waterStr) {
  const people = parseInt(document.getElementById("calc-people")?.value || "2", 10);
  const kwh = parseInt(document.getElementById("calc-kwh")?.value || "80", 10);

  const kwhLabel = document.getElementById("calc-kwh-label");
  if (kwhLabel) kwhLabel.textContent = `${kwh} kWh`;

  const elecUnit = parseVndNumber(elecStr, 3200);
  const waterPerPerson = parseVndNumber(waterStr, 50000);

  const totalRoom = Number(roomPrice) + (kwh * elecUnit) + (people * waterPerPerson);
  const perPerson = Math.round(totalRoom / people);

  const totalEl = document.getElementById("calc-total-room");
  const perEl = document.getElementById("calc-per-person");
  if (totalEl) totalEl.textContent = `${totalRoom.toLocaleString("vi-VN")} đ`;
  if (perEl) perEl.textContent = `${perPerson.toLocaleString("vi-VN")} đ`;
}

// 3. LỊCH HẸN CỦA TÔI (CHO SINH VIÊN & NGƯỜI LAO ĐỘNG)
async function openMyAppointmentsModal() {
  if (!currentUser || !authToken) {
    showToast("🔒 Vui lòng đăng nhập để xem lịch hẹn của bạn!", "info");
    openAuthModal("login");
    return;
  }

  const modal = document.getElementById("my-appointments-modal");
  const content = document.getElementById("my-appointments-content");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
  if (!content) return;

  content.innerHTML = `<div class="py-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải lịch hẹn từ MongoDB...</div>`;

  try {
    const res = await fetch(`${API_BASE_URL}/appointments/my`, { headers: getAuthHeaders() });
    const list = await res.json();
    if (!res.ok) throw new Error(list.message || "Không thể tải lịch hẹn");

    if (!list.length) {
      content.innerHTML = `
        <div class="py-10 text-center text-slate-500">
          <div class="text-3xl mb-2">📅</div>
          <p class="font-bold text-slate-700 mb-1">Bạn chưa đặt lịch xem phòng nào</p>
          <p class="text-[11px]">Hãy bấm vào một phòng bất kỳ rồi chọn <strong>Đặt lịch</strong> để hẹn chủ trọ nhé!</p>
        </div>
      `;
      return;
    }

    content.innerHTML = list.map(a => {
      const badge = a.status === "confirmed"
        ? `<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">✅ Chủ trọ đã xác nhận</span>`
        : a.status === "cancelled"
        ? `<span class="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">❌ Chủ trọ đã hủy</span>`
        : `<span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">⏳ Đang chờ chủ trọ xác nhận</span>`;

      return `
        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            ${badge}
            <span class="font-bold text-slate-700"><i class="fa-regular fa-clock mr-1"></i>${a.appointmentDate} • ${a.appointmentTime}</span>
          </div>
          <div class="font-bold text-blue-700 text-sm">${a.roomTitle}</div>
          ${a.note ? `<div class="text-slate-500 italic mt-1">Ghi chú: "${a.note}"</div>` : ""}
        </div>
      `;
    }).join("");
  } catch (err) {
    content.innerHTML = `<div class="py-8 text-center text-rose-600 font-bold">❌ ${err.message}</div>`;
  }
}

// 4. CHAT TRỰC TIẾP THỜI GIAN THỰC (NESTJS WEBSOCKET / SOCKET.IO)
let chatSocket = null;

async function openChatModal(roomId, roomTitle) {
  document.getElementById("chat-room-id").value = roomId;
  document.getElementById("chat-room-title").textContent = roomTitle || "Phòng trọ";

  const modal = document.getElementById("chat-modal");
  const box = document.getElementById("chat-messages-box");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
  if (!box) return;

  box.innerHTML = `<div class="text-center text-slate-400 py-6"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải lịch sử tin nhắn...</div>`;

  // 1. Tải lịch sử tin nhắn từ MongoDB
  try {
    const res = await fetch(`${API_BASE_URL}/chat/room/${roomId}`);
    if (res.ok) {
      const history = await res.json();
      box.innerHTML = "";
      if (history.length === 0) {
        box.innerHTML = `<div id="chat-empty-hint" class="text-center text-slate-400 py-8">Hãy gửi tin nhắn đầu tiên để hỏi chủ trọ về phòng này!</div>`;
      } else {
        history.forEach(m => appendChatMessage(m));
      }
    }
  } catch (err) {
    box.innerHTML = `<div class="text-center text-rose-500 py-6">Không thể kết nối máy chủ chat.</div>`;
  }

  // 2. Kết nối Socket.io tới NestJS WebSocket Gateway
  if (typeof io !== "undefined") {
    if (chatSocket) {
      chatSocket.disconnect();
    }
    chatSocket = io("http://localhost:5000");
    chatSocket.on("connect", () => {
      chatSocket.emit("joinRoom", { roomId });
    });
    chatSocket.on("newMessage", (msg) => {
      appendChatMessage(msg);
    });
  }
}

function closeChatModal() {
  if (chatSocket) {
    chatSocket.disconnect();
    chatSocket = null;
  }
  closeModal("chat-modal");
}

function appendChatMessage(msg) {
  const box = document.getElementById("chat-messages-box");
  if (!box) return;
  const hint = document.getElementById("chat-empty-hint");
  if (hint) hint.remove();

  const myName = currentUser ? currentUser.fullName : "Khách thuê";
  const isMe = msg.senderName === myName;
  const meta = roleMeta[msg.senderRole] || { label: "👤 Khách", cls: "bg-slate-200 text-slate-700" };

  const div = document.createElement("div");
  div.className = `flex flex-col ${isMe ? "items-end" : "items-start"}`;
  div.innerHTML = `
    <div class="flex items-center gap-1.5 mb-0.5 text-[10px] text-slate-500">
      <span class="font-bold text-slate-700">${msg.senderName}</span>
      <span class="px-1.5 py-0.2 rounded border ${meta.cls}">${meta.label}</span>
    </div>
    <div class="max-w-[82%] px-3 py-2 rounded-2xl shadow-sm ${isMe ? "bg-blue-600 text-white rounded-tr-sm" : "bg-white text-slate-800 border border-slate-200 rounded-tl-sm"}">
      ${msg.content}
    </div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function sendChatMessage(e) {
  e.preventDefault();
  const roomId = document.getElementById("chat-room-id").value;
  const input = document.getElementById("chat-input");
  const content = input.value.trim();
  if (!content) return;

  const senderName = currentUser ? currentUser.fullName : "Khách thuê";
  const senderRole = currentUser ? currentUser.role : "guest";

  if (chatSocket && chatSocket.connected) {
    chatSocket.emit("sendMessage", { roomId, senderName, senderRole, content });
    input.value = "";
  } else {
    showToast("❌ WebSocket chưa kết nối tới Backend NestJS!", "info");
  }
}


// =========================================================================
// TRỢ LÝ AI HỖ TRỢ GIẢI ĐÁP & GỢI Ý PHÒNG TRỌ 24/7
// =========================================================================

function toggleAiWidget() {
  const panel = document.getElementById("ai-widget-panel");
  if (!panel) return;
  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
    panel.classList.add("flex");
    document.getElementById("ai-question-input")?.focus();
  } else {
    panel.classList.add("hidden");
    panel.classList.remove("flex");
  }
}

function formatAiText(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function askAiQuick(question) {
  const input = document.getElementById("ai-question-input");
  if (input) {
    input.value = question;
    sendAiQuestion({ preventDefault: () => {} });
  }
}

async function sendAiQuestion(e) {
  e.preventDefault();
  const input = document.getElementById("ai-question-input");
  const box = document.getElementById("ai-messages-box");
  if (!input || !box) return;

  const question = input.value.trim();
  if (!question) return;
  input.value = "";

  // 1. Hiển thị câu hỏi của khách
  const userBubble = document.createElement("div");
  userBubble.className = "flex justify-end";
  userBubble.innerHTML = `
    <div class="max-w-[82%] bg-blue-600 text-white px-3.5 py-2.5 rounded-2xl rounded-tr-sm shadow-sm leading-relaxed">
      ${question}
    </div>
  `;
  box.appendChild(userBubble);

  // 2. Hiển thị hiệu ứng AI đang trả lời
  const typingId = "ai-typing-" + Date.now();
  const typingEl = document.createElement("div");
  typingEl.id = typingId;
  typingEl.className = "flex items-start gap-2";
  typingEl.innerHTML = `
    <div class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
      <i class="fa-solid fa-robot text-xs"></i>
    </div>
    <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-slate-400 italic shadow-sm">
      <i class="fa-solid fa-spinner fa-spin mr-1"></i> Trợ lý AI đang phân tích dữ liệu...
    </div>
  `;
  box.appendChild(typingEl);
  box.scrollTop = box.scrollHeight;

  try {
    const res = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    const data = await res.json();
    document.getElementById(typingId)?.remove();

    const roomsHtml = (data.suggestedRooms && data.suggestedRooms.length > 0)
      ? `<div class="mt-2.5 space-y-2">
          ${data.suggestedRooms.map(r => `
            <div onclick="openRoomModal('${r.id}')" class="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition">
              <img src="${r.image}" class="w-12 h-12 object-cover rounded-lg shrink-0">
              <div class="min-w-0 flex-1">
                <div class="font-bold text-slate-800 text-[11px] line-clamp-1">${r.title}</div>
                <div class="text-blue-600 font-extrabold text-xs">${formatCurrency(r.price)} • ${r.area}m²</div>
                <div class="text-[10px] text-slate-500 truncate"><i class="fa-solid fa-location-dot text-rose-500 mr-0.5"></i>Cách ${r.nearPlaceName} ${r.distance}</div>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-400 text-[10px] pr-1"></i>
            </div>
          `).join("")}
        </div>`
      : "";

    const aiBubble = document.createElement("div");
    aiBubble.className = "flex items-start gap-2";
    aiBubble.innerHTML = `
      <div class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
        <i class="fa-solid fa-robot text-xs"></i>
      </div>
      <div class="max-w-[85%] bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 text-slate-700 shadow-sm leading-relaxed">
        <div>${formatAiText(data.reply)}</div>
        ${roomsHtml}
      </div>
    `;
    box.appendChild(aiBubble);
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    document.getElementById(typingId)?.remove();
    const errBubble = document.createElement("div");
    errBubble.className = "text-center text-rose-500 text-[11px] py-2";
    errBubble.textContent = "❌ Không kết nối được Trợ lý AI (kiểm tra Backend NestJS port 5000).";
    box.appendChild(errBubble);
  }
}


// =========================================================================
// HỆ THỐNG BLOG & THÔNG BÁO CẬP NHẬT MỚI (ADMIN ĐĂNG BÀI VÀO MONGODB)
// =========================================================================

let cachedBlogPosts = [];

const blogCategoryMeta = {
  "cap-nhat": { label: "📢 Cập nhật mới", cls: "bg-indigo-100 text-indigo-700" },
  "canh-bao": { label: "🚨 Cảnh báo lừa đảo", cls: "bg-rose-100 text-rose-700" },
  "kinh-nghiem": { label: "💡 Kinh nghiệm", cls: "bg-amber-100 text-amber-800" },
  "uu-dai": { label: "🎁 Ưu đãi", cls: "bg-emerald-100 text-emerald-700" }
};

async function loadBlogPosts(category = "all") {
  const grid = document.getElementById("blog-grid");
  if (!grid) return;

  try {
    const url = category && category !== "all" ? `${API_BASE_URL}/posts?category=${category}` : `${API_BASE_URL}/posts`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const posts = await res.json();
    cachedBlogPosts = posts || [];
    renderBlogPosts(cachedBlogPosts);
  } catch (err) {
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs">Chưa tải được bài viết Blog (kiểm tra Backend NestJS port 5000).</div>`;
  }
}

function filterBlogPosts(category, btnEl) {
  document.querySelectorAll(".blog-cat-btn").forEach(b => {
    b.classList.remove("bg-blue-600", "text-white");
    b.classList.add("text-slate-600");
  });
  if (btnEl) {
    btnEl.classList.add("bg-blue-600", "text-white");
    btnEl.classList.remove("text-slate-600");
  }
  loadBlogPosts(category);
}

function renderBlogPosts(posts) {
  const grid = document.getElementById("blog-grid");
  if (!grid) return;

  if (!posts || posts.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-10 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">Chưa có bài viết nào trong chuyên mục này.</div>`;
    return;
  }

  const isAdmin = currentUser && currentUser.role === "admin";

  grid.innerHTML = posts.map(p => {
    const cat = blogCategoryMeta[p.category] || blogCategoryMeta["cap-nhat"];
    const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString("vi-VN") : "Hôm nay";
    return `
      <article onclick="openBlogDetailModal('${p._id}')" class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between group">
        <div>
          <div class="relative h-44 overflow-hidden">
            <img src="${p.coverImage}" alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
            <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
              ${p.isPinned ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow">📌 Ghim</span>' : ''}
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shadow ${cat.cls}">${cat.label}</span>
            </div>
            ${isAdmin ? `
              <button onclick="deleteBlogPost('${p._id}', event)" class="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 hover:bg-rose-600 hover:text-white text-rose-600 flex items-center justify-center shadow transition" title="Xóa bài viết">
                <i class="fa-solid fa-trash text-[11px]"></i>
              </button>
            ` : ''}
          </div>
          <div class="p-4">
            <h3 class="font-bold text-slate-900 text-sm line-clamp-2 group-hover:text-indigo-600 transition mb-1.5">${p.title}</h3>
            <p class="text-xs text-slate-500 line-clamp-3 leading-relaxed">${p.summary}</p>
          </div>
        </div>
        <div class="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span><i class="fa-regular fa-calendar mr-1"></i>${dateStr} • ${p.authorName || 'Admin'}</span>
          <div class="flex items-center gap-2.5">
            <span><i class="fa-solid fa-heart text-rose-400 mr-0.5"></i>${p.likes || 0}</span>
            <span><i class="fa-regular fa-comment text-blue-400 mr-0.5"></i>${(p.comments || []).length}</span>
            <span><i class="fa-regular fa-eye mr-0.5"></i>${p.views || 0}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function openBlogDetailModal(postId) {
  const modal = document.getElementById("blog-detail-modal");
  const content = document.getElementById("blog-detail-content");
  if (!modal || !content) return;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  content.innerHTML = `<div class="p-10 text-center text-slate-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải bài viết...</div>`;

  try {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}`);
    if (!res.ok) throw new Error();
    const p = await res.json();
    const cat = blogCategoryMeta[p.category] || blogCategoryMeta["cap-nhat"];
    const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleString("vi-VN") : "";

    content.innerHTML = `
      <div class="relative h-56 sm:h-64 w-full overflow-hidden">
        <img src="${p.coverImage}" class="w-full h-full object-cover">
        <button onclick="closeModal('blog-detail-modal')" class="absolute top-4 right-4 w-9 h-9 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="absolute bottom-4 left-4 flex items-center gap-2">
          ${p.isPinned ? '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow">📌 Bài ghim</span>' : ''}
          <span class="px-2.5 py-1 rounded-full text-xs font-bold shadow ${cat.cls}">${cat.label}</span>
        </div>
      </div>
      <div class="p-6">
        <h2 class="text-xl font-extrabold text-slate-900 mb-2 leading-snug">${p.title}</h2>
        <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 pb-4 mb-4 border-b border-slate-100">
          <span><i class="fa-solid fa-user-shield text-indigo-500 mr-1"></i>${p.authorName || 'Admin'}</span>
          <span><i class="fa-regular fa-clock mr-1"></i>${dateStr}</span>
          <span><i class="fa-regular fa-eye mr-1"></i>${p.views || 1} lượt xem</span>
        </div>
        <div class="text-sm text-slate-700 leading-relaxed whitespace-pre-line mb-6">${p.content}</div>

        <!-- Tương tác Cộng đồng: Thả tim + Bình luận dưới Blog -->
        <div class="pt-4 border-t border-slate-200">
          <div class="flex items-center justify-between mb-4">
            <button onclick="likeBlogPost('${p._id}')" id="blog-like-btn" class="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition active:scale-95">
              <i class="fa-solid fa-heart"></i> Hữu ích (<span id="blog-like-count">${p.likes || 0}</span>)
            </button>
            <span class="text-xs text-slate-500 font-semibold"><i class="fa-regular fa-comments mr-1"></i>${(p.comments || []).length} bình luận cộng đồng</span>
          </div>

          <form onsubmit="submitBlogComment(event, '${p._id}')" class="flex items-center gap-2 mb-4">
            <input type="text" id="blog-comment-input" required placeholder="Chia sẻ ý kiến hoặc đặt câu hỏi về bài viết này..." class="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition">Gửi</button>
          </form>

          <div id="blog-comments-list" class="space-y-2.5 max-h-56 overflow-y-auto">
            ${(p.comments && p.comments.length > 0) ? p.comments.slice().reverse().map(c => {
              const cm = roleMeta[c.authorRole] || roleMeta.tenant;
              const ct = c.createdAt ? new Date(c.createdAt).toLocaleString("vi-VN") : "";
              return `
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-1.5">
                      <strong class="text-slate-800">${c.authorName}</strong>
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${cm.cls}">${cm.label}</span>
                    </div>
                    <span class="text-[10px] text-slate-400">${ct}</span>
                  </div>
                  <p class="text-slate-600">${c.content}</p>
                </div>
              `;
            }).join("") : '<div class="text-center text-slate-400 text-xs py-3 italic">Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ ý kiến!</div>'}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="p-10 text-center text-rose-500 text-xs">Không thể tải nội dung bài viết.</div>`;
  }
}

function openAddBlogModal() {
  if (!currentUser || currentUser.role !== "admin") {
    showToast("🔒 Chỉ tài khoản Quản trị viên (Admin) mới có quyền viết bài Blog!", "info");
    return;
  }
  const modal = document.getElementById("add-blog-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

async function handleAddBlogSubmit(e) {
  e.preventDefault();
  const title = document.getElementById("blog-title").value.trim();
  const category = document.getElementById("blog-category").value;
  const summary = document.getElementById("blog-summary").value.trim();
  const content = document.getElementById("blog-content").value.trim();
  const isPinned = document.getElementById("blog-pinned").checked;

  let coverImage = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80";

  // Upload ảnh bìa nếu Admin chọn file từ máy tính
  const imgInput = document.getElementById("blog-image-input");
  if (imgInput && imgInput.files && imgInput.files.length > 0) {
    try {
      const fd = new FormData();
      fd.append("images", imgInput.files[0]);
      const upRes = await fetch(`${API_BASE_URL}/rooms/upload`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: fd
      });
      if (upRes.ok) {
        const upData = await upRes.json();
        if (upData.urls && upData.urls[0]) coverImage = upData.urls[0];
      }
    } catch (err) {
      console.error(err);
    }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/posts`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, category, summary, content, isPinned, coverImage })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể đăng bài Blog"}`, "info");
      return;
    }
    closeModal("add-blog-modal");
    document.getElementById("add-blog-form").reset();
    showToast("🚀 Đã xuất bản bài viết Blog mới lên trang chủ!", "success");
    await loadBlogPosts();
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

async function deleteBlogPost(postId, event) {
  event.stopPropagation();
  if (!confirm("Bạn có chắc chắn muốn xóa bài viết Blog này không?")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast("🗑️ Đã xóa bài viết Blog!", "success");
      await loadBlogPosts();
    }
  } catch (err) {
    showToast("❌ Lỗi khi xóa bài viết", "info");
  }
}


// =========================================================================
// CẢI THIỆN CHO SINH VIÊN, NGƯỜI LAO ĐỘNG & CHỦ TRỌ:
// HỢP ĐỒNG MẪU PDF, TÌM Ở GHÉP HỢP GU, BÁO PHÒNG TRỐNG, HÓA ĐƠN VIETQR
// =========================================================================

// 1. TẠO & IN HỢP ĐỒNG THUÊ TRỌ MẪU (PDF)
function openContractModal(roomId) {
  const room = rooms.find(r => String(r.id) === String(roomId));
  if (!room) return;

  document.getElementById("contract-room-id").value = room.id;
  document.getElementById("contract-tenant-name").value = currentUser ? (currentUser.fullName || "") : "";
  document.getElementById("contract-tenant-phone").value = currentUser ? (currentUser.phone || "") : "";
  document.getElementById("contract-deposit").value = room.price;

  closeModal("room-detail-modal");
  const modal = document.getElementById("contract-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
  updateContractPreview();
}

function updateContractPreview() {
  const roomId = document.getElementById("contract-room-id")?.value;
  const room = rooms.find(r => String(r.id) === String(roomId));
  const box = document.getElementById("contract-preview-box");
  if (!room || !box) return;

  const tenantName = document.getElementById("contract-tenant-name")?.value.trim() || "....................................";
  const tenantCccd = document.getElementById("contract-tenant-cccd")?.value.trim() || "........................";
  const tenantPhone = document.getElementById("contract-tenant-phone")?.value.trim() || "........................";
  const deposit = parseInt(document.getElementById("contract-deposit")?.value || room.price, 10);
  const months = document.getElementById("contract-months")?.value || "12";
  const today = new Date().toLocaleDateString("vi-VN");

  box.innerHTML = `
    <div class="text-center mb-3">
      <div class="font-bold uppercase">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div class="font-bold">Độc lập – Tự do – Hạnh phúc</div>
      <div class="my-2 font-extrabold text-sm uppercase">HỢP ĐỒNG THUÊ PHÒNG TRỌ</div>
      <div class="italic text-[10px]">Đà Nẵng, ngày ${today}</div>
    </div>
    <p class="mb-2"><strong>BÊN CHO THUÊ (BÊN A):</strong> Chủ nhà trọ — SĐT: <strong>${room.phone}</strong></p>
    <p class="mb-2"><strong>BÊN THUÊ PHÒNG (BÊN B):</strong> <strong>${tenantName}</strong> — CCCD: ${tenantCccd} — SĐT: ${tenantPhone}</p>
    <p class="mb-2"><strong>Điều 1. Đối tượng thuê:</strong> Phòng tại địa chỉ <em>${room.address}</em> (Diện tích: ${room.area} m²).</p>
    <p class="mb-2"><strong>Điều 2. Giá thuê &amp; Thanh toán:</strong><br>
      • Tiền thuê phòng: <strong>${room.price.toLocaleString("vi-VN")} VNĐ/tháng</strong>.<br>
      • Tiền điện: <strong>${room.electricity || "3.200đ / kWh"}</strong> • Tiền nước: <strong>${room.water || "50.000đ / người"}</strong>.<br>
      • Tiền đặt cọc: <strong>${deposit.toLocaleString("vi-VN")} VNĐ</strong> (hoàn trả 100% khi kết thúc đúng hạn).<br>
      • Thời hạn thuê: <strong>${months} tháng</strong> kể từ ngày ký.
    </p>
    <p class="mb-3"><strong>Điều 3. Cam kết:</strong> Hai bên cam kết thực hiện đúng nội quy an ninh, PCCC và thanh toán đúng hạn. Nếu báo trả phòng trước 30 ngày sẽ được hoàn lại đầy đủ tiền cọc.</p>
    <div class="grid grid-cols-2 text-center mt-5 pt-2">
      <div><strong>ĐẠI DIỆN BÊN A</strong><br><span class="italic text-[10px]">(Ký, ghi rõ họ tên)</span></div>
      <div><strong>ĐẠI DIỆN BÊN B</strong><br><span class="italic text-[10px]">(Ký, ghi rõ họ tên)</span></div>
    </div>
  `;
}

function printRentalContract() {
  const box = document.getElementById("contract-preview-box");
  if (!box) return;
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) return;
  win.document.write(`
    <html><head><title>Hợp Đồng Thuê Phòng Trọ - SVTrọ Đà Nẵng</title>
    <style>body{font-family:Times New Roman,serif;padding:40px;line-height:1.6;font-size:14px;} .text-center{text-align:center;} .grid{display:flex;justify-content:space-around;margin-top:40px;}</style>
    </head><body>${box.innerHTML}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// 2. TÌM BẠN Ở GHÉP HỢP GU THEO THÓI QUEN SINH HOẠT
function openRoommateModal() {
  const modal = document.getElementById("roommate-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function applyRoommateMatch(e) {
  e.preventDefault();
  const schedule = document.getElementById("rm-schedule").value;
  const budgetPerPerson = parseInt(document.getElementById("rm-budget").value, 10);
  const needAc = document.getElementById("rm-ac").checked;

  // Lọc các phòng còn trống mà chia 2 người <= ngân sách + khớp tiêu chí
  const matched = rooms.filter(r => {
    if (r.status === "full") return false;
    if (r.price / 2 > budgetPerPerson) return false;
    if (schedule === "tu-do" && !(r.amenities || []).includes("gio-tu-do")) return false;
    if (needAc && !(r.amenities || []).includes("may-lanh")) return false;
    return true;
  });

  closeModal("roommate-modal");
  renderRooms(matched);
  showToast(`🤝 Tìm thấy ${matched.length} phòng phù hợp ở ghép (mỗi người ≤ ${(budgetPerPerson/1000000).toFixed(1)}tr)!`, "success");
}

// 3. ĐĂNG KÝ NHẬN BÁO KHI CÓ PHÒNG TRỐNG (WAITLIST CHO NGƯỜI LAO ĐỘNG & SV)
async function submitWaitlistAlert(roomId) {
  const phone = document.getElementById("waitlist-phone-input")?.value.trim() || "";
  if (!/^[0-9]{10}$/.test(phone)) {
    showToast("⚠️ Vui lòng nhập đúng số điện thoại 10 chữ số!", "info");
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const payload = {
    roomId,
    tenantName: currentUser ? currentUser.fullName : "Khách chờ phòng trống",
    tenantPhone: phone,
    tenantEmail: currentUser ? currentUser.email : "",
    appointmentDate: today,
    appointmentTime: "Báo khi trống",
    note: "Đăng ký nhận thông báo ngay khi khu trọ có người chuyển đi",
    isWaitlist: true
  };

  if (isBackendOnline && String(roomId).length === 24) {
    try {
      const res = await fetch(`${API_BASE_URL}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast("🔔 Đã lưu SĐT vào danh sách chờ MongoDB! Chủ trọ sẽ báo bạn ngay khi có phòng trống.", "success");
        return;
      }
    } catch (err) {
      console.error(err);
    }
  }
  showToast("🔔 Đã đăng ký nhận thông báo khi có phòng trống!", "success");
}

// 4. TÍNH HÓA ĐƠN ĐIỆN NƯỚC HÀNG THÁNG + MỨC TIÊU THỤ + XUẤT EXCEL (.xlsx) + VIETQR
let lastGeneratedBillText = "";
let lastGeneratedBillData = null;

function getSavedBillingMeters() {
  try {
    return JSON.parse(localStorage.getItem("svtro_billing_meters") || "{}");
  } catch {
    return {};
  }
}

function getDefaultBillingMeter(room, index = 0) {
  const now = new Date();
  // Phòng đầu tiên mặc định quá hạn 9 ngày để chủ trọ thấy rõ cảnh báo > 1 tuần
  const due = new Date(now);
  if (index === 0) due.setDate(now.getDate() - 9);
  else due.setDate(now.getDate() + 3);
  return {
    elecOld: 1200,
    elecNew: 1200 + (room?.estimatedKwh || 80),
    people: 2,
    extra: 100000,
    tenantName: index === 0 ? "Nguyễn Minh Quân" : "",
    tenantPhone: index === 0 ? "0914222333" : "",
    dueDate: due.toISOString().split("T")[0],
    paymentStatus: index === 1 ? "paid" : "unpaid"
  };
}

function getBillingOverdueInfo(meter) {
  if (meter?.paymentStatus === "paid") {
    return {
      state: "paid",
      daysLate: 0,
      badgeText: "✅ Đã thanh toán",
      badgeCls: "bg-emerald-100 text-emerald-700"
    };
  }
  const dueStr = meter?.dueDate;
  if (dueStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueStr + "T00:00:00");
    const diffDays = Math.floor((today - due) / 86400000);
    if (diffDays >= 7) {
      return {
        state: "overdue-week",
        daysLate: diffDays,
        badgeText: `🚨 Quá hạn ${diffDays} ngày (> 1 tuần)`,
        badgeCls: "bg-rose-600 text-white"
      };
    }
    if (diffDays > 0) {
      return {
        state: "unpaid",
        daysLate: diffDays,
        badgeText: `⚠️ Trễ hạn ${diffDays} ngày`,
        badgeCls: "bg-amber-100 text-amber-800"
      };
    }
  }
  return {
    state: "unpaid",
    daysLate: 0,
    badgeText: `⏳ Chưa thanh toán${dueStr ? ` (Hạn ${formatMoveInDate(dueStr)})` : ""}`,
    badgeCls: "bg-slate-200 text-slate-700"
  };
}

function filterBillingRoomsByStatus(mode, btnEl) {
  document.querySelectorAll(".bill-filter-btn").forEach(b => {
    b.classList.remove("bg-blue-600", "text-white");
    b.classList.add("bg-white");
  });
  if (btnEl) {
    btnEl.classList.add("bg-blue-600", "text-white");
    btnEl.classList.remove("bg-white");
  }
  document.querySelectorAll("#billing-room-list .bill-room-card").forEach(card => {
    const st = card.getAttribute("data-pay-state") || "unpaid";
    const show =
      mode === "all" ||
      (mode === "overdue-week" && st === "overdue-week") ||
      (mode === "unpaid" && (st === "unpaid" || st === "overdue-week")) ||
      (mode === "paid" && st === "paid");
    card.style.display = show ? "" : "none";
  });
}

function saveBillingMeter(roomId, data) {
  const all = getSavedBillingMeters();
  all[String(roomId)] = data;
  localStorage.setItem("svtro_billing_meters", JSON.stringify(all));
}

function selectBillingRoom(roomId) {
  const list = window._billingRooms || rooms;
  const idx = list.findIndex(r => String(r.id) === String(roomId));
  const room = idx >= 0 ? list[idx] : list[0];
  if (!room) return;

  window._selectedBillingRoomId = room.id;
  const hiddenSel = document.getElementById("bill-room-select");
  if (hiddenSel) hiddenSel.value = room.id;

  // Highlight phòng đang chọn trong danh sách phòng thuê
  document.querySelectorAll(".bill-room-card").forEach(el => {
    el.classList.remove("bg-blue-50", "border-blue-500", "ring-2", "ring-blue-100");
  });
  const activeCard = document.getElementById(`bill-room-card-${room.id}`);
  if (activeCard) {
    activeCard.classList.add("bg-blue-50", "border-blue-500", "ring-2", "ring-blue-100");
  }

  // Nạp chỉ số tiêu thụ & hạn thanh toán đã lưu của riêng phòng này
  const saved = getSavedBillingMeters()[String(room.id)] || getDefaultBillingMeter(room, Math.max(0, idx));

  const tName = document.getElementById("bill-tenant-name");
  const tPhone = document.getElementById("bill-tenant-phone");
  const dueEl = document.getElementById("bill-due-date");
  const payEl = document.getElementById("bill-pay-status");
  const eOld = document.getElementById("bill-elec-old");
  const eNew = document.getElementById("bill-elec-new");
  const ppl = document.getElementById("bill-people");
  const ext = document.getElementById("bill-extra");
  if (tName) tName.value = saved.tenantName || "";
  if (tPhone) tPhone.value = saved.tenantPhone || "";
  if (dueEl) dueEl.value = saved.dueDate || new Date().toISOString().split("T")[0];
  if (payEl) payEl.value = saved.paymentStatus || "unpaid";
  if (eOld) eOld.value = saved.elecOld ?? 1200;
  if (eNew) eNew.value = saved.elecNew ?? (1200 + (room.estimatedKwh || 80));
  if (ppl) ppl.value = saved.people ?? 2;
  if (ext) ext.value = saved.extra ?? 100000;

  recalcBillingReceipt();
}

function recalcBillingReceipt(shouldRefreshList = false) {
  const list = window._billingRooms || rooms;
  const roomId = document.getElementById("bill-room-select")?.value;
  const room = list.find(r => String(r.id) === String(roomId)) || list[0];
  const box = document.getElementById("bill-receipt-preview");
  if (!room || !box) return;

  const tenantName = document.getElementById("bill-tenant-name")?.value.trim() || "Khách thuê phòng";
  const tenantPhone = document.getElementById("bill-tenant-phone")?.value.trim() || "";
  const dueDate = document.getElementById("bill-due-date")?.value || new Date().toISOString().split("T")[0];
  const paymentStatus = document.getElementById("bill-pay-status")?.value || "unpaid";
  const elecOld = parseInt(document.getElementById("bill-elec-old")?.value || "0", 10);
  const elecNew = parseInt(document.getElementById("bill-elec-new")?.value || "0", 10);
  const kwhUsed = Math.max(0, elecNew - elecOld);
  const people = Math.max(1, parseInt(document.getElementById("bill-people")?.value || "1", 10));
  const extra = Math.max(0, parseInt(document.getElementById("bill-extra")?.value || "0", 10));
  const bank = document.getElementById("bill-bank")?.value || "MB";
  const account = document.getElementById("bill-account")?.value.trim() || "0905123456";

  const meterObj = {
    tenantName: tenantName === "Khách thuê phòng" ? "" : tenantName,
    tenantPhone,
    dueDate,
    paymentStatus,
    elecOld,
    elecNew,
    people,
    extra
  };
  saveBillingMeter(room.id, meterObj);

  const overdueInfo = getBillingOverdueInfo(meterObj);
  if (shouldRefreshList) {
    refreshManagerViews("billing");
    if (typeof loadNotifications === "function") loadNotifications();
    return;
  }

  const elecUnit = parseVndNumber(room.electricity, 3200);
  const waterUnit = parseVndNumber(room.water, 50000);
  const elecTotal = kwhUsed * elecUnit;
  const waterTotal = people * waterUnit;
  const grandTotal = room.price + elecTotal + waterTotal + extra;
  const monthStr = `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
  const addInfo = encodeURIComponent(`Tien tro thang ${monthStr}`);
  const qrUrl = `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${grandTotal}&addInfo=${addInfo}`;

  // Hiển thị tóm tắt đơn giá theo hợp đồng
  const contractBox = document.getElementById("bill-contract-summary");
  if (contractBox) {
    contractBox.innerHTML = `
      <div class="font-extrabold text-blue-900">📜 Đơn giá theo Hợp đồng — ${room.title.slice(0, 42)}</div>
      <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-blue-800">
        <span>🏠 Phòng: <strong>${room.price.toLocaleString("vi-VN")}đ</strong></span>
        <span>⚡ Điện: <strong>${elecUnit.toLocaleString("vi-VN")}đ/kWh</strong></span>
        <span>💧 Nước: <strong>${waterUnit.toLocaleString("vi-VN")}đ/người</strong></span>
      </div>
    `;
  }

  // Hiển thị mức độ tiêu thụ sử dụng
  const meterBox = document.getElementById("bill-usage-meter");
  if (meterBox) {
    const pct = Math.min(100, Math.round((kwhUsed / 200) * 100));
    const level = kwhUsed <= 70
      ? { label: "Tiết kiệm", cls: "text-emerald-700 bg-emerald-100", bar: "bg-emerald-500" }
      : kwhUsed <= 130
      ? { label: "Trung bình", cls: "text-amber-800 bg-amber-100", bar: "bg-amber-500" }
      : { label: "Tiêu thụ cao", cls: "text-rose-700 bg-rose-100", bar: "bg-rose-500" };
    meterBox.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-bold text-slate-700">📊 Mức tiêu thụ tháng ${monthStr}: <strong class="text-blue-700">${kwhUsed} kWh</strong> (${elecOld} → ${elecNew})</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${level.cls}">${level.label}</span>
      </div>
      <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div class="h-full ${level.bar} transition-all duration-300" style="width: ${pct}%"></div>
      </div>
    `;
  }

  lastGeneratedBillData = {
    monthStr,
    roomTitle: room.title,
    roomAddress: room.address || "Đà Nẵng",
    tenantName,
    tenantPhone,
    dueDate,
    paymentStatus,
    overdueText: overdueInfo.badgeText,
    daysLate: overdueInfo.daysLate,
    roomPrice: room.price,
    elecOld,
    elecNew,
    kwhUsed,
    elecUnit,
    elecTotal,
    people,
    waterUnit,
    waterTotal,
    extra,
    grandTotal,
    bank,
    account
  };

  lastGeneratedBillText = `🧾 PHIẾU BÁO TIỀN TRỌ THÁNG ${monthStr}\n🏠 Phòng: ${room.title}\n👤 Người thuê: ${tenantName}\n📅 Hạn thanh toán: ${formatMoveInDate(dueDate)} (${overdueInfo.badgeText})\n• Tiền phòng (theo HĐ): ${room.price.toLocaleString("vi-VN")}đ\n• Tiền điện (${elecOld} → ${elecNew} = ${kwhUsed} kWh x ${elecUnit.toLocaleString("vi-VN")}đ): ${elecTotal.toLocaleString("vi-VN")}đ\n• Tiền nước (${people} người x ${waterUnit.toLocaleString("vi-VN")}đ): ${waterTotal.toLocaleString("vi-VN")}đ\n• Wifi / Rác: ${extra.toLocaleString("vi-VN")}đ\n👉 TỔNG CỘNG: ${grandTotal.toLocaleString("vi-VN")} VNĐ\n🏦 STK ${bank}: ${account}`;

  box.innerHTML = `
    <div>
      <div class="text-center font-extrabold text-slate-900 text-xs uppercase mb-1">🧾 Phiếu Báo Tiền Trọ Tháng ${monthStr}</div>
      <div class="text-center mb-2">
        <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${overdueInfo.badgeCls}">${overdueInfo.badgeText}</span>
      </div>
      <div class="text-[11px] font-bold text-blue-700 line-clamp-1">${room.title}</div>
      <div class="text-[11px] text-slate-500 mb-2">👤 Người thuê: <strong class="text-slate-800">${tenantName}</strong> • Hạn: <strong>${formatMoveInDate(dueDate)}</strong></div>
      <div class="space-y-1.5 text-[11px] text-slate-700 border-y border-slate-200 py-2.5 mb-2">
        <div class="flex justify-between"><span>Tiền thuê phòng (HĐ):</span><strong>${room.price.toLocaleString("vi-VN")} đ</strong></div>
        <div class="flex justify-between"><span>Điện (${kwhUsed} kWh × ${elecUnit.toLocaleString("vi-VN")}đ):</span><strong>${elecTotal.toLocaleString("vi-VN")} đ</strong></div>
        <div class="flex justify-between"><span>Nước (${people} ng × ${waterUnit.toLocaleString("vi-VN")}đ):</span><strong>${waterTotal.toLocaleString("vi-VN")} đ</strong></div>
        <div class="flex justify-between"><span>Wifi / Rác / Dịch vụ:</span><strong>${extra.toLocaleString("vi-VN")} đ</strong></div>
      </div>
      <div class="flex justify-between items-center text-sm font-extrabold text-emerald-700 mb-3">
        <span>TỔNG THANH TOÁN:</span>
        <span>${grandTotal.toLocaleString("vi-VN")} đ</span>
      </div>
    </div>
    <div class="text-center bg-white p-2.5 rounded-xl border border-slate-200">
      <img src="${qrUrl}" alt="Mã VietQR chuyển khoản" class="w-40 h-40 object-contain mx-auto">
      <div class="text-[10px] text-slate-500 mt-1">Quét mã VietQR (${bank} - ${account})</div>
    </div>
  `;
}

function copyOverdueReminderForZalo() {
  const d = lastGeneratedBillData;
  if (!d) return;
  const lateNote = d.daysLate >= 7
    ? `⚠️ Hiện đã quá hạn thanh toán ${d.daysLate} ngày (hơn 1 tuần so với hạn ${formatMoveInDate(d.dueDate)}).`
    : d.daysLate > 0
    ? `⚠️ Hiện đã trễ hạn thanh toán ${d.daysLate} ngày (hạn ${formatMoveInDate(d.dueDate)}).`
    : `📅 Hạn thanh toán kỳ này là ngày ${formatMoveInDate(d.dueDate)}.`;
  const msg = `📢 THÔNG BÁO NHẮC THANH TOÁN TIỀN PHÒNG THÁNG ${d.monthStr}\nChào ${d.tenantName},\n${lateNote}\n🏠 Phòng: ${d.roomTitle}\n💰 Tổng số tiền cần thanh toán: ${d.grandTotal.toLocaleString("vi-VN")} VNĐ\n🏦 Vui lòng chuyển khoản qua ${d.bank} - STK: ${d.account} và gửi ảnh biên lai giúp chủ nhà nhé. Cảm ơn bạn!`;
  navigator.clipboard?.writeText(msg);
  showToast("📢 Đã copy tin nhắc thanh toán quá hạn! Dán vào Zalo gửi người thuê ngay nhé.", "success");
}

function exportSingleRoomExcel() {
  const d = lastGeneratedBillData;
  if (!d) return;

  const rows = [
    ["PHIẾU BÁO TIỀN PHÒNG TRỌ HÀNG THÁNG (SVTRỌ ĐÀ NẴNG)"],
    ["Kỳ hóa đơn", `Tháng ${d.monthStr}`, "", "Ngày lập", new Date().toLocaleDateString("vi-VN")],
    ["Phòng thuê", d.roomTitle, "", "Người thuê", d.tenantName],
    ["Hạn thanh toán", formatMoveInDate(d.dueDate), "", "Trạng thái", d.overdueText],
    [],
    ["STT", "Hạng mục theo hợp đồng", "Chỉ số / Số lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)"],
    [1, "Tiền thuê phòng cố định", "1 tháng", d.roomPrice, d.roomPrice],
    [2, `Tiền điện tiêu thụ (Cũ: ${d.elecOld} → Mới: ${d.elecNew})`, `${d.kwhUsed} kWh`, d.elecUnit, d.elecTotal],
    [3, "Tiền nước sinh hoạt", `${d.people} người`, d.waterUnit, d.waterTotal],
    [4, "Phí Wifi / Rác / Dịch vụ khác", "1 tháng", d.extra, d.extra],
    [],
    ["", "TỔNG CỘNG THANH TOÁN", "", "", d.grandTotal],
    ["", "Thông tin chuyển khoản", `${d.bank} - STK: ${d.account}`, "", ""]
  ];

  const safeMonth = d.monthStr.replace("/", "-");
  const fileName = `HoaDon_PhongTro_Thang_${safeMonth}.xlsx`;

  if (typeof XLSX !== "undefined") {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 40 }, { wch: 24 }, { wch: 16 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HoaDon");
    XLSX.writeFile(wb, fileName);
    showToast(`📊 Đã xuất file Excel ${fileName} để gửi người thuê!`, "success");
  } else {
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(".xlsx", ".csv");
    a.click();
    showToast("📊 Đã xuất file bảng tính CSV mở trực tiếp bằng Excel!", "success");
  }
}

function exportAllRoomsExcel() {
  const list = window._billingRooms || rooms;
  if (!list || list.length === 0) return;

  const savedMeters = getSavedBillingMeters();
  const monthStr = `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
  const bank = document.getElementById("bill-bank")?.value || "MB";
  const account = document.getElementById("bill-account")?.value.trim() || currentUser?.phone || "";

  const rows = [
    [`BẢNG TỔNG HỢP HÓA ĐƠN & THEO DÕI QUÁ HẠN THÁNG ${monthStr} — ${currentUser?.fullName || "CHỦ TRỌ"}`],
    [],
    ["STT", "Tên phòng", "Người thuê", "Hạn thanh toán", "Trạng thái", "Giá phòng (HĐ)", "Tiêu thụ (kWh)", "Tiền điện", "Tiền nước", "Wifi/Rác", "TỔNG CỘNG (VNĐ)"]
  ];

  let sumAll = 0;
  list.forEach((r, idx) => {
    const m = savedMeters[String(r.id)] || getDefaultBillingMeter(r, idx);
    const info = getBillingOverdueInfo(m);
    const kwh = Math.max(0, (m.elecNew || 0) - (m.elecOld || 0));
    const elecUnit = parseVndNumber(r.electricity, 3200);
    const waterUnit = parseVndNumber(r.water, 50000);
    const elecTotal = kwh * elecUnit;
    const waterTotal = (m.people || 2) * waterUnit;
    const total = r.price + elecTotal + waterTotal + (m.extra || 0);
    sumAll += total;
    rows.push([idx + 1, r.title, m.tenantName || "Khách thuê", formatMoveInDate(m.dueDate), info.badgeText, r.price, kwh, elecTotal, waterTotal, m.extra || 0, total]);
  });

  rows.push([]);
  rows.push(["", "TỔNG DOANH THU DỰ KIẾN", "", "", "", "", "", "", "", "", sumAll]);
  rows.push(["", `Chuyển khoản: ${bank} - STK: ${account}`]);

  const fileName = `TongHop_HoaDon_Thang_${monthStr.replace("/", "-")}.xlsx`;
  if (typeof XLSX !== "undefined") {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TongHop");
    XLSX.writeFile(wb, fileName);
    showToast(`📑 Đã xuất bảng Excel tổng hợp ${list.length} phòng (${fileName})!`, "success");
  } else {
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(".xlsx", ".csv");
    a.click();
    showToast(`📑 Đã xuất bảng tổng hợp ${list.length} phòng!`, "success");
  }
}

function copyBillForZalo() {
  if (!lastGeneratedBillText) return;
  navigator.clipboard?.writeText(lastGeneratedBillText);
  showToast("📋 Đã copy phiếu báo tiền trọ! Bạn dán thẳng vào Zalo gửi khách nhé.", "success");
}

function printBillReceipt() {
  const box = document.getElementById("bill-receipt-preview");
  if (!box) return;
  const win = window.open("", "_blank", "width=460,height=680");
  if (!win) return;
  win.document.write(`
    <html><head><title>Phiếu Thu Tiền Trọ - SVTrọ</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px;} img{display:block;margin:10px auto;max-width:200px;} .flex{display:flex;justify-content:space-between;margin:4px 0;}</style>
    </head><body>${box.innerHTML}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}


// =========================================================================
// MENU TỔNG HỢP ĐÓNG/MỞ, HỒ SƠ CÁ NHÂN, BẢO MẬT, NHẬT KÝ ĐĂNG NHẬP,
// CHẾ ĐỘ SÁNG/TỐI (DARK MODE) & ĐA NGÔN NGỮ (VI / EN / KO / JA)
// =========================================================================

// 1. MENU TỔNG HỢP (SIDEBAR DRAWER)
function toggleMainMenu(forceState) {
  const drawer = document.getElementById("main-menu-drawer");
  const overlay = document.getElementById("main-menu-overlay");
  if (!drawer || !overlay) return;

  const isOpen = !drawer.classList.contains("-translate-x-full");
  const shouldOpen = typeof forceState === "boolean" ? forceState : !isOpen;

  if (shouldOpen) {
    renderMenuUserCard();
    overlay.classList.remove("hidden");
    drawer.classList.remove("-translate-x-full");
  } else {
    drawer.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleMainMenu(false);
});

function renderMenuUserCard() {
  const card = document.getElementById("menu-user-card");
  if (!card) return;

  if (!currentUser || !authToken) {
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="font-bold text-slate-800">Khách truy cập</div>
          <div class="text-[11px] text-slate-500">Đăng nhập để lưu hồ sơ &amp; đặt lịch</div>
        </div>
        <button onclick="toggleMainMenu(false); openAuthModal('login')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[11px] shadow">
          Đăng nhập
        </button>
      </div>
    `;
    return;
  }

  const meta = roleMeta[currentUser.role] || roleMeta.student;
  const avatarHtml = currentUser.avatar
    ? `<img src="${currentUser.avatar}" class="w-10 h-10 rounded-full object-cover border border-slate-200">`
    : `<div class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-base"><i class="fa-solid fa-user text-white"></i></div>`;

  card.innerHTML = `
    <div class="flex items-center gap-3">
      ${avatarHtml}
      <div class="min-w-0 flex-1">
        <div class="font-bold text-slate-900 truncate">${currentUser.fullName}</div>
        <div class="text-[10px] text-slate-500 truncate">${currentUser.email}</div>
        <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.cls}">${meta.label}</span>
      </div>
    </div>
  `;
}

// 2. HỒ SƠ CÁ NHÂN, BẢO MẬT & NHẬT KÝ ĐĂNG NHẬP
function openProfileModal(tab = "info") {
  if (!currentUser || !authToken) {
    showToast("🔒 Vui lòng đăng nhập để xem Hồ sơ & Nhật ký đăng nhập!", "info");
    openAuthModal("login");
    return;
  }

  const modal = document.getElementById("profile-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  // Điền sẵn thông tin hiện tại
  const meta = roleMeta[currentUser.role] || roleMeta.student;
  const emailEl = document.getElementById("prof-email-display");
  const roleEl = document.getElementById("prof-role-badge");
  if (emailEl) emailEl.textContent = currentUser.email || "";
  if (roleEl) {
    roleEl.textContent = meta.label;
    roleEl.className = `px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.cls}`;
  }
  document.getElementById("prof-fullname").value = currentUser.fullName || "";
  document.getElementById("prof-phone").value = currentUser.phone || "";
  const fileEl = document.getElementById("prof-avatar-file");
  if (fileEl) fileEl.value = "";

  const previewEl = document.getElementById("prof-avatar-preview");
  if (previewEl) {
    if (currentUser.avatar) {
      previewEl.innerHTML = `<img src="${currentUser.avatar}" class="w-full h-full object-cover">`;
    } else {
      previewEl.innerHTML = `<i class="fa-solid fa-user text-white text-xl"></i>`;
    }
  }

  switchProfileTab(tab);
}

function previewProfileAvatar(event) {
  const file = event.target.files?.[0];
  const previewEl = document.getElementById("prof-avatar-preview");
  if (!file || !previewEl) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewEl.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
  };
  reader.readAsDataURL(file);
}

function switchProfileTab(tab) {
  ["info", "security", "history"].forEach(t => {
    const btn = document.getElementById(`prof-tab-${t}`);
    const panel = document.getElementById(`prof-panel-${t}`);
    if (t === tab) {
      btn?.classList.add("border-blue-600", "text-blue-600");
      btn?.classList.remove("border-transparent", "text-slate-500");
      panel?.classList.remove("hidden");
    } else {
      btn?.classList.remove("border-blue-600", "text-blue-600");
      btn?.classList.add("border-transparent", "text-slate-500");
      panel?.classList.add("hidden");
    }
  });

  if (tab === "history") loadLoginHistory();
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const fullName = document.getElementById("prof-fullname").value.trim();
  const phone = document.getElementById("prof-phone").value.trim();
  let avatar = currentUser.avatar || "";

  // Tải ảnh đại diện thật từ máy tính lên Backend (Multer)
  const fileInput = document.getElementById("prof-avatar-file");
  if (fileInput && fileInput.files && fileInput.files.length > 0) {
    try {
      const fd = new FormData();
      fd.append("images", fileInput.files[0]);
      const upRes = await fetch(`${API_BASE_URL}/rooms/upload`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: fd
      });
      if (upRes.ok) {
        const upData = await upRes.json();
        if (upData.urls && upData.urls[0]) avatar = upData.urls[0];
      }
    } catch (err) {
      console.error(err);
    }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/users/me`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ fullName, phone, avatar })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(`❌ ${data.message || "Không thể cập nhật hồ sơ"}`, "info");
      return;
    }

    currentUser = { ...currentUser, fullName: data.fullName, phone: data.phone, avatar: data.avatar };
    localStorage.setItem("svtro_user", JSON.stringify(currentUser));
    renderAuthHeader();
    showToast("✅ Đã cập nhật thông tin hồ sơ cá nhân vào MongoDB!", "success");
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById("sec-old-pass").value;
  const newPassword = document.getElementById("sec-new-pass").value;
  const confirmPass = document.getElementById("sec-confirm-pass").value;

  if (newPassword !== confirmPass) {
    showToast("⚠️ Mật khẩu nhập lại không khớp!", "info");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/users/me/password`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(`❌ ${data.message || "Đổi mật khẩu thất bại"}`, "info");
      return;
    }
    document.getElementById("prof-panel-security").reset();
    showToast("🔐 Đã đổi mật khẩu bảo mật thành công!", "success");
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

async function loadLoginHistory() {
  const listEl = document.getElementById("login-history-list");
  if (!listEl) return;
  listEl.innerHTML = `<div class="py-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải nhật ký đăng nhập từ MongoDB...</div>`;

  try {
    const res = await fetch(`${API_BASE_URL}/users/me/login-history`, { headers: getAuthHeaders() });
    const history = await res.json();
    if (!res.ok) throw new Error(history.message || "Không thể tải nhật ký");

    if (!history || history.length === 0) {
      listEl.innerHTML = `<div class="py-8 text-center text-slate-400">Chưa có bản ghi đăng nhập nào. Hãy đăng xuất và đăng nhập lại để hệ thống ghi nhận thiết bị!</div>`;
      return;
    }

    listEl.innerHTML = history.map(item => {
      const timeStr = item.loginAt ? new Date(item.loginAt).toLocaleString("vi-VN") : "";
      const isOk = item.status !== "failed";
      const device = (item.userAgent || "Trình duyệt Web").slice(0, 70);
      return `
        <div class="p-3 rounded-xl border ${isOk ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-200'} flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-600 text-white'}">
                ${isOk ? '✅ Thành công' : '❌ Sai mật khẩu'}
              </span>
              <span class="font-bold text-slate-800">${timeStr}</span>
            </div>
            <div class="text-[11px] text-slate-500 truncate"><i class="fa-solid fa-laptop mr-1"></i>${device}</div>
            <div class="text-[10px] text-slate-400 mt-0.5"><i class="fa-solid fa-network-wired mr-1"></i>IP: ${item.ip || '127.0.0.1'}</div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    listEl.innerHTML = `<div class="py-6 text-center text-rose-500 font-bold">❌ ${err.message}</div>`;
  }
}

// 3. CHẾ ĐỘ NỀN SÁNG / TỐI (DARK MODE)
function applySavedTheme() {
  const saved = localStorage.getItem("svtro_theme") || "light";
  const isDark = saved === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  updateThemeIcons(isDark);
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("svtro_theme", isDark ? "dark" : "light");
  updateThemeIcons(isDark);
  showToast(isDark ? "🌙 Đã chuyển sang chế độ nền Tối!" : "☀️ Đã chuyển sang chế độ nền Sáng!", "info");
}

function updateThemeIcons(isDark) {
  const headerBtn = document.getElementById("header-theme-btn");
  const menuIcon = document.getElementById("menu-theme-icon");
  if (headerBtn) {
    headerBtn.innerHTML = isDark
      ? `<i class="fa-solid fa-sun text-amber-400 text-base"></i>`
      : `<i class="fa-solid fa-moon text-base"></i>`;
  }
  if (menuIcon) {
    menuIcon.className = isDark ? "fa-solid fa-sun text-amber-400" : "fa-solid fa-moon text-indigo-600";
  }
}

// 4. ĐA NGÔN NGỮ (TIẾNG VIỆT / ENGLISH / 한국어 / 日本語)
const i18nDict = {
  vi: {
    nav_map: "Bản đồ",
    nav_blog: "Blog",
    nav_post: "Đăng tin",
    nav_login: "Đăng nhập",
    hero_badge: "Hệ Thống Cập Nhật Phòng Trống Theo Thời Gian Thực",
    hero_title: "Tìm phòng trọ cho Sinh viên & Người lao động Đà Nẵng",
    hero_subtitle: "Kiểm tra trực tiếp phòng CÒN hay HẾT - Bách Khoa, Kinh Tế, Đông Á... & KCN Hòa Khánh, KCN Hòa Cầm, An Đồn, Thọ Quang.",
    menu_title: "Menu Tổng Hợp",
    menu_nav_group: "Điều hướng nhanh",
    menu_home: "Trang chủ & Tìm phòng",
    menu_map: "Bản đồ vệ tinh Đà Nẵng",
    menu_blog: "Blog & Cập nhật mới",
    menu_fav: "Phòng đã lưu (Yêu thích)",
    menu_roommate: "Tìm bạn ở ghép hợp gu",
    menu_ai: "Trợ lý AI giải đáp 24/7",
    menu_account_group: "Tài khoản & Bảo mật",
    menu_profile: "Hồ sơ thông tin cá nhân",
    menu_security: "Bảo mật & Đổi mật khẩu",
    menu_history: "Nhật ký đăng nhập",
    menu_settings_group: "Giao diện & Ngôn ngữ",
    menu_theme: "Chế độ nền tối",
    menu_lang: "Ngôn ngữ hiển thị"
  },
  en: {
    nav_map: "Map",
    nav_blog: "Blog",
    nav_post: "Post Room",
    nav_login: "Sign In",
    hero_badge: "Real-Time Room Availability Platform",
    hero_title: "Find Rooms for Students & Workers in Da Nang",
    hero_subtitle: "Check live room availability near Universities & Industrial Zones (Hoa Khanh, Hoa Cam, An Don, Tho Quang).",
    menu_title: "All-in-One Menu",
    menu_nav_group: "Quick Navigation",
    menu_home: "Home & Search Rooms",
    menu_map: "Da Nang Satellite Map",
    menu_blog: "Blog & Updates",
    menu_fav: "Saved Favorites",
    menu_roommate: "Roommate Matching",
    menu_ai: "24/7 AI Assistant",
    menu_account_group: "Account & Security",
    menu_profile: "Personal Profile",
    menu_security: "Security & Password",
    menu_history: "Login History",
    menu_settings_group: "Theme & Language",
    menu_theme: "Dark Mode",
    menu_lang: "Display Language"
  },
  ko: {
    nav_map: "지도",
    nav_blog: "블로그",
    nav_post: "방 등록",
    nav_login: "로그인",
    hero_badge: "실시간 빈방 업데이트 시스템",
    hero_title: "다낭 대학생 및 직장인을 위한 방 찾기",
    hero_subtitle: "다낭 대학교 및 산업단지(호아칸, 호아깜, 안돈) 근처의 실시간 빈방을 확인하세요.",
    menu_title: "통합 메뉴",
    menu_nav_group: "빠른 이동",
    menu_home: "홈 & 방 검색",
    menu_map: "다낭 위성 지도",
    menu_blog: "블로그 & 새 소식",
    menu_fav: "저장한 방 (즐겨찾기)",
    menu_roommate: "룸메이트 매칭",
    menu_ai: "24/7 AI 도우미",
    menu_account_group: "계정 및 보안",
    menu_profile: "내 프로필 정보",
    menu_security: "보안 및 비밀번호 변경",
    menu_history: "로그인 기록",
    menu_settings_group: "테마 및 언어",
    menu_theme: "다크 모드",
    menu_lang: "표시 언어"
  },
  ja: {
    nav_map: "地図",
    nav_blog: "ブログ",
    nav_post: "部屋を投稿",
    nav_login: "ログイン",
    hero_badge: "リアルタイム空室状況プラットフォーム",
    hero_title: "ダナンの学生・労働者向け賃貸部屋検索",
    hero_subtitle: "大学や工業団地（ホアカン・ホアカム・アンドン）周辺の空室をリアルタイムで確認できます。",
    menu_title: "総合メニュー",
    menu_nav_group: "クイックナビ",
    menu_home: "ホーム＆部屋検索",
    menu_map: "ダナン衛星マップ",
    menu_blog: "ブログ＆最新情報",
    menu_fav: "お気に入り保存",
    menu_roommate: "ルームメイト検索",
    menu_ai: "24時間AIサポート",
    menu_account_group: "アカウント＆セキュリティ",
    menu_profile: "プロフィール設定",
    menu_security: "パスワード変更・セキュリティ",
    menu_history: "ログイン履歴",
    menu_settings_group: "外観と言語",
    menu_theme: "ダークモード",
    menu_lang: "表示言語"
  }
};

function applySavedLanguage() {
  const lang = localStorage.getItem("svtro_lang") || "vi";
  const select = document.getElementById("language-select");
  if (select) select.value = lang;
  applyLanguageStrings(lang);
}

function setLanguage(lang) {
  localStorage.setItem("svtro_lang", lang);
  applyLanguageStrings(lang);
  const labels = { vi: "🇻🇳 Tiếng Việt", en: "🇬🇧 English", ko: "🇰🇷 한국어", ja: "🇯🇵 日本語" };
  showToast(`🌐 Đã chuyển ngôn ngữ sang ${labels[lang] || lang}`, "success");
}

function applyLanguageStrings(lang) {
  const dict = i18nDict[lang] || i18nDict.vi;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
}


// Lưu số điện (kWh) của phòng vào MongoDB (CHỈ Chủ nhà & Admin)
async function saveRoomKwh(roomId) {
  if (!canManageRooms()) {
    showToast("🔒 Chỉ Chủ nhà hoặc Admin mới có quyền chỉnh số điện!", "info");
    return;
  }
  const estimatedKwh = parseInt(document.getElementById("calc-kwh")?.value || "80", 10);

  if (isBackendOnline && String(roomId).length === 24) {
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ estimatedKwh })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ ${err.message || "Không thể lưu số điện"}`, "info");
        return;
      }
      const room = rooms.find(r => String(r.id) === String(roomId));
      if (room) room.estimatedKwh = estimatedKwh;
      showToast(`⚡ Đã lưu mức điện ${estimatedKwh} kWh/tháng vào MongoDB!`, "success");
      return;
    } catch (err) {
      showToast("❌ Lỗi kết nối Backend NestJS", "info");
      return;
    }
  }
  const room = rooms.find(r => String(r.id) === String(roomId));
  if (room) room.estimatedKwh = estimatedKwh;
  showToast(`⚡ Đã lưu mức điện ${estimatedKwh} kWh/tháng!`, "success");
}


// =========================================================================
// TÍNH NĂNG SINH ĐỘNG: SLIDER NHIỀU ẢNH, ĐÃ XEM GẦN ĐÂY, LỜI CHÀO THEO GIỜ,
// SKELETON LOADING & TƯƠNG TÁC CỘNG ĐỒNG BLOG (LIKE + COMMENT)
// =========================================================================

// 1. Slider xem nhiều ảnh trong Chi tiết phòng
function slideModalImage(delta) {
  const gallery = window._modalGallery || [];
  if (gallery.length <= 1) return;
  window._modalGalleryIdx = (window._modalGalleryIdx + delta + gallery.length) % gallery.length;
  setModalImage(window._modalGalleryIdx);
}

function setModalImage(index) {
  const gallery = window._modalGallery || [];
  if (!gallery[index]) return;
  window._modalGalleryIdx = index;
  const img = document.getElementById("modal-slider-img");
  const counter = document.getElementById("modal-slider-counter");
  if (img) img.src = gallery[index];
  if (counter) counter.textContent = `${index + 1} / ${gallery.length}`;
  document.querySelectorAll(".modal-thumb-item").forEach((el, i) => {
    if (i === index) {
      el.classList.add("border-blue-600", "opacity-100");
      el.classList.remove("border-transparent", "opacity-70");
    } else {
      el.classList.remove("border-blue-600", "opacity-100");
      el.classList.add("border-transparent", "opacity-70");
    }
  });
}

// 2. Phòng đã xem gần đây (Recently Viewed)
function addRecentRoom(room) {
  if (!room || !room.id) return;
  let recent = JSON.parse(localStorage.getItem("svtro_recent_rooms") || "[]");
  recent = recent.filter(r => String(r.id) !== String(room.id));
  recent.unshift({ id: room.id, title: room.title, price: room.price, image: room.image });
  recent = recent.slice(0, 5);
  localStorage.setItem("svtro_recent_rooms", JSON.stringify(recent));
  renderRecentRooms();
}

function renderRecentRooms() {
  const bar = document.getElementById("recent-rooms-bar");
  const listEl = document.getElementById("recent-rooms-list");
  if (!bar || !listEl) return;

  const recent = JSON.parse(localStorage.getItem("svtro_recent_rooms") || "[]");
  if (!recent.length) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  listEl.innerHTML = recent.map(r => `
    <div onclick="openRoomModal('${r.id}')" class="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition shrink-0 max-w-[230px]">
      <img src="${r.image}" class="w-9 h-9 rounded-lg object-cover shrink-0">
      <div class="min-w-0">
        <div class="text-[11px] font-bold text-slate-800 truncate">${r.title}</div>
        <div class="text-[11px] font-extrabold text-blue-600">${formatCurrency(r.price)}</div>
      </div>
    </div>
  `).join("");
}

function clearRecentRooms() {
  localStorage.removeItem("svtro_recent_rooms");
  renderRecentRooms();
  showToast("Đã xóa lịch sử phòng vừa xem", "info");
}

// 3. Lời chào tự động theo khung giờ
function updateTimeGreeting() {
  const badge = document.getElementById("time-greeting-badge");
  if (!badge) return;
  const hour = new Date().getHours();
  let icon = "☀️";
  let greet = "Chào buổi sáng";
  if (hour >= 11 && hour < 14) { icon = "🌤️"; greet = "Chào buổi trưa"; }
  else if (hour >= 14 && hour < 18) { icon = "🌇"; greet = "Chào buổi chiều"; }
  else if (hour >= 18 || hour < 5) { icon = "🌙"; greet = "Chào buổi tối"; }

  const namePart = currentUser ? `, ${currentUser.fullName}` : "";
  badge.innerHTML = `<span>${icon}</span> <span>${greet}${namePart}! Hệ thống cập nhật phòng trống Đà Nẵng theo thời gian thực</span>`;
}

// 4. Hiệu ứng Skeleton Loading hiện đại lúc tải phòng
function renderSkeletonRooms() {
  const container = document.getElementById("rooms-grid");
  if (!container) return;
  const skel = `
    <div class="bg-white rounded-2xl overflow-hidden border border-slate-200 p-4 animate-pulse space-y-3">
      <div class="h-44 bg-slate-200 rounded-xl"></div>
      <div class="h-5 bg-slate-200 rounded w-1/2"></div>
      <div class="h-4 bg-slate-200 rounded w-full"></div>
      <div class="h-3 bg-slate-200 rounded w-3/4"></div>
      <div class="flex gap-2 pt-2">
        <div class="h-8 bg-slate-200 rounded-xl flex-1"></div>
        <div class="h-8 bg-slate-200 rounded-xl w-20"></div>
      </div>
    </div>
  `;
  container.innerHTML = skel + skel + skel;
}

// 5. Thả tim & Bình luận cộng đồng dưới Blog (Lưu vào MongoDB)
async function likeBlogPost(postId) {
  try {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/like`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      const el = document.getElementById("blog-like-count");
      if (el) el.textContent = updated.likes || 0;
      showToast("❤️ Cảm ơn bạn đã đánh dấu bài viết hữu ích!", "success");
      loadBlogPosts();
    }
  } catch (err) {
    showToast("❌ Không thể kết nối Backend NestJS", "info");
  }
}

async function submitBlogComment(e, postId) {
  e.preventDefault();
  const input = document.getElementById("blog-comment-input");
  const content = input?.value.trim();
  if (!content) return;

  const authorName = currentUser ? currentUser.fullName : "Người thuê ẩn danh";
  const authorRole = currentUser ? currentUser.role : "tenant";

  try {
    const res = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorName, authorRole, content })
    });
    if (res.ok) {
      input.value = "";
      showToast("💬 Đã gửi bình luận vào cộng đồng!", "success");
      openBlogDetailModal(postId);
      loadBlogPosts();
    }
  } catch (err) {
    showToast("❌ Không thể gửi bình luận", "info");
  }
}

// =========================================================================
// TRANG QUẢN TRỊ RIÊNG CHO ADMIN (SIDEBAR BÊN TRÁI)
// Quản lý danh sách Chủ trọ, Tài khoản, Xử lý lỗi & Sửa phòng hộ chủ nhà
// =========================================================================

window._activeAdminSection = "overview";
window._adminSelectedLandlordId = null;

function openAdminPage(section = "overview") {
  if (!currentUser || currentUser.role !== "admin") {
    showToast("🔒 Chỉ tài khoản Quản trị viên (Admin) mới được truy cập Trang Admin!", "info");
    return;
  }

  const modal = document.getElementById("admin-page-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const prof = document.getElementById("admin-sidebar-profile");
  if (prof) {
    const avatarHtml = currentUser.avatar
      ? `<img src="${currentUser.avatar}" class="w-8 h-8 rounded-full object-cover border border-white/30 shrink-0">`
      : `<div class="w-8 h-8 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center shrink-0">A</div>`;
    prof.innerHTML = `
      ${avatarHtml}
      <div class="min-w-0">
        <div class="font-bold text-white truncate">${currentUser.fullName}</div>
        <div class="text-[10px] text-emerald-400">● Admin • ${currentUser.phone || "0359433923"}</div>
      </div>
    `;
  }

  loadAdminSection(section);
}

function closeAdminPage() {
  const modal = document.getElementById("admin-page-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function toggleAdminUsersMenu() {
  const sub = document.getElementById("admin-users-submenu");
  const chev = document.getElementById("admin-users-chevron");
  if (!sub) return;
  const wasHidden = sub.classList.contains("hidden");
  sub.classList.toggle("hidden");
  if (chev) chev.classList.toggle("rotate-180", wasHidden);
  if (wasHidden) {
    loadAdminSection("users-landlord");
  }
}

async function loadAdminSection(section = "overview") {
  if (section === "users") section = "users-landlord";
  window._activeAdminSection = section;
  const body = document.getElementById("admin-page-body");
  const heading = document.getElementById("admin-page-heading");
  const sub = document.getElementById("admin-page-sub");
  if (!body) return;

  const metaMap = {
    overview: ["📊 Tổng quan & Giám sát Hệ thống", "Theo dõi nhanh tình trạng Backend, số lượng chủ trọ, phòng trống và xử lý sự cố"],
    landlords: ["🏘️ Danh sách Chủ trọ & Hỗ trợ Sửa phòng hộ", "Chọn bất kỳ chủ trọ nào để xem toàn bộ phòng của họ và chỉnh sửa trực tiếp theo yêu cầu"],
    tenants: ["👤 Danh sách Người thuê & Hỗ trợ", "Xem danh sách người thuê, theo dõi lịch hẹn xem phòng, tin tìm phòng trong Group và hỗ trợ xử lý sự cố"],
    "users-landlord": ["🏠 Quản lý Tài khoản Chủ trọ & Duyệt đăng ký", "Phê duyệt yêu cầu đăng ký Chủ trọ mới, phân quyền hoặc khóa tài khoản Chủ trọ"],
    "users-tenant": ["👤 Quản lý Tài khoản Người thuê & Hệ thống", "Quản lý danh sách tài khoản Người thuê (kích hoạt tự động) và Quản trị viên"],
    issues: ["🚨 Xử lý Lỗi & Báo cáo Lừa đảo", "Kiểm tra các phản ánh từ người thuê và nhảy thẳng vào sửa/xóa bài đăng gặp sự cố"],
    blog: ["📰 Quản lý Blog & Thông báo Hệ thống", "Xuất bản thông báo cập nhật mới lên trang chủ và theo dõi tương tác cộng đồng"]
  };
  if (heading) heading.textContent = (metaMap[section] || metaMap.overview)[0];
  if (sub) sub.textContent = (metaMap[section] || metaMap.overview)[1];

  const isUsersSub = section === "users-landlord" || section === "users-tenant";
  const usersSubEl = document.getElementById("admin-users-submenu");
  const usersChev = document.getElementById("admin-users-chevron");
  if (isUsersSub && usersSubEl) {
    usersSubEl.classList.remove("hidden");
    if (usersChev) usersChev.classList.add("rotate-180");
  }

  ["overview", "landlords", "tenants", "users", "users-landlord", "users-tenant", "issues", "blog"].forEach(s => {
    const btn = document.getElementById(`admin-nav-${s}`);
    if (!btn) return;
    const active = s === section || (s === "users" && isUsersSub);
    if (active) {
      btn.classList.add(s === "users" && isUsersSub ? "bg-slate-800" : "bg-blue-600", "text-white", "shadow");
      btn.classList.remove("text-slate-300", "hover:bg-slate-800");
      if (s === "users" && isUsersSub) btn.classList.remove("bg-blue-600");
    } else {
      btn.classList.remove("bg-blue-600", "bg-slate-800", "text-white", "shadow");
      btn.classList.add("text-slate-300", "hover:bg-slate-800");
    }
  });

  body.innerHTML = `<div class="py-12 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải dữ liệu quản trị từ MongoDB...</div>`;

  try {
    // Luôn cập nhật badge chờ duyệt
    const [usersRes, pendingRes] = await Promise.all([
      fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/users/pending`, { headers: getAuthHeaders() })
    ]);
    const allUsers = usersRes.ok ? await usersRes.json() : [];
    const pendingUsers = pendingRes.ok ? await pendingRes.json() : [];

    const pBadge = document.getElementById("admin-nav-pending-badge");
    if (pBadge) {
      pBadge.textContent = pendingUsers.length;
      if (pendingUsers.length > 0) pBadge.classList.remove("hidden");
      else pBadge.classList.add("hidden");
    }

    if (section === "overview") {
      const [statsRes, roomsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/stats/admin`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/rooms/my-rooms`, { headers: getAuthHeaders() })
      ]);
      const statsData = statsRes.ok ? await statsRes.json() : { overview: {} };
      const allRooms = roomsRes.ok ? await roomsRes.json() : [];
      const ov = statsData.overview || {};
      const landlordCount = allUsers.filter(u => u.role === "landlord").length;
      const tenantCount = allUsers.filter(u => u.role === "tenant" || u.role === "student" || u.role === "worker").length;

      body.innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <div class="text-[11px] font-bold text-amber-600">🏘️ Tổng Chủ trọ</div>
            <div class="text-2xl font-extrabold text-slate-900 mt-1">${landlordCount}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Đang quản lý ${allRooms.length} phòng</div>
          </div>
          <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <div class="text-[11px] font-bold text-blue-600">👤 Người thuê</div>
            <div class="text-2xl font-extrabold text-slate-900 mt-1">${tenantCount}</div>
            <div class="text-[11px] text-slate-500 mt-0.5">Tổng ${allUsers.length} tài khoản</div>
          </div>
          <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <div class="text-[11px] font-bold text-rose-600">📩 Tài khoản chờ duyệt</div>
            <div class="text-2xl font-extrabold text-rose-700 mt-1">${pendingUsers.length}</div>
            <button onclick="loadAdminSection('users')" class="text-[11px] text-blue-600 font-bold hover:underline mt-0.5">Xem &amp; duyệt ngay →</button>
          </div>
          <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <div class="text-[11px] font-bold text-emerald-600">🚨 Báo cáo / Lỗi</div>
            <div class="text-2xl font-extrabold text-slate-900 mt-1">${ov.totalScamReports || 0}</div>
            <button onclick="loadAdminSection('issues')" class="text-[11px] text-blue-600 font-bold hover:underline mt-0.5">Kiểm tra &amp; xử lý →</button>
          </div>
        </div>

        <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <div class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
            <i class="fa-solid fa-bolt text-amber-500"></i> Thao tác hỗ trợ nhanh cho Admin
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button onclick="loadAdminSection('landlords')" class="p-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-left transition">
              <div class="font-bold text-amber-900 text-xs">🛠️ Sửa phòng hộ Chủ nhà</div>
              <div class="text-[11px] text-amber-800/80 mt-0.5">Chọn chủ trọ và chỉnh sửa giá, ảnh, trạng thái theo yêu cầu</div>
            </button>
            <button onclick="loadAdminSection('users')" class="p-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-left transition">
              <div class="font-bold text-blue-900 text-xs">👥 Duyệt &amp; Khóa tài khoản</div>
              <div class="text-[11px] text-blue-800/80 mt-0.5">Xử lý yêu cầu tạo tài khoản mới hoặc khóa tài khoản lỗi</div>
            </button>
            <button onclick="openAddBlogModal()" class="p-3.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-left transition">
              <div class="font-bold text-indigo-900 text-xs">📢 Đăng thông báo hệ thống</div>
              <div class="text-[11px] text-indigo-800/80 mt-0.5">Gửi tin cập nhật mới trực tiếp ra trang chủ SVTrọ</div>
            </button>
          </div>
        </div>

        <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              Trạng thái máy chủ: NestJS API (:5000) &amp; MongoDB hoạt động bình thường
            </div>
            <div class="text-[11px] text-emerald-800 mt-0.5">Tổng ${allRooms.length} tin phòng • ${ov.totalAppointments || 0} lịch hẹn xem phòng</div>
          </div>
          <a href="http://localhost:5000/api/docs" target="_blank" class="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs transition">
            📄 Mở Swagger API
          </a>
        </div>
      `;
    } else if (section === "landlords") {
      const roomsRes = await fetch(`${API_BASE_URL}/rooms/my-rooms`, { headers: getAuthHeaders() });
      const allRooms = roomsRes.ok ? await roomsRes.json() : [];
      const landlords = allUsers.filter(u => u.role === "landlord" || u.role === "admin");

      const roomsByOwner = {};
      allRooms.forEach(r => {
        const oid = r.landlordId && typeof r.landlordId === "object" ? String(r.landlordId._id) : String(r.landlordId || "unassigned");
        if (!roomsByOwner[oid]) roomsByOwner[oid] = [];
        roomsByOwner[oid].push(r);
      });

      const selectedId = window._adminSelectedLandlordId && landlords.some(l => String(l._id) === String(window._adminSelectedLandlordId))
        ? window._adminSelectedLandlordId
        : (landlords.find(l => l.role === "landlord")?._id || landlords[0]?._id || null);
      window._adminSelectedLandlordId = selectedId;

      const selectedLandlord = landlords.find(l => String(l._id) === String(selectedId));
      const selectedRooms = selectedId ? (roomsByOwner[String(selectedId)] || []) : [];

      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <!-- Cột danh sách Chủ trọ -->
          <div class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-extrabold text-slate-900 text-sm">Danh sách Chủ trọ (${landlords.length})</h3>
              <span class="text-[10px] text-slate-500">Bấm chọn để sửa phòng hộ</span>
            </div>
            <input type="text" oninput="filterAdminLandlords(this.value)" placeholder="🔍 Tìm chủ trọ theo tên, email, SĐT..." class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <div id="admin-landlord-list" class="space-y-2 max-h-[58vh] overflow-y-auto pr-1">
              ${landlords.map(l => {
                const count = (roomsByOwner[String(l._id)] || []).length;
                const isSelected = String(l._id) === String(selectedId);
                const isLocked = l.role !== "admin" && l.isActive === false;
                return `
                  <div onclick="openAdminLandlordRooms('${l._id}')" class="admin-landlord-item p-3 rounded-xl border cursor-pointer transition ${isSelected ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}" data-search="${(l.fullName + ' ' + l.email + ' ' + l.phone).toLowerCase()}">
                    <div class="flex items-center justify-between gap-2">
                      <div class="font-bold text-slate-900 text-xs truncate">
                        ${l.role === 'admin' ? '👑' : '🏠'} ${l.fullName}
                      </div>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'} shrink-0">
                        ${count} phòng
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-1 truncate">📧 ${l.email} • 📞 ${l.phone}</div>
                    <div class="mt-1.5 flex items-center justify-between">
                      <span class="text-[10px] font-bold ${isLocked ? 'text-rose-600' : 'text-emerald-600'}">
                        ${isLocked ? '🔒 Đã khóa' : '✅ Đang hoạt động'}
                      </span>
                      <span class="text-[10px] font-bold text-blue-600">Xem &amp; sửa phòng →</span>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- Cột phòng của Chủ trọ được chọn (Sửa hộ theo yêu cầu chủ nhà) -->
          <div class="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            ${selectedLandlord ? `
              <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="font-extrabold text-slate-900 text-sm">📂 Phòng của: ${selectedLandlord.fullName}</div>
                  <div class="text-[11px] text-slate-600 mt-0.5">📞 ${selectedLandlord.phone} • 📧 ${selectedLandlord.email}</div>
                </div>
                <div class="flex items-center gap-1.5">
                  <a href="tel:${selectedLandlord.phone}" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px]">📞 Gọi chủ nhà</a>
                  ${selectedLandlord.role !== "admin" ? `
                    <button onclick="adminToggleUserLock('${selectedLandlord._id}', ${selectedLandlord.isActive !== false})" class="px-2.5 py-1.5 ${selectedLandlord.isActive === false ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} rounded-lg font-bold text-[11px]">
                      ${selectedLandlord.isActive === false ? '🔓 Mở khóa TK' : '🔒 Khóa TK'}
                    </button>
                  ` : ''}
                </div>
              </div>

              ${selectedRooms.length > 0 ? `
                <div class="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                  ${selectedRooms.map(r => `
                    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div class="flex items-center gap-3 min-w-0">
                        <img src="${(r.images && r.images[0]) || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=200&q=80'}" class="w-16 h-12 object-cover rounded-lg border border-slate-200 shrink-0">
                        <div class="min-w-0">
                          <div class="font-bold text-slate-900 text-xs line-clamp-1">${r.title}</div>
                          <div class="text-blue-600 font-bold text-xs">${formatCurrency(r.price)} • ${r.area}m² • ${r.status === 'full' ? '🔴 Đã hết' : `🟢 Còn ${r.availableCount || 1} phòng`}</div>
                          <div class="text-[11px] text-slate-500 line-clamp-1">${r.address}</div>
                        </div>
                      </div>
                      <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button onclick="adminEditRoomStatus('${r._id}')" class="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg font-bold text-[11px]">🔄 Đổi TT</button>
                        <button onclick="openEditRoomModal('${r._id}')" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px]">✏️ Sửa hộ</button>
                        <button onclick="adminDeleteRoom('${r._id}')" class="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-bold text-[11px]">🗑️ Xóa</button>
                      </div>
                    </div>
                  `).join("")}
                </div>
              ` : `
                <div class="py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  Chủ trọ này hiện chưa đăng phòng nào.
                </div>
              `}
            ` : `<div class="py-10 text-center text-slate-400">Chưa có chủ trọ nào trong hệ thống.</div>`}
          </div>
        </div>
      `;
    } else if (section === "tenants") {
      const [apptsRes, reqsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/appointments`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/room-requests`)
      ]);
      const allAppts = apptsRes.ok ? await apptsRes.json() : [];
      const allReqs = reqsRes.ok ? await reqsRes.json() : [];
      const tenants = allUsers.filter(u => u.role !== "admin" && u.role !== "landlord");

      const selectedTenantId = window._adminSelectedTenantId && tenants.some(t => String(t._id) === String(window._adminSelectedTenantId))
        ? window._adminSelectedTenantId
        : (tenants[0]?._id || null);
      window._adminSelectedTenantId = selectedTenantId;
      const selectedTenant = tenants.find(t => String(t._id) === String(selectedTenantId));

      const matchTenantAppts = (t) => allAppts.filter(a =>
        (a.tenantId && String(a.tenantId) === String(t._id)) ||
        (t.email && a.tenantEmail === t.email) ||
        (t.phone && a.tenantPhone === t.phone)
      );
      const matchTenantReqs = (t) => allReqs.filter(r =>
        (r.tenantId && String(r.tenantId) === String(t._id)) ||
        (t.phone && r.phone === t.phone)
      );

      const selAppts = selectedTenant ? matchTenantAppts(selectedTenant) : [];
      const selReqs = selectedTenant ? matchTenantReqs(selectedTenant) : [];

      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <!-- Cột danh sách Người thuê -->
          <div class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-extrabold text-slate-900 text-sm">Danh sách Người thuê (${tenants.length})</h3>
              <span class="text-[10px] text-slate-500">Bấm chọn để xem &amp; hỗ trợ</span>
            </div>
            <input type="text" oninput="filterAdminTenants(this.value)" placeholder="🔍 Tìm người thuê theo tên, email, SĐT..." class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <div id="admin-tenant-list" class="space-y-2 max-h-[58vh] overflow-y-auto pr-1">
              ${tenants.length > 0 ? tenants.map(t => {
                const aCnt = matchTenantAppts(t).length;
                const rCnt = matchTenantReqs(t).length;
                const isSel = String(t._id) === String(selectedTenantId);
                const isLocked = t.isActive === false;
                return `
                  <div onclick="openAdminTenantDetail('${t._id}')" class="admin-tenant-item p-3 rounded-xl border cursor-pointer transition ${isSel ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}" data-search="${(t.fullName + ' ' + t.email + ' ' + t.phone).toLowerCase()}">
                    <div class="flex items-center justify-between gap-2">
                      <div class="font-bold text-slate-900 text-xs truncate">👤 ${t.fullName}</div>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 shrink-0">${aCnt} lịch • ${rCnt} tin</span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-1 truncate">📧 ${t.email} • 📞 ${t.phone}</div>
                    <div class="mt-1.5 flex items-center justify-between">
                      <span class="text-[10px] font-bold ${isLocked ? 'text-rose-600' : 'text-emerald-600'}">${isLocked ? '🔒 Đã khóa' : '✅ Đang hoạt động'}</span>
                      <span class="text-[10px] font-bold text-blue-600">Xem chi tiết →</span>
                    </div>
                  </div>
                `;
              }).join("") : `<div class="py-8 text-center text-slate-400">Chưa có tài khoản người thuê nào.</div>`}
            </div>
          </div>

          <!-- Cột chi tiết Người thuê được chọn -->
          <div class="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
            ${selectedTenant ? `
              <div class="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="font-extrabold text-slate-900 text-sm">👤 ${selectedTenant.fullName}</div>
                  <div class="text-[11px] text-slate-600 mt-0.5">📞 ${selectedTenant.phone} • 📧 ${selectedTenant.email}</div>
                </div>
                <div class="flex items-center gap-1.5">
                  <a href="tel:${selectedTenant.phone}" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px]">📞 Gọi hỗ trợ</a>
                  <button onclick="adminToggleUserLock('${selectedTenant._id}', ${selectedTenant.isActive !== false})" class="px-2.5 py-1.5 ${selectedTenant.isActive === false ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} rounded-lg font-bold text-[11px]">
                    ${selectedTenant.isActive === false ? '🔓 Mở khóa TK' : '🔒 Khóa TK'}
                  </button>
                </div>
              </div>

              <!-- Lịch hẹn xem phòng của người thuê -->
              <div class="space-y-2">
                <div class="font-extrabold text-slate-900 text-xs">📅 Lịch hẹn xem phòng (${selAppts.length})</div>
                ${selAppts.length > 0 ? selAppts.map(a => `
                  <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div class="font-bold text-blue-700 text-xs">${a.roomTitle}</div>
                      <div class="text-[11px] text-slate-500">🗓️ ${a.appointmentDate} (${a.appointmentTime}) • Trạng thái: <strong>${a.status === 'confirmed' ? '✅ Đã xác nhận' : a.status === 'cancelled' ? '❌ Đã hủy' : '⏳ Chờ xác nhận'}</strong></div>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button onclick="updateAppointmentStatus('${a._id}', 'confirmed').then(() => loadAdminSection('tenants'))" class="px-2 py-1 bg-emerald-600 text-white rounded-lg font-bold text-[10px]">✅ Duyệt</button>
                      <button onclick="updateAppointmentStatus('${a._id}', 'cancelled').then(() => loadAdminSection('tenants'))" class="px-2 py-1 bg-rose-100 text-rose-700 rounded-lg font-bold text-[10px]">❌ Hủy</button>
                    </div>
                  </div>
                `).join("") : `<div class="text-[11px] text-slate-400 italic">Người thuê này chưa đặt lịch xem phòng nào.</div>`}
              </div>

              <!-- Tin tìm phòng trong Group của người thuê -->
              <div class="space-y-2 pt-2 border-t border-slate-100">
                <div class="font-extrabold text-slate-900 text-xs">📣 Tin tìm phòng trong Group (${selReqs.length})</div>
                ${selReqs.length > 0 ? selReqs.map(r => `
                  <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="font-bold text-slate-900 text-xs truncate">${r.title}</div>
                      <div class="text-[11px] text-slate-500">💰 Tối đa ${formatCurrency(r.maxBudget)} • 📍 ${r.districtName} • ${r.status === 'matched' ? '✅ Đã chốt' : '🟢 Đang tìm'}</div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <button onclick="toggleRoomRequestStatus('${r._id}', '${r.status === 'matched' ? 'open' : 'matched'}').then(() => loadAdminSection('tenants'))" class="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold text-[10px]">${r.status === 'matched' ? '🔄 Mở lại' : '✅ Chốt'}</button>
                      <button onclick="deleteRoomRequest('${r._id}').then(() => loadAdminSection('tenants'))" class="px-2 py-1 bg-rose-100 text-rose-700 rounded-lg font-bold text-[10px]">🗑️ Xóa</button>
                    </div>
                  </div>
                `).join("") : `<div class="text-[11px] text-slate-400 italic">Người thuê này chưa đăng tin tìm phòng nào trong Group.</div>`}
              </div>
            ` : `<div class="py-10 text-center text-slate-400">Chọn một người thuê bên trái để xem thông tin chi tiết.</div>`}
          </div>
        </div>
      `;
    } else if (section === "users-landlord" || section === "users-tenant") {
      const landlordUsers = allUsers.filter(u => u.role === "landlord");
      const memberUsers = allUsers.filter(u => u.role !== "landlord");

      const renderUserRow = (u, groupKey) => {
        const isSelf = currentUser && (String(u._id) === String(currentUser.id) || u.email === currentUser.email);
        const isRootAdmin = u.email === "admin@svtro.vn";
        const isLocked = u.role !== "admin" && u.isActive === false;
        const normRole = (u.role === "student" || u.role === "worker") ? "tenant" : u.role;
        return `
          <div class="admin-user-item-${groupKey} p-3 ${isLocked ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'} border rounded-xl flex flex-wrap items-center justify-between gap-2.5" data-search="${(u.fullName + ' ' + u.email + ' ' + u.phone).toLowerCase()}">
            <div class="min-w-0">
              <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span class="truncate">${u.fullName}</span>
                ${isLocked ? '<span class="px-1.5 py-0.5 text-[10px] rounded bg-rose-600 text-white font-bold">Đã khóa</span>' : ''}
                ${isSelf ? '<span class="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-bold">Bạn</span>' : ''}
              </div>
              <div class="text-[11px] text-slate-500 truncate">📧 ${u.email} • 📞 ${u.phone}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <select onchange="adminChangeUserRole('${u._id}', this.value)" ${(isSelf || isRootAdmin) ? 'disabled' : ''} class="bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 ${(isSelf || isRootAdmin) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}">
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
                <option value="landlord" ${u.role === 'landlord' ? 'selected' : ''}>🏠 Chủ trọ</option>
                <option value="tenant" ${normRole === 'tenant' ? 'selected' : ''}>👤 Người thuê</option>
              </select>
              ${(!isSelf && !isRootAdmin && u.role !== 'admin') ? `
                <button onclick="adminToggleUserLock('${u._id}', ${!isLocked})" class="px-2.5 py-1 rounded-lg font-bold text-[11px] ${isLocked ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-100 hover:bg-rose-200 text-rose-700'}">
                  ${isLocked ? '🔓 Mở khóa' : '🔒 Khóa'}
                </button>
              ` : ''}
            </div>
          </div>
        `;
      };

      if (section === "users-landlord") {
        body.innerHTML = `
          <div class="bg-white border border-amber-200 rounded-2xl p-4 space-y-3 shadow-2xs">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <i class="fa-solid fa-house-user text-amber-600"></i> Tài khoản Chủ trọ (${landlordUsers.length})
                </h3>
                <p class="text-[11px] text-slate-500">Chỉ Chủ trọ mới cần gửi yêu cầu xét duyệt trước khi đăng phòng</p>
              </div>
              <input type="text" oninput="filterAdminSplitUsers('landlord', this.value)" placeholder="🔍 Tìm chủ trọ..." class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none">
            </div>

            ${pendingUsers.length > 0 ? `
              <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div class="font-extrabold text-amber-900 text-xs">📩 Yêu cầu đăng ký Chủ trọ chờ duyệt (${pendingUsers.length})</div>
                ${pendingUsers.map(u => `
                  <div class="p-3 bg-white border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div class="font-bold text-slate-900 text-xs">🏠 ${u.fullName}</div>
                      <div class="text-[11px] text-slate-500">📧 ${u.email} • 📞 ${u.phone}</div>
                      ${u.registerReason ? `<div class="text-[11px] text-slate-700 mt-1">📝 Xác minh: ${u.registerReason}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <button onclick="adminApproveUser('${u._id}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs">✅ Duyệt Chủ trọ</button>
                      <button onclick="adminRejectUser('${u._id}')" class="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl font-bold text-xs">❌ Từ chối</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            ` : `<div class="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-semibold">✅ Hiện không có yêu cầu đăng ký Chủ trọ nào đang chờ duyệt.</div>`}

            <div class="space-y-2">
              ${landlordUsers.length > 0 ? landlordUsers.map(u => renderUserRow(u, "landlord")).join("") : `<div class="py-4 text-center text-slate-400">Chưa có tài khoản Chủ trọ nào.</div>`}
            </div>
          </div>
        `;
      } else {
        body.innerHTML = `
          <div class="bg-white border border-blue-200 rounded-2xl p-4 space-y-3 shadow-2xs">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <i class="fa-solid fa-users text-blue-600"></i> Tài khoản Người thuê &amp; Hệ thống (${memberUsers.length})
                </h3>
                <p class="text-[11px] text-slate-500">Tài khoản Người thuê đăng ký tự động kích hoạt ngay không cần chờ duyệt</p>
              </div>
              <input type="text" oninput="filterAdminSplitUsers('member', this.value)" placeholder="🔍 Tìm người thuê..." class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none">
            </div>

            <div class="space-y-2">
              ${memberUsers.length > 0 ? memberUsers.map(u => renderUserRow(u, "member")).join("") : `<div class="py-4 text-center text-slate-400">Chưa có tài khoản người thuê nào.</div>`}
            </div>
          </div>
        `;
      }
    } else if (section === "issues") {
      const scamRes = await fetch(`${API_BASE_URL}/reviews/scam-reports`, { headers: getAuthHeaders() });
      const reports = scamRes.ok ? await scamRes.json() : [];

      body.innerHTML = `
        <div class="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-extrabold text-slate-900 text-sm">🚨 Danh sách Báo cáo vi phạm / Sự cố (${reports.length})</h3>
            <span class="text-[11px] text-slate-500">Admin có thể bấm sửa hoặc xóa phòng lỗi ngay lập tức</span>
          </div>
          ${reports.length > 0 ? reports.map(r => {
            const rid = r.roomId && typeof r.roomId === "object" ? r.roomId._id : r.roomId;
            return `
              <div class="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div class="font-bold text-rose-700 text-xs">🚨 Báo cáo từ: ${r.authorName} (${r.rating || 1} ⭐)</div>
                  <div class="font-bold text-slate-900 text-xs mt-0.5">Lý do: ${r.reportReason || "Nghi ngờ lừa đảo / sai thông tin"}</div>
                  <div class="text-slate-600 text-[11px] mt-0.5">${r.comment || ""}</div>
                </div>
                ${rid ? `
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button onclick="openEditRoomModal('${rid}')" class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px]">✏️ Sửa phòng</button>
                    <button onclick="adminDeleteRoom('${rid}')" class="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px]">🗑️ Gỡ phòng</button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join("") : `
            <div class="py-10 text-center text-emerald-600 font-bold bg-emerald-50 rounded-xl border border-emerald-200">
              ✅ Tuyệt vời! Hiện không có báo cáo lừa đảo hay sự cố phòng trọ nào cần xử lý.
            </div>
          `}
        </div>
      `;
    } else if (section === "blog") {
      const postRes = await fetch(`${API_BASE_URL}/posts`);
      const posts = postRes.ok ? await postRes.json() : [];
      body.innerHTML = `
        <div class="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-extrabold text-slate-900 text-sm">📰 Bài viết Blog &amp; Thông báo (${posts.length})</h3>
            <button onclick="openAddBlogModal()" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow">+ Đăng bài mới</button>
          </div>
          <div class="space-y-2.5">
            ${posts.map(p => `
              <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-bold text-slate-900 text-xs truncate">${p.title}</div>
                  <div class="text-[11px] text-slate-500 mt-0.5">👁️ ${p.views || 0} lượt xem • ❤️ ${p.likes || 0} thích • 💬 ${(p.comments || []).length} bình luận</div>
                </div>
                <button onclick="deleteBlogPost('${p._id}').then(() => loadAdminSection('blog'))" class="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-bold text-[11px] shrink-0">🗑️ Xóa</button>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = `<div class="py-10 text-center text-rose-600 font-bold">❌ Lỗi tải dữ liệu quản trị: ${err.message}</div>`;
  }
}

function openAdminLandlordRooms(landlordId) {
  window._adminSelectedLandlordId = landlordId;
  loadAdminSection("landlords");
}

function openAdminTenantDetail(tenantId) {
  window._adminSelectedTenantId = tenantId;
  loadAdminSection("tenants");
}

function filterAdminTenants(q) {
  const kw = (q || "").trim().toLowerCase();
  document.querySelectorAll("#admin-tenant-list .admin-tenant-item").forEach(el => {
    const hay = el.getAttribute("data-search") || "";
    el.style.display = (!kw || hay.includes(kw)) ? "" : "none";
  });
}

function filterAdminLandlords(q) {
  const kw = (q || "").trim().toLowerCase();
  document.querySelectorAll("#admin-landlord-list .admin-landlord-item").forEach(el => {
    const hay = el.getAttribute("data-search") || "";
    el.style.display = (!kw || hay.includes(kw)) ? "" : "none";
  });
}

function filterAdminUsers() {
  const kw = (document.getElementById("admin-user-search")?.value || "").trim().toLowerCase();
  const role = document.getElementById("admin-user-role-filter")?.value || "all";
  document.querySelectorAll("#admin-users-list .admin-user-item").forEach(el => {
    const hay = el.getAttribute("data-search") || "";
    const r = el.getAttribute("data-role") || "";
    const ok = (!kw || hay.includes(kw)) && (role === "all" || r === role);
    el.style.display = ok ? "" : "none";
  });
}

function filterAdminSplitUsers(groupKey, q) {
  const kw = (q || "").trim().toLowerCase();
  document.querySelectorAll(`.admin-user-item-${groupKey}`).forEach(el => {
    const hay = el.getAttribute("data-search") || "";
    el.style.display = (!kw || hay.includes(kw)) ? "" : "none";
  });
}

async function adminEditRoomStatus(roomId) {
  await toggleRoomStatus(roomId);
  await checkBackendHealthAndLoad();
  loadAdminSection(window._activeAdminSection || "landlords");
}

async function adminDeleteRoom(roomId) {
  await deleteRoom(roomId);
  await checkBackendHealthAndLoad();
  loadAdminSection(window._activeAdminSection || "landlords");
}

async function adminChangeUserRole(userId, newRole) {
  await changeUserRole(userId, newRole);
  loadAdminSection(window._activeAdminSection || "users-landlord");
}

async function adminToggleUserLock(userId, shouldLock) {
  await toggleUserLock(userId, shouldLock);
  loadAdminSection(window._activeAdminSection || "users-landlord");
}

async function adminApproveUser(userId) {
  await approvePendingUser(userId);
  loadAdminSection("users-landlord");
}

async function adminRejectUser(userId) {
  await rejectPendingUser(userId);
  loadAdminSection("users-landlord");
}

// =========================================================================
// GÓC ĐĂNG TIN TÌM PHÒNG THEO YÊU CẦU (NGƯỜI THUÊ ĐĂNG ↔ CHỦ TRỌ LIÊN HỆ)
// =========================================================================

let cachedRoomRequests = [];
let _myRoomsForOffer = [];
let _groupStatusFilter = "all";

function formatMoveInDate(val) {
  if (!val) return "Linh hoạt";
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split("-");
    return `${d}/${m}/${y}`;
  }
  return val;
}

function openGroupPage() {
  const modal = document.getElementById("group-page-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const av = document.getElementById("group-composer-avatar");
  if (av) {
    av.innerHTML = currentUser?.avatar
      ? `<img src="${currentUser.avatar}" class="w-full h-full object-cover">`
      : `<i class="fa-solid fa-user"></i>`;
  }
  loadRoomRequests();
}

function closeGroupPage() {
  const modal = document.getElementById("group-page-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function setGroupStatusFilter(status, btnEl) {
  _groupStatusFilter = status;
  document.querySelectorAll(".group-tab-btn").forEach(b => {
    b.classList.remove("bg-blue-50", "text-blue-700");
    b.classList.add("text-slate-600");
  });
  if (btnEl) {
    btnEl.classList.add("bg-blue-50", "text-blue-700");
    btnEl.classList.remove("text-slate-600");
  }
  loadRoomRequests();
}

async function loadRoomRequests() {
  const grid = document.getElementById("room-requests-grid");
  if (!grid) return;

  const district = document.getElementById("request-district-filter")?.value || "all";
  try {
    const params = new URLSearchParams();
    if (district && district !== "all") params.set("district", district);
    if (_groupStatusFilter && _groupStatusFilter !== "all") params.set("status", _groupStatusFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE_URL}/room-requests${qs}`);
    if (res.ok) {
      cachedRoomRequests = await res.json();
      const meta = document.getElementById("group-meta-stats");
      if (meta) {
        const openCnt = cachedRoomRequests.filter(r => r.status !== "matched").length;
        meta.textContent = `Kết nối trực tiếp Người thuê & Chủ trọ • ${cachedRoomRequests.length} bài đăng (${openCnt} đang cần tìm phòng)`;
      }
      renderRoomRequests(cachedRoomRequests);
      return;
    }
  } catch (err) {
    console.warn("Không tải được tin tìm phòng từ Backend:", err);
  }
  grid.innerHTML = `<div class="py-8 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">Chưa kết nối được bảng tin Group.</div>`;
}

async function likeRoomRequest(reqId) {
  try {
    const res = await fetch(`${API_BASE_URL}/room-requests/${reqId}/like`, { method: "POST" });
    if (res.ok) {
      showToast("👍 Đã bày tỏ quan tâm bài viết!", "success");
      await loadRoomRequests();
    }
  } catch (err) {
    showToast("❌ Không kết nối được Backend NestJS", "info");
  }
}

function renderRoomRequests(list) {
  const grid = document.getElementById("room-requests-grid");
  if (!grid) return;

  if (!list || list.length === 0) {
    grid.innerHTML = `
      <div class="py-10 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
        <div class="text-3xl mb-2">👥</div>
        <div class="font-bold text-slate-700 text-sm mb-1">Chưa có bài đăng nào phù hợp bộ lọc</div>
        <p class="text-xs text-slate-500 mb-3">Hãy là người đầu tiên đăng bài tìm phòng trong Group nhé!</p>
        <button onclick="openAddRequestModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow">+ Đăng bài tìm phòng ngay</button>
      </div>
    `;
    return;
  }

  const isLandlordOrAdmin = canManageRooms();

  grid.innerHTML = list.map(req => {
    const isMatched = req.status === "matched";
    const isOwnerOrAdmin = currentUser && (
      currentUser.role === "admin" ||
      (req.tenantId && String(req.tenantId) === String(currentUser.id))
    );
    const zaloPhone = (req.phone || "").replace(/[^0-9]/g, "");
    const offers = Array.isArray(req.offers) ? req.offers : [];
    const createdStr = req.createdAt ? new Date(req.createdAt).toLocaleString("vi-VN") : "Vừa xong";
    const initial = (req.tenantName || "N").trim().charAt(0).toUpperCase();
    const amenityChips = (req.amenities || []).map(a => {
      const lbl = amenityLabels[a];
      return lbl ? `<span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold">${lbl.name}</span>` : "";
    }).join("");

    return `
      <article class="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <!-- Header bài viết kiểu Facebook -->
        <div class="p-4 pb-2 flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-blue-600 text-white font-extrabold flex items-center justify-center shrink-0 shadow-xs">
              ${initial}
            </div>
            <div class="min-w-0">
              <div class="font-extrabold text-slate-900 text-xs sm:text-sm flex flex-wrap items-center gap-1.5">
                <span class="truncate">${req.tenantName}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">👤 Người thuê</span>
              </div>
              <div class="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>${createdStr}</span>
                <span>•</span>
                <span><i class="fa-solid fa-earth-asia"></i> ${req.districtName || 'Đà Nẵng'}</span>
              </div>
            </div>
          </div>

          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${isMatched ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}">
            ${isMatched ? '✅ Đã chốt phòng' : '🟢 Đang tìm phòng'}
          </span>
        </div>

        <!-- Nội dung bài viết -->
        <div class="px-4 py-2 space-y-2.5">
          <h3 class="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">${req.title}</h3>
          ${req.note ? `<p class="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">${req.note}</p>` : ""}

          <!-- Thẻ thông tin tóm tắt nhu cầu -->
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <div class="text-slate-500">💰 Ngân sách tối đa</div>
              <div class="font-extrabold text-blue-700">${formatCurrency(req.maxBudget)}</div>
            </div>
            <div>
              <div class="text-slate-500">📅 Ngày dọn vào</div>
              <div class="font-bold text-slate-800">${formatMoveInDate(req.moveInDate)}</div>
            </div>
            <div>
              <div class="text-slate-500">🏠 Loại phòng</div>
              <div class="font-bold text-slate-800">${roomTypeLabels[req.roomType] || 'Phòng trọ'} (${req.peopleCount || 1} người)</div>
            </div>
            <div>
              <div class="text-slate-500">📞 Liên hệ</div>
              <div class="font-bold text-slate-800">${req.phone}</div>
            </div>
          </div>

          ${amenityChips ? `<div class="flex flex-wrap gap-1.5">${amenityChips}</div>` : ""}
        </div>

        <!-- Thanh tương tác kiểu Facebook (Quan tâm / Bình luận đề xuất / Liên hệ) -->
        <div class="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex flex-wrap items-center gap-1.5">
            <button onclick="likeRoomRequest('${req._id}')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 font-bold text-xs transition flex items-center gap-1">
              👍 Quan tâm <span class="text-blue-600">(${req.likes || 0})</span>
            </button>
            ${!isMatched && isLandlordOrAdmin ? `
              <button onclick="openOfferRequestModal('${req._id}', '${(req.title || '').replace(/'/g, "\\'")}')" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1">
                🤝 Đề xuất phòng (${offers.length})
              </button>
            ` : `
              <span class="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">💬 ${offers.length} đề xuất từ chủ trọ</span>
            `}
            ${!isMatched ? `
              <a href="tel:${req.phone}" class="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs transition">📞 Gọi</a>
              <a href="https://zalo.me/${zaloPhone}" target="_blank" class="px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-xs transition">💬 Zalo</a>
            ` : ""}
          </div>

          ${isOwnerOrAdmin ? `
            <div class="flex items-center gap-1.5">
              <button onclick="toggleRoomRequestStatus('${req._id}', '${isMatched ? 'open' : 'matched'}')" class="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] transition">
                ${isMatched ? '🔄 Mở lại' : '✅ Đã chốt phòng'}
              </button>
              <button onclick="deleteRoomRequest('${req._id}')" class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition">
                🗑️ Xóa
              </button>
            </div>
          ` : ""}
        </div>

        <!-- Luồng bình luận / Đề xuất phòng của Chủ trọ kiểu Facebook -->
        ${offers.length > 0 ? `
          <div class="px-4 py-3 bg-slate-50/80 border-t border-slate-100 space-y-2.5">
            ${offers.map(o => {
              const oZalo = (o.landlordPhone || "").replace(/[^0-9]/g, "");
              const oInit = (o.landlordName || "C").trim().charAt(0).toUpperCase();
              return `
                <div class="flex items-start gap-2.5">
                  <div class="w-7 h-7 rounded-full bg-amber-500 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">${oInit}</div>
                  <div class="flex-1 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs space-y-1 shadow-2xs">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-extrabold text-slate-900">🏠 ${o.landlordName} <span class="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Chủ trọ</span></span>
                      ${o.offerPrice ? `<span class="font-extrabold text-blue-700">${formatCurrency(o.offerPrice)}</span>` : ""}
                    </div>
                    ${o.roomTitle ? `
                      <div>
                        ${o.roomId ? `<button onclick="openRoomModal('${o.roomId}')" class="text-indigo-600 hover:underline font-bold text-left">🔗 Xem phòng đề xuất: ${o.roomTitle}</button>` : `<span class="font-bold text-indigo-700">🏠 ${o.roomTitle}</span>`}
                      </div>
                    ` : ""}
                    <p class="text-slate-700 leading-relaxed">${o.message}</p>
                    <div class="flex items-center gap-2 pt-1">
                      <a href="tel:${o.landlordPhone}" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px]">📞 Gọi ${o.landlordPhone}</a>
                      <a href="https://zalo.me/${oZalo}" target="_blank" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[10px]">💬 Nhắn Zalo làm hợp đồng</a>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function openAddRequestModal() {
  if (currentUser) {
    const nameInput = document.getElementById("req-name");
    const phoneInput = document.getElementById("req-phone");
    if (nameInput && !nameInput.value) nameInput.value = currentUser.fullName || "";
    if (phoneInput && !phoneInput.value) phoneInput.value = currentUser.phone || "";
  }
  const dateInput = document.getElementById("req-movein");
  if (dateInput && !dateInput.value) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.min = today;
    dateInput.value = today;
  }
  const modal = document.getElementById("add-request-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

async function handleAddRequestSubmit(e) {
  e.preventDefault();
  const distSel = document.getElementById("req-district");
  const amenities = Array.from(document.querySelectorAll('input[name="req-amenity"]:checked')).map(cb => cb.value);

  const payload = {
    title: document.getElementById("req-title").value.trim(),
    tenantName: document.getElementById("req-name").value.trim(),
    phone: document.getElementById("req-phone").value.trim(),
    district: distSel.value,
    districtName: distSel.options[distSel.selectedIndex]?.text || "Đà Nẵng",
    maxBudget: parseInt(document.getElementById("req-budget").value, 10) || 2500000,
    peopleCount: parseInt(document.getElementById("req-people").value, 10) || 1,
    roomType: document.getElementById("req-type").value,
    moveInDate: document.getElementById("req-movein").value.trim(),
    amenities,
    note: document.getElementById("req-note").value.trim(),
    tenantId: currentUser ? currentUser.id : undefined
  };

  try {
    const res = await fetch(`${API_BASE_URL}/room-requests`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể đăng tin tìm phòng"}`, "info");
      return;
    }
    document.getElementById("add-request-form").reset();
    closeModal("add-request-modal");
    showToast("📣 Đã đăng tin tìm phòng thành công! Các chủ trọ phù hợp sẽ sớm liên hệ bạn.", "success");
    await loadRoomRequests();
  } catch (err) {
    showToast("❌ Không kết nối được Backend NestJS (port 5000)", "info");
  }
}

async function openOfferRequestModal(requestId, requestTitle) {
  if (!canManageRooms()) {
    showToast("🔒 Vui lòng đăng nhập tài khoản Chủ trọ để gửi đề xuất phòng!", "info");
    openAuthModal("login");
    return;
  }

  document.getElementById("offer-request-id").value = requestId;
  document.getElementById("offer-request-target-title").textContent = `Đề xuất phòng cho yêu cầu: "${requestTitle}"`;
  const phoneEl = document.getElementById("offer-phone");
  if (phoneEl) phoneEl.value = currentUser?.phone || "";

  // Tải danh sách phòng RIÊNG của chủ trọ này để chọn nhanh 1 chạm
  const sel = document.getElementById("offer-room-select");
  if (sel) {
    sel.innerHTML = `<option value="">-- Nhập thông tin phòng trực tiếp --</option>`;
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/my-rooms`, { headers: getAuthHeaders() });
      if (res.ok) {
        _myRoomsForOffer = await res.json();
        _myRoomsForOffer.forEach(r => {
          const opt = document.createElement("option");
          opt.value = r._id;
          opt.textContent = `${r.title} (${formatCurrency(r.price)})`;
          sel.appendChild(opt);
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  const modal = document.getElementById("offer-request-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function onOfferRoomSelectChange(selectEl) {
  const chosen = _myRoomsForOffer.find(r => String(r._id) === String(selectEl.value));
  if (chosen) {
    const priceEl = document.getElementById("offer-price");
    const msgEl = document.getElementById("offer-message");
    if (priceEl) priceEl.value = chosen.price || 2000000;
    if (msgEl && !msgEl.value.trim()) {
      msgEl.value = `Chào bạn, bên mình có phòng "${chosen.title}" tại ${chosen.address}, giá ${formatCurrency(chosen.price)}, diện tích ${chosen.area}m² rất phù hợp với yêu cầu của bạn. Liên hệ mình qua xem phòng và ký hợp đồng nhé!`;
    }
  }
}

async function handleOfferRequestSubmit(e) {
  e.preventDefault();
  const reqId = document.getElementById("offer-request-id").value;
  const selRoomId = document.getElementById("offer-room-select").value;
  const chosen = _myRoomsForOffer.find(r => String(r._id) === String(selRoomId));

  const payload = {
    landlordName: currentUser?.fullName || "Chủ trọ SVTrọ",
    landlordPhone: document.getElementById("offer-phone").value.trim(),
    roomId: chosen ? chosen._id : "",
    roomTitle: chosen ? chosen.title : "",
    offerPrice: parseInt(document.getElementById("offer-price").value, 10) || 0,
    message: document.getElementById("offer-message").value.trim()
  };

  try {
    const res = await fetch(`${API_BASE_URL}/room-requests/${reqId}/offers`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể gửi đề xuất"}`, "info");
      return;
    }
    document.getElementById("offer-request-form").reset();
    closeModal("offer-request-modal");
    showToast("🤝 Đã gửi đề xuất phòng tới Người thuê thành công!", "success");
    await loadRoomRequests();
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

async function toggleRoomRequestStatus(reqId, newStatus) {
  try {
    const res = await fetch(`${API_BASE_URL}/room-requests/${reqId}/status`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      showToast(newStatus === "matched" ? "✅ Đã đánh dấu đã chốt phòng / hợp đồng!" : "🔄 Đã mở lại tin tìm phòng!", "success");
      await loadRoomRequests();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể cập nhật trạng thái"}`, "info");
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

async function deleteRoomRequest(reqId) {
  if (!confirm("Bạn có chắc chắn muốn xóa tin tìm phòng này không?")) return;
  try {
    const res = await fetch(`${API_BASE_URL}/room-requests/${reqId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast("🗑️ Đã xóa tin tìm phòng!", "success");
      await loadRoomRequests();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.message || "Không thể xóa tin"}`, "info");
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối Backend NestJS", "info");
  }
}

// =========================================================================
// TRANG QUẢN LÝ RIÊNG CHO CHỦ TRỌ (FULL-SCREEN VỚI SIDEBAR BÊN TRÁI)
// =========================================================================

window._activeLandlordSection = "myrooms";

function openLandlordPage(section = "myrooms") {
  if (!canManageRooms()) {
    showToast("🔒 Chỉ tài khoản Chủ trọ mới được truy cập Trang Chủ Trọ!", "info");
    return;
  }

  const modal = document.getElementById("landlord-page-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const prof = document.getElementById("landlord-sidebar-profile");
  if (prof) {
    const init = (currentUser.fullName || "C").trim().charAt(0).toUpperCase();
    const avatarHtml = currentUser.avatar
      ? `<img src="${currentUser.avatar}" class="w-8 h-8 rounded-full object-cover border border-white/30 shrink-0">`
      : `<div class="w-8 h-8 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center shrink-0">${init}</div>`;
    prof.innerHTML = `
      ${avatarHtml}
      <div class="min-w-0">
        <div class="font-bold text-white truncate">${currentUser.fullName}</div>
        <div class="text-[10px] text-emerald-400">● Chủ trọ • ${currentUser.phone || ""}</div>
      </div>
    `;
  }

  loadLandlordSection(section);
}

function closeLandlordPage() {
  const modal = document.getElementById("landlord-page-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

async function loadLandlordSection(section = "myrooms") {
  window._activeLandlordSection = section;
  const body = document.getElementById("landlord-page-body");
  const heading = document.getElementById("landlord-page-heading");
  const sub = document.getElementById("landlord-page-sub");
  if (!body) return;

  const metaMap = {
    myrooms: ["🏠 Phòng Trọ Của Tôi", "Chỉ hiển thị các phòng do chính bạn đăng — dễ dàng đăng, sửa, xóa mà không nhầm với chủ trọ khác"],
    appointments: ["📅 Lịch Hẹn Xem Phòng & Danh Sách Chờ", "Xác nhận hoặc hủy các lịch hẹn xem phòng từ người thuê"],
    inbox: ["💬 Tin Nhắn Từ Khách Thuê", "Trao đổi trực tiếp theo thời gian thực với khách quan tâm phòng của bạn"],
    billing: ["🧾 Tính Tiền Phòng & Tạo Mã VietQR", "Tạo hóa đơn tiền phòng + điện + nước hàng tháng và mã QR chuyển khoản nhanh"]
  };
  if (heading) heading.textContent = (metaMap[section] || metaMap.myrooms)[0];
  if (sub) sub.textContent = (metaMap[section] || metaMap.myrooms)[1];

  ["myrooms", "appointments", "inbox", "billing"].forEach(s => {
    const btn = document.getElementById(`landlord-nav-${s}`);
    if (!btn) return;
    if (s === section) {
      btn.classList.add("bg-blue-600", "text-white", "shadow");
      btn.classList.remove("text-slate-300", "hover:bg-slate-800");
    } else {
      btn.classList.remove("bg-blue-600", "text-white", "shadow");
      btn.classList.add("text-slate-300", "hover:bg-slate-800");
    }
  });

  await loadDashboardTab(section, body);
}

function refreshManagerViews(tab = "myrooms") {
  const dashModal = document.getElementById("dashboard-modal");
  if (dashModal && !dashModal.classList.contains("hidden")) {
    loadDashboardTab(tab);
  }
  const landlordModal = document.getElementById("landlord-page-modal");
  if (landlordModal && !landlordModal.classList.contains("hidden")) {
    loadLandlordSection(window._activeLandlordSection || tab);
  }
}

// =========================================================================
// TRANG RIÊNG PHÒNG YÊU THÍCH ĐÃ LƯU CHO NGƯỜI THUÊ
// =========================================================================

function getFavoriteNotes() {
  try {
    return JSON.parse(localStorage.getItem("svtro_favorite_notes") || "{}");
  } catch {
    return {};
  }
}

function saveFavoriteNote(roomId, noteText) {
  const notes = getFavoriteNotes();
  notes[String(roomId)] = noteText;
  localStorage.setItem("svtro_favorite_notes", JSON.stringify(notes));
}

function openFavoritesPage() {
  const modal = document.getElementById("favorites-page-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  renderFavoritesPage();
}

function closeFavoritesPage() {
  const modal = document.getElementById("favorites-page-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function removeFavoriteFromPage(roomId) {
  const strId = String(roomId);
  savedFavorites = savedFavorites.map(String).filter(id => id !== strId);
  localStorage.setItem("svtro_favorites", JSON.stringify(savedFavorites));
  updateFavoritesCount();
  renderRooms(rooms);
  renderFavoritesPage();
  showToast("💔 Đã bỏ phòng khỏi danh sách yêu thích", "info");
}

function clearAllFavorites() {
  if (savedFavorites.length === 0) return;
  if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ phòng đã lưu không?")) return;
  savedFavorites = [];
  localStorage.setItem("svtro_favorites", JSON.stringify([]));
  updateFavoritesCount();
  renderRooms(rooms);
  renderFavoritesPage();
  showToast("🗑️ Đã xóa toàn bộ danh sách phòng đã lưu!", "info");
}

function renderFavoritesPage() {
  const grid = document.getElementById("favorites-page-grid");
  const countPill = document.getElementById("fav-page-count-pill");
  if (!grid) return;

  const favIds = savedFavorites.map(String);
  const notes = getFavoriteNotes();
  let favRooms = rooms.filter(r => favIds.includes(String(r.id)));

  if (countPill) countPill.textContent = favRooms.length;

  const kw = (document.getElementById("fav-search-input")?.value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("fav-status-filter")?.value || "all";
  const sortMode = document.getElementById("fav-sort-select")?.value || "recent";

  if (statusFilter === "available") {
    favRooms = favRooms.filter(r => r.status !== "full");
  }
  if (kw) {
    favRooms = favRooms.filter(r => {
      const note = (notes[String(r.id)] || "").toLowerCase();
      return (
        (r.title || "").toLowerCase().includes(kw) ||
        (r.address || "").toLowerCase().includes(kw) ||
        (r.districtName || "").toLowerCase().includes(kw) ||
        note.includes(kw)
      );
    });
  }

  if (sortMode === "price-asc") favRooms.sort((a, b) => a.price - b.price);
  else if (sortMode === "price-desc") favRooms.sort((a, b) => b.price - a.price);
  else if (sortMode === "area-desc") favRooms.sort((a, b) => b.area - a.area);

  if (favRooms.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-14 text-center bg-white border border-dashed border-slate-300 rounded-3xl">
        <div class="text-4xl mb-3">❤️</div>
        <h3 class="text-base font-extrabold text-slate-800 mb-1">
          ${favIds.length === 0 ? "Bạn chưa lưu phòng yêu thích nào" : "Không tìm thấy phòng phù hợp bộ lọc"}
        </h3>
        <p class="text-xs text-slate-500 mb-4 max-w-md mx-auto">
          ${favIds.length === 0
            ? "Khi lướt xem phòng ngoài trang chủ, hãy bấm vào biểu tượng Trái tim ❤️ trên từng phòng để lưu lại và tìm kiếm, so sánh dễ dàng tại đây!"
            : "Hãy thử xóa từ khóa tìm kiếm hoặc đổi bộ lọc tình trạng phòng."}
        </p>
        <button onclick="closeFavoritesPage()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow transition">
          🔍 Khám phá danh sách phòng trọ ngay
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = favRooms.map(room => {
    const savedNote = notes[String(room.id)] || "";
    const ggMapsUrl = getGoogleMapsUrl(room.lat, room.lng, room.address);
    return `
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between">
        <div>
          <div class="relative h-44 w-full overflow-hidden cursor-pointer" onclick="openRoomModal('${room.id}')">
            <img src="${room.image}" alt="${room.title}" class="w-full h-full object-cover hover:scale-105 transition duration-500">
            <div class="absolute top-2.5 left-2.5">${getStatusBadge(room.status, room.availableCount)}</div>
            <button onclick="event.stopPropagation(); removeFavoriteFromPage('${room.id}')" class="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 hover:bg-rose-600 text-rose-500 hover:text-white shadow flex items-center justify-center transition" title="Bỏ lưu khỏi yêu thích">
              <i class="fa-solid fa-heart"></i>
            </button>
            <div class="absolute bottom-2.5 left-2.5 bg-blue-600 text-white text-xs font-extrabold px-2.5 py-1 rounded-lg shadow">
              ${formatCurrency(room.price)}
            </div>
          </div>

          <div class="p-4 space-y-2">
            <h3 onclick="openRoomModal('${room.id}')" class="font-extrabold text-slate-900 text-sm line-clamp-2 cursor-pointer hover:text-blue-600 transition">${room.title}</h3>
            <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
              <i class="fa-solid fa-location-dot text-rose-500"></i>
              <span class="truncate">${room.address}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
              <span class="px-2 py-0.5 bg-slate-100 rounded-md">📐 ${room.area} m²</span>
              <span class="px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md">⚡ ${room.electricity}</span>
              <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">📍 ${room.districtName || 'Đà Nẵng'}</span>
            </div>

            <!-- Ghi chú cá nhân cho phòng đã lưu -->
            <div class="pt-1">
              <input type="text" value="${savedNote.replace(/"/g, '&quot;')}" oninput="saveFavoriteNote('${room.id}', this.value)" placeholder="📝 Ghi chú riêng (VD: Cuối tuần qua xem, gần trường)..." class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-700 focus:ring-2 focus:ring-rose-400 focus:outline-none">
            </div>
          </div>
        </div>

        <div class="px-4 pb-4 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
          <button onclick="openRoomModal('${room.id}')" class="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition">
            👁️ Xem chi tiết
          </button>
          <a href="tel:${room.phone}" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold transition" title="Gọi chủ trọ">
            📞 Gọi
          </a>
          <a href="${ggMapsUrl}" target="_blank" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition" title="Mở Google Maps">
            🗺️
          </a>
          <button onclick="removeFavoriteFromPage('${room.id}')" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold transition" title="Bỏ lưu">
            💔
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// =========================================================================
// HỆ THỐNG CHUÔNG THÔNG BÁO CÁ NHÂN (TIN NHẮN, CẬP NHẬT, LỊCH HẸN, ĐỀ XUẤT)
// =========================================================================

let cachedNotifications = [];
let _notifFilterMode = "unread";

function getNotifReadStorageKey() {
  return currentUser ? `svtro_read_notifs_${currentUser.id}` : "svtro_read_notifs_guest";
}

function getReadNotifIds() {
  try {
    return JSON.parse(localStorage.getItem(getNotifReadStorageKey()) || "[]");
  } catch {
    return [];
  }
}

function markNotifAsRead(notifId) {
  const ids = getReadNotifIds();
  if (!ids.includes(notifId)) {
    ids.push(notifId);
    localStorage.setItem(getNotifReadStorageKey(), JSON.stringify(ids));
  }
  renderNotifications();
}

function markAllNotifsRead() {
  const ids = Array.from(new Set([...getReadNotifIds(), ...cachedNotifications.map(n => n.id)]));
  localStorage.setItem(getNotifReadStorageKey(), JSON.stringify(ids));
  renderNotifications();
  showToast("✅ Đã đánh dấu tất cả thông báo là đã xem!", "success");
}

function toggleNotifDropdown(event) {
  if (event) event.stopPropagation();
  closeUserDropdown();
  const dd = document.getElementById("notif-dropdown");
  if (!dd) return;
  const willOpen = dd.classList.contains("hidden");
  dd.classList.toggle("hidden");
  if (willOpen) {
    loadNotifications();
  }
}

function closeNotifDropdown() {
  const dd = document.getElementById("notif-dropdown");
  if (dd) dd.classList.add("hidden");
}

function setNotifFilter(mode, btnEl) {
  _notifFilterMode = mode;
  document.querySelectorAll(".notif-filter-btn").forEach(b => {
    b.classList.remove("bg-blue-600", "text-white");
    b.classList.add("text-slate-600");
  });
  if (btnEl) {
    btnEl.classList.add("bg-blue-600", "text-white");
    btnEl.classList.remove("text-slate-600");
  }
  renderNotifications();
}

async function loadNotifications() {
  if (!isBackendOnline) return;
  const items = [];

  try {
    // 1. Thông báo cập nhật chương trình / bài viết mới từ Admin (Blog)
    const postsRes = await fetch(`${API_BASE_URL}/posts`);
    if (postsRes.ok) {
      const posts = await postsRes.json();
      (posts || []).slice(0, 6).forEach(p => {
        items.push({
          id: `post_${p._id}`,
          icon: "📢",
          tag: "Cập nhật hệ thống",
          tagCls: "bg-indigo-100 text-indigo-700",
          title: p.title,
          desc: p.summary || "Bấm để xem chi tiết thông báo mới từ SVTrọ",
          time: p.createdAt,
          action: () => openBlogDetailModal(p._id)
        });
      });
    }

    // 2. Thông báo riêng theo từng tài khoản đang đăng nhập
    if (currentUser && authToken) {
      const role = currentUser.role;

      // 2a. Tin nhắn khách thuê & Cảnh báo quá hạn thanh toán > 1 tuần (Chủ trọ / Admin)
      if (role === "landlord" || role === "admin") {
        // Kiểm tra phòng quá hạn thanh toán > 7 ngày
        const savedMeters = getSavedBillingMeters();
        const myBillRooms = rooms.filter(r => role === "admin" || (r.landlordId && String(r.landlordId) === String(currentUser.id)));
        myBillRooms.forEach((r, idx) => {
          const m = savedMeters[String(r.id)] || getDefaultBillingMeter(r, idx);
          const info = getBillingOverdueInfo(m);
          if (info.state === "overdue-week") {
            items.push({
              id: `overdue_${r.id}_${m.dueDate}`,
              icon: "🚨",
              tag: "Quá hạn > 1 tuần",
              tagCls: "bg-rose-100 text-rose-700",
              title: `Phòng quá hạn thanh toán ${info.daysLate} ngày!`,
              desc: `${r.title} • Người thuê: ${m.tenantName || "Khách thuê"} (Hạn ${formatMoveInDate(m.dueDate)})`,
              time: new Date().toISOString(),
              action: () => {
                window._selectedBillingRoomId = r.id;
                openLandlordPage("billing");
              }
            });
          }
        });

        const chatRes = await fetch(`${API_BASE_URL}/chat/conversations`, { headers: getAuthHeaders() });
        if (chatRes.ok) {
          const convs = await chatRes.json();
          (convs || []).slice(0, 5).forEach(c => {
            const matchedRoom = rooms.find(r => String(r.id) === String(c._id));
            const roomTitle = matchedRoom ? matchedRoom.title : `Phòng #${c._id}`;
            items.push({
              id: `chat_${c._id}_${c.messageCount || 1}`,
              icon: "💬",
              tag: "Tin nhắn mới",
              tagCls: "bg-sky-100 text-sky-700",
              title: `Tin nhắn từ ${c.lastSender || "Khách thuê"}`,
              desc: `${c.lastMessage || ""} (${roomTitle.slice(0, 35)})`,
              time: c.lastTime,
              action: () => openChatModal(c._id, roomTitle)
            });
          });
        }

        // Lịch hẹn xem phòng mới
        const apptRes = await fetch(`${API_BASE_URL}/appointments`, { headers: getAuthHeaders() });
        if (apptRes.ok) {
          const appts = await apptRes.json();
          (appts || []).filter(a => a.status === "pending").slice(0, 5).forEach(a => {
            items.push({
              id: `appt_pending_${a._id}`,
              icon: "📅",
              tag: "Lịch hẹn mới",
              tagCls: "bg-amber-100 text-amber-800",
              title: `${a.tenantName} đặt lịch xem phòng`,
              desc: `${a.roomTitle} • ${a.appointmentDate} (${a.appointmentTime})`,
              time: a.createdAt,
              action: () => role === "admin" ? openAdminPage("overview") : openLandlordPage("appointments")
            });
          });
        }
      }

      // 2b. Yêu cầu duyệt tài khoản mới (Chỉ Admin)
      if (role === "admin") {
        const pendRes = await fetch(`${API_BASE_URL}/users/pending`, { headers: getAuthHeaders() });
        if (pendRes.ok) {
          const pends = await pendRes.json();
          (pends || []).forEach(u => {
            items.push({
              id: `pending_user_${u._id}`,
              icon: "📩",
              tag: "Chờ duyệt TK",
              tagCls: "bg-rose-100 text-rose-700",
              title: `${u.fullName} đăng ký tài khoản mới`,
              desc: `Email: ${u.email} • SĐT: ${u.phone}`,
              time: u.createdAt,
              action: () => openAdminPage("users")
            });
          });
        }
      }

      // 2c. Lịch hẹn & Đề xuất phòng cho Người thuê
      if (role !== "admin" && role !== "landlord") {
        const myApptRes = await fetch(`${API_BASE_URL}/appointments/my`, { headers: getAuthHeaders() });
        if (myApptRes.ok) {
          const myAppts = await myApptRes.json();
          (myAppts || []).slice(0, 5).forEach(a => {
            const stText = a.status === "confirmed" ? "✅ Chủ trọ đã xác nhận lịch hẹn" : a.status === "cancelled" ? "❌ Lịch hẹn đã bị hủy" : "⏳ Đã gửi lịch hẹn xem phòng";
            items.push({
              id: `my_appt_${a._id}_${a.status}`,
              icon: "📅",
              tag: "Lịch hẹn",
              tagCls: "bg-emerald-100 text-emerald-700",
              title: stText,
              desc: `${a.roomTitle} • ${a.appointmentDate} (${a.appointmentTime})`,
              time: a.updatedAt || a.createdAt,
              action: () => openMyAppointmentsModal()
            });
          });
        }
      }

      // 2d. Tin Group Tìm Phòng & Đề xuất phòng từ Chủ trọ
      const reqRes = await fetch(`${API_BASE_URL}/room-requests`);
      if (reqRes.ok) {
        const reqs = await reqRes.json();
        (reqs || []).forEach(req => {
          const isMine = (req.tenantId && String(req.tenantId) === String(currentUser.id)) || (currentUser.phone && req.phone === currentUser.phone);
          if (isMine && Array.isArray(req.offers) && req.offers.length > 0) {
            req.offers.forEach((o, idx) => {
              items.push({
                id: `offer_${req._id}_${idx}`,
                icon: "🤝",
                tag: "Chủ trọ đề xuất",
                tagCls: "bg-blue-100 text-blue-700",
                title: `${o.landlordName} vừa đề xuất phòng cho bạn!`,
                desc: o.message || `Phòng phù hợp với yêu cầu "${req.title}"`,
                time: o.createdAt || req.updatedAt,
                action: () => openGroupPage()
              });
            });
          } else if (role === "landlord" && req.status === "open") {
            items.push({
              id: `group_req_${req._id}`,
              icon: "📣",
              tag: "Khách cần tìm phòng",
              tagCls: "bg-emerald-100 text-emerald-700",
              title: `${req.tenantName} cần tìm phòng tại ${req.districtName}`,
              desc: `${req.title} • Ngân sách tối đa ${formatCurrency(req.maxBudget)}`,
              time: req.createdAt,
              action: () => openGroupPage()
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn("Lỗi tải thông báo:", err);
  }

  // Sắp xếp mới nhất lên đầu
  items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  cachedNotifications = items;
  renderNotifications();
}

function handleNotifClick(index) {
  const item = cachedNotifications[index];
  if (!item) return;
  markNotifAsRead(item.id);
  closeNotifDropdown();
  if (typeof item.action === "function") item.action();
}

function renderNotifications() {
  const listEl = document.getElementById("notif-list-body");
  const badgeEl = document.getElementById("notif-unread-badge");
  const headerCountEl = document.getElementById("notif-header-count");
  if (!listEl) return;

  const readIds = getReadNotifIds();
  const unreadCount = cachedNotifications.filter(n => !readIds.includes(n.id)).length;

  if (badgeEl) {
    badgeEl.textContent = unreadCount > 99 ? "99+" : unreadCount;
    badgeEl.style.display = unreadCount > 0 ? "inline-flex" : "none";
  }
  if (headerCountEl) {
    headerCountEl.textContent = `${unreadCount} chưa xem`;
  }

  const displayList = cachedNotifications
    .map((n, idx) => ({ ...n, _idx: idx, isRead: readIds.includes(n.id) }))
    .filter(n => _notifFilterMode === "all" || !n.isRead);

  if (displayList.length === 0) {
    listEl.innerHTML = `
      <div class="py-10 px-4 text-center text-slate-400">
        <div class="text-2xl mb-1.5">🔕</div>
        <div class="font-bold text-slate-600 text-xs">${_notifFilterMode === "unread" ? "Bạn đã xem hết tất cả thông báo!" : "Chưa có thông báo nào."}</div>
        <div class="text-[11px] mt-0.5">Tin nhắn mới, đề xuất phòng và cập nhật chương trình sẽ tự động hiện tại đây.</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = displayList.map(n => {
    const timeStr = n.time ? new Date(n.time).toLocaleString("vi-VN") : "Mới";
    return `
      <div onclick="handleNotifClick(${n._idx})" class="notif-item ${n.isRead ? 'notif-read opacity-75' : 'notif-unread'} p-3 cursor-pointer transition flex items-start gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-base shrink-0 mt-0.5">${n.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1.5 mb-0.5">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${n.tagCls}">${n.tag}</span>
            ${!n.isRead ? '<span class="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Chưa xem"></span>' : ''}
          </div>
          <div class="font-bold text-slate-900 text-xs line-clamp-1">${n.title}</div>
          <div class="text-[11px] text-slate-600 line-clamp-2 mt-0.5">${n.desc}</div>
          <div class="text-[10px] text-slate-400 mt-1">${timeStr}</div>
        </div>
      </div>
    `;
  }).join("");
}

// =========================================================================
// TRANG QUẢN LÝ RIÊNG CHO NGƯỜI THUÊ (FULL-SCREEN VỚI SIDEBAR BÊN TRÁI)
// =========================================================================

window._activeTenantSection = "appointments";

function openTenantPage(section = "appointments") {
  if (!currentUser || !authToken) {
    showToast("🔒 Vui lòng đăng nhập để mở Trang Người Thuê!", "info");
    openAuthModal("login");
    return;
  }

  const modal = document.getElementById("tenant-page-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");

  const prof = document.getElementById("tenant-sidebar-profile");
  if (prof) {
    const init = (currentUser.fullName || "N").trim().charAt(0).toUpperCase();
    const avatarHtml = currentUser.avatar
      ? `<img src="${currentUser.avatar}" class="w-8 h-8 rounded-full object-cover border border-white/30 shrink-0">`
      : `<div class="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0">${init}</div>`;
    prof.innerHTML = `
      ${avatarHtml}
      <div class="min-w-0">
        <div class="font-bold text-white truncate">${currentUser.fullName}</div>
        <div class="text-[10px] text-emerald-400">● Người thuê • ${currentUser.phone || ""}</div>
      </div>
    `;
  }

  loadTenantSection(section);
}

function closeTenantPage() {
  const modal = document.getElementById("tenant-page-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

async function loadTenantSection(section = "appointments") {
  window._activeTenantSection = section;
  const body = document.getElementById("tenant-page-body");
  const heading = document.getElementById("tenant-page-heading");
  const sub = document.getElementById("tenant-page-sub");
  if (!body) return;

  const metaMap = {
    appointments: ["📅 Lịch Hẹn Xem Phòng Của Tôi", "Theo dõi trạng thái xác nhận lịch hẹn từ các chủ trọ theo thời gian thực"],
    favorites: ["❤️ Phòng Yêu Thích Đã Lưu", "Quản lý danh sách phòng bạn đã thả tim, ghi chú cá nhân và liên hệ nhanh"],
    myrequests: ["📣 Tin Tìm Phòng Của Tôi Trong Group", "Xem đề xuất phòng từ chủ trọ và đánh dấu đã chốt phòng khi tìm được"],
    profile: ["👤 Hồ Sơ Cá Nhân & Ảnh Đại Diện", "Cập nhật họ tên, số điện thoại liên hệ và tải ảnh đại diện mới"],
    security: ["🔐 Bảo Mật & Nhật Ký Đăng Nhập", "Đổi mật khẩu mã hóa Bcrypt và theo dõi lịch sử thiết bị đăng nhập"]
  };
  if (heading) heading.textContent = (metaMap[section] || metaMap.appointments)[0];
  if (sub) sub.textContent = (metaMap[section] || metaMap.appointments)[1];

  ["appointments", "favorites", "myrequests", "profile", "security"].forEach(s => {
    const btn = document.getElementById(`tenant-nav-${s}`);
    if (!btn) return;
    if (s === section) {
      btn.classList.add("bg-blue-600", "text-white", "shadow");
      btn.classList.remove("text-slate-300", "hover:bg-slate-800");
    } else {
      btn.classList.remove("bg-blue-600", "text-white", "shadow");
      btn.classList.add("text-slate-300", "hover:bg-slate-800");
    }
  });

  body.innerHTML = `<div class="py-10 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang tải dữ liệu...</div>`;

  try {
    if (section === "appointments") {
      const res = await fetch(`${API_BASE_URL}/appointments/my`, { headers: getAuthHeaders() });
      const list = res.ok ? await res.json() : [];
      if (!list.length) {
        body.innerHTML = `
          <div class="py-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
            <div class="text-3xl mb-2">📅</div>
            <div class="font-bold text-slate-700 text-sm mb-1">Bạn chưa đặt lịch xem phòng nào</div>
            <p class="text-xs text-slate-500 mb-3">Hãy chọn phòng ưng ý ngoài trang chủ và đặt lịch hẹn để chủ trọ xác nhận nhé!</p>
            <button onclick="closeTenantPage()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow">🔍 Tìm phòng ngay</button>
          </div>
        `;
        return;
      }

      body.innerHTML = `
        <div class="space-y-3">
          ${list.map(a => {
            const st = a.status === "confirmed"
              ? `<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[11px]">✅ Chủ trọ đã xác nhận</span>`
              : a.status === "cancelled"
              ? `<span class="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[11px]">❌ Đã hủy</span>`
              : `<span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">⏳ Đang chờ chủ trọ xác nhận</span>`;
            return `
              <div class="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    ${st}
                    <span class="font-bold text-slate-800">🗓️ ${a.appointmentDate} (${a.appointmentTime})</span>
                  </div>
                  <div class="font-extrabold text-blue-700 text-sm">${a.roomTitle}</div>
                  ${a.note ? `<div class="text-[11px] text-slate-500 italic mt-0.5">Ghi chú: "${a.note}"</div>` : ""}
                </div>
                ${a.roomId ? `
                  <button onclick="openRoomModal('${a.roomId}')" class="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs shrink-0">👁️ Xem lại phòng</button>
                ` : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else if (section === "favorites") {
      const favIds = savedFavorites.map(String);
      const notes = getFavoriteNotes();
      const favRooms = rooms.filter(r => favIds.includes(String(r.id)));

      if (!favRooms.length) {
        body.innerHTML = `
          <div class="py-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl">
            <div class="text-3xl mb-2">❤️</div>
            <div class="font-bold text-slate-700 text-sm mb-1">Bạn chưa lưu phòng yêu thích nào</div>
            <p class="text-xs text-slate-500 mb-3">Bấm biểu tượng Trái tim ❤️ trên phòng bạn thích để lưu lại xem và so sánh dễ dàng!</p>
            <button onclick="closeTenantPage()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow">🔍 Xem danh sách phòng</button>
          </div>
        `;
        return;
      }

      body.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="font-bold text-slate-700">Đang lưu <strong class="text-rose-600">${favRooms.length}</strong> phòng yêu thích</div>
          <button onclick="openFavoritesPage()" class="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-[11px]">Mở toàn màn hình lọc &amp; sắp xếp →</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${favRooms.map(r => `
            <div class="p-3.5 bg-white border border-slate-200 rounded-2xl flex gap-3 shadow-2xs">
              <img src="${r.image}" onclick="openRoomModal('${r.id}')" class="w-24 h-20 object-cover rounded-xl cursor-pointer shrink-0 border border-slate-200">
              <div class="flex-1 min-w-0 space-y-1">
                <div onclick="openRoomModal('${r.id}')" class="font-extrabold text-slate-900 text-xs line-clamp-1 cursor-pointer hover:text-blue-600">${r.title}</div>
                <div class="text-blue-600 font-extrabold text-xs">${formatCurrency(r.price)} • ${r.area}m²</div>
                <input type="text" value="${(notes[String(r.id)] || "").replace(/"/g, '&quot;')}" oninput="saveFavoriteNote('${r.id}', this.value)" placeholder="📝 Ghi chú riêng..." class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px]">
                <div class="flex items-center gap-1.5 pt-0.5">
                  <button onclick="openRoomModal('${r.id}')" class="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-bold text-[10px]">👁️ Xem</button>
                  <a href="tel:${r.phone}" class="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-[10px]">📞 Gọi</a>
                  <button onclick="removeFavoriteFromPage('${r.id}'); loadTenantSection('favorites')" class="px-2 py-1 bg-rose-50 text-rose-700 rounded-lg font-bold text-[10px]">💔 Bỏ lưu</button>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } else if (section === "myrequests") {
      const res = await fetch(`${API_BASE_URL}/room-requests`);
      const allReqs = res.ok ? await res.json() : [];
      const mine = allReqs.filter(r =>
        (r.tenantId && String(r.tenantId) === String(currentUser.id)) ||
        (currentUser.phone && r.phone === currentUser.phone)
      );

      body.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl p-4">
          <div>
            <div class="font-extrabold text-slate-900 text-sm">📣 Tin tìm phòng bạn đã đăng (${mine.length})</div>
            <div class="text-[11px] text-slate-500">Khi chủ trọ gửi đề xuất phòng phù hợp, thông tin liên hệ sẽ hiện ngay tại đây.</div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openGroupPage()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs">👥 Xem Group</button>
            <button onclick="openAddRequestModal()" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow">+ Đăng tin tìm phòng</button>
          </div>
        </div>
        ${mine.length > 0 ? mine.map(req => {
          const isMatched = req.status === "matched";
          const offers = Array.isArray(req.offers) ? req.offers : [];
          return `
            <div class="p-4 bg-white border border-slate-200 rounded-2xl space-y-2.5 shadow-2xs">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isMatched ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}">
                  ${isMatched ? '✅ Đã chốt phòng' : '🟢 Đang tìm phòng'}
                </span>
                <div class="flex items-center gap-1.5">
                  <button onclick="toggleRoomRequestStatus('${req._id}', '${isMatched ? 'open' : 'matched'}').then(() => loadTenantSection('myrequests'))" class="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg font-bold text-[11px]">
                    ${isMatched ? '🔄 Mở lại' : '✅ Đã chốt phòng'}
                  </button>
                  <button onclick="deleteRoomRequest('${req._id}').then(() => loadTenantSection('myrequests'))" class="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px]">🗑️ Xóa</button>
                </div>
              </div>
              <div class="font-extrabold text-slate-900 text-sm">${req.title}</div>
              <div class="text-[11px] text-slate-600">💰 Tối đa ${formatCurrency(req.maxBudget)} • 📍 ${req.districtName} • 📅 Dọn vào: ${formatMoveInDate(req.moveInDate)}</div>
              ${offers.length > 0 ? `
                <div class="pt-2 border-t border-slate-100 space-y-2">
                  <div class="font-bold text-blue-700 text-xs">🤝 ${offers.length} Chủ trọ đã đề xuất phòng cho bạn:</div>
                  ${offers.map(o => `
                    <div class="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] space-y-1">
                      <div class="font-bold text-slate-900">🏠 ${o.landlordName} — ${o.offerPrice ? formatCurrency(o.offerPrice) : ''}</div>
                      <div class="text-slate-700">${o.message}</div>
                      <div class="flex items-center gap-2 pt-0.5">
                        ${o.roomId ? `<button onclick="openRoomModal('${o.roomId}')" class="px-2 py-1 bg-indigo-600 text-white rounded-lg font-bold text-[10px]">👁️ Xem phòng</button>` : ''}
                        <a href="tel:${o.landlordPhone}" class="px-2 py-1 bg-emerald-600 text-white rounded-lg font-bold text-[10px]">📞 Gọi ${o.landlordPhone}</a>
                      </div>
                    </div>
                  `).join("")}
                </div>
              ` : `<div class="text-[11px] text-slate-400 italic">Chưa có chủ trọ nào gửi đề xuất cho tin này.</div>`}
            </div>
          `;
        }).join("") : `
          <div class="py-10 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
            Bạn chưa đăng tin tìm phòng nào trong Group.
          </div>
        `}
      `;
    } else if (section === "profile") {
      body.innerHTML = `
        <div class="max-w-xl bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div class="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div>
              <div class="text-[11px] text-slate-500">Email tài khoản</div>
              <div class="font-bold text-slate-900 text-sm">${currentUser.email}</div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">👤 Người thuê</span>
          </div>
          <p class="text-xs text-slate-600">Bấm nút bên dưới để chỉnh sửa Họ tên, Số điện thoại hoặc tải ảnh đại diện thật từ máy tính của bạn:</p>
          <button onclick="openProfileModal('info')" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow transition">
            ✏️ Chỉnh sửa Hồ sơ &amp; Tải ảnh đại diện
          </button>
        </div>
      `;
    } else if (section === "security") {
      const histRes = await fetch(`${API_BASE_URL}/users/me/login-history`, { headers: getAuthHeaders() });
      const history = histRes.ok ? await histRes.json() : [];

      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
            <h3 class="font-extrabold text-slate-900 text-sm">🔐 Đổi mật khẩu bảo mật</h3>
            <p class="text-xs text-slate-500">Mật khẩu của bạn được mã hóa bằng thuật toán Bcrypt an toàn trong MongoDB.</p>
            <button onclick="openProfileModal('security')" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow transition">
              🔑 Mở form Đổi mật khẩu
            </button>
          </div>
          <div class="bg-white border border-slate-200 rounded-2xl p-5 space-y-2.5 shadow-2xs">
            <h3 class="font-extrabold text-slate-900 text-sm">📜 Nhật ký đăng nhập gần đây (${history.length})</h3>
            <div class="space-y-2 max-h-[50vh] overflow-y-auto">
              ${history.length > 0 ? history.map(item => `
                <div class="p-2.5 rounded-xl border ${item.status !== 'failed' ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-200'}">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-[11px] ${item.status !== 'failed' ? 'text-emerald-700' : 'text-rose-700'}">${item.status !== 'failed' ? '✅ Thành công' : '❌ Sai mật khẩu'}</span>
                    <span class="text-[10px] text-slate-500">${item.loginAt ? new Date(item.loginAt).toLocaleString("vi-VN") : ""}</span>
                  </div>
                  <div class="text-[10px] text-slate-500 truncate mt-0.5">💻 ${(item.userAgent || "Trình duyệt").slice(0, 65)}</div>
                </div>
              `).join("") : `<div class="text-slate-400 italic py-4">Chưa có bản ghi đăng nhập nào.</div>`}
            </div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = `<div class="py-10 text-center text-rose-600 font-bold">❌ ${err.message}</div>`;
  }
}

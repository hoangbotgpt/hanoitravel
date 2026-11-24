# Hà Nội Shipper 3D Retro (v1.2)

Game lái xe giao hàng 3D phong cách Retro lấy cảm hứng từ **Road Rash** giữa lòng phố phường Hà Nội nắng vàng — xây dựng bằng **TypeScript**, **Three.js**, **Web Audio API** và **Vite**.

> A 3D Retro Road-Rash-inspired motorbike delivery game set across Hanoi's Old Quarter, colonial tree-lined boulevards, and modern 6-lane urban overpass — built with **TypeScript**, **Three.js**, **Web Audio API**, and **Vite**.

---

## Tính năng nổi bật · Features

- **2 mẫu xe máy giao hàng** kèm nhân vật shipper 3D đội mũ bảo hiểm 3/4:
  - **Xe Côn Cổ Điển (`honda`)**: Cơ động, vào cua gọn trong phố cổ hẹp.
  - **Xe Máy Điện Evo (`vinfast`)**: Bứt tốc êm ái, tốc độ tối đa vượt trội.
- **3 tuyến đường Hà Nội A → B phân loại rõ nét (giao thông 2 chiều)**:
  1. **Bài 1 — Phố Cổ & Ô Quan Chưởng (1.450m · 2 làn hẹp `7,4m`)**: Tim đường vàng kép, dãy nhà ống san sát, biển hiệu Phố Cổ, cổng Ô Quan Chưởng và Tháp Đồng Hồ Bờ Hồ.
  2. **Bài 2 — Phố Cây Xanh & Nhà Hát Lớn (1.700m · 4 làn `13,5m`)**: Vòm cây cổ thụ nắng xiên vàng, biệt thự Pháp, xe buýt tuyến 14 và Quảng trường Nhà Hát Lớn.
  3. **Bài 3 — Khu Đô Thị Mới & Cầu Vượt (1.950m · 6 làn rộng `20,4m`)**: Đại lộ hoa giấy rộng thoáng, cầu vượt lớn với **82% lưu lượng xe lớn** (ô tô, xe buýt, xe tải chở hàng 6 bánh).
- **Va chạm & Ngã xe kiểu Road Rash**: Đâm xe gây chớp đỏ viền màn hình, rung camera, tia lửa ma sát, bụi đường; xe đổ trượt ngang trên nhựa đường, shipper văng ra rồi tự đứng dậy, chạy lại dựng xe và tiếp tục hành trình với `1,2s` khiên miễn thương.
- **3 mức độ khó**: **Sáng Sớm** (500.000đ), **Tan Tầm** (350.000đ), **Cao Điểm** (250.000đ).
- **Âm thanh Web Audio Lo-fi 82 BPM + Hiệu ứng Retro**: Tiếng động cơ theo ga, còi đôi, tiếng va chạm/trượt đường, đề máy lại sau ngã, hậu kỳ Bloom/Film Grain (bật/tắt trong Pause), hỗ trợ đầy đủ **cảm ứng mobile** & màn hình responsive.

---

## Điều khiển · Controls

| Phím / Thao tác | Chức năng |
| --- | --- |
| `A` / `D` hoặc `←` / `→` | Lách trái / Lách phải né xe 2 chiều |
| `W` / `S` hoặc `↑` / `↓` | Tăng ga / Phanh |
| `Space` | Bấm còi xe máy |
| `P` hoặc `Esc` | Tạm dừng / Bật-tắt Âm thanh & Hiệu ứng Retro |

---

## Cài đặt & Chạy · Quick Start

Yêu cầu **Node.js >= 18**.

```bash
# Cài đặt thư viện
npm install

# Chạy dev server chơi ngay tại http://127.0.0.1:5173/
npm run dev

# Chạy toàn bộ unit test (Vitest)
npm test

# Kiểm tra TypeScript và đóng gói production (dist/)
npm run build
```

---

## Cấu trúc mã nguồn · Project Structure

```text
├── index.html                  # Giao diện Menu, HUD 3 vùng, Modal & Touch UI
├── package.json
├── vite.config.ts
├── tsconfig.json
├── public/assets/models/       # 3 model GLB tối ưu cho web (honda, vinfast, driver)
└── src/
    ├── config/                 # Bảng màu Retro, thông số xe, 3 bài & độ khó
    ├── core/                   # Logic thuần: roadMath, trafficRules, crashSequence, economy, collision, gameState
    ├── gameplay/               # GameEngine, PlayerController, TrafficSpawner, AudioManager
    ├── ui/                     # HudController & responsive styles.css
    ├── world/                  # Đường 2/4/6 làn, địa danh Hà Nội, RiderRig, VFX, Post-Processing, Showroom
    └── __tests__/              # Bộ test tự động Vitest
```

// ZenPanel - Nhật ký thay đổi hiển thị trong hộp thoại "Có gì mới"
// Ngôn ngữ thân thiện, dễ hiểu, hướng đến trải nghiệm người dùng cuối

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: { title: string; items: string[] }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.6.2',
    date: '2026-10-23',
    highlights: [
      {
        title: '⏱️ Uptime Ứng Dụng Chạy Nền Đếm Từng Giây (1s/1 Lần)',
        items: [
          'Nhịp đếm thời gian thực mượt mà: Cột Uptime trong bảng danh sách Ứng dụng chạy nền (thay thế PM2) giờ đây tự động cập nhật liên tục 1 giây 1 lần theo thời gian thực mà không làm tăng tải VPS.',
          'Chi tiết thời điểm khởi chạy: Khi di chuột vào cột Uptime, bạn sẽ xem được chính xác ngày giờ mà bot hoặc ứng dụng bắt đầu khởi động.',
        ],
      },
      {
        title: '🛡️ Nâng Cấp Playground & Xử Lý Sự Cố Mô Hình AI Chuẩn Xác',
        items: [
          'Tách biệt thông báo lỗi trong khung Chat thử: Bong bóng câu hỏi của bạn và thông báo phản hồi từ Trợ lý AI được bố trí riêng biệt, chấm dứt hoàn toàn hiện tượng câu hỏi bị dính liền vào thông báo lỗi khi có sự cố.',
          'Khung cảnh báo lỗi AI chuyên nghiệp kèm nút "Thử gửi lại": Khi nhà cung cấp AI gặp trục trặc, hệ thống hiển thị khung cảnh báo màu trang nhã, phân tích rõ nguyên nhân và cung cấp sẵn nút bấm 1-click để bạn gửi lại câu hỏi ngay lập tức.',
          'Bóc tách lỗi hạ tầng OpenRouter (502 Provider Error): Phản hồi lỗi kỹ thuật "Provider returned error" từ OpenRouter được tự động nhận diện và giải thích rõ ràng bằng tiếng Việt (máy chủ mô hình đối tác đang bảo trì/quá tải, gợi ý thử lại sau hoặc chuyển đổi model).',
        ],
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2026-10-23',
    highlights: [
      {
        title: '🎯 Tôn Trọng Model Mặc Định',
        items: [
          'Ưu tiên Model mặc định của người dùng: Toàn bộ hệ thống AI Gateway và các phòng ban AI Company giờ đây tôn trọng tuyệt đối Model mặc định do bạn lựa chọn, loại bỏ hoàn toàn tình trạng bị gọi model khác ngoài ý muốn.',
        ],
      },
      {
        title: '💬 Thông Báo Lỗi Tiếng Việt Thân Thiện & Giữ Trọn Vẹn Nhật Ký Gốc',
        items: [
          'Chấm dứt in JSON thô lên màn hình: Toàn bộ phản hồi lỗi kỹ thuật từ Google Gemini, Anthropic Claude, OpenAI... được tự động chuẩn hóa và giải thích bằng tiếng Việt rõ ràng, dễ hiểu (báo rõ hết credit, model không khả dụng, sai key, hết hạn mức).',
          'Lưu giữ đầy đủ chi tiết trong Logs: Giao diện hiển thị thông điệp tiếng Việt thân thiện, trong khi tab Nhật ký & Logs (Activity) vẫn lưu giữ trọn vẹn toàn bộ mã lỗi và chuỗi phản hồi gốc của nhà cung cấp để quản trị viên dễ dàng tra cứu chuyên sâu.',
        ],
      },
      {
        title: '🚨 Báo Lỗi Chuẩn Xác & 1-Click Kiểm Tra Lại Kết Nối',
        items: [
          'Hiển thị trạng thái lỗi thực tế: Khắc phục triệt để tình trạng tài khoản hết tiền (như Claude balance too low) hoặc lỗi kết nối nhưng giao diện vẫn hiện màu xanh "Đang bật / Hoạt động". Thẻ nhà cung cấp và tài khoản sẽ chuyển sang huy hiệu Đỏ (Lỗi kết nối / Hết hạn) kèm hộp cảnh báo nguyên nhân chi tiết.',
          'Nút "Kiểm tra lại kết nối" tức thì: Bổ sung nút kiểm tra nhanh ngay trên thẻ nhà cung cấp và trong hộp thoại cảnh báo để bạn bấm test lại trạng thái API key bất kỳ lúc nào.',
          'Trực quan hóa sự cố phòng ban trong AI Company: Khi có phòng ban gặp trục trặc, thẻ phòng ban sẽ chuyển sang viền đỏ kèm icon cảnh báo và nút "Xem chi tiết sự cố", giúp bạn nắm bắt ngay vấn đề mà không bị nhầm lẫn.',
        ],
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-23',
    highlights: [
      {
        title: '⚡ Sao Chép cURL AI Nhanh & Đếm Ngược Hạn Dùng Realtime',
        items: [
          'Nút sao chép mã nhanh trong AI Gateway: Tự động điền Default API Key và câu lệnh kiểm tra mẫu hữu ích, kèm hiệu ứng phản hồi sống động (chuyển đổi icon Copy -> Check xanh, hiệu ứng nảy nhẹ và thông báo toast).',
          'Đếm ngược hạn dùng Realtime: Hạn sử dụng VPS và hạn sử dụng API Key trong AI Gateway được cập nhật từng giây theo thời gian thực.',
          'Bộ đếm chi tiết chuẩn khi hover: Di chuột vào badge hạn sử dụng sẽ hiển thị tooltip đếm ngược đầy đủ số ngày, giờ, phút, giây kèm ngày giờ hết hạn chuẩn xác.',
        ],
      },
      {
        title: '🚀 API Tester Chuẩn Postman Siêu Cấp',
        items: [
          'Tab Body chuẩn Postman: Hỗ trợ đầy đủ các chế độ none, form-data, x-www-form-urlencoded, raw, binary. Khi chọn "raw", có ngay dropdown lựa chọn nhanh định dạng (JSON, Text, JavaScript, HTML, XML) kèm nút Beautify/Format JSON thông minh và tự động đồng bộ Content-Type tương ứng.',
          'Nhập lệnh cURL (Import cURL): Dán lệnh cURL copy từ Chrome DevTools hoặc tài liệu API vào là hệ thống tự động bóc tách Method, URL, Query params, Headers và Body thành Request hoàn chỉnh.',
          'Bộ sinh mã nguồn (Code Snippets) đa ngôn ngữ: Dropdown chọn sinh code mẫu lập tức cho 7 ngôn ngữ/thư viện (cURL, JavaScript Fetch, JavaScript Axios, Node.js fetch, Python Requests, PHP cURL, Go net/http) kèm nút sao chép tiện lợi.',
          'Xem nhanh Biến Môi Trường (Quick Look 👁️): Nút con mắt bên cạnh thanh chọn môi trường giúp tra cứu nhanh toàn bộ giá trị biến ({{baseUrl}}, {{apiKey}}, v.v.) mà không cần mở cài đặt.',
          'Tiện ích Response nâng cao: Bổ sung nút Tải kết quả (Download file .json/.txt), nút Xóa kết quả (Clear Response), và nút xem toàn màn hình.',
        ],
      },
      {
        title: '📦 Kho Repos Sản Phẩm & Nhập Hàng Loạt Ứng Dụng (App Repositories)',
        items: [
          'Thêm kho ứng dụng bên ngoài dễ dàng: Chỉ cần dán đường dẫn link JSON (như raw GitHub hoặc máy chủ riêng) là hệ thống tự động nhận diện và nạp cả lô ứng dụng vào App Store.',
          'Quản lý kho tập trung: Cửa sổ "Kho Repos" trực quan giúp bạn xem danh sách các nguồn ứng dụng đã kết nối, số lượng app của từng nguồn và thời gian đồng bộ.',
          'Huy hiệu nhận diện nguồn gốc: Mọi ứng dụng được nhập từ bên ngoài sẽ có huy hiệu gắn tên kho tương ứng, giúp bạn dễ dàng phân biệt với kho mặc định của ZenPanel.',
          'Đồng bộ 1 chạm: Bấm nút "Đồng bộ lại" để tự động cập nhật danh sách ứng dụng mới nhất từ các nhà phát triển kho.',
          'Mẫu JSON chuẩn có sẵn: Cung cấp sẵn mẫu cấu trúc JSON chuẩn kèm nút sao chép nhanh, giúp bất kỳ ai cũng có thể tự tạo kho ứng dụng riêng cho đội nhóm hoặc công ty.',
        ],
      },
      {
        title: '🔄 Cập Nhật 1-Click Toàn Diện Cho Tất Cả Ứng Dụng (Universal Update)',
        items: [
          'Ứng dụng Docker: Tự động kéo hình ảnh (Docker Image) mới nhất và khởi động lại container an toàn mà không làm mất dữ liệu đã lưu.',
          'Ứng dụng Native: Bổ sung nút "Cập nhật" trực tiếp trên từng thẻ ứng dụng đã cài (Node.js, Go, Python, Cloudflare Tunnel, RustDesk, Nginx, WireGuard...).',
          'Nâng cấp thông minh: Hệ thống tự động tải phiên bản phát hành mới nhất từ nhà sản xuất hoặc GitHub Release, tự áp dụng cấu hình cũ giúp dịch vụ luôn chạy trơn tru.',
        ],
      },
      {
        title: '🛠️ Nâng Cấp Công Cụ Nền Tảng Hệ Thống Thông Minh',
        items: [
          'Tự động kiểm tra bản mới: ZenPanel tự động đối chiếu phiên bản của các công cụ cốt lõi trên VPS (Docker, Node.js, Git, Cloudflared...) với bản phát hành mới nhất trên internet.',
          'Chỉ hiển thị nút khi cần: Nút nâng cấp sẽ chỉ xuất hiện khi thực sự có bản cập nhật mới, tránh gây rối mắt và thao tác thừa.',
          'Nâng cấp an toàn 1-chạm: Bấm nút để hệ thống tự động tải và cài đặt bản mới nhất trong nền, có thông báo trạng thái rõ ràng.',
        ],
      },
      {
        title: '🎨 Bộ Chọn Theme & Đổi Màu Giao Diện (Theme Switcher)',
        items: [
          'Tùy biến phong cách cá nhân: Dễ dàng lựa chọn giữa nhiều chủ đề màu sắc hiện đại (Xanh Zen, Tím Jupiter, Xanh lục Emerald, Hổ phách Amber...) cùng các tông nền tối sang trọng.',
          'Giao diện trực quan: Chuyển đổi nhanh chóng ngay trên thanh điều khiển hoặc trong trang Cài đặt, áp dụng tức thì không cần tải lại trang.',
        ],
      },
      {
        title: '🧹 Dọn Gọn Danh Sách Tác Vụ Nền (Background Tasks)',
        items: [
          'Bổ sung nút "Xoá tác vụ hoàn thành": Chỉ với một cú nhấp, toàn bộ các tác vụ cài đặt, dọn dẹp hoặc sao lưu đã xong sẽ được dọn sạch khỏi danh sách.',
          'Giữ không gian làm việc luôn gọn gàng, giúp bạn dễ dàng theo dõi các tác vụ đang thực sự chạy.',
        ],
      },
      {
        title: '💻 Kho Ứng Dụng Thích Ứng Theo Hệ Điều Hành (OS Adaptive App Store)',
        items: [
          'Tự động nhận diện môi trường: Phân biệt chính xác giữa Windows Desktop, Windows Server, Ubuntu, Debian, CentOS, Arch Linux, macOS và BSD.',
          'Gợi ý phần mềm chuẩn xác: Tự động hiển thị các ứng dụng tối ưu nhất theo từng hệ điều hành (ví dụ: bộ gõ UniKey, 7-Zip, Notepad++, Cốc Cốc cho Windows; IBus-Bamboo, Nginx native cho Linux).',
          'Tối ưu hóa n8n: Khống chế bộ nhớ tiêu thụ ở mức 512MB, tự động dọn dẹp dữ liệu thực thi cũ, giúp chạy mượt mà ổn định ngay cả trên VPS cấu hình khiêm tốn 4GB RAM.',
        ],
      },
      {
        title: '🚀 Dọn Dẹp Hệ Thống Chuyên Sâu & Giải Phóng RAM Thật',
        items: [
          'Hộp thoại dọn dẹp chuyên nghiệp với thanh tiến trình trực quan theo từng bước thực hiện.',
          'Bảng so sánh trước và sau (Before & After): Thấy ngay dung lượng ổ đĩa và RAM thực tế vừa được giải phóng.',
          'Trên Windows: Quét sạch thùng rác, tệp tin tạm, báo cáo lỗi và giải phóng bộ nhớ RAM nhàn rỗi thông qua cơ chế tối ưu của hệ điều hành.',
          'Trên Linux: Quét sạch bộ nhớ đệm gói APT/DNF, tệp tạm, nhật ký hệ thống cũ và làm mới bộ đệm trang.',
        ],
      },
      {
        title: '⚡ Công Cụ Kiểm Thử API (API Tester) Siêu Mượt Cho Mọi Thiết Bị',
        items: [
          'Giao diện co giãn hoàn hảo trên cả điện thoại di động, máy tính bảng và màn hình máy tính lớn.',
          'Nút xem toàn màn hình (Full Screen) kết quả phản hồi: Xem trọn vẹn dữ liệu JSON, văn bản hoặc HTML mà không bị che khuất.',
          'Tự động ngắt dòng và cuộn mượt mà, giúp thao tác gửi request và xem kết quả nhanh chóng, tiện lợi.',
        ],
      },
    ],
  },
  {
    version: '0.5.3',
    date: '2026-10-22',
    highlights: [
      {
        title: '🤖 Trạm Điều Phối AI (AI Gateway): Tự Động Xoay Vòng Tài Khoản & Tạo Trợ Lý Riêng',
        items: [
          'Hỗ trợ nhiều tài khoản / API Key: Bạn có thể nhập nhiều chìa khóa API cho cùng một nhà cung cấp AI (Google Gemini, OpenAI, Claude, OpenRouter...).',
          'Tự động chia tải và dự phòng thông minh: Khi một tài khoản bị chạm hạn mức (429 Rate Limit) hoặc quá tải, hệ thống tự động chuyển sang tài khoản kế tiếp mà không làm gián đoạn câu trả lời.',
          'Tạo Trợ lý AI chuyên biệt (Sub AI Agents): Tạo nhanh các trợ lý AI chuyên về Lập trình, Viết nội dung, Dịch thuật... với hướng dẫn riêng và mô hình tùy chỉnh.',
          'Chuẩn tương thích OpenAI: Sử dụng trực tiếp trợ lý vừa tạo vào n8n, Flowise, NextChat hoặc ứng dụng bên ngoài dễ dàng.',
          'Nhật ký hoạt động rõ ràng: Hiển thị minh bạch tài khoản nào vừa phản hồi yêu cầu, ghi lại tiến trình xử lý trực tiếp.',
        ],
      },
      {
        title: '💎 Nâng Cấp ZenPanel An Toàn Với Khóa Bảo Trì Toàn Diện',
        items: [
          'Thanh tiến trình nâng cấp sinh động với 4 giai đoạn rõ ràng và thời gian đếm ngược dự tính.',
          'Màn hình khóa bảo trì thông minh: Ngăn chặn thao tác nhầm lẫn trong lúc máy chủ đang nâng cấp và khởi động lại dịch vụ.',
          'Tự động kết nối lại và đăng nhập an toàn: Sau khi cập nhật xong, ZenPanel tự mở đường dẫn mới và tự đăng nhập an toàn, bạn không phải gõ lại mật khẩu.',
        ],
      },
      {
        title: '📊 Chuẩn Hóa Hiển Thị Số Liệu Toàn Diện',
        items: [
          'Làm tròn số liệu đẹp mắt và khoa học trên toàn bộ bảng điều khiển: Tỷ lệ phần trăm, dung lượng ổ đĩa, tốc độ mạng và thời gian.',
          'Loại bỏ hoàn toàn các dãy số thập phân dài ngoằng, giúp bạn nắm bắt nhanh tình trạng sức khỏe VPS chỉ qua một cái nhìn.',
        ],
      },
      {
        title: '🐳 Quản Lý Docker Tiện Lợi: Thao Tác Hàng Loạt & Tìm Kiếm Nhanh',
        items: [
          'Chọn nhiều ứng dụng Docker cùng lúc để khởi động, tạm dừng, chạy lại hoặc xóa trong một thao tác duy nhất.',
          'Tìm kiếm bôi sáng (Highlight): Gõ từ khóa tìm kiếm đến đâu, tên ứng dụng và cổng kết nối sẽ được làm nổi bật đến đó.',
          'Theo dõi tiến độ tải ứng dụng chính xác theo từng lớp dữ liệu, không còn lo lắng thanh tiến trình bị đứng yên.',
          'Sao chép và tải nhật ký (Logs) của container chỉ với 1 cú click chuột.',
        ],
      },
      {
        title: '📁 Trình Quản Lý Tệp Tin ZenFile Explorer Pro Mới',
        items: [
          'Chuyển đổi linh hoạt giữa giao diện duyệt tệp gọn nhẹ và giao diện Pro nâng cao ngay trong tab Quản lý Tệp.',
          'Tải tệp từ internet trực tiếp về VPS (Remote Download): Chỉ cần dán link tải từ xa, máy chủ sẽ tự động kéo tệp về thư mục bạn muốn.',
          'Tự động khắc phục lỗi kết nối, đảm bảo trình quản lý tệp luôn sẵn sàng phục vụ.',
        ],
      },
    ],
  },
  {
    version: '0.5.2',
    date: '2026-10-22',
    highlights: [
      {
        title: '🗄️ Quản Trị Cơ Sở Dữ Liệu Tiện Lợi (Adminer / phpMyAdmin)',
        items: [
          'Kết nối từ xa dễ dàng: Bật liên kết truy cập an toàn qua Cloudflare có bảo mật HTTPS để quản lý cơ sở dữ liệu từ bất cứ nơi nào mà không sợ lộ cổng máy chủ.',
          'Hỗ trợ truy cập linh hoạt bằng IP công khai kèm nút mở cổng tường lửa tự động hoặc qua mạng nội bộ an toàn.',
        ],
      },
      {
        title: '📂 Trình Quản Lý Tệp Đa Phương Tiện & Phân Quyền',
        items: [
          'Xem trước hình ảnh, nghe nhạc, phát video trực tuyến và đọc tài liệu PDF trực tiếp trên trình duyệt mà không cần tải về máy tính.',
          'Chỉnh sửa phân quyền tệp và thư mục (Chmod) dễ hiểu, giúp bảo vệ các mã nguồn quan trọng.',
          'Bộ lọc nhanh thông minh: Lọc nhanh theo Thư mục, Hình ảnh, Âm thanh & Video, Mã nguồn hoặc Tệp nén.',
        ],
      },
      {
        title: '🐘 Quản Lý Máy Chủ Web PHP & Cấu Hình Nhanh',
        items: [
          'Cài đặt 1-chạm PHP và đầy đủ các phần mở rộng thông dụng nhất (MySQL, cURL, GD, ZIP, OPcache...).',
          'Chỉnh sửa thông số tệp php.ini trực quan: Tăng giới hạn tải lên, bộ nhớ RAM cho ứng dụng PHP và tự khởi động lại dịch vụ tức thì.',
          'Tra cứu nhanh danh sách các module PHP đang hoạt động.',
        ],
      },
      {
        title: '⏳ Giao Diện Cài Đặt Ứng Dụng Trực Quan & Dự Tính Thời Gian',
        items: [
          'Thay thế màn hình dòng lệnh phức tạp bằng thanh tiến trình đồ họa hiện đại với phần trăm hoàn thành rõ ràng.',
          'Ước tính thời gian còn lại (ETA) để bạn biết chính xác khi nào ứng dụng sẵn sàng sử dụng.',
        ],
      },
    ],
  },
  {
    version: '0.5.1',
    date: '2026-10-22',
    highlights: [
      {
        title: '🛡️ Tự Động Bảo Vệ Dung Lượng Ổ Đĩa (Chống Tràn Ổ)',
        items: [
          'Kiểm tra dung lượng trống trước khi cài đặt phần mềm mới: Tự động cảnh báo và ngăn chặn nếu ổ đĩa còn quá ít dung lượng, tránh làm sập máy chủ.',
          'Bảng cảnh báo tức thì ngay trên trang Tổng quan khi dung lượng ổ cứng đạt mức báo động kèm nút dẫn nhanh tới công cụ Dọn dẹp.',
        ],
      },
      {
        title: '📱 Tối Ưu Trải Nghiệm Mượt Mà Trên Thiết Bị Di Động',
        items: [
          'Giao diện thông báo tác vụ nền dạng trượt từ dưới lên (Bottom Sheet) cực kỳ vừa vặn trên màn hình điện thoại thông minh.',
          'Công cụ kiểm thử API được tinh chỉnh gọn gàng, chia tab trực quan giúp bạn dễ dàng thao tác trên màn hình cảm ứng.',
        ],
      },
      {
        title: '🧹 Dọn Rác Hệ Thống & Hạ Tải CPU Khẩn Cấp',
        items: [
          'Phát hiện tức thì các chương trình đang chiếm dụng nhiều tài nguyên vi xử lý (CPU).',
          'Nút giải cứu khẩn cấp "Hạ tải CPU" giúp máy chủ trở lại trạng thái mượt mà nhanh chóng.',
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-22',
    highlights: [
      {
        title: '🧠 Trạm Điều Phối Trí Tuệ Nhân Tạo (AI Gateway)',
        items: [
          'Một địa chỉ kết nối duy nhất dùng chung cho hàng loạt mô hình AI nổi tiếng: ChatGPT, Claude, Google Gemini, OpenRouter.',
          'Hỗ trợ chế độ thử nghiệm trò chuyện trực tiếp (Playground) và tự động chuyển sang mô hình phụ nếu mô hình chính bị nghẽn.',
          'Cung cấp sẵn đoạn mã mẫu tiện dụng bằng cURL, Python, Node.js để bạn tích hợp nhanh vào dự án cá nhân.',
        ],
      },
      {
        title: '📡 Kiểm Thử API Trực Tiếp Từ VPS (API Tester)',
        items: [
          'Kiểm tra và gửi yêu cầu mạng trực tiếp từ chính VPS tới các dịch vụ khác mà không lo gặp lỗi chặn kết nối (CORS).',
          'Lưu trữ danh sách yêu cầu theo bộ sưu tập, hỗ trợ biến môi trường tự động điền khóa API.',
        ],
      },
      {
        title: '🔄 Quản Lý Ứng Dụng Chạy Nền 24/7 (Thay Thế PM2)',
        items: [
          'Giữ cho các chương trình Bot Telegram, Discord, ứng dụng Node.js hoặc Python luôn hoạt động liên tục cả ngày lẫn đêm.',
          'Tự động khởi động lại chương trình nếu không may bị lỗi hoặc khi máy chủ vừa bật nguồn.',
          'Theo dõi lượng tiêu thụ RAM và CPU của chương trình theo thời gian thực.',
        ],
      },
      {
        title: '💻 Cửa Sổ Dòng Lệnh Terminal Tiện Dụng',
        items: [
          'Tự động gợi ý các câu lệnh phổ biến khi bạn gõ phím, giúp thao tác quản trị nhanh chóng và giảm bớt việc phải nhớ cú pháp phức tạp.',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-22',
    highlights: [
      {
        title: '🌍 Truy Cập Ứng Dụng Từ Bất Kỳ Đâu Qua Đường Dẫn Bảo Mật',
        items: [
          'Tạo liên kết an toàn (Cloudflare Tunnel) có sẵn chứng chỉ HTTPS cho mọi ứng dụng trong App Store (VS Code, n8n, Grafana...). Bạn có thể truy cập làm việc từ xa mà không cần mở cổng nguy hiểm trên máy chủ.',
          'Cung cấp tài khoản đăng nhập mặc định và hướng dẫn sử dụng nhanh ngay sau khi hoàn tất cài đặt.',
          'Tính năng "Cấu hình lại" cho phép dễ dàng thay đổi cổng mạng, mật khẩu hoặc thiết lập mà vẫn giữ trọn vẹn dữ liệu.',
        ],
      },
      {
        title: '🤖 Kho Ứng Dụng AI Đa Dạng',
        items: [
          'Cài đặt nhanh các công cụ AI phổ biến: Open WebUI, Ollama, Flowise, AnythingLLM chỉ với 1 cú click.',
          'Tự động áp dụng khóa API đã lưu trong bảng điều khiển để sử dụng được ngay lập tức.',
        ],
      },
      {
        title: '🚀 Kiểm Tra Tốc Độ Mạng Thật (Speedtest)',
        items: [
          'Đo đạc tốc độ mạng thực tế từ chính VPS đến các máy chủ quốc tế: Đo độ trễ (Ping), tốc độ tải xuống (Download) và tải lên (Upload) chuẩn xác.',
        ],
      },
      {
        title: '🛡️ Tường Lửa Bảo Vệ Toàn Diện & Chống Mất Cấu Hình',
        items: [
          'Quản lý đóng mở cổng mạng trực quan, tự động lưu trữ cấu hình để các quy tắc bảo vệ luôn duy trì sau mỗi lần máy chủ khởi động lại.',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-22',
    highlights: [
      {
        title: '🔄 Tự Động Phát Hiện Phiên Bản & Nâng Cấp Nhanh',
        items: [
          'Tự động thông báo khi có bản cập nhật mới trên GitHub, hỗ trợ cài đặt hoặc quay về phiên bản cũ thuận tiện.',
          'Xem nhật ký thực thi trực tiếp trong quá trình cài đặt phần mềm và thiết lập dịch vụ.',
        ],
      },
      {
        title: '🎨 Tùy Biến Giao Diện Đẹp Mắt & Tiện Ích Máy Chủ',
        items: [
          'Hỗ trợ nhiều tông màu sắc hiện đại và các chế độ nền sáng tối tinh tế.',
          'Đồng hồ đếm thời gian máy chủ đã hoạt động liên tục (Uptime) chuẩn xác đến từng giây.',
          'Nút khởi động lại hoặc tắt máy chủ tiện lợi ngay trên thanh công cụ.',
          'Quản lý lịch hẹn tác vụ tự động (Cron job / Task Scheduler) dễ dàng.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-22',
    highlights: [
      {
        title: '🚀 Khởi Nguồn Bảng Điều Khiển ZenPanel Hiện Đại',
        items: [
          'Giao diện trực quan hoá toàn bộ sức khỏe phần cứng VPS: Mức tiêu thụ vi xử lý (CPU), dung lượng bộ nhớ (RAM), ổ đĩa lưu trữ và băng thông mạng.',
          'Quản lý danh sách tiến trình và dịch vụ hệ thống: Dễ dàng bật, tắt hoặc khởi động lại chỉ bằng vài thao tác chuột.',
          'Kho ứng dụng 1-Click (App Store): Triển khai nhanh các phần mềm phổ biến phục vụ phát triển ứng dụng và vận hành trang web.',
          'Cửa sổ dòng lệnh Terminal trực tuyến: Điều khiển máy chủ trực tiếp ngay trên trình duyệt mà không cần cài thêm phần mềm SSH/RDP.',
          'Trình quản lý tệp tin và tường lửa bảo mật: Thao tác tệp và kiểm soát cổng truy cập an toàn.',
        ],
      },
    ],
  },
];

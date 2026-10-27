// ZenPanel - Nhật ký thay đổi hiển thị trong hộp thoại "Có gì mới"
// Ngôn ngữ thân thiện, dễ hiểu, hướng đến trải nghiệm người dùng cuối

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: { title: string; items: string[] }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.8.1',
    date: '2026-10-28',
    highlights: [
      {
        title: '🔧 Nâng Cấp Cloudflare Tunnel Đúng Cách',
        items: [
          'Sửa lỗi nút nâng cấp cloudflared báo "Hoàn tất" dù thực tế không lên bản mới (khi cài bằng apt, lệnh cập nhật tự động bị từ chối nhưng trước đây vẫn tính là thành công).',
          'Giờ ZenPanel nhận biết cloudflared cài bằng apt / dnf để nâng bằng chính trình quản lý gói, hoặc tải bản mới và thay file tại chỗ nếu cài tay. Sau đó kiểm tra lại số phiên bản; không lên thì báo lỗi kèm cách làm tay, không còn báo thành công giả.',
        ],
      },
      {
        title: '🌐 Lấy Link Mới Sau Cập Nhật Dễ Hơn',
        items: [
          'Cập nhật qua link Cloudflare tạm thì link cũ chết. Nút "Hỏi IP lấy link mới" mở cửa sổ nhỏ tới IP máy chủ, tự chờ tunnel cấp link rồi gửi về tab cũ (có sẵn nút Sao chép / Mở panel dự phòng).',
          'Kiểm tra cập nhật báo rõ lý do khi VPS không kết nối được GitHub (trước đây im lặng như "không có bản mới" và có thể treo rất lâu). Màn hình cập nhật phản hồi tức thì, không còn kẹt ở bước chờ tunnel.',
        ],
      },
      {
        title: '🔐 Phiên Đăng Nhập Luôn Hiện Thiết Bị Hiện Tại',
        items: [
          'Đăng nhập bằng link 1-Click (installer, "zenpanel url", nút mở tab mới sau cập nhật) giờ có phiên riêng nên thiết bị hiện trong danh sách "Phiên đăng nhập".',
          'Thiết bị đang dùng token cũ tự được nâng cấp, không phải đăng nhập lại; Đăng xuất thu hồi đúng phiên.',
        ],
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-28',
    highlights: [
      {
        title: '💬 Playground AI: Hiển Thị Đẹp & Chạy Thử Code Ngay',
        items: [
          'Câu trả lời của AI giờ được hiển thị đầy đủ: tiêu đề, bảng, danh sách việc, trích dẫn, link, ảnh, và HTML nhúng (đã lọc sạch mã độc nên an toàn).',
          'Khối code có tô màu cú pháp cho hơn 25 ngôn ngữ, đếm dòng, nút Sao chép, Tải xuống, Xuống dòng, tự thu gọn khi quá dài.',
          'Bấm "Chạy" để chạy thử ngay: JavaScript, Python, HTML, SVG và sơ đồ Mermaid. Code chạy trong khung cô lập hoàn toàn, không đọc được đăng nhập hay dữ liệu của panel; vòng lặp vô hạn tự bị cắt sau 10 giây.',
          'Có nút "Xem Markdown gốc" để đối chiếu và sao chép nguyên bản câu trả lời.',
        ],
      },
      {
        title: '🛡️ Quét Mã Độc Chi Tiết & Chính Xác Hơn',
        items: [
          'Báo cáo có kết luận rõ ràng (Sạch / Cần xem / Nhiễm), điểm rủi ro cho từng mục và giải thích bằng tiếng Việt: vì sao bị báo, chắc chắn đến đâu, nên làm gì.',
          'Đối chiếu lõi WordPress với checksum chính thức của wordpress.org: phát hiện file lõi bị sửa hoặc file lạ trong wp-admin / wp-includes, kiểu hack hay gặp nhất mà quét chữ ký không thấy.',
          'Thêm nhiều dấu hiệu: reverse shell, đào tiền ảo, chuyển hướng .htaccess, spam SEO ẩn, file đuôi kép, file PHP trong thư mục upload, dòng mã hoá bất thường.',
          'Nút "An toàn" cho file của bạn bị báo nhầm (gắn với mã băm, file bị sửa lại sẽ báo lại). Có thống kê theo website, độ phủ, và xuất báo cáo .md / .json.',
        ],
      },
      {
        title: '🕒 Múi Giờ & Giờ Đăng Nhập Chuẩn Hơn',
        items: [
          'Dropdown múi giờ liệt kê đúng các múi giờ có trên máy chủ của bạn (Linux hoặc Windows), tự chọn múi giờ hiện tại và gắn nhãn "Default" bên cạnh.',
          'Tab Đăng nhập hiển thị giờ theo múi giờ máy chủ, dễ đọc, thay cho chuỗi giờ thô trước đây.',
        ],
      },
      {
        title: '🤖 Nối Claude, Cursor, n8n Với VPS Qua MCP & API Token',
        items: [
          'Trang "API & MCP" mới: tạo token riêng cho từng ứng dụng, không cần đưa mật khẩu panel. Token chỉ lưu dạng băm, hiện đúng 1 lần lúc tạo, thu hồi là mất quyền ngay.',
          'Hai mức quyền: "Chỉ đọc" (xem trạng thái, tiến trình, container, log) và "Đầy đủ" (thêm khởi động lại dịch vụ, container, tối ưu RAM, sao lưu). Mọi thao tác thay đổi đều ghi vào Nhật ký thao tác kèm tên token.',
          'Hỏi AI bằng tiếng Việt: "RAM đang bị tiến trình nào ngốn?", "đọc log nginx lỗi 100 dòng", "khởi động lại docker". Có sẵn lệnh dán vào Claude Code và file cấu hình cho Cursor.',
          'An toàn: không có công cụ chạy lệnh tuỳ ý; token không đổi được mật khẩu, không tắt máy, không dừng ZenPanel.',
        ],
      },
      {
        title: '🔒 SecureFolder: Khoá Website Chống Sửa File Trái Phép',
        items: [
          'Khoá thư mục website ở chế độ chỉ đọc ngay trong hệ điều hành. Dù website bị cài webshell, kẻ xấu cũng không sửa, xoá hay thêm được file nào.',
          'Cần cập nhật code: mở khoá, deploy, khoá lại chỉ bằng 1 nút. Trạng thái khoá được đọc lại từ hệ thống nên luôn đúng thực tế. Thư mục hệ thống bị chặn không cho khoá nhầm.',
        ],
      },
      {
        title: '🔔 Cảnh Báo Telegram & Discord Dễ Cấu Hình Hơn',
        items: [
          'Hướng dẫn từng bước ngay trên giao diện cho Telegram (BotFather) và Discord (Webhook).',
          'Nút "Xác thực" hiện đúng tên bot; nút "Tự lấy Chat ID" tìm sẵn cuộc trò chuyện của bạn, chỉ cần chọn. Không phải mò ID thủ công nữa.',
          'Kiểm tra đường mạng từ VPS ra Telegram / Discord và báo rõ nguyên nhân nếu bị chặn; có ô "địa chỉ API relay" cho VPS bị chặn Telegram.',
          'Lỗi được dịch ra tiếng Việt kèm cách sửa (token sai, chưa bấm Start, webhook đã bị xoá...). Token và webhook không bao giờ lộ trong thông báo lỗi.',
        ],
      },
      {
        title: '🗂️ Xoá Sao Lưu Hàng Loạt',
        items: ['Tick chọn nhiều bản sao lưu cũ và xoá một lần, hiện sẵn dung lượng sẽ được giải phóng.'],
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-26',
    highlights: [
      {
        title: '🔐 Khoá Cửa SSH & Chặn IP Dò Mật Khẩu — Học Từ 1Panel & vPanel',
        items: [
          'Trang "Truy cập SSH" mới: đổi cổng SSH, cấm root đăng nhập bằng mật khẩu, tắt đăng nhập mật khẩu để chỉ dùng SSH key. ZenPanel tự sao lưu file cấu hình, kiểm tra trước khi áp dụng và hoàn tác nếu lỗi, để bạn không bị khoá khỏi VPS.',
          'Quản lý SSH key ngay trên web: thêm key của máy bạn, xoá key cũ, hoặc để ZenPanel tạo sẵn một cặp key (private key chỉ hiện đúng 1 lần để bạn lưu).',
          'Xem ai đang đăng nhập và IP nào đang dò mật khẩu nhiều nhất, chặn ngay bằng 1 nút. Có tab Fail2ban để xem và bỏ chặn các IP đã bị tự động chặn.',
        ],
      },
      {
        title: '🔔 Cảnh Báo Chủ Động Qua Telegram & Discord',
        items: [
          'VPS gặp sự cố là bạn biết ngay: CPU hoặc RAM cao kéo dài, ổ đĩa gần đầy, dịch vụ (nginx, docker, mysql...) bị dừng, VPS sắp hết hạn.',
          'Tự báo "đã phục hồi" khi hết sự cố và không gửi lặp liên tục. Có nút gửi thử để chắc chắn kênh nhận được tin.',
        ],
      },
      {
        title: '🛡️ Quét Mã Độc Website & Nhật Ký Thao Tác',
        items: [
          'Quét webshell, backdoor và file PHP lạ trong mọi website. Xem đúng dòng code đáng ngờ, rồi cách ly (khôi phục được nếu báo nhầm) hoặc xoá.',
          'Nhật ký thao tác ghi lại mọi việc thay đổi trên panel: ai làm gì, lúc nào, từ IP nào. Biết ngay nếu có người lạ vào panel.',
        ],
      },
      {
        title: '🖥️ Hostname, DNS & Múi Giờ',
        items: [
          'Đổi tên máy chủ, đặt DNS (có sẵn Cloudflare, Google, Quad9), chọn múi giờ (có nút giờ Việt Nam) và đồng bộ giờ ngay trên web, không cần gõ lệnh.',
          'Tab Cập nhật có thêm "Lịch sử cập nhật" để xem lại từng phiên bản đã đổi gì.',
        ],
      },
      {
        title: '🧠 Tối Ưu RAM Thật — Đo Trước & Sau, Không Còn Con Số Ảo',
        items: [
          'Bảng RAM mới trong "Dọn dẹp & RAM": thấy rõ bao nhiêu là ứng dụng, bao nhiêu là cache có thể thu hồi, swap đang dùng bao nhiêu.',
          'Bấm "Tối ưu RAM ngay": Linux xả PageCache và gom bộ nhớ phân mảnh, Windows xả Standby list và thu gọn bộ nhớ các chương trình. Xong việc ZenPanel báo đúng số MB vừa lấy lại được.',
          'Thu gọn RAM từng chương trình (Windows), chỉnh swappiness một chạm (Linux), và bật "Tự tối ưu khi RAM cao" để panel tự lo khi RAM vượt ngưỡng bạn chọn.',
          'Dọn dẹp thêm: cắt log container Docker phình to, xoá core dump, cache npm/pip/yarn, kernel & gói cũ. Kết quả dọn hiển thị dung lượng thật vừa giải phóng.',
        ],
      },
      {
        title: '⚙️ Tab Dịch Vụ Gọn & Mạnh Hơn',
        items: [
          'Mặc định chỉ hiện các dịch vụ quan trọng (web server, Docker, database, SSH, cron...) thay vì hàng trăm dịch vụ hệ thống.',
          'Xem RAM và PID của từng dịch vụ, sắp xếp theo RAM để tìm ngay dịch vụ ngốn bộ nhớ.',
          'Ghim dịch vụ hay dùng lên đầu, chọn nhiều dịch vụ để khởi động / dừng cùng lúc, xem log với số dòng tuỳ chọn.',
        ],
      },
      {
        title: '🚀 Speedtest Chuẩn Speedtest.net',
        items: [
          'Chọn máy chủ đo: Cloudflare gần nhất, Singapore, Tokyo, Frankfurt, Pháp, Mỹ... để biết VPS đi quốc tế nhanh tới đâu.',
          'Chọn Đa luồng hoặc Đơn luồng như Speedtest.net.',
          'Đo thêm "độ trễ khi đang tải" (loaded latency) — chỉ số cho biết mạng có bị nghẽn khi dùng nặng hay không.',
        ],
      },
      {
        title: '🔌 AI Gateway Như 9Router / OpenRouter / Ollama',
        items: [
          'Tab "Combo & Kết nối": tạo combo model (vd "coding" = Claude → GPT → Gemini miễn phí), tự chuyển model khi lỗi hoặc chia đều tải.',
          'Dùng ngay với Claude Code qua chuẩn Anthropic, với Open WebUI / Continue qua chuẩn Ollama, và mọi app chuẩn OpenAI — chỉ cần 1 API key.',
          'Đặt giới hạn cho từng API key: số request mỗi phút, số token mỗi ngày, danh sách model được phép dùng.',
        ],
      },
      {
        title: '🗄️ Mở Database Ra Internet Thật Sự',
        items: [
          'Nút "Mở truy cập từ xa" tự làm hết: cho phép tài khoản đăng nhập từ xa, sửa cấu hình PostgreSQL/Redis, mở tường lửa.',
          'ZenPanel kiểm tra từng lớp (Docker → database → tường lửa → Internet thật) và chỉ rõ chỗ đang bị chặn, kể cả khi do Security Group của nhà cung cấp VPS.',
        ],
      },
    ],
  },
  {
    version: '0.6.9',
    date: '2026-10-26',
    highlights: [
      {
        title: '🔗 Giữ Nguyên 100% URL Cloudflare Quick Tunnel Khi Cập Nhật & Fix Modal',
        items: [
          'Không bị đổi URL khi update: Tiến trình Cloudflare Quick Tunnel được tách rời và bảo lưu qua các lần restart của dịch vụ (KillMode=process). Khi cập nhật phiên bản, tiến trình Node.js khởi động lại mà không làm ngắt kết nối Quick Tunnel, URL trycloudflare.com được giữ nguyên hoàn toàn.',
          'Sửa lỗi Modal hiển thị link cũ: Khi Cloudflare cấp domain mới, hộp thoại cập nhật không còn lấy nhầm URL cũ đã chết và không còn báo "Giữ nguyên URL".',
          'Tự nhận diện Link dán & 1-Click Login: Hộp thoại tự động bóc tách token và domain kể cả khi người dùng dán toàn bộ đường dẫn đăng nhập 1-Click, cho phép mở thẳng tab mới ngay lập tức.',
        ],
      },
    ],
  },
  {
    version: '0.6.8',
    date: '2026-10-26',
    highlights: [
      {
        title: '⏰ Bộ Lập Lịch Tự Động Nội Bộ Cho Cron Job (In-Process Scheduler Daemon)',
        items: [
          'Tự động chạy tác vụ 100%: ZenPanel Agent được tích hợp bộ đếm scheduler ngầm chạy 24/7, tự động kích hoạt tác vụ định kỳ (mỗi N phút, hằng ngày, hằng tuần...) mà không phụ thuộc vào trạng thái dịch vụ cron của OS.',
          'Ghi nhận lịch sử chạy thời gian thực: Lưu log chi tiết từng lần chạy tự động (thời gian, thời lượng, stdout, stderr, mã thoát) và cập nhật cột "Lần chạy gần nhất" trên Dashboard ngay lập tức.',
          'Tự động bật cron của hệ điều hành: Tự động kích hoạt systemctl enable --now cron/crond và nạp đầy đủ biến môi trường PATH cho lệnh shell.',
        ],
      },
      {
        title: '🗑️ Nút Xóa Sạch Nhật Ký & 22 Bộ Màu Nhấn Giao Diện Mới',
        items: [
          'Xóa log 1-chạm an toàn: Nút "Xóa log" mới trong tab Nhật ký có hộp thoại xác nhận tránh bấm nhầm, làm rỗng file log về 0 byte an toàn và vacuum journalctl hệ thống.',
          'Mở rộng 22 Theme màu nhấn: Bổ sung 10 bộ màu rực rỡ mới (Sky Blue, Deep Purple, Hot Pink, Solar Yellow, Neon Mint, Living Coral, Imperial Gold, Pastel Lavender, Deep Ruby, Cyber Matrix).',
          'Lọc sạch phiên bản trùng lặp: Tab Cập nhật trong Cài đặt tự động gom nhóm theo phiên bản, chỉ hiển thị duy nhất bản mới nhất cho mỗi số hiệu.',
        ],
      },
    ],
  },
  {
    version: '0.6.7',
    date: '2026-10-24',
    highlights: [
      {
        title: '🌐 Cập Nhật Website Thông Minh & Giữ Nguyên 100% URL (Zero-Downtime Update)',
        items: [
          'Tự động nhận diện thay đổi nhỏ: Khi bạn push sửa lỗi giao diện lên GitHub mà chưa nâng phiên bản, lệnh `zenpanel update` sẽ tự động cập nhật Website mà không chạy installer đầy đủ.',
          'Giữ nguyên URL tuyệt đối: Quá trình chỉ đồng bộ mã nguồn giao diện và build lại Vite trong thư mục dashboard. Fastify tự phục vụ bundle mới mà KHÔNG cần dừng hay khởi động lại tiến trình agent.',
          'Bảo toàn Cloudflare Quick Tunnel: Do dịch vụ không khởi động lại, tên miền `trycloudflare.com` hiện tại và kết nối trực tiếp IP:2083 được giữ nguyên vẹn 100%, không bị gián đoạn hay đổi URL.',
          'Hỗ trợ lệnh chuyên biệt: Bạn có thể gõ `zenpanel update ui` hoặc `zenpanel update website` bất kỳ lúc nào để làm mới website trong vài giây (sau đó chỉ cần F5 / Ctrl+F5 trên trình duyệt).',
        ],
      },
      {
        title: '🚀 Màn Hình Cập Nhật Mới: In URL Công Khai & Nút Mở Tab Mới Tự Đăng Nhập (1-Click Auto-Login)',
        items: [
          'In rõ ràng URL công khai: Hiển thị minh bạch đường dẫn truy cập mới ngay khi cập nhật hoàn tất kèm nút sao chép nhanh.',
          'Link đăng nhập 1-Click an toàn: Tự động tạo link kèm mã xác thực Token để bạn vào thẳng trang quản trị mà không cần gõ lại mật khẩu.',
          'Nút bấm "Mở tab mới & Tự đăng nhập ngay": Bấm 1 chạm là trình duyệt tự mở tab mới và đăng nhập sẵn sang phiên bản vừa cập nhật.',
          'Khắc phục hoàn toàn lỗi treo modal: Tối ưu thời gian chờ kết nối lại (timeout 3-4s), có ô dán link nhanh và hỗ trợ nút mở qua IP máy chủ tiện lợi.',
        ],
      },
      {
        title: '⚡ Lệnh CLI `zenpanel url` & `install.sh` Tự Sinh Link Đăng Nhập Trực Tiếp',
        items: [
          'Lệnh `zenpanel url` và `zenpanel status` trên terminal SSH tự động in kèm đường dẫn 1-Click Auto-Login giúp bạn truy cập VPS siêu tốc.',
          'Trình cài đặt `install.sh` tự động in link đăng nhập ngay khi kết thúc cài đặt hoặc cập nhật phiên bản mới.',
        ],
      },
      {
        title: '🎨 Bộ Sưu Tập 12 Theme & 8 Tông Nền Cao Cấp Mới',
        items: [
          'Thêm 6 màu nhấn (Themes) bắt mắt mới: Sunset Orange (cam hoàng hôn), Neon Fuchsia (hồng neon), Electric Lime (xanh chuối điện), Cosmic Indigo (chàm vũ trụ), Nordic Teal (xanh mòng két) và Ruby Crimson (đỏ hồng ngọc).',
          'Thêm 5 tông nền (Base Tones) chuyên nghiệp: Charcoal Zinc (chuẩn VS Code), Dracula Night (tím huyền bí), Nordic Frost (băng tuyết), Deep Forest (rừng thông huyền ảo) và Warm Mocha (cà phê ấm áp).',
          'Tích hợp ánh sáng tương phản thông minh (Ambient Glow) tự động hòa quyện với màu nhấn đã chọn.',
        ],
      },
      {
        title: '🧪 Trung Tâm Thử Nghiệm API Tester Toàn Diện (35+ Endpoints Mẫu)',
        items: [
          'Tích hợp sẵn 4 bộ sưu tập mẫu: ZenPanel AI Gateway (Chuẩn OpenAI 13 endpoint), ZenPanel AI Gateway (Anthropic & Ollama 8 endpoint), ZenPanel Quản Trị VPS (14 endpoint hệ thống) và Ví dụ API công khai.',
          'Thử nghiệm trực tiếp mọi API: Tích hợp sẵn biến môi trường {{baseUrl}} và {{panelToken}} để kiểm tra ngay API Docker, RAM Clean, Metrics, Speedtest, AI Chat, Embeddings...',
          'Nút "Mẫu API" 1-click: Cho phép khôi phục hoặc nạp thêm các bộ sưu tập API mẫu mới nhất vào workspace bất kỳ lúc nào mà không làm mất các request cá nhân.',
        ],
      },
      {
        title: '💾 Tùy Chọn Định Dạng Sao Lưu Linh Hoạt (.tar.gz & .zip)',
        items: [
          'Hỗ trợ lựa chọn 2 định dạng nén: Người dùng có thể chọn `.tar.gz` (giữ nguyên 100% phân quyền file Linux, user sở hữu và symlink) hoặc `.zip` (phổ biến, dễ mở đúp chuột trực tiếp trên Windows/macOS không cần cài phần mềm thứ 3).',
          'Đồng bộ cả sao lưu thủ công lẫn tự động: Lựa chọn định dạng có hiệu lực cho cả tính năng "Sao lưu ngay" và cài đặt "Lịch sao lưu tự động".',
          'Nhãn định dạng trực quan: Danh sách các bản sao lưu tự động gắn huy hiệu màu phân biệt rõ ràng (.tar.gz, .zip, .sql.gz, .mongo.gz, .rdb).',
        ],
      },
      {
        title: '🛡️ Tối Ưu Hiển Thị Tooltip & Chuẩn Hóa ZenPanel AI Gateway',
        items: [
          'Sửa lỗi hiển thị tooltip: Khi rê chuột ở gần mép phải màn hình, tooltip tự động chuyển sang neo theo lề phải và giữ nguyên chiều ngang phẳng, không bị bóp méo thành cột dọc.',
          'Chuẩn hóa thương hiệu ZenPanel AI Gateway: Đồng bộ tên gọi cổng kết nối AI trên toàn bộ bảng điều khiển.',
        ],
      },
    ],
  },
  {
    version: '0.6.6',
    date: '2026-10-24',
    highlights: [
      {
        title: '🚀 Trình Quản Lý Tệp ZenFile Ultra Thế Hệ Mới (Dual-Pane & Web Terminal)',
        items: [
          'Ra mắt ZenFile Ultra (Cloud Commander Pro): Giao diện 2 cửa sổ song song (Dual-Pane) giúp sao chép (F5) và di chuyển (F6) tệp tin giữa 2 thư mục siêu tốc.',
          'Tích hợp Web Terminal tương tác trực tiếp: Mở shell (bash, sh, PowerShell) ngay tại thư mục đang duyệt bằng phím tắt Ctrl + ` mà không cần rời trang File Manager.',
          'Monaco Code Editor chuyên nghiệp: Hỗ trợ highlight cú pháp đa ngôn ngữ, tìm kiếm regex, phím tắt VS Code, xem diff so sánh nội dung tệp tin.',
          'Nén & Giải nén đa định dạng: Đóng gói và giải nén trực tiếp các file .zip, .tar, .tar.gz, .tgz siêu nhẹ và mượt mà.',
          'Xem trước hình ảnh lightbox, phát video và phát nhạc trực tuyến.',
          'Toàn quyền Root VPS: Truy cập và quản trị toàn bộ filesystem hệ thống không bị giới hạn permission.',
          'Linh hoạt chuyển đổi: Hỗ trợ chuyển đổi nhanh giữa 3 chế độ (Duyệt tiêu chuẩn OS, ZenFile Ultra kiểu mới và FileBrowser truyền thống).',
        ],
      },
      {
        title: '📦 Hệ Thống Kho Repos Mở Rộng Cho App Store (Community Repos)',
        items: [
          'Kho ứng dụng chính thức ZenPanel Community & Pro Apps được đẩy trực tiếp lên GitHub repo TXAVL/vps-dashboard.',
          'Tính năng Tự Động Thêm Kho 1-Click: Thêm kho repo và mở ngay trình cài đặt ứng dụng chỉ bằng 1 nút bấm từ File Manager hoặc App Store.',
          'Chuẩn hóa liên kết GitHub: Tự động chuyển đổi link GitHub web (blob) sang dạng Raw JSON, người dùng copy link nào cũng hoạt động ổn định.',
          'Tích hợp thẻ gợi ý kho chính thức kèm nút sao chép và hướng dẫn từng bước trực quan trong App Store.',
        ],
      },
      {
        title: '🎯 Phân Loại Nhật Ký Thông Minh: Khắc Phục Nhận Diện Nhầm Log Của Bot',
        items: [
          'Sửa lỗi các log bot (Telegram, Discord, AI Crawler, Googlebot, Ping monitor) chưa phát sinh lỗi nhưng bị hệ thống tính là lỗi và tô đỏ.',
          'Tự động nhận diện chuẩn HTTP Access Log: Các request có mã HTTP 2xx (200, 201...) và 3xx (301, 304...) được nhận diện chính xác là thành công, không tính là lỗi dù đường dẫn có chứa từ khóa nhạy cảm.',
          'Bỏ qua các cờ phủ định: Nhận diện chính xác error: null, failed: 0, 0 errors, status: ok, without error...',
          'Bảo vệ tiền tố cấp độ [INFO], [DEBUG], level=info: Không bị đánh đồng thành lỗi nghiêm trọng khi bot xử lý tin nhắn hoặc trạng thái kiểm tra.',
        ],
      },
      {
        title: '📱 Tối Ưu Giao Diện & Trải Nghiệm Mobile Toàn Diện (Responsive Design)',
        items: [
          'Tối ưu hóa Trang Tổng Quan (Overview): Bố cục co giãn thông minh, tương thích hoàn hảo với màn hình điện thoại di động và máy tính bảng.',
          'Tinh chỉnh các vòng tròn đo tài nguyên CPU/RAM/Ổ đĩa, biểu đồ thời gian thực và các nút thao tác nhanh không bị tràn khung.',
          'Nâng cấp thanh điều hướng Shell và các modal chẩn đoán hệ thống (VpsDoctorModal) để thao tác chạm mượt mà trên mobile.',
        ],
      },
      {
        title: '⏪ Lịch Sử Phiên Bản & Nút Quay Lại Bản Cũ (Rollback 1-Click)',
        items: [
          'Bổ sung nút "Quay lại" trực tiếp tại danh sách "Gói dự phòng trên máy": Cho phép khôi phục tức thì về các bản cũ (v0.6.5, v0.6.4...) mà không cần tải lại.',
          'Khắc phục hiển thị Lịch sử phiên bản: Tự động tổng hợp các bản phát hành, gói sao lưu offline trên máy và commit lịch sử từ GitHub để người dùng có thể quay lại bất kỳ lúc nào.',
          'Mô tả trực quan, rõ ràng: Thay thế thông báo gây nhầm lẫn bằng hướng dẫn chi tiết về tính năng lưu trữ dự phòng và khôi phục.',
        ],
      },
      {
        title: '⚡ Lệnh CLI Thông Minh: zenpanel update Tự Động Kiểm Tra Bản Mới',
        items: [
          'Lệnh `zenpanel update` tự động đối chiếu phiên bản hiện tại với bản mới nhất trên GitHub trước khi thực thi.',
          'Nếu đã ở bản mới nhất: Báo rõ ràng hệ thống đã cập nhật đầy đủ và hướng dẫn dùng cờ `--force` nếu muốn cài đè lại.',
          'Chỉ tiến hành tải và build khi có phiên bản mới hoặc khi người dùng truyền cờ `--force` (zenpanel update --force).',
        ],
      },
    ],
  },
  {
    version: '0.6.5',
    date: '2026-10-24',
    highlights: [
      {
        title: '💾 Trung Tâm Sao Lưu & Khôi Phục Toàn Diện (Backups Hub)',
        items: [
          'Hỗ trợ sao lưu an toàn toàn bộ Website, cơ sở dữ liệu (MySQL, MariaDB, PostgreSQL, MongoDB, Redis) và Docker Volume.',
          'Cơ chế đặt lịch tự động theo giờ / ngày / tuần với chính sách dọn dẹp các bản sao lưu cũ (retention) tiết kiệm dung lượng ổ đĩa.',
          'Tải file nén trực tiếp hoặc khôi phục 1-click với kiểm tra an toàn.',
        ],
      },
      {
        title: '📋 Trình Theo Dõi Nhật Ký Hệ Thống Thời Gian Thực (Live Logs)',
        items: [
          'Xem live log trực tiếp của Nginx, Docker container, SSH auth.log, Systemd và Syslog.',
          'Tìm kiếm tức thì, lọc từ khóa, tải file log đầy đủ về máy tính.',
        ],
      },
      {
        title: '🦙 AI Gateway Tương Thích Chuẩn Ollama API',
        items: [
          'Mở rộng cổng tương thích /ollama/* để các IDE và công cụ CLI hỗ trợ Ollama kết nối trực tiếp qua ZenPanel AI Gateway.',
          'Hỗ trợ hướng dẫn kết nối nhanh (AiConnectTab) cho Python, Node.js, cURL, LangChain và LlamaIndex.',
        ],
      },
      {
        title: '🧹 Tối Ưu RAM & Dọn Dẹp Rác Nâng Cao',
        items: [
          'Tự động cắt tỉa Docker log của container khi vượt quá 10MB, dọn dẹp cache gói và crash dumps.',
          'Thu hồi bộ nhớ RAM cache thông minh, giúp máy chủ luôn duy trì hiệu năng cao nhất.',
        ],
      },
      {
        title: '📁 Tối Ưu Quản Lý File & Chuẩn Hóa ZenFile Explorer Pro',
        items: [
          'Sửa lỗi xung đột tài khoản admin FileBrowser và bổ sung hướng dẫn đặt lại mật khẩu chuẩn xác.',
          'Tách biệt các Modal cài đặt và nâng cấp hệ thống độc lập, mượt mà hơn.',
        ],
      },
    ],
  },
  {
    version: '0.6.4',
    date: '2026-10-23',
    highlights: [
      {
        title: '🔀 ZenPanel AI Gateway: Định Tuyến 3 Tầng Thông Minh Không Lo Đứt Gãy',
        items: [
          'Tự động nhảy tầng dự phòng (Tier 1 ➔ Tier 2 ➔ Tier 3): Khi bạn đang lập trình với Claude Code, Cursor hay Cline mà tài khoản chính hết tiền, bị giới hạn tốc độ (lỗi 429) hoặc máy chủ AI bị nghẽn, ZenPanel sẽ tự động nhảy sang mô hình giá rẻ hoặc mô hình miễn phí ngay lập tức. Công việc của bạn luôn được liên tục, không bao giờ bị dừng giữa chừng.',
          'Đặt tên mô hình siêu tiện: Bạn chỉ cần nhập "tier1" (mô hình thông minh cao cấp nhất), "tier2" (mô hình tiết kiệm siêu tốc như Gemini 3.5 Flash Lite, DeepSeek), "tier3" (tầng miễn phí cứu cánh) hoặc "auto" để ZenPanel tự quyết định.',
          'Quản lý hồ tài khoản thông minh: Tùy chọn chuyển đổi linh hoạt giữa "Failover" (chỉ đổi tài khoản khi dính lỗi) hoặc "Round-Robin" (xoay đều các khóa) để không bao giờ bị quá tải.',
        ],
      },
      {
        title: '⚡ Công Nghệ Nén RTK Token Saver: Tiết Kiệm Tiền & Tránh Tràn Bộ Nhớ',
        items: [
          'Tự động dọn dẹp dữ liệu thừa: RTK Token Saver sẽ tự động quét và lọc sạch các mã màu terminal, khoảng trắng thừa mứa và các vạch phân cách log dài ngoằng trước khi gửi cho AI.',
          'Tiết kiệm từ 20% đến 65% chi phí: Giảm lượng token gửi đi đáng kể giúp bạn đỡ tốn tiền nạp API và không bao giờ lo bị tràn dung lượng nhớ của mô hình khi chạy các lệnh build hay kiểm tra mã nguồn.',
        ],
      },
      {
        title: '🛠️ Trung Tâm Tích Hợp 1-Chạm Cho Claude Code, Cursor, Cline & n8n',
        items: [
          'Sẵn sàng trong 5 giây: Bổ sung khu vực hướng dẫn tích hợp dành riêng cho các trợ lý lập trình phổ biến nhất hiện nay: Claude Code (CLI mới nhất từ Anthropic), Cursor IDE, tiện ích Cline / Roo Code trên VS Code, Aider, n8n, Dify...',
          'Sao chép 1 chạm: Đã điền sẵn địa chỉ máy chủ và khóa bảo mật mẫu, bạn chỉ cần bấm "Sao chép" và dán vào là dùng được ngay.',
        ],
      },
      {
        title: '🚀 Nâng Cấp Phiên Bản Thông Minh: In Rõ Đường Dẫn Mới & Mở Tab Tự Động Đăng Nhập',
        items: [
          'In rõ địa chỉ web mới: Sau khi nâng cấp xong, nếu máy chủ đổi đường dẫn Cloudflare mới, bảng thông báo sẽ in to rõ ràng địa chỉ mới trên màn hình kèm nút "Sao chép" tiện lợi.',
          'Mở tab mới & tự động đăng nhập: Có nút "Mở tab mới với URL mới" giúp bạn mở ngay phiên bản mới và đăng nhập tự động trong 1 cú nhấp chuột, không lo bị kẹt lại ở tab cũ đã hết hạn.',
        ],
      },
    ],
  },
  {
    version: '0.6.3',
    date: '2026-10-23',
    highlights: [
      {
        title: '🔒 Đăng Xuất An Toàn Tuyệt Đối (Đăng Xuất Thật)',
        items: [
          'Vô hiệu hóa ngay lập tức: Khi bạn bấm Đăng xuất, hệ thống sẽ ngắt phiên làm việc trực tiếp trên máy chủ. Bất kỳ ai cầm chìa khóa hay token cũ đều bị khóa lại ngay lập tức.',
          'An tâm tuyệt đối: Tránh tình trạng chỉ tắt màn hình ở máy mà tài khoản vẫn mở ở máy chủ.',
        ],
      },
      {
        title: '💻 Quản Lý Thiết Bị Đang Dùng & Xóa Nút Đăng Xuất Nhầm',
        items: [
          'Đánh dấu thiết bị bạn đang cầm: Thiết bị hiện tại luôn được làm nổi bật với huy hiệu xanh lá "Phiên hiện tại" để bạn không bao giờ bị nhầm lẫn.',
          'Không lo lỡ tay bấm nhầm: Nút Đăng xuất ở dòng thiết bị hiện tại đã được gỡ bỏ hoàn toàn, tránh việc bạn tự bấm ngắt phiên của chính mình trong danh sách. Muốn đăng xuất bạn chỉ cần dùng nút Đăng xuất trên thanh điều hướng.',
          'Ngắt kết nối thiết bị lạ từ xa: Bạn có thể thấy rõ máy tính hay điện thoại nào khác đang đăng nhập và bấm "Đăng xuất" riêng thiết bị đó chỉ với 1 chạm.',
        ],
      },
      {
        title: '🔍 Nhật Ký Đăng Nhập Chi Tiết & Kĩ Tính',
        items: [
          'Hiển thị thiết bị rõ ràng: Biết chính xác người đăng nhập dùng điện thoại (iPhone, Android) hay máy tính (Windows, Mac) cùng trình duyệt (Chrome, Safari, Edge...).',
          'Vị trí & Cờ quốc gia: Đi kèm địa chỉ IP là cờ và tên quốc gia (hoặc nhãn Mạng nội bộ) giúp bạn dễ dàng nhận diện nguồn truy cập.',
          'Ghi nhận minh bạch: Mọi lần đăng nhập đúng hay sai mật khẩu đều được lưu lại kèm lý do rõ ràng.',
        ],
      },
    ],
  },
  {
    version: '0.6.2',
    date: '2026-10-23',
    highlights: [
      {
        title: '⏱️ Đồng Hồ Chạy Bot Nhảy Từng Giây',
        items: [
          'Đếm thời gian siêu mượt: Thời gian bot và ứng dụng của bạn hoạt động giờ đây nhảy từng giây liên tục như đồng hồ bấm giờ thể thao, không còn bị đứng hình hay chờ lâu mới nhảy số.',
          'Biết rõ giờ bật bot: Chỉ cần rê chuột vào dòng thời gian là bạn sẽ thấy ngay ngày giờ chính xác mà bot bắt đầu chạy.',
        ],
      },
      {
        title: '📜 Xem Nhật Ký Bot Thông Minh, Hết Báo Nhầm Lỗi',
        items: [
          'Không còn hoang mang vì chữ đỏ: Các thông báo hoạt động bình thường của bot (như đăng nhập Discord, kết nối server thành công) giờ hiển thị sáng rõ, không bị tô đỏ nhầm thành lỗi nghiêm trọng.',
          'Bộ lọc chuẩn xác: Khi chọn chế độ "Chỉ lỗi", màn hình chỉ gom những sự cố thực sự cần bạn để mắt tới.',
        ],
      },
      {
        title: '💬 Trò Chuyện Thử Với AI Tiện Lợi & Logo Mới',
        items: [
          'Tin nhắn gọn gàng, không dính chữ: Câu hỏi của bạn và phản hồi của AI luôn được tách riêng đẹp mắt hai bên màn hình.',
          'Bấm 1 nút gửi lại ngay: Nếu mạng của AI chập chờn hay quá tải, bạn chỉ cần bấm nút "Thử gửi lại" là xong, không mất công gõ lại từ đầu.',
          'Biểu tượng mới siêu nét: Cập nhật logo chính thức mới nhất cho Claude, NVIDIA và Google Gemini với dải màu hiện đại, rực rỡ.',
        ],
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2026-10-23',
    highlights: [
      {
        title: '🎯 Dùng Đúng Trí Tuệ Nhân Tạo Bạn Thích Nhất',
        items: [
          'Tôn trọng sở thích của bạn: Bạn chọn model AI nào làm mặc định (như Gemini 3.5 Flash Lite tiêu chuẩn mới nhất) thì hệ thống sẽ nhớ và dùng đúng loại đó, không bao giờ tự ý chuyển sang loại khác.',
        ],
      },
      {
        title: '🗣️ Giải Thích Sự Cố Bằng Tiếng Việt Dễ Hiểu',
        items: [
          'Không còn thấy mã khó hiểu: Nếu tài khoản AI hết tiền, hết lượt dùng hay sai khóa kết nối, hệ thống sẽ giải thích ngay bằng tiếng Việt rõ ràng để bạn biết cần nạp tiền hay đổi chìa khóa mới.',
          '1 chạm kiểm tra lại: Nút "Kiểm tra kết nối" ngay trên màn hình giúp bạn thử lại xem tài khoản đã nạp tiền hay dùng lại được chưa bất cứ khi nào bạn muốn.',
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

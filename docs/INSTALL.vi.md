# Cài Instagram Feed Sorter

Bản này dùng trên **Chrome máy tính**: Windows, macOS, Linux và ChromeOS. Edge máy tính có thể dùng gói Chromium tương tự nhưng chưa được kiểm thử đầy đủ riêng. Không hỗ trợ Chrome điện thoại, app Instagram, Safari hoặc Firefox.

1. Vào [Releases](https://github.com/princenhammai/instagram-feed-sorter/releases/latest).
2. Tải file **`instagram-feed-sorter-v<VERSION>.zip`** ở phần Assets. Hai file “Source code” là mã nguồn dành cho lập trình viên.
3. Giải nén vào một thư mục cố định, ví dụ `instagram-feed-sorter`.
4. Mở `chrome://extensions`, bật **Developer mode**.
5. Bấm **Load unpacked**, chọn đúng thư mục chứa trực tiếp file `manifest.json`.
6. Mở Instagram trong cùng Chrome và tự đăng nhập.
7. Mở tab Reels của một account → bấm extension → chọn Views hoặc kiểu sort khác.

Không cần Node.js, server hoặc API key để sort cơ bản. Mỗi người dùng phiên Instagram của chính mình. Transcription là tùy chọn, cần key/provider riêng.

**Cập nhật:** thay file trong đúng thư mục đã cài → Reload extension → refresh Instagram. Giữ nguyên đường dẫn và extension đã cài để giữ dữ liệu local. Thư viện và cài đặt không tự đồng bộ sang máy khác.

**Kiểm tra xuất CSV ở v0.3.3:** refresh Instagram → sort một nhóm Reels nhỏ → chọn **Export data → CSV**. File `ifs-<username>-YYYY-MM-DD.csv` được lưu vào thư mục tải xuống mặc định của trình duyệt, không hiện hộp thoại chọn nơi lưu. Nếu chưa thấy file, mở trang Downloads của trình duyệt. JSON dùng cùng cách tải. Extension chỉ báo thành công sau khi Chrome trả về mã download.

**Nếu báo thiếu manifest:** chọn thư mục đã giải nén chứa `manifest.json`, không chọn ZIP hoặc thư mục cha. Nếu thấy file `.ts/.tsx`, bạn đã tải nhầm mã nguồn.

Hướng dẫn chính thức của Chrome: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked

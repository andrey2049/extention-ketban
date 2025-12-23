// Cho phép mở Side Panel khi click vào biểu tượng extension
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Lắng nghe tin nhắn từ script để cập nhật trạng thái nếu cần
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.done) {
    console.log("Đã hoàn thành mục tiêu gửi lời mời.");
  }
});
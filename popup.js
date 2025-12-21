let isRunning = false;
let sentCount = 0;
let skippedCount = 0;
let sentCountDisplay = null;
let skippedCountDisplay = null;

document.addEventListener("DOMContentLoaded", () => {
  sentCountDisplay = document.getElementById("sent-count");
  skippedCountDisplay = document.getElementById("skipped-count");

  document.getElementById("start").addEventListener("click", async () => {
    const selectedLimit = document.querySelector('input[name="limit"]:checked');
    if (!selectedLimit) {
      alert("⚠️ Vui lòng chọn ngưỡng gửi.");
      return;
    }

    const limit = parseInt(selectedLimit.value);
    const delay = parseFloat(document.getElementById("delay").value) * 1000; // Đổi sang giây
    const locations = document
      .getElementById("locations")
      .value.split(",")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);

    sentCount = 0;
    skippedCount = 0;
    updateCounts();
    isRunning = true;

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [limit, delay, locations],
      func: (limit, delay, locations) => {
        window.autoAddFriendRunning = true;
        let localSentCount = 0;
        const processedLinks = new Set();

        const clickNext = () => {
          if (!window.autoAddFriendRunning || localSentCount >= limit) {
            chrome.runtime.sendMessage({ done: true });
            return;
          }

          // 1. Tìm danh sách nút "Thêm bạn bè" ở trang gợi ý
          const buttons = [...document.querySelectorAll('div[aria-label="Thêm bạn bè"]')].filter(
            (btn) => btn.innerText.includes("Thêm bạn bè") && btn.closest("a")
          );

          const nextButton = buttons.find((btn) => {
            const link = btn.closest("a")?.href;
            return link && !processedLinks.has(link);
          });

          if (!nextButton) {
            console.log("🔄 Hết gợi ý, cuộn trang hoặc tải lại...");
            window.scrollTo(0, document.body.scrollHeight);
            setTimeout(clickNext, 3000);
            return;
          }

          const anchor = nextButton.closest("a");
          const profileLink = anchor.href;
          const name = anchor.innerText.split("\n")[0] || "Người dùng FB";
          
          processedLinks.add(profileLink);
          anchor.click(); // Vào trang cá nhân

          // Chờ trang cá nhân load
          setTimeout(() => {
            try {
              // --- PHẦN QUÉT THÔNG TIN CHÍNH XÁC ---
              
              // Lấy vùng Intro (Giới thiệu)
              const introBox = document.querySelector('div[role="main"]');
              const introText = introBox ? introBox.innerText.toLowerCase() : "";

              // A. Kiểm tra Vị trí (Regex chặt chẽ)
              const hasValidLocation = locations.some(loc => {
                const pattern = new RegExp(`(sống tại|đến từ|ở|từ).*${loc}`, 'i');
                return pattern.test(introText);
              });

              // B. Kiểm tra Số lượng Bạn/Follow (Loại bỏ "Bạn chung")
              let friends = 0;
              let followers = 0;

              const allElements = Array.from(document.querySelectorAll('a, span'))
                .filter(el => /\d/.test(el.innerText))
                .map(el => el.innerText.toLowerCase());

              allElements.forEach(txt => {
                // Chỉ lấy "người bạn" mà không có chữ "chung"
                if ((txt.includes('người bạn') || txt.includes('bạn bè')) && !txt.includes('chung')) {
                  const match = txt.match(/([\d.,]+)\s*([k]?)/);
                  if (match) {
                    let n = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                    if (match[2] === 'k') n *= 1000;
                    if (n > friends) friends = Math.round(n);
                  }
                }
                // Quét người theo dõi
                if (txt.includes('người theo dõi')) {
                  const match = txt.match(/([\d.,]+)\s*([k]?)/);
                  if (match) {
                    let n = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                    if (match[2] === 'k') n *= 1000;
                    if (n > followers) followers = Math.round(n);
                  }
                }
              });

              // C. Kiểm tra Quan hệ
              const isSingle = introText.includes("độc thân");
              const hasRelationship = /(hẹn hò|kết hôn|đã đính hôn|vợ|chồng)/.test(introText);

              // --- RA QUYẾT ĐỊNH ---
              const passStats = (friends >= 500 || followers >= 500);
              const passLoc = hasValidLocation;
              const passRel = isSingle || !hasRelationship;

              if (passLoc && passStats && passRel) {
                const addBtn = document.querySelector('div[aria-label="Thêm bạn bè"]');
                if (addBtn) {
                  addBtn.click();
                  localSentCount++;
                  chrome.runtime.sendMessage({ type: "SUCCESS", name, url: profileLink });
                }
              } else {
                let reason = [];
                if (!passLoc) reason.push("Sai khu vực");
                if (!passStats) reason.push(`Ít bạn (${friends})`);
                if (!passRel) reason.push("Đã kết hôn/Hẹn hò");
                chrome.runtime.sendMessage({ type: "SKIPPED", name, reason: reason.join(" - ") });
              }

              // Quay lại danh sách gợi ý
              window.history.back();
              setTimeout(clickNext, delay);

            } catch (err) {
              console.error(err);
              window.history.back();
              setTimeout(clickNext, delay);
            }
          }, 3500); // Đợi 3.5s để FB load đủ Intro
        };

        clickNext();
      },
    });
  });

  document.getElementById("stop").addEventListener("click", () => {
    isRunning = false;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => { window.autoAddFriendRunning = false; },
      });
    });
  });
});

// Lắng nghe tin nhắn từ trang web gửi về popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SUCCESS") {
    sentCount++;
    log(`✅ Đã gửi: <a href="${message.url}" target="_blank">${message.name}</a>`);
  } else if (message.type === "SKIPPED") {
    skippedCount++;
    log(`⚠️ Bỏ qua ${message.name}: ${message.reason}`);
  } else if (message.done) {
    log("<b>✨ Hoàn thành mục tiêu!</b>");
  }
  updateCounts();
});

function updateCounts() {
  if (sentCountDisplay) sentCountDisplay.textContent = `Đã gửi: ${sentCount}`;
  if (skippedCountDisplay) skippedCountDisplay.textContent = `Bị loại: ${skippedCount}`;
  const totalDisplay = document.getElementById("total-count");
  if (totalDisplay) totalDisplay.textContent = `Tổng đã xử lý: ${sentCount + skippedCount}`;
}

function log(msg) {
  const logDiv = document.getElementById("log") || document.body;
  const item = document.createElement("div");
  item.innerHTML = msg;
  item.style.fontSize = "12px";
  item.style.borderBottom = "1px solid #eee";
  item.style.padding = "2px 0";
  logDiv.prepend(item);
}
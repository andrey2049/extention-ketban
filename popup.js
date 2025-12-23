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
        const delay = parseFloat(document.getElementById("delay").value) * 1000;
        const locations = document.getElementById("locations").value
            .split(",").map((l) => l.trim().toLowerCase()).filter(Boolean);

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
                const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                const clickNext = async () => {
                    if (!window.autoAddFriendRunning || localSentCount >= limit) {
                        chrome.runtime.sendMessage({ done: true });
                        return;
                    }

                    const buttons = [...document.querySelectorAll('div[aria-label="Thêm bạn bè"]')].filter(
                        (btn) => btn.innerText.includes("Thêm bạn bè") && btn.closest("a")
                    );

                    const nextButton = buttons.find((btn) => {
                        const link = btn.closest("a")?.href;
                        return link && !processedLinks.has(link);
                    });

                    if (!nextButton) {
                        window.scrollTo(0, document.body.scrollHeight);
                        await sleep(3000);
                        return clickNext();
                    }

                    const anchor = nextButton.closest("a");
                    const profileLink = anchor.href;
                    processedLinks.add(profileLink);

                    anchor.click(); 
                    await sleep(4500); 

                    try {
                        const mainContent = document.querySelector('div[role="main"]');
                        if (!mainContent) {
                            window.history.back();
                            await sleep(2000);
                            return clickNext();
                        }

                        const realName = mainContent.querySelector('h1')?.innerText || "Người dùng";
                        const introText = mainContent.innerText.toLowerCase();

                        // 1. Kiểm tra Vị trí
                        const hasValidLocation = locations.some(loc => {
                            const pattern = new RegExp(`(sống tại|đến từ|ở|từ).*${loc}`, 'i');
                            return pattern.test(introText);
                        });

                        // 2. Kiểm tra Trạng thái Quan hệ
const isSingle = introText.includes("độc thân");
// Kiểm tra xem họ có ghi rõ là đã có chủ hay không
const isTaken = introText.includes("hẹn hò") || 
                introText.includes("đã kết hôn") || 
                introText.includes("đã đính hôn") || 
                introText.includes("phức tạp");

// 3. Quét Bạn bè & Người theo dõi
let friends = 0;
let followers = 0;

// Lấy tất cả các thẻ có khả năng chứa số lượng bạn bè/follower
mainContent.querySelectorAll('a, span, div').forEach(el => {
    const txt = el.innerText.toLowerCase();
    
    // Sửa lỗi: Chỉ lấy "Người bạn" hoặc "Bạn bè", loại trừ hoàn toàn "Bạn chung"
    if ((txt.includes('người bạn') || txt.includes('bạn bè')) && !txt.includes('chung')) {
        // Regex này sẽ bắt các số như 2K, 500, 1.200...
        const match = txt.match(/([\d.,]+)\s*([k]?)/);
        if (match) {
            let n = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
            if (match[2] === 'k') n *= 1000;
            // Cập nhật giá trị lớn nhất tìm thấy
            friends = Math.max(friends, Math.round(n));
        }
    }

    // Quét người theo dõi
    if (txt.includes('người theo dõi')) {
        const match = txt.match(/([\d.,]+)\s*([k]?)/);
        if (match) {
            let n = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
            if (match[2] === 'k') n *= 1000;
            followers = Math.max(followers, Math.round(n));
        }
    }
});

// Kiểm tra lại trong Console để debug (nhấn F12 khi chạy)
console.log(`Debug - Tên: ${realName}, Bạn bè: ${friends}, Follow: ${followers}`);

// --- ĐIỀU KIỆN TỔNG HỢP ---
const passLoc = hasValidLocation;
const passStats = (friends >= 500 || followers >= 700);

// Logic: 
// - Nếu sai khu vực -> Loại.
// - Nếu đã có chủ (Hẹn hò/Kết hôn) -> Loại.
// - Nếu Độc thân -> Gửi.
// - Nếu Ẩn trạng thái NHƯNG Chỉ số cao -> Gửi.

let shouldAdd = false;
let failReason = "";

if (!passLoc) {
    failReason = "Sai khu vực";
} else if (isTaken) {
    failReason = "Đã có chủ (Hẹn hò/Kết hôn)";
} else if (isSingle || passStats) {
    shouldAdd = true;
} else {
    failReason = "Không đủ điều kiện bạn bè/follower";
}

if (shouldAdd) {
    const addBtn = Array.from(mainContent.querySelectorAll('div[role="button"], div[aria-label="Thêm bạn bè"]'))
        .find(btn => (btn.innerText.includes("Thêm bạn bè") || btn.getAttribute('aria-label') === "Thêm bạn bè") 
                     && !btn.innerText.includes("Nhắn tin")
                     && !btn.innerText.includes("Hủy lời mời"));

    if (addBtn) {
        addBtn.click();
        localSentCount++;
        chrome.runtime.sendMessage({ type: "SUCCESS", name: realName, url: profileLink });
    }
} else {
    chrome.runtime.sendMessage({ type: "SKIPPED", name: realName, reason: failReason });
}
                    } catch (err) {
                        console.error("Lỗi:", err);
                    }

                    window.history.back();
                    await sleep(delay + 3000);
                    return clickNext();
                };
                clickNext();
            }
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

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SUCCESS") {
        sentCount++;
        log(`✅ Đã gửi: <a href="${message.url}" target="_blank"><b>${message.name}</b></a>`, "success");
    } else if (message.type === "SKIPPED") {
        skippedCount++;
        log(`⚠️ Bỏ qua <b>${message.name}</b>: ${message.reason}`, "skip");
    } else if (message.done) {
        log("<b style='color: blue;'>✨ Hoàn thành mục tiêu!</b>");
        isRunning = false;
    }
    updateCounts();
});

function updateCounts() {
    if (sentCountDisplay) sentCountDisplay.textContent = `Đã gửi: ${sentCount}`;
    if (skippedCountDisplay) skippedCountDisplay.textContent = `Bị loại: ${skippedCount}`;
    const totalDisplay = document.getElementById("total-count");
    if (totalDisplay) totalDisplay.textContent = `Tổng đã xử lý: ${sentCount + skippedCount}`;
}

function log(msg, type) {
    const logDiv = document.getElementById("log");
    if (!logDiv) return;
    const item = document.createElement("div");
    item.innerHTML = msg;
    item.style.fontSize = "12px";
    item.style.borderBottom = "1px solid #eee";
    item.style.padding = "4px 0";
    if (type === "success") item.style.backgroundColor = "#eaffea";
    if (type === "skip") item.style.backgroundColor = "#fff9e6";
    logDiv.prepend(item);
}
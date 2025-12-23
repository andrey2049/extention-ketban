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
                    await sleep(4500); // Đợi trang cá nhân load

                    try {
                        const mainContent = document.querySelector('div[role="main"]');
                        if (!mainContent) {
                            window.history.back();
                            await sleep(2000);
                            return clickNext();
                        }

                        const realName = mainContent.querySelector('h1')?.innerText || "Người dùng";
                        const introText = mainContent.innerText.toLowerCase();

                        // A. Kiểm tra Vị trí
                        const hasValidLocation = locations.some(loc => {
                            const pattern = new RegExp(`(sống tại|đến từ|ở|từ).*${loc}`, 'i');
                            return pattern.test(introText);
                        });

                        // B. Quét Bạn bè & Người theo dõi
                        let friends = 0;
                        let followers = 0;

                        mainContent.querySelectorAll('a, span').forEach(el => {
                            const txt = el.innerText.toLowerCase();
                            if ((txt.includes('người bạn') || txt.includes('bạn bè')) && !txt.includes('chung')) {
                                const match = txt.match(/([\d.,]+)\s*([k]?)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                                    if (match[2] === 'k') n *= 1000;
                                    friends = Math.max(friends, Math.round(n));
                                }
                            }
                            if (txt.includes('người theo dõi')) {
                                const match = txt.match(/([\d.,]+)\s*([k]?)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                                    if (match[2] === 'k') n *= 1000;
                                    followers = Math.max(followers, Math.round(n));
                                }
                            }
                        });

                        const passStats = (friends >= 500 || followers >= 700);
                        const passLoc = hasValidLocation;

                        if (passLoc && passStats) {
                            const addBtn = Array.from(mainContent.querySelectorAll('div[role="button"], div[aria-label="Thêm bạn bè"]'))
                                .find(btn => (btn.innerText.includes("Thêm bạn bè") || btn.getAttribute('aria-label') === "Thêm bạn bè") 
                                             && !btn.innerText.includes("Nhắn tin"));

                            if (addBtn) {
                                addBtn.click();
                                localSentCount++;
                                chrome.runtime.sendMessage({ type: "SUCCESS", name: realName, url: profileLink });
                            }
                        } else {
                            let reason = !passLoc ? "Sai khu vực" : `dưới (Bạn bè: ${friends}, Người theo dõi: ${followers})`;
                            chrome.runtime.sendMessage({ type: "SKIPPED", name: realName, reason: reason });
                        }
                    } catch (err) {
                        console.error("Lỗi script:", err);
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
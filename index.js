// ==================== Firebase 配置 ====================
const firebaseConfig = {
    apiKey: "AIzaSyAJUPZhafyM-0AS3_13h_o8LPWbupuhnro",
    authDomain: "loop-hint.firebaseapp.com",
    projectId: "loop-hint",
    storageBucket: "loop-hint.firebasestorage.app",
    messagingSenderId: "827511787053",
    appId: "1:827511787053:web:706d5ac50a343bc78d72a4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentDeckKey = null;
let currentIndex = 0;
let autoMode = false;
let timer = null;
let currentCards = [];
let editingDeckId = null;
let editingCardId = null;
let sortableInstance = null;   // Sortable.js 实例
let deckEditing = false;
let deckReviewMode = false;
let deckReviewId = null;
let deckReviewData = null;

// ==================== DOM ====================
const frontEl = document.getElementById('front');
const counterEl = document.getElementById('counter');
const deckTitleEl = document.getElementById('deckTitle');

// ==================== 分类管理（支持拖拽排序） ====================
// ==================== 分类管理（支持拖拽排序） ====================


// ---------- 加载分类 ----------
async function loadDecks() {

    const bubbles = document.getElementById('bubbles');
    bubbles.innerHTML = '';

    const snapshot = await db.collection('decks')
        .orderBy('order', 'asc')
        .get();

    snapshot.forEach(doc => {

        const deck = doc.data();

        // hidden=true 的分类不显示在主页，但仍保留在 Firestore
        if (deck.hidden === true) return;

        const div = document.createElement('div');

        div.className = 'bubble';
        div.dataset.id = doc.id;

        div.style.background = '';

        div.innerHTML = `
            <span style="font-size:2.6rem;margin-bottom:8px;">
                ${deck.icon || '📌'}
            </span>
            <div>${deck.name}</div>
        `;

        // ==========================
        // 长按相关
        // ==========================

        let mouseTimer = null;
        let touchTimer = null;
        let longPressed = false;

        // ---------- PC ----------
        div.addEventListener("mousedown", () => {

            longPressed = false;

            mouseTimer = setTimeout(() => {

                longPressed = true;

                editDeck(doc.id);

            }, 700);

        });

        div.addEventListener("mouseup", () => {

            clearTimeout(mouseTimer);

        });

        div.addEventListener("mouseleave", () => {

            clearTimeout(mouseTimer);

        });

        // ---------- 手机 ----------
        div.addEventListener("touchstart", () => {

            longPressed = false;

            touchTimer = setTimeout(() => {

                longPressed = true;

                navigator.vibrate?.(20);

                editDeck(doc.id);

            }, 700);

        }, { passive: true });

        div.addEventListener("touchend", () => {

            clearTimeout(touchTimer);

        }, { passive: true });

        div.addEventListener("touchcancel", () => {

            clearTimeout(touchTimer);

        }, { passive: true });

        div.addEventListener("touchmove", () => {

            clearTimeout(touchTimer);

        }, { passive: true });

        // ==========================
        // 点击进入分类
        // ==========================

        div.addEventListener("click", (e) => {

            // 长按后阻止 click
            if (longPressed) {

                e.preventDefault();
                e.stopPropagation();

                longPressed = false;

                return;
            }

            if (!e.target.classList.contains('action-btn')) {

                // 点击分类：先阅读分类笔记，再进入复习
                showDeckReview(doc.id, deck);

            }

        });

        bubbles.appendChild(div);

    });

    // 最后一个 Bubble：管理已隐藏分类
    const managerBubble = document.createElement('div');
    managerBubble.className = 'bubble hidden-manager-bubble';
    managerBubble.dataset.managerBubble = 'true';
    managerBubble.innerHTML = `
        <span style="font-size:2.6rem;margin-bottom:8px;">⋮</span>
        <div>管理隐藏分类</div>
    `;
    managerBubble.addEventListener('click', () => {
        showHiddenDeckModal();
    });
    bubbles.appendChild(managerBubble);

    // DOM 完成后初始化拖拽
    requestAnimationFrame(initSortable);

}


// ---------- 初始化拖拽（唯一入口） ----------
function initSortable() {
    if (isMobileDevice()) return;

    const el = document.getElementById('bubbles');
    if (!el) return;

    if (sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = new Sortable(el, {
        animation: 180,

        draggable: '.bubble:not(.hidden-manager-bubble)',

        dataIdAttr: 'data-id',

        // ⭐关键三件套
        handle: '.bubble',
        ignore: '.action-btn',
        forceFallback: true,

        ghostClass: 'sortable-ghost',
        chosenClass: 'dragging',

        onEnd: updateDeckOrders
    });

    console.log('💻 桌面端拖拽排序已启用');
}


// ---------- 保存排序到 Firebase ----------
async function updateDeckOrders() {
    if (!sortableInstance) return;

    const order = sortableInstance.toArray();

    if (!order || order.length === 0) return;

    const batch = db.batch();

    order.forEach((deckId, index) => {
        if (!deckId) return;

        batch.update(db.collection('decks').doc(deckId), {
            order: index
        });
    });

    try {
        await batch.commit();
        console.log('✅ 分类排序已保存');
    } catch (e) {
        console.error('排序保存失败:', e);
        alert('排序保存失败，请刷新重试');
    }
}


// ---------- 删除deck ----------
async function deleteCurrentDeck(){

    if(!editingDeckId) return;

    if(!confirm("确定删除整个分类？\n所有卡片都会删除！"))
        return;

    await db.collection("decks")
        .doc(editingDeckId)
        .delete();

    const snap = await db.collection("cards")
        .where("deckId","==",editingDeckId)
        .get();

    const batch=db.batch();

    snap.forEach(doc=>batch.delete(doc.ref));

    await batch.commit();

    hideDeckModal();

    loadDecks();
}
// ---------- 判断设备 ----------
function isMobileDevice() {
    return (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(navigator.userAgent) ||
        window.innerWidth <= 768
    );
}



function showAddDeckModal() {

    editingDeckId = null;
    deckReviewMode = false;
    deckReviewId = null;
    deckReviewData = null;

    const modal = document.getElementById("deckModal");
    modal.classList.remove("deck-review-mode");
    document.getElementById("deckName").readOnly = false;
    document.getElementById("deckIcon").readOnly = false;
    document.getElementById("deckNote").readOnly = false;
    document.getElementById("deckGoBtn").style.display = "none";
    document.getElementById("deckCheckin").style.display = "none";

    document.getElementById("modalTitle").textContent = "新建分类";
    document.getElementById("saveBtn").textContent = "创建";

    document.getElementById("deckName").value = "";
    document.getElementById("deckIcon").value = "";
    document.getElementById("deckNote").value = "";

    const goalEl = document.getElementById("deckCheckinGoal");
    const goalInput = document.getElementById("deckCheckinGoalInput");
    if (goalEl) {
        goalEl.textContent = `目标：${DEFAULT_DAILY_GOAL}`;
        goalEl.style.display = "block";
    }
    if (goalInput) {
        goalInput.value = DEFAULT_DAILY_GOAL;
        goalInput.style.display = "none";
    }

    // 新建时隐藏删除按钮
    document.getElementById("deleteDeckBtn").style.display = "none";

    document.getElementById("deckModal").style.display = "flex";
}

async function editDeck(deckId) {

    editingDeckId = deckId;
    deckReviewMode = false;
    deckReviewId = null;
    deckReviewData = null;

    const modal = document.getElementById("deckModal");
    modal.classList.remove("deck-review-mode");
    document.getElementById("deckName").readOnly = false;
    document.getElementById("deckIcon").readOnly = false;
    document.getElementById("deckNote").readOnly = false;
    document.getElementById("deckGoBtn").style.display = "none";
    document.getElementById("deckCheckin").style.display = "block";

    const doc = await db.collection("decks")
        .doc(deckId)
        .get();

    const deck = doc.data();

    document.getElementById("modalTitle").textContent = "编辑Deck";
    document.getElementById("saveBtn").textContent = "✔";

    document.getElementById("deckName").value = deck.name || "";
    document.getElementById("deckIcon").value = deck.icon || "";
    document.getElementById("deckNote").value = deck.note || "";

    // 编辑时显示删除按钮
    document.getElementById("deleteDeckBtn").style.display = "block";

    document.getElementById("deckModal").style.display = "flex";
    await loadDeckCheckin();
}

// ==================== 复习前阅读分类笔记 ====================

function showDeckReview(deckId, deck) {
    deckReviewMode = true;
    deckReviewId = deckId;
    deckReviewData = deck;

    const modal = document.getElementById("deckModal");
    modal.classList.add("deck-review-mode");

    document.getElementById("modalTitle").textContent =
        `${deck.icon || "📌"} ${deck.name || "分类"}`;

    document.getElementById("deckName").value = deck.name || "";
    document.getElementById("deckIcon").value = deck.icon || "";
    document.getElementById("deckNote").value = deck.note || "";

    document.getElementById("deckName").readOnly = true;
    document.getElementById("deckIcon").readOnly = true;
    document.getElementById("deckNote").readOnly = true;

    document.getElementById("deleteDeckBtn").style.display = "none";
    document.getElementById("saveBtn").style.display = "none";
    document.getElementById("deckGoBtn").style.display = "flex";
    document.getElementById("deckCheckin").style.display = "block";

    modal.style.display = "flex";
    loadDeckCheckin();
}

function goFromDeckReview() {
    if (!deckReviewMode || !deckReviewId || !deckReviewData) return;

    const deckId = deckReviewId;
    const deck = deckReviewData;

    hideDeckModal();
    startPlayer(deckId, deck);
}

// 阅读模式下：点击模态框遮罩区域即可取消，不需要单独的“取消”按钮
const deckModal = document.getElementById("deckModal");
if (deckModal) {
    deckModal.addEventListener("click", (e) => {
        if (deckReviewMode && e.target === deckModal) {
            hideDeckModal();
        }
    });
}

async function saveDeck() {

    const name = document.getElementById("deckName").value.trim();

    const icon =
        document.getElementById("deckIcon").value.trim() || "📌";

    const note =
        document.getElementById("deckNote").value.trim();

    if (!name) {
        return alert("分类名称不能为空");
    }

    try {

        // ===== 编辑 =====
        if (editingDeckId) {

            await db.collection("decks")
                .doc(editingDeckId)
                .update({
                    name,
                    icon,
                    note
                });

        } else {

            // ===== 新建 =====
            const snap = await db.collection("decks")
                .orderBy("order", "desc")
                .limit(1)
                .get();

            let maxOrder = 0;

            if (!snap.empty) {
                maxOrder =
                    (snap.docs[0].data().order || 0) + 1;
            }

            await db.collection("decks").add({

                name,

                icon,

                note,

                dailyGoal: DEFAULT_DAILY_GOAL,

                color: "#2f80ed",

                order: maxOrder,

                hidden: false,

                createdAt:
                    firebase.firestore.FieldValue.serverTimestamp()

            });

        }

        hideDeckModal();

        loadDecks();

    } catch (e) {

        alert("保存失败：" + e.message);

    }

}

// ==================== 分类显示/隐藏管理 ====================

async function toggleEditingDeckHidden() {
    if (!editingDeckId) return;
    try {
        const ref = db.collection("decks").doc(editingDeckId);
        const snap = await ref.get();
        if (!snap.exists) return;

        const deck = snap.data();
        await ref.update({ hidden: deck.hidden !== true });
        hideDeckModal();
        await loadDecks();
    } catch (e) {
        alert("更新分类显示状态失败：" + e.message);
    }
}

async function showHiddenDeckModal() {
    const list = document.getElementById("hiddenDeckList");
    const empty = document.getElementById("hiddenDeckEmpty");
    list.innerHTML = "";
    empty.style.display = "none";

    try {
        const snapshot = await db.collection("decks")
            .orderBy("order", "asc")
            .get();

        const hiddenDecks = snapshot.docs.filter(doc => doc.data().hidden === true);

        if (hiddenDecks.length === 0) {
            empty.style.display = "block";
        } else {
            hiddenDecks.forEach(doc => {
                const deck = doc.data();
                const item = document.createElement("div");
                item.className = "hidden-deck-item";
                item.innerHTML = `
                    <div class="hidden-deck-info">
                        <span class="hidden-deck-icon">${deck.icon || "📌"}</span>
                        <span class="hidden-deck-name">${deck.name || "未命名分类"}</span>
                    </div>
                    <button class="hidden-deck-show-btn" onclick="restoreHiddenDeck('${doc.id}')">显示</button>
                `;
                list.appendChild(item);
            });
        }

        document.getElementById("hiddenDeckModal").style.display = "flex";
    } catch (e) {
        alert("加载隐藏分类失败：" + e.message);
    }
}

function hideHiddenDeckModal() {
    document.getElementById("hiddenDeckModal").style.display = "none";
}

async function restoreHiddenDeck(deckId) {
    try {
        await db.collection("decks").doc(deckId).update({ hidden: false });
        await showHiddenDeckModal();
        await loadDecks();
    } catch (e) {
        alert("恢复分类失败：" + e.message);
    }
}


// ==================== 分类每日打卡 ====================
// 打卡数据只存 Firestore，不使用 localStorage。
// 数据结构：decks/{deckId}/checkins/{YYYY-MM-DD}
const CHECKIN_HISTORY_DAYS = 365;
const DEFAULT_DAILY_GOAL = "今天完成了吗";
let checkinWeekOffset = 0;
let currentCheckinCompletedDates = new Set();

function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseLocalDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function getActiveCheckinDeckId() {
    return deckReviewMode ? deckReviewId : editingDeckId;
}

function getStartOfWeek(date = new Date()) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - result.getDay());
    return result;
}

function getCheckinWeekDates() {
    const start = getStartOfWeek(new Date());
    start.setDate(start.getDate() + (checkinWeekOffset * 7));

    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
    });
}

function renderDeckCheckin(completedDates) {
    const calendar = document.getElementById("deckCheckinCalendar");
    const streakEl = document.getElementById("deckCheckinStreak");
    const todayBtn = document.getElementById("deckCheckinTodayBtn");
    const weekLabel = document.getElementById("deckCheckinWeekLabel");

    if (!calendar || !streakEl || !todayBtn) return;

    currentCheckinCompletedDates = new Set(completedDates);

    const todayKey = getLocalDateKey();
    const streak = calculateCurrentStreak(completedDates);

    streakEl.textContent = `连续坚持 ${streak} 天`;

    if (completedDates.has(todayKey)) {
        todayBtn.textContent = "✅ 今日已完成";
        todayBtn.classList.add("completed");
    } else {
        todayBtn.textContent = "🏆点击打卡";
        todayBtn.classList.remove("completed");
    }

    const weekDates = getCheckinWeekDates();
    const firstDate = weekDates[0];
    const lastDate = weekDates[6];

    if (weekLabel) {
        const sameMonth =
            firstDate.getFullYear() === lastDate.getFullYear() &&
            firstDate.getMonth() === lastDate.getMonth();

        if (sameMonth) {
            weekLabel.textContent =
                `${firstDate.getFullYear()}年${firstDate.getMonth() + 1}月${firstDate.getDate()}日–${lastDate.getDate()}日`;
        } else {
            weekLabel.textContent =
                `${firstDate.getFullYear()}/${firstDate.getMonth() + 1}/${firstDate.getDate()} – ` +
                `${lastDate.getFullYear()}/${lastDate.getMonth() + 1}/${lastDate.getDate()}`;
        }
    }

    // 周视图：始终只显示周日～周六 7 天
    calendar.innerHTML = "";

    weekDates.forEach(date => {
        const dateKey = getLocalDateKey(date);
        const isCompleted = completedDates.has(dateKey);
        const isFuture = dateKey > todayKey;

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `checkin-cell ${isCompleted ? "level-1" : "level-0"}`;
        cell.textContent = date.getDate();

        if (isFuture) {
            cell.classList.add("future");
            cell.disabled = true;
        }

        if (dateKey === todayKey) {
            cell.classList.add("today");
        }

        cell.title = `${dateKey} · ${isCompleted ? "已完成" : "未完成"}`;
        cell.setAttribute("aria-label", cell.title);

        if (!isFuture) {
            cell.addEventListener("click", () => toggleCheckinDate(dateKey));
        }

        calendar.appendChild(cell);
    });

    // 不允许翻到未来周
    const nextWeekBtn = document.querySelector(
        '.deck-checkin-week-btn[aria-label="下一周"]'
    );
    if (nextWeekBtn) {
        nextWeekBtn.disabled = checkinWeekOffset >= 0;
    }
}

function calculateCurrentStreak(completedDates) {
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    while (completedDates.has(getLocalDateKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

function changeCheckinWeek(delta) {
    const nextOffset = checkinWeekOffset + delta;

    // 当前周是 0，未来周不允许查看
    if (nextOffset > 0) return;

    checkinWeekOffset = nextOffset;
    renderDeckCheckin(currentCheckinCompletedDates);
}

function resetCheckinWeekView() {
    checkinWeekOffset = 0;
}

function renderCheckinGoal(goal, editable) {
    const goalEl = document.getElementById("deckCheckinGoal");
    const inputEl = document.getElementById("deckCheckinGoalInput");

    if (!goalEl || !inputEl) return;

    goalEl.textContent = `目标：${goal || DEFAULT_DAILY_GOAL}`;
    goalEl.classList.toggle("editable", editable);
    goalEl.title = editable ? "点击编辑每日目标" : "";

    if (editable) {
        goalEl.style.display = "block";
    } else {
        goalEl.style.display = "block";
        inputEl.style.display = "none";
    }
}

function startEditCheckinGoal() {
    if (deckReviewMode || !editingDeckId) return;

    const goalEl = document.getElementById("deckCheckinGoal");
    const inputEl = document.getElementById("deckCheckinGoalInput");
    if (!goalEl || !inputEl) return;

    const currentGoal =
        goalEl.textContent.replace(/^目标：/, "").trim() ||
        DEFAULT_DAILY_GOAL;

    inputEl.value = currentGoal;
    goalEl.style.display = "none";
    inputEl.style.display = "block";
    inputEl.focus();
    inputEl.select();
}

function handleCheckinGoalKeydown(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        event.target.blur();
    }

    if (event.key === "Escape") {
        event.preventDefault();
        const goalEl = document.getElementById("deckCheckinGoal");
        const inputEl = document.getElementById("deckCheckinGoalInput");
        if (goalEl && inputEl) {
            inputEl.value =
                goalEl.textContent.replace(/^目标：/, "").trim() ||
                DEFAULT_DAILY_GOAL;
            inputEl.style.display = "none";
            goalEl.style.display = "block";
        }
    }
}

async function finishEditCheckinGoal() {
    const inputEl = document.getElementById("deckCheckinGoalInput");
    const goalEl = document.getElementById("deckCheckinGoal");

    if (!inputEl || !goalEl || inputEl.style.display === "none") return;
    if (!editingDeckId || deckReviewMode) return;

    const goal = inputEl.value.trim() || DEFAULT_DAILY_GOAL;

    inputEl.disabled = true;

    try {
        await db.collection("decks")
            .doc(editingDeckId)
            .update({ dailyGoal: goal });

        goalEl.textContent = `目标：${goal}`;
        inputEl.style.display = "none";
        goalEl.style.display = "block";
    } catch (e) {
        alert("保存每日目标失败：" + e.message);
        inputEl.style.display = "none";
        goalEl.style.display = "block";
    } finally {
        inputEl.disabled = false;
    }
}

async function loadDeckCheckin() {
    const deckId = getActiveCheckinDeckId();
    const panel = document.getElementById("deckCheckin");

    if (!deckId || !panel) {
        if (panel) panel.style.display = "none";
        return;
    }

    panel.style.display = "block";
    resetCheckinWeekView();

    try {
        const deckSnap = await db.collection("decks")
            .doc(deckId)
            .get();

        const deckData = deckSnap.exists ? deckSnap.data() : {};
        renderCheckinGoal(
            deckData.dailyGoal || DEFAULT_DAILY_GOAL,
            !deckReviewMode && !!editingDeckId
        );

        const snapshot = await db.collection("decks")
            .doc(deckId)
            .collection("checkins")
            .orderBy("date", "desc")
            .limit(CHECKIN_HISTORY_DAYS)
            .get();

        const completedDates = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();
            const dateKey = data.date || doc.id;
            if (data.completed !== false) {
                completedDates.add(dateKey);
            }
        });

        renderDeckCheckin(completedDates);
    } catch (e) {
        console.error("加载打卡记录失败:", e);
        const streakEl = document.getElementById("deckCheckinStreak");
        if (streakEl) streakEl.textContent = "打卡数据加载失败";
    }
}

async function toggleTodayCheckin() {
    await toggleCheckinDate(getLocalDateKey());
}

async function toggleCheckinDate(dateKey) {
    const deckId = getActiveCheckinDeckId();
    if (!deckId) return;

    const ref = db.collection("decks")
        .doc(deckId)
        .collection("checkins")
        .doc(dateKey);

    try {
        const snap = await ref.get();

        if (snap.exists && snap.data().completed !== false) {
            await ref.delete();
        } else {
            await ref.set({
                date: dateKey,
                completed: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        await loadDeckCheckin();
    } catch (e) {
        console.error("保存打卡失败:", e);
        alert("打卡保存失败：" + e.message);
    }
}

async function deleteDeckCheckins(deckId) {
    if (!deckId) return;

    const snapshot = await db.collection("decks")
        .doc(deckId)
        .collection("checkins")
        .get();

    if (snapshot.empty) return;

    // 目前热图只保留最近一年，但删除时按 Firestore Batch 上限分批处理
    const docs = snapshot.docs;
    const BATCH_SIZE = 500;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

function hideDeckModal() {
    const modal = document.getElementById('deckModal');
    modal.style.display = 'none';

    deckReviewMode = false;
    deckReviewId = null;
    deckReviewData = null;

    modal.classList.remove("deck-review-mode");
    document.getElementById("deckName").readOnly = false;
    document.getElementById("deckIcon").readOnly = false;
    document.getElementById("deckNote").readOnly = false;
    document.getElementById("deckGoBtn").style.display = "none";
    document.getElementById("deckCheckin").style.display = "none";

    const goalInput = document.getElementById("deckCheckinGoalInput");
    const goalEl = document.getElementById("deckCheckinGoal");
    if (goalInput) {
        goalInput.value = "";
        goalInput.style.display = "none";
    }
    if (goalEl) {
        goalEl.style.display = "block";
    }

    currentCheckinCompletedDates = new Set();
    resetCheckinWeekView();

    document.getElementById("saveBtn").style.display = "";
}

async function deleteCurrentDeck() {

    if (!editingDeckId) return;

    const ok = confirm(
`确定删除整个分类？

该分类下所有卡片都会一起删除！

此操作不可恢复。`
    );

    if (!ok) return;

    try {

        const deckIdToDelete = editingDeckId;

        // 删除分类下的打卡记录（Firestore 不会自动级联删除子集合）
        await deleteDeckCheckins(deckIdToDelete);

        // 删除分类
        await db.collection("decks")
            .doc(deckIdToDelete)
            .delete();

        // 查询所有卡片
        const snap = await db.collection("cards")
            .where("deckId","==",editingDeckId)
            .get();

        // 批量删除
        const batch = db.batch();

        snap.forEach(doc=>{
            batch.delete(doc.ref);
        });

        await batch.commit();

        hideDeckModal();

        await loadDecks();

    }
    catch(e){

        alert("删除失败：" + e.message);

    }

}

// ==================== 批量导入 ====================
function openImportModal() {
    document.getElementById('importModal').style.display = 'flex';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

async function confirmImport() {

    if (!currentDeckKey) {
        alert('请先进入一个分类');
        return;
    }

    const text = document
        .getElementById('importText')
        .value;

    if (!text.trim()) {
        alert('请输入内容');
        return;
    }

    // 预处理
    const rawLines = text
        .split(/\r?\n/)
        .map(v => v.trim())
        .filter(Boolean);

    // 自动去重
    const lines = [...new Set(rawLines)];

    if (lines.length === 0) {
        alert('没有可导入内容');
        return;
    }

    const removedCount = rawLines.length - lines.length;

    const preview = lines
        .slice(0, 20)
        .join('\n');

    const ok = confirm(
`准备导入

原始条数：${rawLines.length}
去重后：${lines.length}
移除重复：${removedCount}

预览：

${preview}

${lines.length > 20 ? '\n......' : ''}

确定导入？`
    );

    if (!ok) return;

    try {

        // Firestore Batch 上限 500
        const BATCH_SIZE = 500;

        for (let i = 0; i < lines.length; i += BATCH_SIZE) {

            const batch = db.batch();

            const chunk = lines.slice(
                i,
                i + BATCH_SIZE
            );

            chunk.forEach(front => {

                const ref = db.collection('cards').doc();

                batch.set(ref, {
                    deckId: currentDeckKey,
                    front,
                    weight: 0,
                    createdAt:
                        firebase.firestore.FieldValue.serverTimestamp()
                });

            });

            await batch.commit();

            console.log(
                `已提交 ${Math.min(i + BATCH_SIZE, lines.length)}/${lines.length}`
            );
        }

        closeImportModal();

        document.getElementById('importText').value = '';

        alert(
            `✅ 成功导入 ${lines.length} 张卡片\n\n已自动去除 ${removedCount} 条重复内容`
        );

        await loadCards();

    } catch (err) {

        console.error(err);

        alert(
            '导入失败：' +
            (err.message || err)
        );

    }
}

// ==================== 播放器功能 ====================
async function startPlayer(deckId, deck) {
    currentDeckKey = deckId;
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('player').classList.add('active');
    deckTitleEl.textContent = deck.name;
    currentIndex = 0;
    await loadCards();
    initMobileGesture();
}

function backToMenu() {
    if (autoMode) toggleAuto();
    // 强制退出沉浸模式
    immersiveMode = false;
    document.body.classList.remove('immersive', 'show-ui');
    destroyWeightHUD();
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    sortCardsByPriority();
    currentIndex = 0;
    document.getElementById('player').classList.remove('active');
    document.getElementById('mainMenu').classList.add('active');
}

async function loadCards() {
    const snapshot = await db.collection('cards').where('deckId', '==', currentDeckKey).get();
    currentCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    sortCardsByPriority();
    renderCard();
}

// ==================== 新版 renderCard（微信读书风格）===================
function renderCard() {
    if (currentCards.length === 0) {
        frontEl.textContent = "暂无卡片，请添加卡片";
        counterEl.textContent = "0 / 0";
        return;
    }

    const card = currentCards[currentIndex];
    const cardEl = document.querySelector('.card');

    // ==================== 卡牌分级 ====================
    cardEl.classList.remove('favorite', 'epic', 'mythic');
    const weight = card.weight || 0;

    if (weight >= 50) {
        cardEl.classList.add('mythic');
    } else if (weight >= 25) {
        cardEl.classList.add('epic');
    } else if (weight >= 15) {
        cardEl.classList.add('favorite');
    }
    cardEl.classList.add('shimmer');

    // ==================== 内容渲染 ====================
    let html = card.front || '';
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/\[\[(.*?)\]\]/g, '<span class="big">$1</span>');
    html = html.replace(/\{\{(.*?)\}\}/g, '<span class="highlight">$1</span>');
    html = html.replace(/__(.*?)__/g, '<span class="underline">$1</span>');
    html = html.replace(/!!(.*?)!!/g, '<span class="danger">$1</span>');
    html = html.replace(/\*\*(.*?)\*\*/g,'<span class="bold">$1</span>');

  html = html.replace(
    /((?:\|.*\|\s*(?:<br>)?)+)/g,
    table => {

        const rows = table
            .trim()
            .split(/<br>/);

        let out = '<table class="card-table">';

        rows.forEach(row=>{

            out += "<tr>";

            row.split("|")
               .slice(1,-1)
               .forEach(cell=>{

                   out += `<td>${cell.trim()}</td>`;

               });

            out += "</tr>";
        });

        out += "</table>";

        return out;
    }
);
    frontEl.innerHTML = html;

    // 关键优化：固定字号 + 智能双栏
    requestAnimationFrame(() => {
        applySmartLayout();
    });

    // ==================== 计数器 ====================
    counterEl.textContent = `${currentIndex + 1} / ${currentCards.length}`;

    // ==================== 权重显示 ====================
    let text = `★${weight}`;
    if (weight >= 50) text = `👑 ${weight}`;
    else if (weight >= 25) text = `🔮 ${weight}`;
    else if (weight >= 15) text = `💎 ${weight}`;

    document.getElementById('weightBadge').textContent = text;
    updateWeightHUD();
}

function getCardLevelIcon(weight) {

    if (weight >= 50) {
        return { icon: "👑", className: "legend" };
    }

    if (weight >= 25) {
        return { icon: "🔮", className: "high" };
    }

    if (weight >= 15) {
        return { icon: "💎", className: "mid" };
    }

    return { icon: "⭐", className: "low" };
}

function applySmartLayout() {
    const content = frontEl;
    if (!content || isMobileDevice()) return;

    const container = content.parentElement;
    if (!container) return;

    // 重置为单列
    content.classList.remove("two-column");

    // 强制浏览器重排，获取单列真实高度
    const containerHeight = container.clientHeight;
    let singleColumnHeight = content.scrollHeight;

    const textLength = content.innerText.trim().length;

    // ==================== 决策逻辑 ====================

    // 1. 极短内容（肯定能一眼看完）→ 保持单列
    if (textLength <= 280 && singleColumnHeight <= containerHeight * 1.05) {
        return;
    }

    // 2. 检测单列是否溢出（核心改进）
    const isOverflow = singleColumnHeight > containerHeight * 1.08; // 允许一点点容差

    if (isOverflow || textLength > 420) {
        // 切换到双栏
        content.classList.add("two-column");

        // 关键：切换布局后重新测量（异步，确保布局已生效）
        requestAnimationFrame(() => {
            const twoColumnHeight = content.scrollHeight;

            // 如果双栏后依然明显过长，就接受滚动（这是合理的）
            if (twoColumnHeight > containerHeight * 1.6) {
                // 可选：可以在这里进一步缩小字体或增加滚动提示
                console.log(`[SmartLayout] 长内容双栏滚动模式`);
            }
        });
    }
    // 否则保持单列（已确认不会溢出）
}






// ==================== 点击绑定（关键） ====================

document.querySelector('.card').addEventListener('click', () => {
    if (!isMobileDevice()) nextCard();
  
});

function nextCard() {
    if (currentCards.length === 0) return;
    
    animateCard('next', () => {
        const card = currentCards[currentIndex];
        card.lastViewedAt = Date.now();
        db.collection('cards').doc(card.id).update({ lastViewedAt: card.lastViewedAt });

        currentIndex = (currentIndex + 1) % currentCards.length;
    });
}

function prevCard() {
    if (currentCards.length === 0) return;
    
    animateCard('prev', () => {
        currentIndex = (currentIndex - 1 + currentCards.length) % currentCards.length;
    });
}

function toggleAuto() {
    autoMode = !autoMode;

    const btn = document.getElementById("autoBtn");

    btn.innerHTML = autoMode
        ? '<span class="icon">⏸</span>Pause'
        : '<span class="icon">▶</span>AutoPlay';

    if (autoMode) {
        const sec = parseFloat(document.getElementById("intervalInput").value) || 10;
        timer = setInterval(nextCard, sec * 1000);
    } else {
        clearInterval(timer);
    }
}

function sortCardsByPriority() {
    const now = Date.now();
    currentCards.sort((a, b) => {
        const weightA = a.weight || 0;
        const weightB = b.weight || 0;
        const lastA = a.lastViewedAt || 0;
        const lastB = b.lastViewedAt || 0;
        const deltaA = (now - lastA) / 1000 / 60;
        const deltaB = (now - lastB) / 1000 / 60;
        const scoreA = weightA * 100 + deltaA;
        const scoreB = weightB * 100 + deltaB;
        return scoreB - scoreA;
    });
}

async function showAddCardModal() {

    if (autoMode) toggleAuto();

    editingCardId = null;

    document.getElementById('cardModalTitle').textContent = '添加';
    document.getElementById('saveCardBtn').textContent = '✔️';

    document.getElementById('newFront').value = '';

    // ========= 加载所有卡组 =========
    const select = document.getElementById("cardDeckSelect");
    select.innerHTML = "";

    const snapshot = await db.collection("decks")
        .orderBy("order")
        .get();

    snapshot.forEach(doc => {

        const deck = doc.data();

        const option = document.createElement("option");

        option.value = doc.id;
        option.textContent =
            `${deck.icon || "📌"} ${deck.name}`;

        if(doc.id === currentDeckKey){
            option.selected = true;
        }

        select.appendChild(option);

    });

    document.getElementById('addCardModal').style.display = 'flex';
}

function hideAddCardModal() { 
    document.getElementById('addCardModal').style.display = 'none'; 
}

async function saveCard() {

    const front = document
        .getElementById('newFront')
        .value
        .trim();

    if (!front) {
        return alert("正面不能为空");
    }

    try {

        // ===== 编辑卡片 =====
        if (editingCardId) {

            const targetDeck =
           document.getElementById("cardDeckSelect").value;

           await db.collection("cards")
               .doc(editingCardId)
               .update({
                   front,
                   deckId: targetDeck
               });

            // 更新当前内存中的内容
            const card = currentCards.find(
                c => c.id === editingCardId
            );

            if (card) {
                card.front = front;
            }

            hideAddCardModal();

            if (targetDeck === currentDeckKey) {
                // 还在当前分类
                const card = currentCards.find(c => c.id === editingCardId);
                if (card) {
                    card.front = front;
                    card.deckId = targetDeck;
                }
                renderCard();
            } else {
                // 已移动到其它分类，从当前列表消失
                if (currentIndex > 0) currentIndex--;
                await loadCards();
            }
            return;
        }

        // ===== 新增卡片 =====
        const targetDeck =
    document.getElementById("cardDeckSelect").value;

        await db.collection("cards").add({
            deckId: targetDeck,
            front,
            weight: 0,
            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()
        });

        await loadCards();

        document.getElementById('newFront').value = '';
        document.getElementById('newFront').focus();

    } catch (e) {

        alert(
            '保存失败：' +
            e.message
        );

    }
}

async function editCurrentCard() {

    if (autoMode) toggleAuto();

    if (currentCards.length === 0) return;

    const card = currentCards[currentIndex];

    editingCardId = card.id;

    document.getElementById('cardModalTitle').textContent = '编辑';
    document.getElementById('saveCardBtn').textContent = '✔️';

    document.getElementById('newFront').value = card.front;

    // ===== 加载分类 =====
    const select = document.getElementById("cardDeckSelect");
    select.innerHTML = "";

    const snapshot = await db.collection("decks")
        .orderBy("order")
        .get();

    snapshot.forEach(doc => {

        const deck = doc.data();

        const option = document.createElement("option");

        option.value = doc.id;
        option.textContent =
            `${deck.icon || "📌"} ${deck.name}`;

        if (doc.id === card.deckId) {
            option.selected = true;
        }

        select.appendChild(option);

    });

    document.getElementById('addCardModal').style.display = 'flex';
}

async function deleteCurrentCard() {
    if (currentCards.length === 0) return;
    if (!confirm('确定删除这张卡片吗？')) return;
    try {
        const card = currentCards[currentIndex];
        await db.collection('cards').doc(card.id).delete();
        if (currentIndex > 0) currentIndex--;
        await loadCards();
    } catch (e) {
        alert('删除失败：' + e.message);
    }
}

function hideMoveCardModal() {
    document.getElementById('moveCardModal').style.display = 'none';
}

async function markImportant() {

    const card = currentCards[currentIndex];

    const newWeight = (card.weight || 0) + 1;

    await db.collection('cards')
        .doc(card.id)
        .update({ weight: newWeight });

    card.weight = newWeight;

    renderCard();

    playStarAnimation(newWeight);
}

async function markMastered() {

    const card = currentCards[currentIndex];

    const newWeight = Math.max(0, (card.weight || 0) - 1);

    await db.collection('cards')
        .doc(card.id)
        .update({ weight: newWeight });

    card.weight = newWeight;

    renderCard();

    playStarAnimation(newWeight);
}

async function editCurrentDeckNote() {

    if (!currentDeckKey) {
        alert("当前没有打开分类");
        return;
    }

    await editDeck(currentDeckKey);
  
}


async function moveCurrentCard() {
    if (autoMode) toggleAuto();
    if (currentCards.length === 0) return;
    const select = document.getElementById('moveDeckSelect');
    select.innerHTML = '';
    const snapshot = await db.collection('decks').get();
    snapshot.forEach(doc => {
        if (doc.id === currentDeckKey) return;
        const deck = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${deck.icon || '📌'} ${deck.name}`;
        select.appendChild(option);
    });
    document.getElementById('moveCardModal').style.display = 'flex';
}

function playStarAnimation(weight) {

    const flash = document.getElementById('starFlash');

    const { icon, className } = getCardLevelIcon(weight);

    flash.textContent = icon;

    flash.classList.remove(
        "active",
        "low",
        "mid",
        "high",
        "legend"
    );

    flash.classList.add(className);

    // 强制重绘
    void flash.offsetWidth;

    flash.classList.add("active");

    // ⭐关键：自动隐藏
    clearTimeout(flash._hideTimer);

    flash._hideTimer = setTimeout(() => {
        flash.classList.remove("active");
    }, 400); // 动画时长
}

async function confirmMoveCard() {
    try {
        const targetDeckId = document.getElementById('moveDeckSelect').value;
        if (!targetDeckId) return alert('请选择目标分类');
        const card = currentCards[currentIndex];
        await db.collection('cards').doc(card.id).update({ deckId: targetDeckId });
        hideMoveCardModal();
        if (currentIndex > 0) currentIndex--;
        await loadCards();
    } catch (e) {
        alert('移动失败：' + e.message);
    }
}

// ==================== 快捷键 & 其他功能 ====================
document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
        e.preventDefault();
    }
});

document.addEventListener("keydown", (e) => {

    const tag = document.activeElement.tagName;

    if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
    }

    switch (e.key) {

        // 权重
        case "+":
            markImportant();
            break;

        case "-":
            markMastered();
            break;

        // 翻页
        case "1":
            prevCard();
            break;

        case "3":
            nextCard();
            break;

        // WASD
        case "a":
        case "A":
            e.preventDefault();
            showAddCardModal();
            closeMenu();
            break;


        // 编辑
        case "e":
        case "E":
            editCurrentCard();
            break;

        // 沉浸模式
        case "r":
        case "R":
            e.preventDefault();
            toggleImmersiveMode();
            break;

        // 空格下一张
        case " ":
            e.preventDefault();
            nextCard();
            break;
    }
});

function cleanTextarea(id) {
    const el = document.getElementById(id);
    let text = el.value || '';
    text = text.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    el.value = text;
    el.style.transform = 'scale(1.01)';
    el.style.boxShadow = '0 0 0 2px #2f80ed';
    setTimeout(() => {
        el.style.transform = '';
        el.style.boxShadow = '';
    }, 180);
}

let activeTextarea = 'newFront';

function wrapSelection(before, after) {
    const textarea = document.getElementById(activeTextarea);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.slice(start, end);
    textarea.value = text.slice(0, start) + before + selected + after + text.slice(end);
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = end + before.length;
}
function insertOrderedList(){

    const textarea = document.getElementById(activeTextarea);

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const text = textarea.value;

    const selected = text.slice(start,end);

    const lines = selected.split("\n");

    const result = lines
        .map((line,i)=>`${i+1}. ${line}`)
        .join("\n");

    textarea.value =
        text.slice(0,start)
        + result
        + text.slice(end);

    textarea.focus();

    textarea.selectionStart = start;
    textarea.selectionEnd = start + result.length;
}


// ============================================================
// 沉浸模式
// ============================================================
// ============================================================
// 沉浸模式
// ============================================================
// ============================================================
// 沉浸模式
// ============================================================

let immersiveMode = false;
let weightHUD = null;
let uiTimer = null;
let moreBtn2 = null;


// ============================================================
// 沉浸模式 UI 容器
// ============================================================

function createImmersiveTools() {
    let container = document.getElementById("immersiveTools");

    if (!container) {
        container = document.createElement("div");
        container.id = "immersiveTools";

        Object.assign(container.style, {
            position: "fixed",
            top: "12px",
            right: "8%",
            zIndex: "1000000",
            display: "flex",
            alignItems: "center",
            gap: "2px"
        });

        document.body.appendChild(container);
    }

    return container;
}

function destroyImmersiveTools() {
    const container = document.getElementById("immersiveTools");

    if (container) {
        container.remove();
    }

    moreBtn2 = null;
    weightHUD = null;
}


// ============================================================
// 沉浸模式专用 More 按钮
// ============================================================

// 原 moreBtn 位于 .topbar 内，而沉浸模式会隐藏整个 .topbar，
// 因此复制一个 moreBtn2 到沉浸模式专用容器中。

function createImmersiveMoreBtn() {

    if (moreBtn2) return;

    const original = document.getElementById("moreBtn");

    if (!original) return;

    const container = createImmersiveTools();

    moreBtn2 = original.cloneNode(true);

    moreBtn2.id = "moreBtn2";
    moreBtn2.setAttribute("aria-label", "更多");

    // 不再单独 fixed，由 immersiveTools 统一控制位置
    Object.assign(moreBtn2.style, {
        position: "relative",
        top: "4px",
        right: "auto",
        zIndex: "auto",

        width: window.innerWidth <= 768 ? "40px" : "42px",
        height: window.innerWidth <= 768 ? "36px" : "38px",

        padding: "0",
        border: "none",

        background: "transparent",
        boxShadow: "none",
        color: "#fff",
        borderRadius: "100px",

        fontSize: "18px",
        lineHeight: "0",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        flexShrink: "0"
    });

    moreBtn2.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    container.appendChild(moreBtn2);
}

function destroyImmersiveMoreBtn() {

    if (moreBtn2) {
        moreBtn2.remove();
        moreBtn2 = null;
    }
}


// ============================================================
// 沉浸模式 UI 显示控制
// ============================================================

function showImmersiveUI() {

    document.body.classList.add("show-ui");

    clearTimeout(uiTimer);

    uiTimer = setTimeout(() => {
        document.body.classList.remove("show-ui");
    }, 1500);
}


// ============================================================
// 沉浸模式开关
// ============================================================

function toggleImmersiveMode() {

    immersiveMode = !immersiveMode;

    document.body.classList.toggle(
        "immersive",
        immersiveMode
    );

    if (immersiveMode) {

        // 创建沉浸模式专用 UI 容器
        createImmersiveTools();

        // 创建 More 按钮
        createImmersiveMoreBtn();

        // 创建 HUD
        createWeightHUD();

        // 显示一次 UI
        showImmersiveUI();

        // 强制同步一次
        updateWeightHUD();

        // 请求全屏
        if (document.documentElement.requestFullscreen) {
            document.documentElement
                .requestFullscreen()
                .catch(() => {});
        }

    } else {

        document.body.classList.remove("show-ui");

        clearTimeout(uiTimer);

        // 销毁整个沉浸模式 UI
        destroyImmersiveTools();

        // 退出全屏
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }
}


// ============================================================
// Weight HUD
// ============================================================

function createWeightHUD() {

    if (weightHUD) {
        weightHUD.remove();
    }

    const container = createImmersiveTools();

    const el = document.createElement("div");

    el.id = "weightHUD";
    el.className = "weight-hud immersive-hud";

    // HUD 不再自己 fixed
    // 位置由 #immersiveTools 统一控制
    Object.assign(el.style, {
        position: "relative",
        top: "auto",
        right: "auto",
        zIndex: "auto",
        flexShrink: "0"
    });

    container.appendChild(el);

    weightHUD = el;

    updateWeightHUD();
}


function destroyWeightHUD() {

    const hud = document.getElementById("weightHUD");

    if (hud) {
        hud.remove();
    }

    weightHUD = null;
}


// ============================================================
// 更新 Weight HUD
// ============================================================

function updateWeightHUD() {

    if (!weightHUD) return;

    const card = currentCards[currentIndex];
    const w = card?.weight || 0;

    let text = `★ ${w}`;

    weightHUD.classList.remove(
        "low",
        "mid",
        "high",
        "legend"
    );

    if (w >= 50) {

        text = `👑 ${w}`;
        weightHUD.classList.add("legend");

    } else if (w >= 30) {

        text = `🔮 ${w}`;
        weightHUD.classList.add("high");

    } else if (w >= 15) {

        text = `💎 ${w}`;
        weightHUD.classList.add("mid");

    } else {

        weightHUD.classList.add("low");
    }

    weightHUD.textContent = text;
}


// ============================================================
// 鼠标移动：显示沉浸模式 UI
// ============================================================

document.addEventListener("mousemove", () => {

    if (immersiveMode) {
        showImmersiveUI();
    }
});


// ============================================================
// 键盘快捷键
// R = 切换沉浸模式
// ============================================================

document.addEventListener("keydown", (e) => {

    const tag = document.activeElement?.tagName;

    if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
    }

    if (e.key === "r" || e.key === "R") {

        e.preventDefault();

        toggleImmersiveMode();
    }
});


// ============================================================
// 全屏状态变化
// ============================================================

document.addEventListener("fullscreenchange", () => {

    // 用户主动退出全屏
    if (!document.fullscreenElement) {

        immersiveMode = false;

        document.body.classList.remove(
            "immersive",
            "show-ui"
        );

        clearTimeout(uiTimer);

        destroyImmersiveTools();
    }
});


// ============================================================
// 手机端横屏自动进入沉浸模式
// 竖屏自动退出
// ============================================================

function syncLandscapeImmersiveMode() {

    const mobileUA =
        /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini/i
        .test(navigator.userAgent);

    if (!mobileUA) {
        return;
    }

    const isLandscape =
        window.matchMedia("(orientation: landscape)").matches;

    if (isLandscape && !immersiveMode) {

        toggleImmersiveMode();

    } else if (!isLandscape && immersiveMode) {

        toggleImmersiveMode();
    }
}


// ============================================================
// 监听屏幕方向变化
// ============================================================

window.addEventListener(
    "orientationchange",
    syncLandscapeImmersiveMode
);

window.addEventListener(
    "resize",
    syncLandscapeImmersiveMode
);


// 页面本身以横屏打开时也同步一次
window.addEventListener(
    "load",
    syncLandscapeImmersiveMode
);


// ============================================================
// More 菜单
// ============================================================

function toggleMenu() {

    const menu = document.getElementById("moreMenu");

    if (!menu) return;

    menu.classList.toggle("show");
}


function closeMenu() {

    const menu = document.getElementById("moreMenu");

    if (!menu) return;

    menu.classList.remove("show");
}


// ============================================================
// 点击其他区域关闭 More 菜单
// ============================================================

document.addEventListener("click", e => {

    const menu = document.getElementById("moreMenu");
    const moreBtn = document.getElementById("moreBtn");
    const moreBtn2 = document.getElementById("moreBtn2");

    if (!menu) return;

    const clickedMenu =
        menu.contains(e.target);

    const clickedMoreBtn =
        moreBtn && moreBtn.contains(e.target);

    const clickedMoreBtn2 =
        moreBtn2 && moreBtn2.contains(e.target);

    if (
        !clickedMenu &&
        !clickedMoreBtn &&
        !clickedMoreBtn2
    ) {
        menu.classList.remove("show");
    }
});



// ==================== 初始化 ====================
async function migrateOldDecks() {
    const snapshot = await db.collection('decks').get();
    let order = 0;
    const batch = db.batch();
    snapshot.forEach(doc => {
        if (doc.data().order === undefined) {
            batch.update(doc.ref, { order: order++ });
        }
    });
    if (snapshot.size > 0) await batch.commit();
}

window.onload = async () => {
    await migrateOldDecks();
    loadDecks();
};


// ==================== 手机手势 ====================
// ==================== 手机点击区域交互 ====================
// ==================== 手机手势 ====================
// ==================== 手机点击区域交互 ====================

let longPressTimer = null;
let lastCenterTap = 0;


// ==================== 手势状态 ====================

let touchStartX = 0;
let touchStartY = 0;

let gestureLocked = false;
// true = 判断为滚动，不允许翻页 / 点击

let moved = false;
// true = 手指发生明显移动


// ==================== 参数 ====================

const LONG_PRESS_TIME = 600;

// 长按时允许手指有轻微自然抖动
const MOVE_THRESHOLD = 15;


// ==================== 初始化 ====================

function initMobileGesture(){

    if(!isMobileDevice()) return;


    const playerCard = document.querySelector(".card");

    if(!playerCard) return;


    // 防止重复绑定
    if(playerCard.dataset.gestureBound) return;

    playerCard.dataset.gestureBound = "1";


    playerCard.addEventListener(
        "touchstart",
        handleTouchStart,
        { passive:true }
    );


    playerCard.addEventListener(
        "touchmove",
        handleTouchMove,
        { passive:true }
    );


    playerCard.addEventListener(
        "touchend",
        handleTouchEnd,
        { passive:true }
    );


    playerCard.addEventListener(
        "touchcancel",
        handleTouchCancel,
        { passive:true }
    );


    console.log("📱 手机三段式交互已启用");

}



// ==================== 按下 ====================

function handleTouchStart(e){

    const touch = e.changedTouches[0];

    if(!touch) return;


    const card = e.currentTarget;


    // =====================
    // 重置状态
    // =====================

    clearTimeout(longPressTimer);

    gestureLocked = false;
    moved = false;

    card.dataset.longPressed = "0";


    // =====================
    // 记录起点
    // =====================

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;


    // =====================
    // 判断触摸位置
    // =====================

    const rect =
        card.getBoundingClientRect();


    const y =
        touch.clientY - rect.top;


    const height =
        rect.height;


    const ratio =
        y / height;


    // ==========================
    // 中间 30%
    //
    // 25% ~ 55%
    //
    // 双击加星
    // 长按编辑
    // ==========================

    if(
        ratio >= 0.25 &&
        ratio <= 0.55
    ){

        longPressTimer = setTimeout(()=>{

            // 如果期间发生明显移动
            // 则不执行长按
            if(
                moved ||
                gestureLocked
            ){
                return;
            }


            navigator.vibrate?.(30);


            card.dataset.longPressed = "1";


            editCurrentCard();


        }, LONG_PRESS_TIME);

    }

}



// ==================== 移动 ====================

function handleTouchMove(e){

    const touch = e.changedTouches[0];

    if(!touch) return;


    const dx =
        touch.clientX - touchStartX;


    const dy =
        touch.clientY - touchStartY;


    const absX =
        Math.abs(dx);


    const absY =
        Math.abs(dy);


    // =====================
    // 轻微抖动
    //
    // 不取消长按
    // =====================

    if(
        absX < MOVE_THRESHOLD &&
        absY < MOVE_THRESHOLD
    ){

        return;

    }


    // =====================
    // 已发生明显移动
    // =====================

    moved = true;


    // 移动后取消长按
    clearTimeout(longPressTimer);


    // =====================
    // 判断滚动方向
    //
    // 垂直移动更明显
    // → 认为用户正在滚动
    // =====================

    if(absY > absX){

        gestureLocked = true;

    }

}



// ==================== 抬起 ====================

function handleTouchEnd(e){

    clearTimeout(longPressTimer);


    const card =
        e.currentTarget;


    // =====================
    // 长按结束
    // =====================

    if(
        card.dataset.longPressed === "1"
    ){

        card.dataset.longPressed = "0";

        gestureLocked = false;
        moved = false;

        return;

    }


    // =====================
    // 滚动 / 明显移动保护
    // =====================

    if(
        gestureLocked ||
        moved
    ){

        gestureLocked = false;
        moved = false;

        return;

    }


    // =====================
    // 获取点击位置
    // =====================

    const touch =
        e.changedTouches[0];

    if(!touch) return;


    const rect =
        card.getBoundingClientRect();


    const y =
        touch.clientY - rect.top;


    const height =
        rect.height;


    const ratio =
        y / height;



    // ==========================
    // 上33%
    //
    // 上一张
    // ==========================

    if(ratio < 0.33){

        navigator.vibrate?.(10);

        prevCard();

        return;

    }



    // ==========================
    // 下 33%
    //
    // 下一张
    // ==========================

    if(ratio > 0.66){

        navigator.vibrate?.(10);

        nextCard();

        return;

    }



    // ==========================
    // 中间 33%
    //
    // 双击 → 加星
    // ==========================

    const now =
        Date.now();


    if(
        now - lastCenterTap < 250
    ){

        lastCenterTap = 0;


        navigator.vibrate?.(20);


        markImportant();


        return;

    }


    // 第一次点击
    lastCenterTap = now;

}



// ==================== 触摸取消 ====================

function handleTouchCancel(e){

    clearTimeout(longPressTimer);


    e.currentTarget.dataset.longPressed = "0";


    gestureLocked = false;

    moved = false;

}


// ===================手机端手势操作部分结束 ====================
// ===================手机端手势操作部分结束 ====================


// 切卡动画效果实现

let animating = false;

function animateCard(direction, callback){

    const card = document.querySelector(".card");

    if(card.classList.contains("animating")) return;

    card.classList.add("animating");

    card.classList.remove(
        "exit-left",
        "exit-right",
        "enter-left",
        "enter-right",
        "active"
    );

    card.classList.add(
        direction === "next"
            ? "exit-left"
            : "exit-right"
    );

    setTimeout(()=>{

        callback();

        renderCard();

        card.classList.remove(
            "exit-left",
            "exit-right"
        );

        // 直接恢复，不做 enter 动画
        card.classList.add("active");

        card.classList.remove("animating");

    },80);

}


const moreBtn = document.getElementById("moreBtn");

moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
});

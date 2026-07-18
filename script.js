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

                startPlayer(doc.id, deck);

            }

        });

        bubbles.appendChild(div);

    });

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

        draggable: '.bubble',

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

    document.getElementById("modalTitle").textContent = "新建分类";
    document.getElementById("saveBtn").textContent = "创建";

    document.getElementById("deckName").value = "";
    document.getElementById("deckIcon").value = "";
    document.getElementById("deckNote").value = "";

    // 新建时隐藏删除按钮
    document.getElementById("deleteDeckBtn").style.display = "none";

    document.getElementById("deckModal").style.display = "flex";
}

async function editDeck(deckId) {

    editingDeckId = deckId;

    const doc = await db.collection("decks")
        .doc(deckId)
        .get();

    const deck = doc.data();

    document.getElementById("modalTitle").textContent = "编辑分类";
    document.getElementById("saveBtn").textContent = "保存修改";

    document.getElementById("deckName").value = deck.name || "";
    document.getElementById("deckIcon").value = deck.icon || "";
    document.getElementById("deckNote").value = deck.note || "";

    // 编辑时显示删除按钮
    document.getElementById("deleteDeckBtn").style.display = "block";

    document.getElementById("deckModal").style.display = "flex";
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

                color: "#2f80ed",

                order: maxOrder,

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

function hideDeckModal() { 
    document.getElementById('deckModal').style.display = 'none'; 
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

        // 删除分类
        await db.collection("decks")
            .doc(editingDeckId)
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
// 沉浸模式
let immersiveMode = false;
let weightHUD = null;
let uiTimer = null;

function showImmersiveUI() {
    document.body.classList.add('show-ui');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => document.body.classList.remove('show-ui'), 1500);
}

function toggleImmersiveMode() {
    immersiveMode = !immersiveMode;
    document.body.classList.toggle('immersive', immersiveMode);

    if (immersiveMode) {

        showImmersiveUI();

        // ✅ NEW: 创建 HUD
        createWeightHUD();

        // 强制同步一次
        updateWeightHUD();

        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }

    } else {

        document.body.classList.remove('show-ui');

        // ✅ NEW: 销毁 HUD
        destroyWeightHUD();

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    }
}

function createWeightHUD() {
    if (weightHUD) weightHUD.remove();

    const el = document.createElement("div");
    el.id = "weightHUD";

    el.className = "weight-hud immersive-hud";

    document.body.appendChild(el);

    weightHUD = el;

    updateWeightHUD(); // 初始化
}

function destroyWeightHUD() {

    const hud = document.getElementById('weightHUD');

    if(hud){
        hud.remove();
    }

    weightHUD = null;
}

function updateWeightHUD() {
    if (!weightHUD) return;

    const card = currentCards[currentIndex];
    const w = card?.weight || 0;

    let text = `★ ${w}`;

    weightHUD.classList.remove("low", "mid", "high", "legend");

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




document.addEventListener('mousemove', () => {
    if (immersiveMode) showImmersiveUI();
});

document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleImmersiveMode();
    }
});

document.addEventListener('fullscreenchange', () => {

    if (!document.fullscreenElement) {

        immersiveMode = false;

        document.body.classList.remove(
            'immersive',
            'show-ui'
        );

        destroyWeightHUD();
    }
});

function toggleMenu() {
    document.getElementById("moreMenu").classList.toggle("show");
}

function closeMenu() {
    document.getElementById("moreMenu").classList.remove("show");
}

document.addEventListener("click", e => {
    const menu = document.getElementById("moreMenu");
    const moreBtn = document.getElementById("moreBtn");
    if (!menu.contains(e.target) && !moreBtn.contains(e.target)) {
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

let lastCenterTap = 0;

function initMobileGesture() {

    if (!isMobileDevice()) return;

    const playerCard = document.querySelector(".card");
    if (!playerCard) return;

    if (playerCard.dataset.gestureBound) return;
    playerCard.dataset.gestureBound = "1";

    playerCard.addEventListener(
        "touchend",
        handleMobileTap,
        { passive: true }
    );

    console.log("📱 三分区点击模式已启用");
}

function handleMobileTap(e) {

    const touch = e.changedTouches[0];

    const rect = e.currentTarget.getBoundingClientRect();

    const x = touch.clientX - rect.left;
    const width = rect.width;

    // 三等分
    const leftEdge = width / 3;
    const rightEdge = width * 2 / 3;

    // 左侧：上一张
    if (x < leftEdge) {
        prevCard();
        navigator.vibrate?.(10);
        return;
    }

    // 右侧：下一张
    if (x > rightEdge) {
        nextCard();
        navigator.vibrate?.(10);
        return;
    }

    // 中间：双击加星
    const now = Date.now();

    if (now - lastCenterTap < 250) {

        lastCenterTap = 0;

        markImportant();

        navigator.vibrate?.(20);

        return;
    }

    lastCenterTap = now;

    // 中间单击不处理
}


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

let moreClickTimer = null;
let lastMoreClick = 0;

moreBtn.addEventListener("click", (e) => {

    e.stopPropagation();

    const now = Date.now();

    // 双击
    if (now - lastMoreClick < 250) {

        clearTimeout(moreClickTimer);

        lastMoreClick = 0;

        markImportant();

        navigator.vibrate?.(10);

        return;
    }

    lastMoreClick = now;

    // 单击延迟打开菜单
    moreClickTimer = setTimeout(() => {

        toggleMenu();

        lastMoreClick = 0;

    }, 250);

});

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
let showingBack = false;
let autoMode = false;
let timer = null;
let currentCards = [];
let editingDeckId = null;
let editingCardId = null;
let sortableInstance = null;   // Sortable.js 实例

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
        div.dataset.id = doc.id; // ⭐ Sortable key

        div.style.background = '';

        div.innerHTML = `
            <span style="font-size:2.6rem; margin-bottom:8px;">
                ${deck.icon || '📌'}
            </span>
            <div>${deck.name}</div>

            <div class="action-btn edit-btn"
                onclick="event.stopImmediatePropagation();
                editDeck('${doc.id}', '${deck.name}', '${deck.icon || ''}')">
            </div>

            <div class="action-btn delete-btn"
                onclick="event.stopImmediatePropagation();
                deleteDeck('${doc.id}')">
            </div>
        `;

        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('action-btn')) {
                startPlayer(doc.id, deck);
            }
        });

        bubbles.appendChild(div);
    });

    // ⭐ 确保 DOM 完成后再初始化
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
    document.getElementById('modalTitle').textContent = "新建分类";
    document.getElementById('saveBtn').textContent = "创建";
    document.getElementById('deckName').value = '';
    document.getElementById('deckIcon').value = '';
    document.getElementById('deckModal').style.display = 'flex';
}

function editDeck(deckId, name, icon) {
    editingDeckId = deckId;
    document.getElementById('modalTitle').textContent = "编辑分类";
    document.getElementById('saveBtn').textContent = "保存修改";
    document.getElementById('deckName').value = name;
    document.getElementById('deckIcon').value = icon;
    document.getElementById('deckModal').style.display = 'flex';
}

async function saveDeck() {
    const name = document.getElementById('deckName').value.trim();
    const icon = document.getElementById('deckIcon').value.trim() || '📌';
    if (!name) return alert("分类名称不能为空");

    try {
        if (editingDeckId) {
            await db.collection('decks').doc(editingDeckId).update({ name, icon });
        } else {
            const snap = await db.collection('decks').orderBy('order', 'desc').limit(1).get();
            let maxOrder = 0;
            if (!snap.empty) {
                maxOrder = (snap.docs[0].data().order || 0) + 1;
            }
            await db.collection('decks').add({
                name,
                icon,
                color: '#2f80ed',
                order: maxOrder,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        hideDeckModal();
        loadDecks();
    } catch (e) { 
        alert("保存失败: " + e.message); 
    }
}

function hideDeckModal() { 
    document.getElementById('deckModal').style.display = 'none'; 
}

async function deleteDeck(deckId) {
    if (!confirm('确定删除该分类吗？所有卡片也将被删除！')) return;
    await db.collection('decks').doc(deckId).delete();
    const snap = await db.collection('cards').where('deckId', '==', deckId).get();
    snap.forEach(doc => doc.ref.delete());
    await loadDecks();
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
    showingBack = false;
    await loadCards();
  initMobileGesture();
}

function backToMenu() {

    if (autoMode) toggleAuto();

    // 强制退出沉浸模式
    immersiveMode = false;

    document.body.classList.remove(
        'immersive',
        'show-ui'
    );

    destroyWeightHUD();

    if(document.fullscreenElement){
        document.exitFullscreen();
    }

    sortCardsByPriority();
    currentIndex = 0;

    document.getElementById('player')
        .classList.remove('active');

    document.getElementById('mainMenu')
        .classList.add('active');
}

async function loadCards() {
    const snapshot = await db.collection('cards').where('deckId', '==', currentDeckKey).get();
    currentCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    sortCardsByPriority();
    renderCard();
}



// ==================== renderCard ====================

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

    frontEl.innerHTML = html;

    // ==================== 溢出检测 ====================
    requestAnimationFrame(() => {
        frontEl.classList.remove('long-text');

        if (frontEl.scrollHeight > frontEl.parentElement.clientHeight) {
            frontEl.classList.add('long-text');
        }
    });

    // ==================== 计数器 ====================
    counterEl.textContent = `${currentIndex + 1} / ${currentCards.length}`;

    // ==================== 权重显示 神话史诗收藏 ====================
    let text = `★${weight}`;

    if (weight >= 50) {
        text = `👑 ${weight}`;
    } else if (weight >= 30) {
        text = `🔮 ${weight}`;
    } else if (weight >= 15) {
        text = `💎 ${weight}`;
    }

    document.getElementById('weightBadge').textContent = text;
    updateWeightHUD();
}



// ==================== 点击绑定（关键） ====================

document.querySelector('.card').addEventListener('click', () => {
    if (!isMobileDevice()) nextCard();
  
});



function handleCardAction() {
    nextCard();
}
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
    if (currentCards.length === 0) return;
    try {
        const card = currentCards[currentIndex];
        const newWeight = (card.weight || 0) + 1;
        await db.collection('cards').doc(card.id).update({ weight: newWeight });
        card.weight = newWeight;
        renderCard();
        playStarAnimation();
    } catch (e) {
        alert('更新权重失败：' + e.message);
    }
}

async function markMastered() {
    if (currentCards.length === 0) return;
    try {
        const card = currentCards[currentIndex];
        const newWeight = Math.max(0, (card.weight || 0) - 1);
        await db.collection('cards').doc(card.id).update({ weight: newWeight });
        card.weight = newWeight;
        renderCard();
    } catch (e) {
        alert('更新权重失败：' + e.message);
    }
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

function playStarAnimation() {
    const flash = document.getElementById('starFlash');
    flash.classList.remove('active');
    void flash.offsetWidth;
    flash.classList.add('active');
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
        handleCardAction();
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
            prevCard();
            break;

        case "d":
        case "D":
            nextCard();
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

let touchStartX = 0;
let touchStartY = 0;

let touchStartTime = 0;

let longPressTimer = null;

let lastTap = 0;
let tapTimer = null;
// 连点保护
let tapCount = 0;
let tapCountTimer = null;

function initMobileGesture(){

    if(!isMobileDevice()) return;

    const playerCard =
        document.querySelector('.card');

    if(!playerCard) return;

    if(playerCard.dataset.gestureBound){
        return;
    }

    playerCard.dataset.gestureBound = '1';

    playerCard.addEventListener(
        'touchstart',
        handleTouchStart,
        { passive:true }
    );

    playerCard.addEventListener(
        'touchend',
        handleTouchEnd,
        { passive:true }
    );

    console.log('📱 手势已启用');

  playerCard.addEventListener(
    'touchmove',
    handleTouchMove,
    { passive:true }
);
}

function handleTouchStart(e){

    const touch = e.changedTouches[0];

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    touchStartTime = Date.now();

    longPressTimer = setTimeout(() => {

        navigator.vibrate?.(20);

        editCurrentCard();

    }, 1000);
}

function handleTouchMove(e){

    const touch = e.changedTouches[0];

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    // 手指移动后取消长按
    if(
        Math.abs(dx) > 15 ||
        Math.abs(dy) > 15
    ){
        clearTimeout(longPressTimer);
    }
}

function handleTouchEnd(e){

    clearTimeout(longPressTimer);

    const touch = e.changedTouches[0];

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    const duration =
        Date.now() - touchStartTime;

    // 只要发生明显移动，就不是点击
    if(
        Math.abs(dx) > 15 ||
        Math.abs(dy) > 15
    ){

        // 左右滑动翻页
        if(
            Math.abs(dx) > 80 &&
            Math.abs(dx) > Math.abs(dy) * 1.5
        ){

            if(dx > 0){

                prevCard();

            }else{

                nextCard();
            }

            navigator.vibrate?.(10);
        }

        return;
    }

    // 长按触发编辑后不再执行点击逻辑
    if(duration > 1000){
        return;
    }

    const now = Date.now();

    // 双击加星
    if(now - lastTap < 300){

    clearTimeout(tapTimer);

    markImportant();

    navigator.vibrate?.(10);

    // ===== 连点模式 =====
    tapCount++;

    clearTimeout(tapCountTimer);

    tapCountTimer = setTimeout(() => {
        tapCount = 0;
    }, 1500);

    lastTap = 0;

    return;
}
    // 单击下一张
    lastTap = now;

    tapTimer = setTimeout(() => {

    // 最近1秒发生过连续加星
    if(tapCount > 0){
        return;
    }

    nextCard();

}, 300);
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


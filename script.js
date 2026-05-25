
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

// ==================== DOM ====================
const frontEl = document.getElementById('front');
const backEl = document.getElementById('back');

const counterEl = document.getElementById('counter');
const deckTitleEl = document.getElementById('deckTitle');
const progressEl = document.getElementById('progress');

document.getElementById('breathingLight')
    .classList.toggle('active', autoMode);

// ==================== 分类管理 ====================
async function loadDecks() {
    const bubbles = document.getElementById('bubbles');
    bubbles.innerHTML = '';

    const snapshot = await db.collection('decks').get();
    snapshot.forEach(doc => {
        const deck = doc.data();
        const div = document.createElement('div');
        div.className = 'bubble';
        div.style.background = `linear-gradient(135deg, ${deck.color || '#2f80ed'}, #1e5aa8)`;
        
        div.innerHTML = `
            <span style="font-size:2.6rem; margin-bottom:8px;">${deck.icon || '📌'}</span>
            <div>${deck.name}</div>
            <div class="action-btn edit-btn" onclick="event.stopImmediatePropagation(); editDeck('${doc.id}', '${deck.name}', '${deck.icon || ''}')">✏️</div>
            <div class="action-btn delete-btn" onclick="event.stopImmediatePropagation(); deleteDeck('${doc.id}')">×</div>
        `;
        
        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('action-btn')) startPlayer(doc.id, deck);
        });
        bubbles.appendChild(div);
    });
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
            await db.collection('decks').add({ name, icon, color: '#2f80ed', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
        hideDeckModal();
        loadDecks();
    } catch (e) { alert("保存失败: " + e.message); }
}

function hideDeckModal() { document.getElementById('deckModal').style.display = 'none'; }

async function deleteDeck(deckId) {
    if (!confirm('确定删除该分类吗？所有卡片也将被删除！')) return;
    await db.collection('decks').doc(deckId).delete();
    const snap = await db.collection('cards').where('deckId', '==', deckId).get();
    snap.forEach(doc => doc.ref.delete());
    loadDecks();
}

// ==================== CSV 批量导入 ====================
// ==================== CSV / TXT / TSV 批量导入 ====================
async function importCSV(e) {

    const file = e.target.files[0];

    if (!file) return;

    const ext = file.name
        .split('.')
        .pop()
        .toLowerCase();

    const reader = new FileReader();

    reader.onload = async (event) => {

        const text = event.target.result;

        const lines = text
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l);

        let success = 0;

        const batch = db.batch();

        // 自动识别分隔符
        let separator = ",";

        if (ext === 'txt' || ext === 'tsv') {
            separator = "\t";
        }

        for (let i = 0; i < lines.length; i++) {

            const line = lines[i];

            // 跳过 Anki 配置行
            if (line.startsWith('#')) {
                continue;
            }

            // 跳过 CSV 表头
            const lower = line.toLowerCase();

            if (
                lower.includes('正面') ||
                lower.includes('front')
            ) {
                continue;
            }

            let front = '';
            let back = '';

            // ====================
            // TXT / TSV
            // ====================
            if (separator === "\t") {

                const firstTab = line.indexOf("\t");

                if (firstTab === -1) continue;

                front = line
                    .slice(0, firstTab)
                    .trim();

                back = line
                    .slice(firstTab + 1)
                    .trim();

            }

            // ====================
            // CSV
            // ====================
            else {

                const firstComma = line.indexOf(",");

                if (firstComma === -1) continue;

                front = line
                    .slice(0, firstComma)
                    .trim();

                back = line
                    .slice(firstComma + 1)
                    .trim();

                // 去掉 csv 外层引号
                if (
                    front.startsWith('"') &&
                    front.endsWith('"')
                ) {
                    front = front.slice(1, -1);
                }

                if (
                    back.startsWith('"') &&
                    back.endsWith('"')
                ) {
                    back = back.slice(1, -1);
                }
            }

            if (!front || !back) continue;

            const cardRef = db.collection('cards').doc();

            batch.set(cardRef, {
    deckId: currentDeckKey,
    front,
    back,
    weight: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
});

            success++;
        }

        try {

            await batch.commit();

            alert(`✅ 成功导入 ${success} 张卡片`);

            await loadCards();

        } catch (err) {

            alert("导入失败：" + err.message);
        }
    };

    reader.readAsText(file, 'utf-8');

    e.target.value = '';
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
}

function backToMenu() {
    if (autoMode) toggleAuto();
    document.getElementById('player').classList.remove('active');
    document.getElementById('mainMenu').classList.add('active');
}

async function loadCards() {
    const snapshot = await db.collection('cards').where('deckId', '==', currentDeckKey).get();
    currentCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  sortCardsByPriority();
    renderCard();
}

function renderCard() {

    if (currentCards.length === 0) {

        frontEl.textContent = "暂无卡片，请添加卡片";

        backEl.style.display = "none";

        counterEl.textContent = "0 / 0";

        return;
    }

    const card = currentCards[currentIndex];

    // ====================
    // 安全处理
    // ====================

    const front =
        card.front || '';

    const back =
        card.back || '';

    // ====================
    // 渲染内容
    // ====================

    frontEl.innerHTML =
        front.replace(/\n/g, '<br>');

    backEl.innerHTML =
        back.replace(/\n/g, '<br>');

    // ====================
    // 超长文本检测
    // ====================

    frontEl.classList.remove('long-text');

    backEl.classList.remove('long-text');

    if (front.length > 180) {

        frontEl.classList.add('long-text');
    }

    if (back.length > 180) {

        backEl.classList.add('long-text');
    }

    // ====================
    // 是否存在背面
    // ====================

    const hasBack =
        back.trim() !== '';

    backEl.style.display =
        (showingBack && hasBack)
            ? "block"
            : "none";

    // ====================
    // 计数
    // ====================

    counterEl.textContent =
        `${currentIndex + 1} / ${currentCards.length}`;

    // ====================
    // 工具栏
    // ====================

    document.getElementById('editCardBtn')
        .style.display = 'block';

    document.getElementById('deleteCardBtn')
        .style.display = 'block';

    // ====================
    // 权重显示
    // ====================

    const weight =
        card.weight || 0;

    document.getElementById('weightBadge')
        .textContent = `⭐ ${weight}`;
}

function flipCard() {

    if (currentCards.length === 0) return;

    const card = currentCards[currentIndex];

    const hasBack =
        card.back &&
        card.back.trim() !== '';

    // 没背面 -> 不翻转
    if (!hasBack) return;

    showingBack = !showingBack;

    backEl.style.display =
        showingBack
            ? "block"
            : "none";
}

function handleCardAction() {

    if (currentCards.length === 0) return;

    const card = currentCards[currentIndex];

    const hasBack =
        card.back &&
        card.back.trim() !== '';

    // 有背面 且 当前未显示
    if (!showingBack && hasBack) {

        flipCard();
    }

    // 已显示背面
    // 或没有背面
    else {

        nextCard();
    }
}

function nextCard() {

    if (currentCards.length === 0) return;

    currentIndex =
        (currentIndex + 1)
        % currentCards.length;

    showingBack = false;

    renderCard();
}

function prevCard() { currentIndex = (currentIndex - 1 + currentCards.length) % currentCards.length; showingBack = false; renderCard(); }

function toggleAuto() {
    autoMode = !autoMode;
    document.getElementById('autoBtn').textContent = autoMode ? "Pause" : "Play";
    if (autoMode) {
        const sec = parseInt(document.getElementById('intervalInput').value) || 10;
        timer = setInterval(() => !showingBack ? flipCard() : nextCard(), sec * 1000);
    } else {
        clearInterval(timer);
        progressEl.style.width = "0%";
    }
}

function sortCardsByPriority() {

    const now = Date.now();

    currentCards.sort((a, b) => {

        // 默认值
        const weightA = a.weight || 0;
        const weightB = b.weight || 0;

        // 最近播放时间
        const lastA = a.lastViewedAt || 0;
        const lastB = b.lastViewedAt || 0;

        // 距离上次播放多久（分钟）
        const deltaA =
            (now - lastA) / 1000 / 60;

        const deltaB =
            (now - lastB) / 1000 / 60;

        // 核心 score
        const scoreA =
            weightA * 100 + deltaA;

        const scoreB =
            weightB * 100 + deltaB;

        return scoreB - scoreA;
    });
}

function showAddCardModal() {
if (autoMode) {
    toggleAuto();
}
    editingCardId = null;

    document.getElementById('cardModalTitle').textContent = '添加新卡片';

    document.getElementById('saveCardBtn').textContent = '保存卡片';

    document.getElementById('newFront').value = '';
    document.getElementById('newBack').value = '';

    document.getElementById('addCardModal').style.display = 'flex';
}
function hideAddCardModal() { document.getElementById('addCardModal').style.display = 'none'; }

async function saveCard() {

    const front = document.getElementById('newFront').value.trim();
    const back = document.getElementById('newBack').value.trim();

    if (!front) {
    return alert("正面不能为空");
}

    try {

        if (editingCardId) {

            await db.collection('cards')
                .doc(editingCardId)
                .update({
                    front,
                    back
                });

        } else {

            await db.collection('cards').add({
    deckId: currentDeckKey,
    front,
    back,
    weight: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
});
        }

        hideAddCardModal();
        await loadCards();

    } catch (e) {
        alert('保存失败：' + e.message);
    }
}
function editCurrentCard() {
if (autoMode) {
    toggleAuto();
}
    if (currentCards.length === 0) return;

    const card = currentCards[currentIndex];
    card.lastViewedAt = Date.now();

db.collection('cards')
    .doc(card.id)
    .update({
        lastViewedAt: card.lastViewedAt
    });
  
    editingCardId = card.id;

    document.getElementById('cardModalTitle').textContent = '编辑卡片';

    document.getElementById('saveCardBtn').textContent = '保存修改';

    document.getElementById('newFront').value = card.front;
    document.getElementById('newBack').value = card.back;

    document.getElementById('addCardModal').style.display = 'flex';
}
async function deleteCurrentCard() {

    if (currentCards.length === 0) return;

    if (!confirm('确定删除这张卡片吗？')) return;

    try {

        const card = currentCards[currentIndex];

        await db.collection('cards')
            .doc(card.id)
            .delete();

        if (currentIndex > 0) {
            currentIndex--;
        }

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

        const newWeight =
            (card.weight || 0) + 1;

        await db.collection('cards')
            .doc(card.id)
            .update({
                weight: newWeight
            });

        // 本地同步
        card.weight = newWeight;

        renderCard();

    } catch (e) {

        alert('更新权重失败：' + e.message);
    }
}

async function markMastered() {

    if (currentCards.length === 0) return;

    try {

        const card = currentCards[currentIndex];

        // 最低不能小于 0
        const newWeight =
            Math.max(
                0,
                (card.weight || 0) - 1
            );

        await db.collection('cards')
            .doc(card.id)
            .update({
                weight: newWeight
            });

        // 本地同步
        card.weight = newWeight;
        sortCardsByPriority();
        renderCard();

    } catch (e) {

        alert('更新权重失败：' + e.message);
    }
}

async function moveCurrentCard() {
if (autoMode) {
    toggleAuto();
}
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

async function confirmMoveCard() {

    try {

        const targetDeckId = document.getElementById('moveDeckSelect').value;

        if (!targetDeckId) {
            return alert('请选择目标分类');
        }

        const card = currentCards[currentIndex];

        await db.collection('cards')
            .doc(card.id)
            .update({
                deckId: targetDeckId
            });

        hideMoveCardModal();

        if (currentIndex > 0) {
            currentIndex--;
        }

        await loadCards();

       

    } catch (e) {
        alert('移动失败：' + e.message);
    }
}
// 初始化
// ==================== 空格键控制 ====================
document.addEventListener('keydown', (e) => {

    // 避免输入框触发
    const tag = document.activeElement.tagName;

    if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA'
    ) {
        return;
    }

    // 空格键
    if (e.code === 'Space') {

        e.preventDefault();

        handleCardAction();
    }
});

// 快捷键
document.addEventListener("keydown", (e) => {

    // 避免在输入框/textarea里误触
    const tag = document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    switch (e.key) {

        case "+":
        case "=": // 防止部分键盘需要 Shift+=
            e.preventDefault();
            markImportant();
            break;

        case "-":
            e.preventDefault();
            markMastered();
            break;

        case "e":
        case "E":
            e.preventDefault();
            editCurrentCard();
            break;
    }
});
window.onload = loadDecks;

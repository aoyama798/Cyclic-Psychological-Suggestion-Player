
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
// ==================== 超稳健导入 ====================
async function importCSV(e) {

    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (event) => {

        try {

            // ====================
            // 读取文本
            // ====================

            let text = event.target.result || '';

            // 去 BOM
            text = text.replace(/^\uFEFF/, '');

            // 换行统一
            const lines = text
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l);

            if (lines.length === 0) {
                return alert('文件为空');
            }

            let success = 0;

            const batch = db.batch();

            for (let rawLine of lines) {

                // ====================
                // 跳过注释
                // ====================

                if (
                    rawLine.startsWith('#') ||
                    rawLine.startsWith('//')
                ) {
                    continue;
                }

                // ====================
                // 去外层引号
                // ====================

                let line = rawLine
                    .replace(/^"(.*)"$/, '$1')
                    .trim();

                if (!line) continue;

                // ====================
                // 跳过表头
                // ====================

                const lower = line.toLowerCase();

                if (
                    lower === 'front' ||
                    lower === '正面' ||
                    lower.includes('问题')
                ) {
                    continue;
                }

                // ====================
                // 自动识别分隔符
                // ====================

                let front = line;

                const separators = [
                    '\t',
                    ',',
                    '，',
                    ';',
                    '|'
                ];

                for (const sep of separators) {

                    if (line.includes(sep)) {

                        front = line
                            .split(sep)[0]
                            .trim();

                        break;
                    }
                }

                // ====================
                // 清理 front
                // ====================

                front = front
                    .replace(/^"(.*)"$/, '$1')
                    .trim();

                if (!front) continue;

                // ====================
                // 写入 Firebase
                // ====================

                const cardRef =
                    db.collection('cards').doc();

                batch.set(cardRef, {

                    deckId: currentDeckKey,

                    front,

                    weight: 0,

                    createdAt:
                        firebase.firestore.FieldValue.serverTimestamp()
                });

                success++;
            }

            // ====================
            // 提交
            // ====================

            await batch.commit();

            alert(`✅ 成功导入 ${success} 张卡片`);

            await loadCards();

        } catch (err) {

            alert('导入失败：' + err.message);
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
        counterEl.textContent = "0 / 0";
        return;
    }

    const card = currentCards[currentIndex];

    const front = card.front || '';

    let html = front;

// 换行
html = html.replace(/\n/g, '<br>');

// 大字
html = html.replace(
    /\[\[(.*?)\]\]/g,
    '<span class="big">$1</span>'
);

// 高亮
html = html.replace(
    /\{\{(.*?)\}\}/g,
    '<span class="highlight">$1</span>'
);

// 下划线
html = html.replace(
    /__(.*?)__/g,
    '<span class="underline">$1</span>'
);

// 红色
html = html.replace(
    /!!(.*?)!!/g,
    '<span class="danger">$1</span>'
);

frontEl.innerHTML = html;

    frontEl.classList.remove('long-text');

    if (front.length > 180) {
        frontEl.classList.add('long-text');
    }

    counterEl.textContent =
        `${currentIndex + 1} / ${currentCards.length}`;

    document.getElementById('weightBadge')
        .textContent = `⭐ ${card.weight || 0}`;

}



function handleCardAction() {

    nextCard();
}

function nextCard() {

    if (currentCards.length === 0) return;

    // 记录浏览时间
    const card = currentCards[currentIndex];

    card.lastViewedAt = Date.now();

    db.collection('cards')
        .doc(card.id)
        .update({
            lastViewedAt: card.lastViewedAt
        });

    currentIndex =
        (currentIndex + 1)
        % currentCards.length;

    renderCard();
}

function prevCard() {

    if (currentCards.length === 0) return;

    currentIndex =
        (
            currentIndex - 1
            + currentCards.length
        )
        % currentCards.length;

    renderCard();
}

function toggleAuto() {
    autoMode = !autoMode;
    document.getElementById('autoBtn').textContent = autoMode ? "Pause" : "Play";
    if (autoMode) {
        const sec = parseInt(document.getElementById('intervalInput').value) || 10;
        timer = setInterval(() => nextCard(), sec * 1000);
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
  

    document.getElementById('addCardModal').style.display = 'flex';
}
function hideAddCardModal() { document.getElementById('addCardModal').style.display = 'none'; }

async function saveCard() {

    const front = document.getElementById('newFront').value.trim();

    if (!front) {
    return alert("正面不能为空");
}

    try {

        if (editingCardId) {

            await db.collection('cards')
                .doc(editingCardId)
                .update({
                    front
                });

        } else {

            await db.collection('cards').add({
    deckId: currentDeckKey,
    front,
    weight: 0,
    createdAt:
        firebase.firestore.FieldValue.serverTimestamp()
});
        }

        await loadCards();

// 编辑模式
if (editingCardId) {

    hideAddCardModal();
}

// 新增模式
else {

    document.getElementById('newFront').value = '';

    document.getElementById('newFront').focus();
}

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
        playStarAnimation();
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

function playStarAnimation() {

    const flash =
        document.getElementById('starFlash');

    flash.classList.remove('active');

    // 强制重绘
    void flash.offsetWidth;

    flash.classList.add('active');
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

        case "4":
            e.preventDefault();
            markImportant();
            break;

        case "1":
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
// 快捷键文本净化按钮
function cleanTextarea(id) {

    const el = document.getElementById(id);

    let text = el.value || '';

    // 去 HTML
    text = text.replace(/<[^>]*>/g, '');

    // 删除所有空白
    text = text.replace(/\s+/g, '');

    el.value = text;

    // 动画
    el.style.transform = 'scale(1.01)';
    el.style.boxShadow = '0 0 0 2px #2f80ed';

    setTimeout(() => {

        el.style.transform = '';
        el.style.boxShadow = '';

    }, 180);
}

// mini fomat pack
function wrapSelection(before, after) {

    const textarea =
        document.getElementById('newFront');

    const start =
        textarea.selectionStart;

    const end =
        textarea.selectionEnd;

    const text =
        textarea.value;

    const selected =
        text.substring(start, end);

    const newText =
        text.substring(0, start)
        + before
        + selected
        + after
        + text.substring(end);

    textarea.value = newText;

    textarea.focus();

    textarea.setSelectionRange(
        start + before.length,
        end + before.length
    );
}

let activeTextarea = 'newFront';

function wrapSelection(before, after) {

    const textarea =
        document.getElementById(activeTextarea);

    const start =
        textarea.selectionStart;

    const end =
        textarea.selectionEnd;

    const text =
        textarea.value;

    const selected =
        text.slice(start, end);

    textarea.value =
        text.slice(0, start)
        + before
        + selected
        + after
        + text.slice(end);

    textarea.focus();

    textarea.selectionStart =
        start + before.length;

    textarea.selectionEnd =
        end + before.length;
}
function renderMarkup(text){

    return text

        // 红色
        .replace(
            /!!(.*?)!!/g,
            '<span style="color:#ff4d4f;">$1</span>'
        )

        // 绿色
        .replace(
            /\{\{(.*?)\}\}/g,
            '<span style="color:#52c41a;">$1</span>'
        )

        // 放大
        .replace(
            /\[\[(.*?)\]\]/g,
            '<span style="font-size:1.6em;font-weight:700;">$1</span>'
        )

        // 下划线
        .replace(
            /__(.*?)__/g,
            '<u>$1</u>'
        )

        // 换行
        .replace(/\n/g,'<br>');
}
function updatePreview(){

    const text =
        document.getElementById('newFront').value;

    document.getElementById('previewBox')
        .innerHTML = renderMarkup(text);
}



let immersiveMode = false;
let uiTimer = null;

function showImmersiveUI() {

    document.body.classList.add(
        'show-ui'
    );

    clearTimeout(uiTimer);

    uiTimer = setTimeout(() => {

        document.body.classList.remove(
            'show-ui'
        );

    }, 1500);
}

function toggleImmersiveMode() {

    immersiveMode = !immersiveMode;

    document.body.classList.toggle(
        'immersive',
        immersiveMode
    );

    // 进入沉浸
    if (immersiveMode) {

        showImmersiveUI();

        // 尝试全屏
        if (document.documentElement.requestFullscreen) {

            document.documentElement
                .requestFullscreen()
                .catch(err => {

                    console.warn(
                        'Fullscreen 被阻止:',
                        err
                    );
                });
        }
    }

    // 退出沉浸
    else {

        document.body.classList.remove(
            'show-ui'
        );

        if (document.fullscreenElement) {

            document.exitFullscreen()
                .catch(err => {

                    console.warn(
                        '退出全屏失败:',
                        err
                    );
                });
        }
    }
}

// 鼠标移动时显示 UI
document.addEventListener(
    'mousemove',
    () => {

        if (!immersiveMode) return;

        showImmersiveUI();
    }
);

// R 键
document.addEventListener(
    'keydown',
    (e) => {

        const tag =
            document.activeElement.tagName;

        if (
            tag === 'INPUT' ||
            tag === 'TEXTAREA'
        ) return;

        if (
            e.key === 'r' ||
            e.key === 'R'
        ) {

            e.preventDefault();

            toggleImmersiveMode();
        }
    }
);

// ESC 自动同步状态
document.addEventListener(
    'fullscreenchange',
    () => {

        if (!document.fullscreenElement) {

            immersiveMode = false;

            document.body.classList.remove(
                'immersive'
            );

            document.body.classList.remove(
                'show-ui'
            );
        }
    }
);

window.onload = loadDecks;

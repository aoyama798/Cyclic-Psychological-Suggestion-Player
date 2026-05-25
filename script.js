
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
const tagEl = document.getElementById('tag');
const counterEl = document.getElementById('counter');
const deckTitleEl = document.getElementById('deckTitle');
const progressEl = document.getElementById('progress');

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
async function importCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const csv = event.target.result;
        const lines = csv.split('\n').map(l => l.trim()).filter(l => l);
        let success = 0;
        const batch = db.batch();

        for (let i = 0; i < lines.length; i++) {
            if (i === 0 && lines[i].toLowerCase().includes('正面') || lines[i].toLowerCase().includes('front')) continue;
            
            const cols = lines[i].split(',').map(c => c.trim());
            if (cols.length < 2) continue;

            const front = cols[0];
            const back = cols.slice(1).join(',');

            if (front && back) {
                const cardRef = db.collection('cards').doc();
                batch.set(cardRef, {
                    deckId: currentDeckKey,
                    front: front,
                    back: back,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                success++;
            }
        }

        try {
            await batch.commit();
            alert(`✅ 成功批量导入 ${success} 张卡片！`);
            await loadCards();
        } catch (err) {
            alert("导入失败：" + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ==================== 播放器功能 ====================
async function startPlayer(deckId, deck) {
    currentDeckKey = deckId;
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('player').classList.add('active');
    deckTitleEl.textContent = deck.name;
    tagEl.textContent = deck.name;
    tagEl.style.background = deck.color || '#2f80ed';
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

    frontEl.textContent = card.front;
    backEl.textContent = card.back;

    backEl.style.display = showingBack ? "block" : "none";

    counterEl.textContent = `${currentIndex + 1} / ${currentCards.length}`;

    // 新增
    document.getElementById('editCardBtn').style.display = 'block';
    document.getElementById('deleteCardBtn').style.display = 'block';
}

function flipCard() { showingBack = !showingBack; backEl.style.display = showingBack ? "block" : "none"; }
function nextCard() { currentIndex = (currentIndex + 1) % currentCards.length; showingBack = false; renderCard(); }
function prevCard() { currentIndex = (currentIndex - 1 + currentCards.length) % currentCards.length; showingBack = false; renderCard(); }

function toggleAuto() {
    autoMode = !autoMode;
    document.getElementById('autoBtn').textContent = autoMode ? "停止自动" : "自动播放";
    if (autoMode) {
        const sec = parseInt(document.getElementById('intervalInput').value) || 10;
        timer = setInterval(() => !showingBack ? flipCard() : nextCard(), sec * 1000);
    } else {
        clearInterval(timer);
        progressEl.style.width = "0%";
    }
}

function showAddCardModal() {

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

    if (!front || !back) {
        return alert("正面和背面不能为空");
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

    if (currentCards.length === 0) return;

    const card = currentCards[currentIndex];

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

async function moveCurrentCard() {

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

        alert('卡片已移动');

    } catch (e) {
        alert('移动失败：' + e.message);
    }
}
// 初始化
window.onload = loadDecks;

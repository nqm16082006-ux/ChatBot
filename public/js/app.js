/**
 * VIBE RAG STUDIO - CLIENT CONTROLLER
 * Handles chat messaging, knowledge ingestion, RAG controls, and UI interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const openSidebarBtn = document.getElementById('openSidebarBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const docCount = document.getElementById('docCount');
  const chunkCount = document.getElementById('chunkCount');
  const docList = document.getElementById('docList');
  const clearAllDocsBtn = document.getElementById('clearAllDocsBtn');
  
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const openPasteModalBtn = document.getElementById('openPasteModalBtn');
  
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressPercent = document.getElementById('progressPercent');
  const progressText = document.getElementById('progressText');
  
  const toggleRAG = document.getElementById('toggleRAG');
  const inputRagBadge = document.getElementById('inputRagBadge');
  const topKInput = document.getElementById('topKInput');
  const topKVal = document.getElementById('topKVal');
  const activeModelBadge = document.getElementById('activeModelBadge');
  
  const messagesContainer = document.getElementById('messagesContainer');
  const messageFeed = document.getElementById('messageFeed');
  const welcomeHero = document.getElementById('welcomeHero');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  
  // Modals
  const pasteModal = document.getElementById('pasteModal');
  const closePasteModalBtn = document.getElementById('closePasteModalBtn');
  const cancelPasteBtn = document.getElementById('cancelPasteBtn');
  const submitPasteBtn = document.getElementById('submitPasteBtn');
  const pasteTitle = document.getElementById('pasteTitle');
  const pasteContent = document.getElementById('pasteContent');
  
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsModalBtn = document.getElementById('openSettingsModalBtn');
  const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsApiKey = document.getElementById('settingsApiKey');
  const settingsGenModel = document.getElementById('settingsGenModel');
  
  const sourceModal = document.getElementById('sourceModal');
  const closeSourceModalBtn = document.getElementById('closeSourceModalBtn');
  const sourceModalTitle = document.getElementById('sourceModalTitle');
  const sourceModalBody = document.getElementById('sourceModalBody');
  
  const toastContainer = document.getElementById('toastContainer');

  // Chat State
  let chatHistory = [];
  let isGenerating = false;

  // Initialize Markdown renderer
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      highlight: function(code, lang) {
        if (typeof hljs !== 'undefined') {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        }
        return code;
      },
      breaks: true,
      gfm: true
    });
  }

  // ==========================================
  // TOAST UTILITY
  // ==========================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-triangle-exclamation' : 'fa-info');
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ==========================================
  // STATUS & DOCUMENT MANAGEMENT
  // ==========================================
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      apiKeyStatus.textContent = data.apiKeyMasked || 'Chưa sẵn sàng';
      docCount.textContent = data.totalDocuments || 0;
      chunkCount.textContent = data.totalChunks || 0;
      
      if (data.generationModel) {
        activeModelBadge.innerHTML = `<span class="dot-live"></span> Đang chạy: <strong>${data.generationModel}</strong> & Vector DB`;
      }
      
      renderDocList(data.documents || []);
    } catch (err) {
      console.error('Error fetching status:', err);
      apiKeyStatus.textContent = 'Lỗi kết nối';
    }
  }

  function renderDocList(docs) {
    if (!docs || docs.length === 0) {
      docList.innerHTML = `
        <div class="empty-docs-placeholder">
          <i class="fa-regular fa-folder-open"></i>
          <p>Chưa có tài liệu nào trong kho tri thức.<br>Hãy tải file hoặc bấm "Nạp mẫu 2026".</p>
        </div>`;
      return;
    }

    docList.innerHTML = '';
    docs.forEach(doc => {
      const item = document.createElement('div');
      item.className = 'doc-item';
      item.innerHTML = `
        <div class="doc-item-info">
          <i class="fa-solid fa-file-lines doc-item-icon"></i>
          <div class="doc-item-details">
            <span class="doc-item-name" title="${doc.filename}">${doc.filename}</span>
            <span class="doc-item-meta">${doc.chunkCount} đoạn • ${(doc.charCount / 1000).toFixed(1)}k ký tự</span>
          </div>
        </div>
        <button class="doc-item-delete" data-id="${doc.id}" title="Xóa tài liệu này">
          <i class="fa-regular fa-trash-can"></i>
        </button>
      `;

      item.querySelector('.doc-item-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Bạn có chắc muốn xóa tài liệu "${doc.filename}"?`)) {
          await deleteDoc(doc.id);
        }
      });

      docList.appendChild(item);
    });
  }

  async function deleteDoc(id) {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Đã xóa tài liệu khỏi kho tri thức', 'success');
        fetchStatus();
      }
    } catch (err) {
      showToast('Lỗi khi xóa tài liệu', 'error');
    }
  }

  // Clear all documents
  clearAllDocsBtn.addEventListener('click', async () => {
    if (confirm('Bạn có chắc muốn xóa TOÀN BỘ dữ liệu trong kho tri thức không?')) {
      try {
        const res = await fetch('/api/documents/clear', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast('Đã xóa sạch kho tri thức', 'success');
          fetchStatus();
        }
      } catch (err) {
        showToast('Lỗi khi xóa', 'error');
      }
    }
  });

  // ==========================================
  // FILE UPLOAD & INGESTION
  // ==========================================
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      uploadFile(fileInput.files[0]);
    }
  });

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    progressContainer.style.display = 'block';
    progressText.textContent = `Đang tải lên và trích xuất "${file.name}"...`;
    progressBar.style.width = '30%';
    progressPercent.textContent = '30%';

    try {
      progressBar.style.width = '65%';
      progressPercent.textContent = '65%';
      progressText.textContent = 'Đang gọi Gemini Embedding nhúng dữ liệu...';

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';

      if (res.ok && data.success) {
        showToast(`Nhúng thành công "${file.name}" (${data.document.chunkCount} chunks)`, 'success');
        fileInput.value = '';
        setTimeout(() => {
          progressContainer.style.display = 'none';
          progressBar.style.width = '0%';
        }, 1200);
        fetchStatus();
      } else {
        throw new Error(data.error || 'Lỗi xử lý file');
      }
    } catch (err) {
      showToast(err.message, 'error');
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }
  }

  // ==========================================
  // LOAD SAMPLE KNOWLEDGE (TÀI LIỆU MẪU 2026)
  // ==========================================
  loadSampleBtn.addEventListener('click', async () => {
    progressContainer.style.display = 'block';
    progressText.textContent = 'Đang nạp bộ tài liệu VibeTech 2026...';
    progressBar.style.width = '45%';
    progressPercent.textContent = '45%';

    try {
      const sampleText = `# TÀI LIỆU HƯỚNG DẪN & THÔNG TIN SẢN PHẨM CÔNG NGHỆ VIBE AI SUITE (PHIÊN BẢN 2026)

## 1. Giới thiệu tổng quan
Vibe AI Suite 2026 là nền tảng quản trị tri thức doanh nghiệp kết hợp Trí tuệ Nhân tạo thế hệ mới (Next-Gen RAG) do VibeTech phát triển. Nền tảng cho phép doanh nghiệp nhúng toàn bộ kho tài liệu, hợp đồng, tài liệu đào tạo nội bộ và chính sách nhân sự vào mô hình ngôn ngữ lớn để nhân viên tra cứu tức thì.

## 2. Các gói dịch vụ & Bảng giá năm 2026
- Gói Khởi nghiệp (Starter Plan): 49 USD/tháng. Hỗ trợ tối đa 50 tài liệu (tương đương 50.000 trang), 2.000 lượt truy vấn RAG/ngày, thời gian phản hồi trung bình 0.5 giây.
- Gói Doanh nghiệp (Enterprise Pro): 299 USD/tháng. Dung lượng tài liệu không giới hạn, 50.000 lượt truy vấn RAG/ngày, hỗ trợ phân quyền truy cập theo phòng ban, tích hợp SSO (Single Sign-On).
- Gói Tùy chỉnh (Ultimate On-Premise): 999 USD/tháng. Triển khai máy chủ riêng biệt (Private Cloud hoặc On-Premise), bảo mật chuẩn HIPAA và ISO 27001, huấn luyện mô hình Embedding tùy biến theo ngành.

## 3. Chính sách bảo hành và Hỗ trợ kỹ thuật
- Cam kết thời gian hoạt động (SLA): Đảm bảo 99.95% uptime hàng tháng.
- Chính sách hoàn tiền: Khách hàng có quyền yêu cầu hoàn tiền 100% trong vòng 30 ngày đầu tiên nếu không hài lòng với kết quả tìm kiếm ngữ nghĩa mà không cần lý do.
- Tổng đài hỗ trợ khẩn cấp 24/7 (Độc quyền gói Enterprise & Ultimate): 1900-8888 (Mã bảo mật hỗ trợ: #VIBE2026).
- Email kỹ thuật hỗ trợ riêng: support-vip@vibetech.ai (cam kết phản hồi dưới 15 phút).

## 4. Quy trình bảo mật & Lưu trữ Vector
- Toàn bộ vector nhúng được mã hóa đầu-cuối (End-to-End Encryption) bằng thuật toán AES-256 GCM.
- Dữ liệu thô của khách hàng KHÔNG bao giờ được sử dụng để đào tạo (train) lại các mô hình nền tảng công cộng của bên thứ ba.
- Mỗi dự án có một không gian Vector Namespace độc lập, cô lập hoàn toàn giữa các doanh nghiệp.

## 5. Quy định hoàn hủy & Nâng cấp tài khoản
- Khách hàng có thể chuyển đổi giữa các gói cước bất cứ lúc nào. Chi phí thừa sẽ được tính dồn vào chu kỳ hóa đơn tiếp theo theo tỉ lệ số ngày sử dụng thực tế (prorated).
- Khi hủy dịch vụ, toàn bộ dữ liệu vector và file lưu trữ sẽ tự động xóa vĩnh viễn sau 14 ngày làm việc theo tiêu chuẩn DoD 5220.22-M.`;

      progressBar.style.width = '75%';
      progressPercent.textContent = '75%';

      const res = await fetch('/api/add-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'VibeTech_AI_Suite_2026',
          content: sampleText
        })
      });

      const data = await res.json();
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';

      if (res.ok && data.success) {
        showToast('Đã nạp thành công bộ tri thức mẫu VibeTech 2026!', 'success');
        setTimeout(() => {
          progressContainer.style.display = 'none';
          progressBar.style.width = '0%';
        }, 1000);
        fetchStatus();
      } else {
        throw new Error(data.error || 'Lỗi khi nạp dữ liệu mẫu');
      }
    } catch (err) {
      showToast(err.message, 'error');
      progressContainer.style.display = 'none';
    }
  });

  // ==========================================
  // PASTE RAW TEXT MODAL
  // ==========================================
  openPasteModalBtn.addEventListener('click', () => {
    pasteTitle.value = '';
    pasteContent.value = '';
    pasteModal.style.display = 'flex';
  });

  closePasteModalBtn.addEventListener('click', () => pasteModal.style.display = 'none');
  cancelPasteBtn.addEventListener('click', () => pasteModal.style.display = 'none');

  submitPasteBtn.addEventListener('click', async () => {
    const title = pasteTitle.value.trim();
    const content = pasteContent.value.trim();
    if (!content) {
      alert('Vui lòng nhập nội dung văn bản!');
      return;
    }

    submitPasteBtn.disabled = true;
    submitPasteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nhúng...';

    try {
      const res = await fetch('/api/add-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Đã nhúng thành công "${data.document.filename}"!`, 'success');
        pasteModal.style.display = 'none';
        fetchStatus();
      } else {
        throw new Error(data.error || 'Lỗi nhúng văn bản');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitPasteBtn.disabled = false;
      submitPasteBtn.innerHTML = '<i class="fa-solid fa-vector-square"></i> Nhúng vào Vector DB';
    }
  });

  // ==========================================
  // SETTINGS MODAL
  // ==========================================
  openSettingsModalBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  closeSettingsModalBtn.addEventListener('click', () => settingsModal.style.display = 'none');
  cancelSettingsBtn.addEventListener('click', () => settingsModal.style.display = 'none');

  saveSettingsBtn.addEventListener('click', async () => {
    const apiKey = settingsApiKey.value.trim();
    const genModel = settingsGenModel.value;

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, genModel })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Đã cập nhật cấu hình!', 'success');
        settingsModal.style.display = 'none';
        fetchStatus();
      }
    } catch (err) {
      showToast('Lỗi khi cập nhật cấu hình', 'error');
    }
  });

  // ==========================================
  // SOURCE DETAIL MODAL
  // ==========================================
  closeSourceModalBtn.addEventListener('click', () => sourceModal.style.display = 'none');

  function openSourceInspector(source) {
    sourceModalTitle.innerHTML = `<i class="fa-solid fa-book-open"></i> Trích dẫn: ${source.filename} (Đoạn ${source.chunkIndex})`;
    sourceModalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom: 12px; font-size:0.85rem;">
        <span><strong>Tài liệu:</strong> ${source.filename}</span>
        <span class="source-score" style="font-size:0.8rem;">Độ tương đồng: ${(source.score * 100).toFixed(1)}%</span>
      </div>
      <div class="source-detail-box">${escapeHtml(source.fullText)}</div>
    `;
    sourceModal.style.display = 'flex';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
  }

  // Close modals on backdrop click
  window.addEventListener('click', (e) => {
    if (e.target === pasteModal) pasteModal.style.display = 'none';
    if (e.target === settingsModal) settingsModal.style.display = 'none';
    if (e.target === sourceModal) sourceModal.style.display = 'none';
  });

  // ==========================================
  // RAG CONTROLS & TOGGLE
  // ==========================================
  toggleRAG.addEventListener('change', () => {
    if (toggleRAG.checked) {
      inputRagBadge.innerHTML = '<i class="fa-solid fa-bolt"></i> RAG Bật';
      inputRagBadge.classList.remove('off');
      showToast('Đã BẬT cơ chế RAG (Truy xuất từ tài liệu)', 'info');
    } else {
      inputRagBadge.innerHTML = '<i class="fa-solid fa-ban"></i> RAG Tắt';
      inputRagBadge.classList.add('off');
      showToast('Đã TẮT RAG (AI chỉ trả lời bằng tri thức gốc)', 'info');
    }
  });

  topKInput.addEventListener('input', () => {
    topKVal.textContent = `${topKInput.value} đoạn`;
  });

  // Mobile sidebar
  openSidebarBtn.addEventListener('click', () => sidebar.classList.add('active'));
  closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('active'));

  // ==========================================
  // CHAT INTERACTION & RENDERING
  // ==========================================
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // Click on suggestion cards
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        chatInput.value = prompt;
        sendMessage();
      }
    });
  });

  // Clear chat
  clearChatBtn.addEventListener('click', () => {
    if (chatHistory.length > 0 && confirm('Bạn có muốn làm mới cuộc hội thoại?')) {
      chatHistory = [];
      messageFeed.innerHTML = '';
      welcomeHero.style.display = 'flex';
      showToast('Đã làm mới cuộc hội thoại', 'info');
    }
  });

  async function sendMessage() {
    const question = chatInput.value.trim();
    if (!question || isGenerating) return;

    // Hide welcome hero
    welcomeHero.style.display = 'none';

    // Append User Message
    appendMessage('user', question);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Show Typing Indicator
    const typingIndicator = showTyping();
    isGenerating = true;
    sendBtn.disabled = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          enableRAG: toggleRAG.checked,
          topK: parseInt(topKInput.value) || 4,
          chatHistory
        })
      });

      const data = await res.json();
      typingIndicator.remove();

      if (res.ok && data.answer) {
        appendMessage('assistant', data.answer, {
          sources: data.sources || [],
          modelUsed: data.modelUsed,
          duration: data.durationSeconds,
          ragEnabled: data.ragEnabled
        });

        // Update history
        chatHistory.push({ role: 'user', content: question });
        chatHistory.push({ role: 'assistant', content: data.answer });
      } else {
        throw new Error(data.error || 'Không nhận được câu trả lời từ AI');
      }
    } catch (err) {
      typingIndicator.remove();
      appendMessage('assistant', `⚠️ **Đã xảy ra lỗi:** ${err.message}\n\n*Gợi ý:* Hãy kiểm tra lại kết nối mạng hoặc API Key trong phần Cài đặt.`);
    } finally {
      isGenerating = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  function appendMessage(role, content, meta = null) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = role === 'user' 
      ? '<i class="fa-regular fa-user"></i>' 
      : '<i class="fa-solid fa-sparkles"></i>';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Render markdown for assistant, plain text for user
    if (role === 'assistant' && typeof marked !== 'undefined') {
      bubble.innerHTML = marked.parse(content);
    } else {
      bubble.textContent = content;
    }

    // Attach Citations & Meta if available
    if (meta && role === 'assistant') {
      const metaBox = document.createElement('div');
      metaBox.className = 'message-meta';

      const stats = document.createElement('div');
      stats.className = 'meta-stats';
      stats.innerHTML = `
        <span class="meta-stat-item"><i class="fa-regular fa-clock"></i> ${meta.duration || '0.5'}s</span>
        <span class="meta-stat-item"><i class="fa-solid fa-microchip"></i> ${meta.modelUsed || 'Gemini'}</span>
        <span class="meta-stat-item"><i class="fa-solid fa-bolt"></i> ${meta.ragEnabled ? 'RAG: Có' : 'RAG: Không'}</span>
      `;
      metaBox.appendChild(stats);

      // Sources chips
      if (meta.sources && meta.sources.length > 0) {
        const sourcesLabel = document.createElement('div');
        sourcesLabel.style.fontSize = '0.74rem';
        sourcesLabel.style.fontWeight = '600';
        sourcesLabel.style.color = '#94a3b8';
        sourcesLabel.style.marginTop = '4px';
        sourcesLabel.innerHTML = `<i class="fa-solid fa-quote-left"></i> Nguồn tài liệu tham khảo (${meta.sources.length}):`;
        metaBox.appendChild(sourcesLabel);

        const sourcesContainer = document.createElement('div');
        sourcesContainer.className = 'sources-container';

        meta.sources.forEach(src => {
          const chip = document.createElement('div');
          chip.className = 'source-chip';
          chip.innerHTML = `
            <i class="fa-regular fa-file-lines"></i>
            <span>${src.filename} [Đoạn ${src.chunkIndex}]</span>
            <span class="source-score">${(src.score * 100).toFixed(1)}%</span>
          `;
          chip.addEventListener('click', () => openSourceInspector(src));
          sourcesContainer.appendChild(chip);
        });

        metaBox.appendChild(sourcesContainer);
      }

      bubble.appendChild(metaBox);
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    messageFeed.appendChild(row);

    // Auto-scroll to bottom
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  }

  function showTyping() {
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.innerHTML = `
      <div class="avatar"><i class="fa-solid fa-sparkles"></i></div>
      <div class="message-bubble">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    messageFeed.appendChild(row);
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
    return row;
  }

  // Initial load
  fetchStatus();
});

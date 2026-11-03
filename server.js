require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { RAGService } = require('./rag/ragService');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// Initialize RAG Service
const ragService = new RAGService(process.env.GEMINI_API_KEY);

// Helper to extract text from uploaded file
async function extractTextFromFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (ext === '.pdf') {
    try {
      const pdfModule = require('pdf-parse');
      if (typeof pdfModule === 'function') {
        const data = await pdfModule(file.buffer);
        return data.text;
      } else if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse(file.buffer);
        await parser.load();
        return await parser.getText();
      }
    } catch (err) {
      console.error('[Extract] PDF parsing error:', err.message);
      throw new Error(`Lỗi đọc file PDF: ${err.message}`);
    }
  }

  // Text, Markdown, JSON, CSV, etc.
  return file.buffer.toString('utf-8');
}

// 1. System Status
app.get('/api/status', (req, res) => {
  const docs = ragService.vectorStore.listDocuments();
  const totalChunks = ragService.vectorStore.getTotalChunks();
  const hasKey = Boolean(ragService.apiKey && ragService.apiKey.length > 10);
  const maskedKey = hasKey ? `${ragService.apiKey.slice(0, 6)}...${ragService.apiKey.slice(-4)}` : 'Chưa cấu hình';

  res.json({
    status: 'online',
    hasApiKey: hasKey,
    apiKeyMasked: maskedKey,
    embedModel: ragService.embedder.model,
    generationModel: process.env.GEMINI_GEN_MODEL || 'gemini-3.1-flash-lite',
    totalDocuments: docs.length,
    totalChunks,
    documents: docs
  });
});

// 2. Upload and Ingest Document
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn file để tải lên' });
    }

    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf-8'); // Fix unicode filenames
    console.log(`[Upload] Processing file: ${filename} (${req.file.size} bytes)`);

    const extractedText = await extractTextFromFile(req.file);
    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ error: 'File tải lên không có văn bản hoặc không thể trích xuất' });
    }

    const result = await ragService.ingestDocument({
      filename,
      text: extractedText
    });

    res.json({
      success: true,
      message: `Đã nạp thành công tài liệu: ${filename}`,
      document: result
    });
  } catch (err) {
    console.error('[Upload] Error:', err);
    res.status(500).json({ error: err.message || 'Lỗi khi xử lý file' });
  }
});

// 3. Add Raw Text Directly to Knowledge Base
app.post('/api/add-text', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Nội dung văn bản không được để trống' });
    }

    const filename = (title && title.trim()) ? `${title.trim()}.txt` : `Ghi_chu_${Date.now()}.txt`;

    const result = await ragService.ingestDocument({
      filename,
      text: content
    });

    res.json({
      success: true,
      message: `Đã thêm văn bản vào cơ sở tri thức: ${filename}`,
      document: result
    });
  } catch (err) {
    console.error('[AddText] Error:', err);
    res.status(500).json({ error: err.message || 'Lỗi khi nhúng văn bản' });
  }
});

// 4. List Documents
app.get('/api/documents', (req, res) => {
  res.json({
    documents: ragService.vectorStore.listDocuments(),
    totalChunks: ragService.vectorStore.getTotalChunks()
  });
});

// 5. Delete Document
app.delete('/api/documents/:id', (req, res) => {
  const success = ragService.vectorStore.deleteDocument(req.params.id);
  res.json({ success, message: success ? 'Đã xóa tài liệu' : 'Không tìm thấy tài liệu' });
});

// 6. Clear All Documents
app.post('/api/documents/clear', (req, res) => {
  ragService.vectorStore.clear();
  res.json({ success: true, message: 'Đã xóa toàn bộ cơ sở tri thức' });
});

// 7. Chat Query (RAG Enabled / Disabled)
app.post('/api/chat', async (req, res) => {
  try {
    const { question, enableRAG = true, topK = 4, chatHistory = [] } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Câu hỏi không được để trống' });
    }

    const startTime = Date.now();
    const result = await ragService.query({
      question: question.trim(),
      enableRAG: Boolean(enableRAG),
      topK: Number(topK) || 4,
      chatHistory
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    res.json({
      answer: result.answer,
      sources: result.sources || [],
      modelUsed: result.modelUsed,
      durationSeconds: duration,
      ragEnabled: Boolean(enableRAG)
    });
  } catch (err) {
    console.error('[Chat] Error:', err);
    res.status(500).json({ error: err.message || 'Lỗi khi xử lý tin nhắn' });
  }
});

// 8. Update API Key & Model Config
app.post('/api/config', (req, res) => {
  const { apiKey, genModel } = req.body;
  if (apiKey && apiKey.trim()) {
    ragService.setApiKey(apiKey.trim());
  }
  if (genModel && genModel.trim()) {
    ragService.candidateModels.unshift(genModel.trim());
  }
  res.json({
    success: true,
    message: 'Cập nhật cấu hình thành công!'
  });
});

// Start Server
app.listen(port, () => {
  console.log(`====================================================`);
  console.log(`🚀 Vibe RAG Chatbot Server đang chạy tại:`);
  console.log(`   👉 http://localhost:${port}`);
  console.log(`   Mô hình thế hệ: ${process.env.GEMINI_GEN_MODEL || 'gemini-3.1-flash-lite'}`);
  console.log(`   Mô hình nhúng: ${ragService.embedder.model}`);
  console.log(`====================================================`);
});

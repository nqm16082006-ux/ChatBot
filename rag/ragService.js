/**
 * RAG Orchestration Service
 * Integrates Document Chunking, Embedding Generation, Vector Retrieval, and Gemini LLM Generation
 */

const { chunkText } = require('./chunker');
const { GeminiEmbedder } = require('./embedder');
const { VectorStore } = require('./vectorStore');

class RAGService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.embedder = new GeminiEmbedder(this.apiKey);
    this.vectorStore = new VectorStore();
    this.candidateModels = [
      process.env.GEMINI_GEN_MODEL || 'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash'
    ];
  }

  setApiKey(key) {
    this.apiKey = key;
    this.embedder.setApiKey(key);
  }

  /**
   * Ingest a document: chunk text -> embed each chunk -> save in vector store
   */
  async ingestDocument({ filename, text, onProgress }) {
    if (!text || text.trim().length === 0) {
      throw new Error('Tài liệu trống, không có nội dung để nhúng');
    }

    console.log(`[RAGService] Chunking text for: ${filename} (Length: ${text.length} chars)`);
    const rawChunks = chunkText(text, { chunkSize: 650, overlap: 120 });
    console.log(`[RAGService] Generated ${rawChunks.length} chunks. Starting embedding...`);

    const embeddedChunks = await this.embedder.getBatchEmbeddings(rawChunks, onProgress);

    const docRecord = {
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      filename,
      uploadedAt: new Date().toISOString(),
      charCount: text.length,
      chunks: embeddedChunks.map((c, index) => ({
        id: `chunk_${index}`,
        text: c.text,
        chunkIndex: index + 1,
        embedding: c.embedding
      }))
    };

    this.vectorStore.addDocument(docRecord);
    console.log(`[RAGService] Document "${filename}" ingested successfully with ${docRecord.chunks.length} chunks.`);

    return {
      id: docRecord.id,
      filename: docRecord.filename,
      chunkCount: docRecord.chunks.length,
      charCount: docRecord.charCount,
      uploadedAt: docRecord.uploadedAt
    };
  }

  /**
   * Call Gemini generateContent with fallback models
   */
  async callGemini(contents, systemInstruction = null) {
    let lastError = null;

    for (const modelName of this.candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
        const bodyPayload = {
          contents
        };
        if (systemInstruction) {
          bodyPayload.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        const data = await res.json();
        if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return {
            text: data.candidates[0].content.parts[0].text,
            modelUsed: modelName
          };
        } else {
          const errMsg = data.error?.message || `HTTP ${res.status}`;
          console.warn(`[RAGService] Model ${modelName} returned error: ${errMsg}. Trying fallback...`);
          lastError = new Error(errMsg);
        }
      } catch (err) {
        console.warn(`[RAGService] Fetch error with ${modelName}: ${err.message}. Trying fallback...`);
        lastError = err;
      }
    }

    throw lastError || new Error('Không thể kết nối đến các mô hình Gemini.');
  }

  /**
   * Ask question with RAG Retrieval & Prompt Augmentation
   */
  async query({ question, enableRAG = true, topK = 4, chatHistory = [] }) {
    if (!question || question.trim().length === 0) {
      throw new Error('Vui lòng nhập câu hỏi');
    }

    let relevantChunks = [];
    let promptWithContext = question;
    let systemInstruction = `Bạn là Trợ lý AI Thông minh (Vibe RAG Assistant), được trang bị công nghệ Retrieval-Augmented Generation và mô hình Google Gemini.
Hãy trả lời một cách thông minh, mạch lạc, thẩm mỹ cao bằng Tiếng Việt. Định dạng câu trả lời sử dụng Markdown (tiêu đề, gạch đầu dòng, bảng, code block nếu có).`;

    if (enableRAG) {
      // Step 1: Embed question
      try {
        const queryVector = await this.embedder.getEmbedding(question);
        // Step 2: Search top-K relevant chunks
        relevantChunks = this.vectorStore.search(queryVector, topK, 0.30);
      } catch (err) {
        console.error('[RAGService] Vector search error:', err.message);
      }

      if (relevantChunks.length > 0) {
        // Step 3: Augment prompt with context
        const contextText = relevantChunks.map((chunk, i) => {
          return `--- [Đoạn trích ${i + 1} | Nguồn: "${chunk.filename}" | Độ tương đồng: ${(chunk.score * 100).toFixed(1)}%] ---\n${chunk.text}`;
        }).join('\n\n');

        systemInstruction += `\n\nBạn được cung cấp các tài liệu tri thức liên quan dưới đây:
${contextText}

HƯỚNG DẪN TRẢ LỜI:
1. Hãy ưu tiên dựa vào các đoạn trích từ tài liệu trên để trả lời câu hỏi của người dùng.
2. Trích dẫn rõ ràng nguồn tài liệu và số đoạn trích khi đưa ra dữ liệu thực tế.
3. Nếu tài liệu không đủ dữ kiện, hãy nêu rõ tài liệu chưa đề cập, và bạn có thể bổ sung hiểu biết tổng quát để giúp người dùng.`;
      } else {
        systemInstruction += `\n\nLưu ý: Không tìm thấy tài liệu có độ khớp cao trong kho tri thức hiện tại. Hãy thông báo nhẹ nhàng cho người dùng và giải đáp dựa trên hiểu biết của bạn.`;
      }
    }

    // Prepare contents payload including recent chat history
    const contents = [];
    if (Array.isArray(chatHistory)) {
      for (const msg of chatHistory.slice(-6)) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: question }]
    });

    const result = await this.callGemini(contents, systemInstruction);

    return {
      answer: result.text,
      modelUsed: result.modelUsed,
      sources: relevantChunks.map(c => ({
        filename: c.filename,
        chunkIndex: c.chunkIndex,
        score: c.score,
        preview: c.text.slice(0, 160) + '...',
        fullText: c.text
      }))
    };
  }
}

module.exports = { RAGService };

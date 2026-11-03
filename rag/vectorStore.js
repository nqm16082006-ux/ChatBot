/**
 * Vector Store for Knowledge Retrieval
 * Performs In-Memory Cosine Similarity search and saves to local JSON database
 */

const fs = require('fs');
const path = require('path');

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

class VectorStore {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, '..', 'data', 'vector_db.json');
    this.documents = []; // array of { id, filename, uploadedAt, charCount, chunks: [...] }
    this.load();
  }

  load() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        this.documents = JSON.parse(raw);
        console.log(`[VectorStore] Loaded ${this.documents.length} document(s) from ${this.storagePath}`);
      } else {
        this.documents = [];
        this.save();
      }
    } catch (err) {
      console.error('[VectorStore] Error loading storage:', err.message);
      this.documents = [];
    }
  }

  save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.documents, null, 2), 'utf-8');
    } catch (err) {
      console.error('[VectorStore] Error saving storage:', err.message);
    }
  }

  addDocument(doc) {
    // doc: { id, filename, uploadedAt, charCount, chunks: [{ id, text, chunkIndex, embedding }] }
    // Remove if existing document with same filename exists
    this.documents = this.documents.filter(d => d.filename !== doc.filename);
    this.documents.push(doc);
    this.save();
    return doc;
  }

  deleteDocument(docId) {
    const beforeCount = this.documents.length;
    this.documents = this.documents.filter(d => d.id !== docId && d.filename !== docId);
    this.save();
    return this.documents.length < beforeCount;
  }

  clear() {
    this.documents = [];
    this.save();
  }

  listDocuments() {
    return this.documents.map(d => ({
      id: d.id,
      filename: d.filename,
      uploadedAt: d.uploadedAt,
      charCount: d.charCount,
      chunkCount: d.chunks.length,
      preview: d.chunks[0]?.text?.slice(0, 100) + '...'
    }));
  }

  getTotalChunks() {
    return this.documents.reduce((sum, d) => sum + (d.chunks?.length || 0), 0);
  }

  /**
   * Cosine Similarity Search
   * Returns top-K most relevant chunks across all indexed documents
   */
  search(queryVector, topK = 4, minScore = 0.35) {
    if (!queryVector || !Array.isArray(queryVector)) return [];

    const candidates = [];

    for (const doc of this.documents) {
      for (const chunk of doc.chunks) {
        if (!chunk.embedding) continue;
        const score = cosineSimilarity(queryVector, chunk.embedding);
        if (score >= minScore) {
          candidates.push({
            score: Number(score.toFixed(4)),
            text: chunk.text,
            chunkIndex: chunk.chunkIndex,
            totalChunks: doc.chunks.length,
            documentId: doc.id,
            filename: doc.filename
          });
        }
      }
    }

    // Sort descending by score
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, topK);
  }
}

module.exports = { VectorStore, cosineSimilarity };

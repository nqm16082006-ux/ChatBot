/**
 * Google Gemini Embedder Module
 * Computes high-dimensional vector embeddings for text chunks using Gemini Embedding Models
 */

class GeminiEmbedder {
  constructor(apiKey, model = 'gemini-embedding-001') {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.model = model || process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  async getEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Input text must be a non-empty string');
    }

    const clean = text.trim().slice(0, 8000); // Truncate safely for embedding limit
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: {
          parts: [{ text: clean }]
        }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(`Embedding API Error: ${msg}`);
    }

    if (!data.embedding || !data.embedding.values) {
      throw new Error('No embedding values returned by Gemini API');
    }

    return data.embedding.values;
  }

  /**
   * Batch embedding with concurrency control and delay to prevent rate limits
   */
  async getBatchEmbeddings(chunks, onProgress = null) {
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const vector = await this.getEmbedding(chunk.text);
        results.push({
          ...chunk,
          embedding: vector
        });
      } catch (err) {
        console.error(`Error embedding chunk ${i + 1}/${chunks.length}:`, err.message);
        throw err;
      }

      if (onProgress) {
        onProgress(i + 1, chunks.length);
      }

      // Small throttling delay (80ms)
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 80));
      }
    }
    return results;
  }
}

module.exports = { GeminiEmbedder };

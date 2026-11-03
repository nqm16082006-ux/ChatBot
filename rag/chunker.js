/**
 * Intelligent Text Chunking for RAG
 * Divides raw text into coherent chunks respecting paragraph and sentence boundaries
 */

function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || 600; // characters per chunk
  const overlap = options.overlap || 120;     // characters overlap between consecutive chunks

  if (!text || typeof text !== 'string') return [];

  // Normalize line endings and whitespace
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (cleanText.length <= chunkSize) {
    return [{
      text: cleanText,
      startIndex: 0,
      endIndex: cleanText.length
    }];
  }

  // Split into paragraphs first
  const paragraphs = cleanText.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';
  let currentStart = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if ((currentChunk + '\n\n' + trimmedPara).length <= chunkSize) {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara;
    } else {
      if (currentChunk) {
        chunks.push({
          text: currentChunk,
          startIndex: currentStart,
          endIndex: currentStart + currentChunk.length
        });
        
        // Compute overlap
        const overlapText = currentChunk.slice(Math.max(0, currentChunk.length - overlap));
        currentStart = currentStart + currentChunk.length - overlapText.length;
        currentChunk = overlapText + '\n\n' + trimmedPara;
      } else {
        // Single paragraph exceeds chunkSize - break by sentence or fixed size
        const sentences = trimmedPara.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [trimmedPara];
        for (const sentence of sentences) {
          const s = sentence.trim();
          if ((currentChunk + ' ' + s).length <= chunkSize) {
            currentChunk = currentChunk ? currentChunk + ' ' + s : s;
          } else {
            if (currentChunk) {
              chunks.push({
                text: currentChunk,
                startIndex: currentStart,
                endIndex: currentStart + currentChunk.length
              });
              const overlapText = currentChunk.slice(Math.max(0, currentChunk.length - overlap));
              currentStart = currentStart + currentChunk.length - overlapText.length;
              currentChunk = overlapText + ' ' + s;
            } else {
              // Forced slice
              for (let i = 0; i < s.length; i += (chunkSize - overlap)) {
                const slice = s.slice(i, i + chunkSize);
                chunks.push({
                  text: slice,
                  startIndex: currentStart + i,
                  endIndex: currentStart + i + slice.length
                });
              }
              currentChunk = '';
            }
          }
        }
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      startIndex: currentStart,
      endIndex: currentStart + currentChunk.length
    });
  }

  return chunks;
}

module.exports = { chunkText };

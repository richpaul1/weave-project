/**
 * Utility functions for text chunking
 */

export interface TextChunk {
  text: string;
  index: number;
  startPosition: number;
  endPosition: number;
}

/**
 * Chunks a given text into smaller pieces based on a maximum length.
 * @param text The input text to chunk.
 * @param maxLength The maximum length of each chunk (default: 1000 characters).
 * @returns An array of text chunks.
 */
export function chunkText(text: string, maxLength: number = 1000): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let chunkIndex = 0;
  let startPosition = 0;
  
  // Split by sentence-ending punctuation followed by space
  const sentences = text.split(/(?<=[.?!])\s+/);

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 <= maxLength) {
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    } else {
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex,
          startPosition,
          endPosition: startPosition + currentChunk.length,
        });
        startPosition += currentChunk.length;
        chunkIndex++;
      }
      currentChunk = sentence;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunkIndex,
      startPosition,
      endPosition: startPosition + currentChunk.length,
    });
  }

  return chunks;
}

/**
 * Chunk markdown content by sections and paragraphs
 * @param markdownContent The markdown content to chunk
 * @param maxChunkSize Maximum size of each chunk (default: 1000)
 * @returns Array of text chunks
 */
export function chunkMarkdown(markdownContent: string, maxChunkSize: number = 1000): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let currentPosition = 0;

  // Split by markdown headers (# ## ### etc.)
  const sections = markdownContent.split(/(?=^#{1,6}\s)/m);
  
  for (const section of sections) {
    const sectionContent = section.trim();
    if (!sectionContent) continue;
    
    if (sectionContent.length <= maxChunkSize) {
      chunks.push({
        text: sectionContent,
        index: chunkIndex,
        startPosition: currentPosition,
        endPosition: currentPosition + sectionContent.length,
      });
      currentPosition += sectionContent.length;
      chunkIndex++;
    } else {
      // Split large sections into smaller chunks
      const paragraphs = sectionContent.split('\n\n');
      let currentChunk = '';
      let chunkStartPosition = currentPosition;
      
      for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length + 2 <= maxChunkSize) {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        } else {
          if (currentChunk.trim()) {
            chunks.push({
              text: currentChunk.trim(),
              index: chunkIndex,
              startPosition: chunkStartPosition,
              endPosition: chunkStartPosition + currentChunk.length,
            });
            chunkIndex++;
          }
          currentChunk = paragraph;
          chunkStartPosition = currentPosition;
        }
      }
      
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex,
          startPosition: chunkStartPosition,
          endPosition: chunkStartPosition + currentChunk.length,
        });
        chunkIndex++;
      }
      
      currentPosition += sectionContent.length;
    }
  }
  
  return chunks;
}

export class SentenceChunker {
  private buffer = '';

  // Matches common abbreviations that shouldn't split sentences
  private readonly ABBREVIATIONS = /^(mr|mrs|ms|dr|prof|sr|jr|vs|etc|ie|eg|inc|ltd|co|corp)\./i;

  /**
   * Pushes new text into the chunker and returns any complete sentences found.
   */
  push(text: string): string[] {
    this.buffer += text;
    return this.extractSentences();
  }

  /**
   * Forces the chunker to flush its remaining buffer as a final sentence.
   */
  flush(): string[] {
    const trimmed = this.buffer.trim();
    this.buffer = '';
    return trimmed.length > 0 ? [trimmed] : [];
  }

  private extractSentences(): string[] {
    const sentences: string[] = [];
    let i = 0;
    let lastSplit = 0;

    while (i < this.buffer.length) {
      const char = this.buffer[i];

      if (char === '.' || char === '!' || char === '?') {
        // Look ahead for whitespace or EOF
        const nextChar = i + 1 < this.buffer.length ? this.buffer[i + 1] : null;
        
        if (nextChar === null || /\s/.test(nextChar)) {
          // It's a potential sentence boundary.
          // Let's check for abbreviations or decimals.
          
          const precedingText = this.buffer.substring(lastSplit, i + 1).trimStart();
          const words = precedingText.split(/\s+/);
          const lastWord = words[words.length - 1] || '';

          // If last word matches abbreviation, skip splitting
          if (this.ABBREVIATIONS.test(lastWord)) {
            i++;
            continue;
          }

          // If it's a decimal number, skip splitting
          // e.g., "3." followed by "14" (though space check usually catches decimals, 
          // let's be safe if there's weird spacing, or it just ends in a digit)
          
          // Actually, if it's followed by a space, it's rarely a decimal.
          // Let's just split.
          
          const sentence = this.buffer.substring(lastSplit, i + 1).trim();
          if (sentence.length > 0) {
            sentences.push(sentence);
          }
          lastSplit = i + 1;
        }
      }
      i++;
    }

    this.buffer = this.buffer.substring(lastSplit);
    return sentences;
  }
}

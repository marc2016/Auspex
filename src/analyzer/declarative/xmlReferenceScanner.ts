/** An attribute of a tag with the line where the attribute starts. */
export interface XmlAttribute {
  name: string;
  value: string;
  line: number;
}

export interface XmlTag {
  name: string;
  line: number;
  attributes: XmlAttribute[];
}

export interface XmlText {
  /** Name of the enclosing element. */
  element: string;
  text: string;
  /** Line of the first non-whitespace character of the text. */
  line: number;
}

export interface XmlScanResult {
  tags: XmlTag[];
  texts: XmlText[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

const NAME_CHAR = /[A-Za-z0-9_:.\-]/;

/**
 * Tolerant, line-aware scan of XML-like content. Comments, CDATA sections, processing instructions
 * and declarations are skipped. Malformed constructs (unclosed tags or quotes) end the current tag
 * and scanning continues, so later valid content is still reported.
 */
export function scanXml(content: string): XmlScanResult {
  const tags: XmlTag[] = [];
  const texts: XmlText[] = [];
  const stack: string[] = [];
  const n = content.length;
  let i = 0;
  let line = 1;

  const advanceTo = (end: number) => {
    for (let k = i; k < end && k < n; k++) if (content.charCodeAt(k) === 10) line++;
    i = Math.min(end, n);
  };
  const skipPast = (marker: string) => {
    const end = content.indexOf(marker, i);
    advanceTo(end < 0 ? n : end + marker.length);
  };

  while (i < n) {
    const ch = content[i];
    if (ch !== '<') {
      // element text up to the next '<'
      const end = content.indexOf('<', i);
      const stop = end < 0 ? n : end;
      const raw = content.slice(i, stop);
      const trimmed = raw.trim();
      if (trimmed && stack.length > 0) {
        const leading = raw.slice(0, raw.length - raw.trimStart().length);
        const textLine = line + (leading.match(/\n/g)?.length ?? 0);
        texts.push({ element: stack[stack.length - 1], text: decodeEntities(trimmed), line: textLine });
      }
      advanceTo(stop);
      continue;
    }

    if (content.startsWith('<!--', i)) {
      skipPast('-->');
      continue;
    }
    if (content.startsWith('<![CDATA[', i)) {
      skipPast(']]>');
      continue;
    }
    if (content.startsWith('<?', i)) {
      skipPast('?>');
      continue;
    }
    if (content.startsWith('<!', i)) {
      skipPast('>');
      continue;
    }

    if (content[i + 1] === '/') {
      // end tag
      let j = i + 2;
      while (j < n && NAME_CHAR.test(content[j])) j++;
      const name = content.slice(i + 2, j);
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) stack.length = idx;
      const close = content.indexOf('>', j);
      const nextOpen = content.indexOf('<', j);
      advanceTo(close >= 0 && (nextOpen < 0 || close < nextOpen) ? close + 1 : nextOpen < 0 ? n : nextOpen);
      continue;
    }

    // start tag
    const tagLine = line;
    let j = i + 1;
    while (j < n && NAME_CHAR.test(content[j])) j++;
    const name = content.slice(i + 1, j);
    if (!name) {
      // stray '<' in text
      advanceTo(i + 1);
      continue;
    }
    advanceTo(j);

    const tag: XmlTag = { name, line: tagLine, attributes: [] };
    let selfClosing = false;
    let closed = false;

    while (i < n) {
      const c = content[i];
      if (c === '>') {
        advanceTo(i + 1);
        closed = true;
        break;
      }
      if (c === '/' && content[i + 1] === '>') {
        advanceTo(i + 2);
        selfClosing = true;
        closed = true;
        break;
      }
      if (c === '<') break; // malformed: next tag starts before this one closed
      if (/\s/.test(c)) {
        advanceTo(i + 1);
        continue;
      }
      if (!NAME_CHAR.test(c)) {
        advanceTo(i + 1);
        continue;
      }

      // attribute name
      const attrLine = line;
      let k = i;
      while (k < n && NAME_CHAR.test(content[k])) k++;
      const attrName = content.slice(i, k);
      advanceTo(k);
      while (i < n && /[ \t\r\n]/.test(content[i])) advanceTo(i + 1);
      if (content[i] !== '=') {
        tag.attributes.push({ name: attrName, value: '', line: attrLine });
        continue;
      }
      advanceTo(i + 1);
      while (i < n && /[ \t\r\n]/.test(content[i])) advanceTo(i + 1);

      const q = content[i];
      if (q === '"' || q === "'") {
        const end = content.indexOf(q, i + 1);
        const nextTag = content.indexOf('<', i + 1);
        // Raw '<' is not allowed in attribute values: a '<' before the closing quote means the quote is unclosed
        if (end < 0 || (nextTag >= 0 && nextTag < end)) {
          // unclosed quote: give up on this tag at the next '<'
          advanceTo(nextTag < 0 ? n : nextTag);
          break;
        }
        tag.attributes.push({ name: attrName, value: decodeEntities(content.slice(i + 1, end)), line: attrLine });
        advanceTo(end + 1);
      } else {
        let e = i;
        while (e < n && !/[\s>]/.test(content[e]) && !(content[e] === '/' && content[e + 1] === '>')) e++;
        tag.attributes.push({ name: attrName, value: decodeEntities(content.slice(i, e)), line: attrLine });
        advanceTo(e);
      }
    }

    tags.push(tag);
    if (closed && !selfClosing) stack.push(name);
  }

  return { tags, texts };
}

import React from 'react';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

/**
 * Simple markdown renderer that supports:
 * - **bold** text
 * - *italic* text
 * - ***bold italic*** text
 * - Bullet lists (-, *)
 * - Line breaks
 */
export function MarkdownText({ content, className = '' }: MarkdownTextProps) {
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];
    let listKey = 0;

    const flushList = () => {
      if (currentList.length > 0) {
        result.push(
          <ul key={`list-${listKey++}`} className="ml-4 list-disc space-y-1">
            {currentList}
          </ul>
        );
        currentList = [];
      }
    };

    const renderInlineMarkdown = (line: string, lineIndex: number) => {
      const elements: React.ReactNode[] = [];
      let lastIndex = 0;

      // Regex to match ***text***, **text**, or *text* (not at line start)
      const markdownRegex =
        /(\*\*\*)(.*?)\1|(\*\*)(.*?)\3|(?<!\s)(\*)(?!\s)(.*?)\5/g;
      let match;

      while ((match = markdownRegex.exec(line)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          elements.push(line.slice(lastIndex, match.index));
        }

        // Determine what type of formatting
        if (match[1] === '***') {
          // Bold + Italic: ***text***
          elements.push(
            <strong
              key={`${lineIndex}-${match.index}`}
              className="font-bold italic"
            >
              {match[2]}
            </strong>
          );
        } else if (match[3] === '**') {
          // Bold: **text**
          elements.push(
            <strong key={`${lineIndex}-${match.index}`} className="font-bold">
              {match[4]}
            </strong>
          );
        } else if (match[5] === '*') {
          // Italic: *text*
          elements.push(
            <em key={`${lineIndex}-${match.index}`} className="italic">
              {match[6]}
            </em>
          );
        }

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text after last match
      if (lastIndex < line.length) {
        elements.push(line.slice(lastIndex));
      }

      // If no matches found, just use the line as-is
      if (elements.length === 0) {
        elements.push(line);
      }

      return elements;
    };

    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();

      // Check if this is a list item (starts with - or *)
      const listMatch = trimmedLine.match(/^[-*]\s+(.+)$/);

      if (listMatch) {
        const listContent = listMatch[1];
        currentList.push(
          <li key={`li-${lineIndex}`} className="text-sm">
            {renderInlineMarkdown(listContent, lineIndex)}
          </li>
        );
      } else {
        // Not a list item, flush any pending list
        flushList();

        // Render as regular paragraph or line
        if (trimmedLine) {
          result.push(
            <React.Fragment key={lineIndex}>
              {renderInlineMarkdown(line, lineIndex)}
              {lineIndex < lines.length - 1 && <br />}
            </React.Fragment>
          );
        } else if (lineIndex < lines.length - 1) {
          // Empty line, add spacing
          result.push(<br key={`br-${lineIndex}`} />);
        }
      }
    });

    // Flush any remaining list items
    flushList();

    return result;
  };

  return <div className={className}>{renderMarkdown(content)}</div>;
}

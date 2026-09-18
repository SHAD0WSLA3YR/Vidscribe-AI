import type { TranscriptSegment, Chapter, TranscriptComment } from '@/types';
import type { Descendant } from 'slate';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import jsPDF from 'jspdf';
import { formatTime } from './utils';

// Color name mapping
function getColorName(color?: string): string {
  const colorMap: Record<string, string> = {
    yellow: '🟡',
    green: '🟢',
    blue: '🔵',
    purple: '🟣',
    pink: '🩷',
    orange: '🟠',
  };
  return colorMap[color || 'yellow'] || '🟡';
}

// Helper function to extract text from Slate content
function getTextFromSlateContent(content: Descendant[]): string {
  return content
    .map((node: any) => {
      if (node.text !== undefined) {
        return node.text;
      }
      if (node.children) {
        return getTextFromSlateContent(node.children);
      }
      return '';
    })
    .join('');
}

// Export the function with the expected name
export function serializeNodesToPlainText(content: Descendant[]): string {
  return getTextFromSlateContent(content);
}

export async function segmentsToBlob(
  segments: TranscriptSegment[],
  chapters: Chapter[],
  format: 'pdf' | 'docx' | 'vtt' | 'txt' | 'md',
  comments: TranscriptComment[] = [],
  documentTitle?: string,
  summary?: string | null
): Promise<Blob> {
  switch (format) {
    case 'pdf':
      return generatePDF(segments, chapters, comments, documentTitle, summary);
    case 'docx':
      return generateDOCX(segments, chapters, comments, documentTitle, summary);
    case 'vtt':
      return generateVTT(segments);
    case 'txt':
      return generateTXT(segments, chapters, comments, documentTitle, summary);
    case 'md':
      return generateMarkdown(segments, chapters, comments, documentTitle, summary);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function generateVTT(segments: TranscriptSegment[]): Blob {
  let vtt = 'WEBVTT\n\n';

  segments.forEach((segment, index) => {
    const start = formatTime(segment.start);
    const end = formatTime(segment.end);
    const text = getTextFromSlateContent(segment.content);
    vtt += `${index + 1}\n`;
    vtt += `${start} --> ${end}\n`;
    vtt += `${text}\n\n`;
  });

  return new Blob([vtt], { type: 'text/vtt' });
}

function generateTXT(
  segments: TranscriptSegment[],
  chapters: Chapter[],
  comments: TranscriptComment[],
  documentTitle?: string,
  summary?: string | null
): Blob {
  let txt = '';

  if (documentTitle) {
    txt += `${documentTitle}\n`;
    txt += '='.repeat(documentTitle.length) + '\n\n';
  }

  if (chapters.length > 0) {
    txt += 'Chapters\n--------\n';
    chapters.forEach((chapter) => {
      txt += `${formatTime(chapter.start)} - ${chapter.title}\n`;
    });
    txt += '\n';
  }

  if (summary) {
    txt += 'Summary\n-------\n';
    txt += `${summary}\n\n`;
  }

  if (comments.length > 0) {
    txt += 'Notes\n-----\n';
    comments
      .filter((c) => !c.resolved)
      .forEach((comment) => {
        const segment = segments.find((s) => s.segmentId === comment.segmentId);
        const timestamp = segment ? formatTime(segment.start) : 'Unknown';
        txt += `${getColorName(comment.color)} [${timestamp}] ${comment.note}\n`;
      });
    txt += '\n';
  }

  txt += 'Transcript\n----------\n\n';

  segments.forEach((segment) => {
    const text = getTextFromSlateContent(segment.content);
    txt += `[${formatTime(segment.start)}] ${text}\n`;
  });

  return new Blob([txt], { type: 'text/plain' });
}

function generateMarkdown(
  segments: TranscriptSegment[],
  chapters: Chapter[],
  comments: TranscriptComment[],
  documentTitle?: string,
  summary?: string | null
): Blob {
  let md = '';

  if (documentTitle) {
    md += `# ${documentTitle}\n\n`;
  }

  if (chapters.length > 0) {
    md += '## Chapters\n\n';
    chapters.forEach((chapter) => {
      md += `- **${formatTime(chapter.start)}** - ${chapter.title}\n`;
    });
    md += '\n';
  }

  if (summary) {
    md += '## Summary\n\n';
    md += `${summary}\n\n`;
  }

  if (comments.length > 0) {
    md += '## Notes\n\n';
    comments
      .filter((c) => !c.resolved)
      .forEach((comment) => {
        const segment = segments.find((s) => s.id === comment.segmentId);
        const timestamp = segment ? formatTime(segment.start) : 'Unknown';
        md += `${getColorName(comment.color)} **[${timestamp}]** ${comment.note}\n\n`;
      });
  }

  md += '## Transcript\n\n';

  segments.forEach((segment) => {
    const text = getTextFromSlateContent(segment.content);
    md += `**[${formatTime(segment.start)}]** ${text}\n\n`;
  });

  return new Blob([md], { type: 'text/markdown' });
}

async function generateDOCX(
  segments: TranscriptSegment[],
  chapters: Chapter[],
  comments: TranscriptComment[],
  documentTitle?: string,
  summary?: string | null
): Promise<Blob> {
  const children: Paragraph[] = [];

  if (documentTitle) {
    children.push(
      new Paragraph({
        text: documentTitle,
        heading: HeadingLevel.HEADING_1,
      })
    );
  }

  if (chapters.length > 0) {
    children.push(
      new Paragraph({
        text: 'Chapters',
        heading: HeadingLevel.HEADING_2,
      })
    );

    chapters.forEach((chapter) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${formatTime(chapter.start)} - ${chapter.title}`,
            }),
          ],
        })
      );
    });

    children.push(new Paragraph({ text: '' }));
  }

  if (summary) {
    children.push(
      new Paragraph({
        text: 'Summary',
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        text: summary,
      }),
      new Paragraph({ text: '' })
    );
  }

  if (comments.length > 0) {
    children.push(
      new Paragraph({
        text: 'Notes',
        heading: HeadingLevel.HEADING_2,
      })
    );

    comments
      .filter((c) => !c.resolved)
      .forEach((comment) => {
        const segment = segments.find((s) => s.id === comment.segmentId);
        const timestamp = segment ? formatTime(segment.start) : 'Unknown';
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${getColorName(comment.color)} [${timestamp}] ${comment.note}`,
              }),
            ],
          })
        );
      });

    children.push(new Paragraph({ text: '' }));
  }

  children.push(
    new Paragraph({
      text: 'Transcript',
      heading: HeadingLevel.HEADING_2,
    })
  );

  segments.forEach((segment) => {
    const text = getTextFromSlateContent(segment.content);
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `[${formatTime(segment.start)}] `,
            bold: true,
          }),
          new TextRun({
            text: text,
          }),
        ],
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}

async function generatePDF(
  segments: TranscriptSegment[],
  chapters: Chapter[],
  comments: TranscriptComment[],
  documentTitle?: string,
  summary?: string | null
): Promise<Blob> {
  const pdf = new jsPDF();
  let yPosition = 20;
  const lineHeight = 7;
  const margin = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const maxWidth = pageWidth - 2 * margin;

  // Title
  if (documentTitle) {
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(documentTitle, margin, yPosition);
    yPosition += lineHeight * 2;
  }

  // Chapters
  if (chapters.length > 0) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Chapters', margin, yPosition);
    yPosition += lineHeight;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    chapters.forEach((chapter) => {
      if (yPosition > pdf.internal.pageSize.getHeight() - 20) {
        pdf.addPage();
        yPosition = 20;
      }
      pdf.text(
        `${formatTime(chapter.start)} - ${chapter.title}`,
        margin,
        yPosition
      );
      yPosition += lineHeight;
    });
    yPosition += lineHeight;
  }

  // Summary
  if (summary) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Summary', margin, yPosition);
    yPosition += lineHeight;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    const summaryLines = pdf.splitTextToSize(summary, maxWidth);
    summaryLines.forEach((line: string) => {
      if (yPosition > pdf.internal.pageSize.getHeight() - 20) {
        pdf.addPage();
        yPosition = 20;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    });
    yPosition += lineHeight;
  }

  // Notes
  if (comments.length > 0) {
    const activeComments = comments.filter((c) => !c.resolved);
    if (activeComments.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Notes', margin, yPosition);
      yPosition += lineHeight;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      activeComments.forEach((comment) => {
        const segment = segments.find((s) => s.id === comment.segmentId);
        const timestamp = segment ? formatTime(segment.start) : 'Unknown';
        const noteText = `${getColorName(comment.color)} [${timestamp}] ${comment.note}`;
        const noteLines = pdf.splitTextToSize(noteText, maxWidth);
        
        noteLines.forEach((line: string) => {
          if (yPosition > pdf.internal.pageSize.getHeight() - 20) {
            pdf.addPage();
            yPosition = 20;
          }
          pdf.text(line, margin, yPosition);
          yPosition += lineHeight;
        });
      });
      yPosition += lineHeight;
    }
  }

  // Transcript
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Transcript', margin, yPosition);
  yPosition += lineHeight;

  pdf.setFontSize(10);
  segments.forEach((segment) => {
    const text = getTextFromSlateContent(segment.content);
    if (yPosition > pdf.internal.pageSize.getHeight() - 20) {
      pdf.addPage();
      yPosition = 20;
    }

    pdf.setFont('helvetica', 'bold');
    const timestamp = `[${formatTime(segment.start)}] `;
    pdf.text(timestamp, margin, yPosition);

    const timestampWidth = pdf.getTextWidth(timestamp);
    pdf.setFont('helvetica', 'normal');

    const textLines = pdf.splitTextToSize(text, maxWidth - timestampWidth);
    textLines.forEach((line: string, index: number) => {
      if (index > 0 && yPosition > pdf.internal.pageSize.getHeight() - 20) {
        pdf.addPage();
        yPosition = 20;
      }
      const xPos = index === 0 ? margin + timestampWidth : margin;
      pdf.text(line, xPos, yPosition);
      if (index < textLines.length - 1) yPosition += lineHeight;
    });

    yPosition += lineHeight * 1.5;
  });

  return pdf.output('blob');
}

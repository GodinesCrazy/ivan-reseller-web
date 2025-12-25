import React from 'react';

interface MarkdownViewerProps {
  content: string;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  return (
    <div className="prose prose-sm max-w-full">
      <pre>{content}</pre>
    </div>
  );
};

export default MarkdownViewer;


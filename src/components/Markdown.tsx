import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'

interface Props {
  children: string
  className?: string
}

/**
 * Renderiza texto en Markdown con soporte de matemática ($...$ y $$...$$).
 * Se usa para todos los bloques de contenido de una ficha.
 */
export default function Markdown({ children, className }: Props) {
  return (
    <div className={`prose-ficha ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

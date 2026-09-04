import type { FichaContenido } from '../lib/types'
import Markdown from './Markdown'

function Seccion({
  etiqueta,
  children,
}: {
  etiqueta: string
  children: React.ReactNode
}) {
  return (
    <section className="animate-in">
      <h3 className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
        {etiqueta}
      </h3>
      {children}
    </section>
  )
}

export default function FichaView({
  ficha,
  simplificaciones = [],
}: {
  ficha: FichaContenido
  simplificaciones?: string[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <Seccion etiqueta="Idea central">
        <Markdown>{ficha.ideaCentral}</Markdown>
      </Seccion>

      <Seccion
        etiqueta={
          ficha.formaFormalEsFormula ? 'La fórmula' : 'El concepto formal'
        }
      >
        <div className="overflow-x-auto rounded-xl border border-[var(--color-navy-soft)] bg-[var(--color-navy-soft)]/60 px-4 py-3 text-[1.02rem]">
          <Markdown>{ficha.formaFormal}</Markdown>
        </div>
      </Seccion>

      <Seccion etiqueta="En criollo">
        <div className="rounded-xl border-l-4 border-[var(--color-teal)] bg-[var(--color-teal-soft)]/50 px-4 py-3">
          <Markdown>{ficha.enCriollo}</Markdown>
        </div>
      </Seccion>

      <Seccion etiqueta="Glosario">
        <ol className="flex flex-col gap-2">
          {ficha.glosario.map((g, i) => (
            <li
              key={i}
              className="flex gap-2.5 rounded-lg bg-[var(--color-bg)] px-3 py-2 text-sm"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-navy)] text-[0.7rem] font-semibold text-white">
                {i + 1}
              </span>
              <span>
                <strong className="text-[var(--color-ink)]">{g.termino}:</strong>{' '}
                <span className="text-[var(--color-ink-soft)]">
                  {g.definicion}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Seccion>

      <Seccion etiqueta="Ojo con esto">
        <div className="rounded-xl border-l-4 border-[var(--color-amber)] bg-[var(--color-amber-soft)]/60 px-4 py-3">
          <Markdown>{ficha.ojoConEsto}</Markdown>
        </div>
      </Seccion>

      {simplificaciones.length > 0 && (
        <Seccion etiqueta="Explicado más simple">
          <div className="flex flex-col gap-3">
            {simplificaciones.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-dashed border-[var(--color-line)] px-4 py-3"
              >
                <Markdown>{s}</Markdown>
              </div>
            ))}
          </div>
        </Seccion>
      )}
    </div>
  )
}

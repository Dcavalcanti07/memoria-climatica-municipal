import { useEffect, useRef } from 'react';
import type { Doc, Evidencia, Verificacao } from '../../core/schema';
import { BASE_CHIP, BASE_LABEL, STATUS_CHIP, STATUS_LABEL, fmtDate } from '../lib/data';
import type { Review } from '../lib/review';

const TIPO_DOC: Record<string, string> = {
  plano_de_contingencia: 'Plano', alerta_simulado: 'Alerta fictício', atualizacao_secretaria: 'Atualização',
  relatorio_de_ocorrencia: 'Relatório', ata: 'Ata', protocolo: 'Protocolo',
};

export function DocList({ docs, provided, cites, onOpen, selected, updateIds }: { docs: Doc[]; provided: Set<string>; cites: Map<string, number>; onOpen: (d: Doc) => void; selected?: string | null; updateIds: Set<string> }) {
  return (
    <div className="doclist">
      {docs.map((d) => {
        const on = provided.has(d.id);
        return (
          <button key={d.id} className={`doc ${d.conjunto} ${updateIds.has(d.id) ? 'update' : ''} ${on ? '' : 'off'} ${selected === d.id ? 'sel' : ''}`} onClick={() => onOpen(d)} aria-label={`Abrir documento ${d.titulo}`}>
            <div className="meta"><span>{d.id}</span><span>·</span><span>{fmtDate(d.data)}</span><span>·</span><span>{TIPO_DOC[d.tipo] ?? d.tipo}</span></div>
            <div className="t">{d.titulo}</div>
            <div className="src">{d.fonte}</div>
            {on && (cites.get(d.id) ?? 0) > 0 && <span className="cites" title="citações deste documento na análise">{cites.get(d.id)}×</span>}
            {!on && <div className="src" style={{ fontStyle: 'italic' }}>não fornecido nesta condição</div>}
          </button>
        );
      })}
    </div>
  );
}

/** Leitor com destaque das citações literais usadas pela IA. */
export function DocReader({ doc, quotes, focus, onClose }: { doc: Doc; quotes: Evidencia[]; focus?: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('mark.focus');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [doc, focus, onClose]);
  // marca trechos citados (casamento literal, sem normalização agressiva)
  const segments: { text: string; mark: boolean; focus: boolean }[] = [];
  let rest = doc.texto;
  const qs = [...new Set(quotes.map((q) => q.trecho.replace(/^["“]|["”]$/g, '').trim()))].filter((q) => q.length > 3);
  let guard = 0;
  while (rest.length && guard++ < 200) {
    let best = -1, bq = '';
    for (const q of qs) { const i = rest.indexOf(q); if (i >= 0 && (best < 0 || i < best)) { best = i; bq = q; } }
    if (best < 0) { segments.push({ text: rest, mark: false, focus: false }); break; }
    if (best > 0) segments.push({ text: rest.slice(0, best), mark: false, focus: false });
    segments.push({ text: bq, mark: true, focus: !!focus && bq.includes(focus.replace(/^["“]|["”]$/g, '').trim().slice(0, 40)) });
    rest = rest.slice(best + bq.length);
  }
  return (
    <div className="reader-backdrop" onClick={onClose}>
      <div className="reader" ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={doc.titulo}>
        <button className="close-x" onClick={onClose} aria-label="Fechar">×</button>
        <div className="eyebrow">{doc.id} · {fmtDate(doc.data)} · {doc.conjunto === 'memoria' ? 'registro histórico' : 'informação atual'}</div>
        <h2>{doc.titulo}</h2>
        <div className="muted">{doc.fonte}</div>
        <pre>{segments.map((s, i) => s.mark ? <mark key={i} className={`${doc.conjunto === 'memoria' ? '' : 'water'} ${s.focus ? 'focus' : ''}`}>{s.text}</mark> : <span key={i}>{s.text}</span>)}</pre>
        <p className="muted" style={{ fontSize: 13 }}>Trechos destacados foram citados literalmente pela IA nesta análise. Documento fictício, criado para o experimento.</p>
      </div>
    </div>
  );
}

export function QuoteBtn({ ev, doc, literal, onOpen }: { ev: Evidencia; doc?: Doc; literal?: boolean; onOpen: () => void }) {
  return (
    <button className={`quote ${doc?.conjunto ?? ''}`} onClick={onOpen}>
      “{ev.trecho}”
      <span className="qmeta">
        {ev.doc_id} · {doc ? `${doc.titulo.slice(0, 48)}${doc.titulo.length > 48 ? '…' : ''} · ${fmtDate(doc.data)}` : 'documento não encontrado'}
        {literal === false && <span className="bad"> · citação não encontrada literalmente</span>}
      </span>
    </button>
  );
}

export function CheckCard({ v, sel, onSelect, review, onReview, docs, literal, onQuote, judgeNote, tech, open }: {
  v: Verificacao; sel: boolean; onSelect: () => void; review?: Review; onReview: (p: Partial<Review>) => void;
  docs: Map<string, Doc>; literal: (ev: Evidencia) => boolean | undefined; onQuote: (ev: Evidencia) => void; judgeNote?: string | null; tech: boolean; open: boolean;
}) {
  const st = review?.status ?? 'pendente';
  return (
    <article className={`check ${sel ? 'sel' : ''} ${st}`} aria-label={v.pergunta}>
      <div className="chips">
        <span className={`chip ${BASE_CHIP[v.base]}`}>{BASE_LABEL[v.base]}</span>
        <span className={`chip ${STATUS_CHIP[v.status_epistemico]}`}>{STATUS_LABEL[v.status_epistemico]}</span>
        {v.prioridade === 'alta' && <span className="chip contra">prioridade alta</span>}
      </div>
      <div className="q" onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect()}>{v.pergunta}</div>
      {open && (
        <dl>
          <div><dt>Por que importa</dt><dd>{v.por_que_importa}</dd></div>
          <div><dt>O que motivou</dt><dd>{v.motivacao}</dd></div>
          <div><dt>Evidências</dt><dd>{v.evidencias.map((ev, i) => <QuoteBtn key={i} ev={ev} doc={docs.get(ev.doc_id)} literal={literal(ev)} onOpen={() => onQuote(ev)} />)}</dd></div>
          <div><dt>O que ainda não sabemos</dt><dd>{v.o_que_falta_saber}</dd></div>
          <div><dt>Quem poderia confirmar</dt><dd>{v.quem_pode_confirmar} <span className="muted">(sujeito à confirmação institucional)</span></dd></div>
          {v.setores_relacionados.length > 0 && <div><dt>Setores relacionados</dt><dd>{v.setores_relacionados.join(' · ')}</dd></div>}
          <div>
            <dt>Revisão da equipe</dt>
            <div className="review-row" role="group" aria-label="Status de revisão">
              {([['revisada', 'Revisada'], ['confirmar', 'Precisa confirmar'], ['descartada', 'Não se aplica']] as const).map(([k, l]) => (
                <button key={k} aria-pressed={st === k} onClick={() => onReview({ status: st === k ? 'pendente' : k })}>{l}</button>
              ))}
            </div>
            <textarea aria-label="Observação da equipe" placeholder="Observação da equipe (ex.: quem ligou, o que foi confirmado)…" value={review?.nota ?? ''} onChange={(e) => onReview({ nota: e.target.value })} style={{ marginTop: 8 }} />
          </div>
          {tech && judgeNote && <div className="judge-note">Avaliação por rubrica (IA avaliadora, não especialista): {judgeNote}</div>}
        </dl>
      )}
    </article>
  );
}

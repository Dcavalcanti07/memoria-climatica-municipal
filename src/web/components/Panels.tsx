import { Fragment, useEffect, useRef } from 'react';
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    dialog.querySelector('mark.focus')?.scrollIntoView({ block: 'center' });
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement || trigger instanceof SVGElement) trigger.focus({ preventScroll: true });
    };
  }, [doc, focus]);
  const parts = (quote: string) => quote.split(/\[\.\.\.\]|\.\.\.|…/).map((part) => part.trim().replace(/^["“]|["”]$/g, '').trim()).filter(Boolean);
  const targets = new Set(parts(focus ?? ''));
  const excerpts = new Set([...quotes.flatMap((q) => parts(q.trecho)), ...targets]);
  const ranges: { start: number; end: number; focus: boolean }[] = [];
  for (const excerpt of excerpts) {
    let start = doc.texto.indexOf(excerpt);
    while (start >= 0) {
      const end = start + excerpt.length;
      ranges.push({ start, end, focus: targets.has(excerpt) });
      start = doc.texto.indexOf(excerpt, end);
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
      last.focus ||= range.focus;
    } else merged.push(range);
  }
  let offset = 0;
  const segments = merged.map((range) => {
    const before = doc.texto.slice(offset, range.start);
    offset = range.end;
    return { ...range, before, text: doc.texto.slice(range.start, range.end) };
  });
  return (
    <dialog className="reader" ref={ref} aria-label={doc.titulo}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.clientX > e.currentTarget.getBoundingClientRect().right) onClose(); }}>
        <button className="close-x" onClick={onClose} aria-label="Fechar">×</button>
        <div className="eyebrow">{doc.id} · {fmtDate(doc.data)} · {doc.conjunto === 'memoria' ? 'registro histórico' : 'informação atual'}</div>
        <h2>{doc.titulo}</h2>
        <div className="muted">{doc.fonte}</div>
        <pre>{segments.map((s) => (
          <Fragment key={s.start}>{s.before}<mark className={`${doc.conjunto === 'memoria' ? '' : 'water'} ${s.focus ? 'focus' : ''}`}>{s.text}</mark></Fragment>
        ))}{doc.texto.slice(offset)}</pre>
        <p className="muted" style={{ fontSize: 13 }}>Trechos destacados foram citados literalmente pela IA nesta análise. Documento fictício, criado para o experimento.</p>
    </dialog>
  );
}

export function QuoteBtn({ ev, doc, literal, onOpen }: { ev: Evidencia; doc?: Doc; literal?: boolean; onOpen: () => void }) {
  return (
    <button className={`quote ${doc?.conjunto ?? ''}`} onClick={onOpen} disabled={!doc}>
      “{ev.trecho}”
      <span className="qmeta">
        {ev.doc_id} · {doc ? `${doc.titulo.slice(0, 48)}${doc.titulo.length > 48 ? '…' : ''} · ${fmtDate(doc.data)}` : 'documento não encontrado'}
        {literal === false && <span className="bad"> · citação não encontrada literalmente</span>}
      </span>
    </button>
  );
}

export function CheckCard({ v, sel, onSelect, review, onReview, docs, literal, onQuote, judgeNote, tech, open, comparison, onMap }: {
  v: Verificacao; sel: boolean; onSelect: () => void; review?: Review; onReview: (p: Partial<Review>) => void;
  docs: Map<string, Doc>; literal: (ev: Evidencia) => boolean | undefined; onQuote: (ev: Evidencia) => void; judgeNote?: string | null; tech: boolean; open: boolean; comparison: string | null; onMap?: () => void;
}) {
  const st = review?.status ?? 'pendente';
  const reviewLabels = { pendente: 'Pendente', revisada: 'Revisada', confirmar: 'Precisa confirmar', descartada: 'Não se aplica' };
  const priority = { alta: 'alta', media: 'média', baixa: 'baixa' }[v.prioridade];
  return (
    <article className={`check ${sel ? 'sel' : ''} ${st}`} aria-label={v.pergunta}>
      <h3><button type="button" className="q" onClick={onSelect} aria-expanded={open}>{v.pergunta}<span aria-hidden="true">{open ? '−' : '+'}</span></button></h3>
      <div className="chips">
        <span className={`chip ${BASE_CHIP[v.base]}`}>{BASE_LABEL[v.base]}</span>
        <span className={`chip ${STATUS_CHIP[v.status_epistemico]}`}>{STATUS_LABEL[v.status_epistemico]}</span>
        {priority && <span className={`chip ${v.prioridade === 'alta' ? 'contra' : ''}`}>Prioridade {priority}</span>}
        {st !== 'pendente' && <span className="chip moss">{reviewLabels[st]}</span>}
        {comparison && <span className={`chip ${comparison === 'A' ? 'memory' : 'moss'}`} title="Avaliador vinculou esta verificação a um item do gabarito atendido aqui e ausente na condição comparada.">Cobre item ausente em {comparison}</span>}
      </div>
      {open && onMap && <div className="check-map"><button className="btn small ghost" onClick={onMap}>Ver caminho no mapa ↑</button></div>}
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
            <dd><div className="review-row" role="group" aria-label="Status de revisão">
              {([['revisada', 'Revisada'], ['confirmar', 'Precisa confirmar'], ['descartada', 'Não se aplica']] as const).map(([k, l]) => (
                <button key={k} aria-pressed={st === k} onClick={() => onReview({ status: st === k ? 'pendente' : k })}>{l}</button>
              ))}
            </div>
            <textarea aria-label="Observação da equipe" placeholder="Observação da equipe (ex.: quem ligou, o que foi confirmado)…" value={review?.nota ?? ''} onChange={(e) => onReview({ nota: e.target.value })} style={{ marginTop: 8 }} /></dd>
          </div>
        </dl>
      )}
      {open && tech && judgeNote && <div className="judge-note">Avaliação por rubrica (IA avaliadora, não especialista): {judgeNote}</div>}
    </article>
  );
}

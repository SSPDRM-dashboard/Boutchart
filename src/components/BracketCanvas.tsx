import React, { useState } from 'react';
import { BracketModel, BracketNode } from '../types';
import { Trophy, Shuffle, ZoomIn, ZoomOut } from 'lucide-react';
import { isRealBout, countRealBouts } from '../utils/bracketUtils';

const BOX_W = 210;
const BOX_H = 40;
const PAD = 24;

interface BracketCanvasProps {
  bracket: BracketModel;
  ring: number | string;
  entrantCount: number;
  layout?: 'modern' | 'classic';
  onReshuffle: () => void;
  onCheckboxToggle: (k: number, i: number, checked: boolean) => void;
  onTextChange: (k: number, i: number, text: string) => void;
  tournamentName?: string;
  onUpdateLeafNode?: (i: number, name: string, club: string, isBye: boolean) => void;
  onSwapLeafNodes?: (i: number, j: number) => void;
}

function getFormattedBout(ring: string | number, boutNumber: number | undefined): string {
  if (boutNumber === undefined) return '';
  const trimmed = String(ring).trim();
  const match = trimmed.match(/([a-zA-Z0-9]+)$/);
  const prefix = match ? match[1].toUpperCase() : 'R';
  const padded = String(boutNumber).padStart(2, '0');
  return `${prefix}${padded}`;
}

export const BracketCanvas: React.FC<BracketCanvasProps> = ({
  bracket,
  ring,
  entrantCount,
  layout = 'modern',
  onReshuffle,
  onCheckboxToggle,
  onTextChange,
  tournamentName,
  onUpdateLeafNode,
  onSwapLeafNodes,
}) => {
  const [scale, setScale] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editClub, setEditClub] = useState('');
  const [editIsBye, setEditIsBye] = useState(false);
  const [swapTargetIndex, setSwapTargetIndex] = useState<string>('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Keep it functional and secure
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIndex(index);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (draggingIndex !== null && draggingIndex !== index) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    if (draggingIndex !== null && draggingIndex !== index) {
      e.preventDefault();
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (!isNaN(sourceIndex) && sourceIndex !== targetIndex && onSwapLeafNodes) {
      onSwapLeafNodes(sourceIndex, targetIndex);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const { size, numRounds, nodes, categoryKey } = bracket;

  // Sizing adapters: scale gap and pitch dynamically based on bracket rounds
  let gap = 200;
  if (numRounds >= 5) gap = 145; // size 32
  else if (numRounds >= 4) gap = 175; // size 16
  else if (numRounds >= 3) gap = 210; // size 8

  let ROW_PITCH = 46;
  if (size === 2) ROW_PITCH = 140;
  else if (size === 4) ROW_PITCH = 110;
  else if (size === 8) ROW_PITCH = 75;
  else if (size === 16) ROW_PITCH = 58;
  else if (size === 32) ROW_PITCH = 46;
  else if (size === 64) ROW_PITCH = 40;

  // Compute absolute positions dynamically for split symmetrical bracket
  const positions: { x: number; y: number }[][] = [];
  for (let k = 0; k <= numRounds; k++) {
    const count = size / Math.pow(2, k);
    const arr: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      // Calculate X
      let x: number;
      if (k === numRounds) {
        x = PAD + numRounds * gap; // Perfectly centered final Champion column
      } else {
        const isLeft = i < count / 2;
        if (isLeft) {
          x = PAD + k * gap;
        } else {
          x = PAD + (2 * numRounds - k) * gap;
        }
      }

      // Calculate Y
      let y: number;
      if (k === 0) {
        // Leaves share same vertical alignment top-to-bottom on both sides
        const j = i < count / 2 ? i : (i - count / 2);
        y = PAD + j * ROW_PITCH + ROW_PITCH / 2;
      } else if (k === numRounds) {
        const prev1Y = positions[k - 1][0].y;
        const prev2Y = positions[k - 1][1].y;
        y = (prev1Y + prev2Y) / 2;
      } else {
        const prev1Y = positions[k - 1][2 * i].y;
        const prev2Y = positions[k - 1][2 * i + 1].y;
        y = (prev1Y + prev2Y) / 2;
      }
      arr.push({ x, y });
    }
    positions.push(arr);
  }

  const canvasWidth = PAD * 2 + 2 * numRounds * gap + BOX_W;
  const canvasHeight = PAD * 2 + Math.max(2, size / 2) * ROW_PITCH;

  const MAX_PRINT_WIDTH = 1050; // landscape width inside margins
  const MAX_PRINT_HEIGHT = 400; // landscape height leaving room for headers and podium
  const scaleWidth = MAX_PRINT_WIDTH / canvasWidth;
  const scaleHeight = MAX_PRINT_HEIGHT / canvasHeight;
  const printScale = Math.min(1, scaleWidth, scaleHeight);

  const isClassic = layout === 'classic';

  // Compile high-fidelity connector line commands in split-bracket mode
  const connectorLines: string[] = [];

  if (isClassic) {
     // Draw the horizonal line under EVERY node
     for (let k = 0; k <= numRounds; k++) {
         if (k === numRounds) continue; // Champion node handled via vertical tick
         const count = positions[k].length;
         for (let i = 0; i < count; i++) {
             const pos = positions[k][i];
             connectorLines.push(`M ${pos.x} ${pos.y} L ${pos.x + BOX_W} ${pos.y}`);
         }
     }
  }

  for (let k = 1; k <= numRounds; k++) {
    const count = positions[k].length;
    for (let m = 0; m < count; m++) {
      const c1 = positions[k - 1][2 * m];
      const c2 = positions[k - 1][2 * m + 1];
      const parent = positions[k][m];

      if (k === numRounds) {
        if (isClassic) {
           const riserX = (c1.x + BOX_W + c2.x) / 2;
           // Straight horizontal line joining the two sides
           connectorLines.push(`M ${c1.x + BOX_W} ${c1.y} L ${c2.x} ${c2.y}`);
           // Short vertical tick for the champion slot
           connectorLines.push(`M ${riserX} ${c1.y} L ${riserX} ${c1.y - 12}`);
        } else {
           // Final match: LHS and RHS meet perfectly horizontal at the center node
           connectorLines.push(`M ${c1.x + BOX_W} ${c1.y} L ${parent.x} ${parent.y}`);
           connectorLines.push(`M ${c2.x} ${c2.y} L ${parent.x + BOX_W} ${parent.y}`);
        }
      } else {
        const isLeftParent = m < count / 2;
        if (isLeftParent) {
          // Left-hand side connectors flow left to right
          const riserX = (c1.x + BOX_W + parent.x) / 2;
          connectorLines.push(`M ${c1.x + BOX_W} ${c1.y} L ${riserX} ${c1.y}`);
          connectorLines.push(`M ${c2.x + BOX_W} ${c2.y} L ${riserX} ${c2.y}`);
          connectorLines.push(`M ${riserX} ${c1.y} L ${riserX} ${c2.y}`);
          connectorLines.push(`M ${riserX} ${parent.y} L ${parent.x} ${parent.y}`);
        } else {
          // Right-hand side connectors flow right to left
          const riserX = (c1.x + parent.x + BOX_W) / 2;
          connectorLines.push(`M ${c1.x} ${c1.y} L ${riserX} ${c1.y}`);
          connectorLines.push(`M ${c2.x} ${c2.y} L ${riserX} ${c2.y}`);
          connectorLines.push(`M ${riserX} ${c1.y} L ${riserX} ${c2.y}`);
          connectorLines.push(`M ${riserX} ${parent.y} L ${parent.x + BOX_W} ${parent.y}`);
        }
      }
    }
  }

  const handleZoom = (factor: number) => {
    setScale((prev) => Math.min(Math.max(0.4, prev * factor), 2));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  return (
    <div
      id={`page-${categoryKey.replace(/[^a-zA-Z0-9]/g, '_')}`}
      data-canvas-width={canvasWidth}
      data-canvas-height={canvasHeight}
      data-ring={ring}
      className="bracket-page-card bracket-page bg-white border border-slate-200 rounded-2xl p-6 md:p-8 mb-8 shadow-sm no-print-break-inside print:border-none print:shadow-none print:p-0 print:m-0"
    >
      <style>{`
        @media print {
          #page-${categoryKey.replace(/[^a-zA-Z0-9]/g, '_')} .print-scale-wrapper {
             transform: scale(${printScale}) !important;
             transform-origin: top center !important;
          }
          #page-${categoryKey.replace(/[^a-zA-Z0-9]/g, '_')} .bracket-canvas {
             width: ${canvasWidth * printScale}px !important;
             height: ${canvasHeight * printScale}px !important;
             margin: 0 auto !important;
          }
        }
      `}</style>
      {/* Centered Heading Layout precisely mimicking the PDF layout */}
      <div className="text-center pb-5 mb-6 border-b border-slate-100 max-w-2xl mx-auto">
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">
          {tournamentName || 'TOURNAMENT CHAMPIONSHIP'}
        </h1>
        <p className="text-xs md:text-sm font-black text-slate-800 tracking-widest uppercase mt-1">
          RING {ring}
        </p>
        <p className="text-base md:text-lg font-extrabold text-amber-600 tracking-normal mt-1.5 uppercase">
          {categoryKey}
        </p>
        <p className="text-xs text-slate-500 font-bold mt-1">
          {entrantCount} competitors
        </p>
        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
          {new Date().toISOString().split('T')[0]}
        </p>

        {/* Action Controls hidden on general print layout */}
        <div className="flex justify-center items-center gap-1.5 mt-3 no-print">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
            <button
              onClick={() => handleZoom(0.85)}
              className="p-1 px-1.5 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1 px-1.5 hover:bg-white text-slate-600 rounded bg-transparent font-mono text-[10px] font-bold transition-all cursor-pointer"
              title="Reset Zoom"
            >
              {(scale * 100).toFixed(0)}%
            </button>
            <button
              onClick={() => handleZoom(1.15)}
              className="p-1 px-1.5 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onReshuffle}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-950 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Reshuffle seeds</span>
          </button>

          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold select-none">
            <span className="text-amber-500 font-sans">✨</span>
            <span>Drag & Drop players to swap slots</span>
          </div>
        </div>
      </div>

      {/* Symmetrical split bracket workspace container */}
      <div className="overflow-x-auto overflow-y-hidden pb-4 pt-4 rounded-xl border border-slate-100/10 print:overflow-visible print:border-none print:flex print:justify-center">
        <div
          className="bracket-canvas relative origin-top-left transition-transform duration-100 print:transform-none"
          style={{
            width: `${canvasWidth * scale}px`,
            height: `${canvasHeight * scale}px`,
            margin: '0 auto',
          }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left print-scale-wrapper"
            style={{ transform: `scale(${scale})`, width: canvasWidth, height: canvasHeight }}
          >
            {/* Symmetrical line connectors svg layer */}
            <svg
              className="absolute top-0 left-0 pointer-events-none"
              width={canvasWidth}
              height={canvasHeight}
              style={{ minWidth: canvasWidth, minHeight: canvasHeight }}
            >
              <path
                d={connectorLines.join(' ')}
                fill="none"
                stroke="#1e293b"
                strokeWidth="1.2"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>

            {/* Symmetrical riser bout number boxes */}
            {positions.map((roundPositions, k) => {
              if (k < 1) return null;
              if (k === numRounds && !isClassic) return null;
              
              return roundPositions.map((pos, m) => {
                const node = nodes[k][m];
                const hasBout = typeof node.bout === 'number';
                if (!hasBout) return null;

                const BOUT_BOX_W = isClassic ? 44 : 34;
                const BOUT_BOX_H = isClassic ? 24 : 18;

                if (k === numRounds) {
                   const c1 = positions[k - 1][0];
                   const c2 = positions[k - 1][1];
                   const riserX = (c1.x + BOX_W + c2.x) / 2;
                   const riserY = pos.y;
                   return (
                     <div
                        key={`riser-bout-final`}
                        className={`absolute bg-white border border-slate-900 flex items-center justify-center font-sans tracking-tight text-slate-900 z-10 select-none print:border-black print:bg-white ${isClassic ? 'text-[15px] font-bold' : 'text-[11px] font-medium'}`}
                        style={{
                          left: `${riserX - BOUT_BOX_W / 2}px`,
                          top: `${riserY - BOUT_BOX_H / 2}px`,
                          width: `${BOUT_BOX_W}px`,
                          height: `${BOUT_BOX_H}px`,
                        }}
                      >
                        {getFormattedBout(ring, node.bout)}
                      </div>
                   )
                }

                const c1 = positions[k - 1][2 * m];
                const isLeftParent = m < roundPositions.length / 2;
                const riserX = isLeftParent
                  ? (c1.x + BOX_W + pos.x) / 2
                  : (c1.x + pos.x + BOX_W) / 2;
                const riserY = pos.y;

                return (
                  <div
                    key={`riser-bout-${k}-${m}`}
                    className={`absolute bg-white border border-slate-900 flex items-center justify-center font-sans tracking-tight text-slate-900 z-10 select-none print:border-black print:bg-white ${isClassic ? 'text-[15px] font-bold' : 'text-[11px] font-medium rounded-sm shadow-sm font-extrabold font-mono text-[10px]'}`}
                    style={{
                      left: `${riserX - BOUT_BOX_W / 2}px`,
                      top: `${riserY - BOUT_BOX_H / 2}px`,
                      width: `${BOUT_BOX_W}px`,
                      height: `${BOUT_BOX_H}px`,
                    }}
                  >
                    {getFormattedBout(ring, node.bout)}
                  </div>
                );
              });
            })}

            {/* Symmetrical render matches list */}
            {positions.map((roundPositions, k) => {
              return roundPositions.map((pos, i) => {
                const node = nodes[k][i];
                const hasBout = typeof node.bout === 'number';

                const x = pos.x;
                const y = pos.y - (k === numRounds ? 23 : BOX_H / 2);

                const countInRound = size / Math.pow(2, k);
                const isLeft = k < numRounds && (i < countInRound / 2);

                // Leaf Nodes: Round 0
                if (k === 0) {
                  const sibling = nodes[k][i ^ 1];
                  const isWalkover = !!(sibling && sibling.isBye);

                  const isDragging = draggingIndex === i;
                  const isDragOver = dragOverIndex === i;

                  if (node.isBye) {
                    return (
                      <div
                        key={`${k}-${i}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragEnter={(e) => handleDragEnter(e, i)}
                        onDragLeave={() => handleDragLeave(i)}
                        onDrop={(e) => handleDrop(e, i)}
                        onClick={() => {
                          setSelectedLeafIndex(i);
                          setEditName('');
                          setEditClub('');
                          setEditIsBye(true);
                          setSwapTargetIndex('');
                          setShowModal(true);
                        }}
                        className={`absolute flex items-center px-2 cursor-grab active:cursor-grabbing transition-all group ${
                          isClassic 
                            ? `bg-transparent text-[9px]` 
                            : `bg-slate-50 border border-slate-200 border-dashed rounded text-[10px]`
                        } text-slate-400 font-mono italic hover:border-amber-500 hover:bg-amber-50/10 ${
                          isLeft ? 'flex-row text-left' : 'flex-row-reverse text-right'
                        } ${isDragging ? 'opacity-40 scale-95' : ''} ${
                          isDragOver ? 'border-amber-500 bg-amber-50/30 scale-105 shadow-md ring-2 ring-amber-500/20 z-20' : ''
                        }`}
                        style={{
                          left: `${x}px`,
                          top: isClassic ? `${y - 20}px` : `${y}px`,
                          width: `${BOX_W}px`,
                          height: `${BOX_H}px`,
                        }}
                      >
                        {isClassic ? (
                          <div className="flex flex-col w-full h-full justify-between min-w-0">
                            {/* BYE text ON TOP of the line */}
                            <div className={`h-[20px] flex items-end gap-1.5 w-full pb-[2.5px] overflow-hidden min-w-0 ${isLeft ? 'justify-start text-left' : 'justify-end text-right'}`}>
                              <span className="text-[12px] font-mono font-black text-slate-500 shrink-0">{node.seed} -</span>
                              <span className="text-[14.5px] font-black tracking-tight text-slate-400 uppercase truncate whitespace-nowrap min-w-0">BYE</span>
                            </div>
                            {/* Empty space below line */}
                            <div className="h-[20px]" />
                          </div>
                        ) : (
                          <>
                            <span className={`w-5 text-slate-350 font-bold group-hover:text-amber-500 transition-colors ${isLeft ? 'mr-1 text-left' : 'ml-1 text-right'}`}>
                              {node.seed}
                            </span>
                            <span className="flex-1 text-[11px] font-black uppercase">BYE</span>
                          </>
                        )}
                        {isClassic && (
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-amber-500 font-bold ml-1 absolute bottom-0 right-0 p-1">
                              + Edit
                            </span>
                        )}
                        {!isClassic && (
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-amber-500 font-bold ml-1">
                              + Edit
                            </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${k}-${i}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDragEnter={(e) => handleDragEnter(e, i)}
                      onDragLeave={() => handleDragLeave(i)}
                      onDrop={(e) => handleDrop(e, i)}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                        setSelectedLeafIndex(i);
                        setEditName(node.isBye ? '' : node.name);
                        setEditClub(node.club || '');
                        setEditIsBye(node.isBye);
                        setSwapTargetIndex('');
                        setShowModal(true);
                      }}
                      className={`absolute flex items-center px-2 cursor-grab active:cursor-grabbing transition-all group ${
                        isClassic 
                          ? `bg-transparent ${node.checked ? 'text-emerald-900' : ''}`
                          : `py-1.5 bg-white border border-slate-900 rounded shadow-sm hover:shadow-md hover:border-amber-500 hover:bg-amber-50/5 ${node.checked ? 'bg-emerald-50/75 border-emerald-500 ring-1 ring-emerald-500/20' : ''}`
                      } ${isWalkover ? (isClassic ? '' : 'bg-amber-50/10 border-slate-400') : ''} ${
                        isLeft ? 'flex-row' : 'flex-row-reverse'
                      } ${isDragging ? 'opacity-40 scale-95' : ''} ${
                        isDragOver ? 'border-amber-500 bg-amber-50/30 scale-105 shadow-md ring-2 ring-amber-500/20 z-20' : ''
                      }`}
                      style={{
                        left: `${x}px`,
                        top: isClassic ? `${y - 20}px` : `${y}px`,
                        width: `${BOX_W}px`,
                        height: `${BOX_H}px`,
                      }}
                    >
                      {/* Advancing check trigger */}
                      {!isClassic && (
                        <span className={`flex items-center justify-center ${isLeft ? 'mr-1.5 order-1' : 'ml-1.5 order-3'}`}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 accent-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                            checked={node.checked}
                            disabled={isWalkover}
                            onChange={(e) => onCheckboxToggle(k, i, e.target.checked)}
                          />
                        </span>
                      )}

                      {isClassic ? (
                        <div className="flex flex-col w-full h-full justify-between min-w-0">
                           {/* Player Name ON TOP of the line */}
                           <div className={`h-[20px] flex items-end gap-1.5 w-full pb-[2.5px] overflow-hidden min-w-0 ${isLeft ? 'justify-start text-left' : 'justify-end text-right'}`}>
                              <span className="text-[12px] font-mono font-black text-slate-500 shrink-0">{node.seed} -</span>
                              <span className="text-[14.5px] font-black tracking-tight text-slate-900 uppercase truncate whitespace-nowrap min-w-0" title={node.name}>{node.name}</span>
                              {isWalkover && <span className="text-[11px] text-amber-600 font-bold ml-1 shrink-0">Walkover</span>}
                           </div>
                           {/* Club BELOW the line */}
                           <div className={`h-[20px] flex items-start pt-[2.5px] w-full text-[11px] font-extrabold text-slate-500 uppercase tracking-tight overflow-hidden min-w-0 ${isLeft ? 'justify-start text-left' : 'justify-end text-right'}`}>
                              <span className="truncate whitespace-nowrap min-w-0">{node.club || '(Ind.)'}</span>
                           </div>
                        </div>
                      ) : (
                        <>
                          <span className={`w-5 text-slate-400 font-mono text-[10px] font-bold group-hover:text-amber-500 transition-colors order-2 ${
                            isLeft ? 'text-left mr-0.5' : 'text-right ml-0.5'
                          }`}>
                            {node.seed}
                          </span>
                          <div className={`flex-1 min-w-0 leading-tight order-2 ${isLeft ? 'text-left pr-1' : 'text-right pl-1'}`}>
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] font-black text-slate-800 uppercase mt-0.5" title={node.name}>
                                {node.name}
                              </p>
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-amber-500 font-bold font-sans">
                                ✎
                              </span>
                            </div>
                            <p className="text-[9px] text-slate-400 tracking-wide font-medium">
                              {node.club || 'Ind.'} {isWalkover ? '· Walkover' : ''}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  );
                }

                // Intermediate Rounds
                if (k < numRounds) {
                  const sibling = nodes[k][i ^ 1];
                  const isWalkover = !!(sibling && sibling.isBye);

                  if (node.isBye) {
                    return (
                      <div
                        key={`${k}-${i}`}
                        className={`absolute flex items-center bg-transparent ${isClassic ? 'justify-center' : 'justify-center border border-slate-200 border-dashed rounded bg-slate-50'} text-[11px] text-slate-300 font-semibold`}
                        style={{
                          left: `${x}px`,
                          top: isClassic ? `${y - 20}px` : `${y}px`,
                          width: `${BOX_W}px`,
                          height: `${BOX_H}px`,
                        }}
                      >
                        {!isClassic && '—'}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${k}-${i}`}
                      className={`absolute flex items-center px-2 cursor-grab active:cursor-grabbing transition-all group ${
                        isClassic 
                          ? `bg-transparent ${node.checked ? 'border-emerald-500 text-emerald-900' : ''}`
                          : `bg-white border border-slate-900 rounded shadow-sm hover:shadow transition-all ${
                              node.name ? 'bg-slate-50/50' : 'border-dashed border-slate-400'
                            } ${node.checked ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500/20' : ''}`
                      } ${
                        isLeft ? 'flex-row' : 'flex-row-reverse'
                      }`}
                      style={{
                        left: `${x}px`,
                        top: isClassic ? `${y - 20}px` : `${y}px`,
                        width: `${BOX_W}px`,
                        height: `${BOX_H}px`,
                      }}
                    >
                      {/* Advance Check trigger */}
                      {!isClassic && (
                        <span className={`flex items-center justify-center ${isLeft ? 'mr-1.5' : 'ml-1.5'}`}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 accent-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                            checked={node.checked}
                            disabled={!node.name || isWalkover}
                            onChange={(e) => onCheckboxToggle(k, i, e.target.checked)}
                          />
                        </span>
                      )}

                      {/* Name input flow */}
                      {isClassic ? (
                        <div className="flex flex-col w-full h-full justify-between min-w-0">
                           {/* Player Name ON TOP of the line */}
                           <div className={`h-[20px] flex items-end w-full pb-[2.5px] overflow-hidden min-w-0 ${isLeft ? 'justify-start text-left' : 'justify-end text-right'}`}>
                              <input
                                type="text"
                                className={`w-full bg-transparent border-none outline-none text-[14.5px] font-black text-slate-900 placeholder-slate-350 uppercase tracking-tight truncate whitespace-nowrap min-w-0 ${
                                  isLeft ? 'text-left' : 'text-right'
                                }`}
                                placeholder="W..."
                                value={node.name || ''}
                                onChange={(e) => onTextChange(k, i, e.target.value)}
                              />
                           </div>
                           {/* Club BELOW the line */}
                           <div className={`h-[20px] flex items-start pt-[2.5px] w-full text-[11px] font-extrabold text-slate-500 uppercase tracking-tight overflow-hidden min-w-0 ${isLeft ? 'justify-start text-left' : 'justify-end text-right'}`}>
                              <span className="truncate whitespace-nowrap min-w-0">{node.club || ''}</span>
                           </div>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className={`w-full bg-transparent border-none outline-none text-[11px] font-black text-slate-800 placeholder-slate-300 tracking-tight uppercase mt-0.5 ${
                            isLeft ? 'text-left' : 'text-right'
                          }`}
                          placeholder="Winner advances..."
                          value={node.name || ''}
                          onChange={(e) => onTextChange(k, i, e.target.value)}
                        />
                      )}
                    </div>
                  );
                }

                // Champion Node (k === numRounds)
                if (isClassic) {
                  return (
                     <div
                        key={`${k}-${i}`}
                        className="absolute flex items-center justify-center px-1"
                        style={{
                          left: `${x}px`,
                          top: `${y - 12}px`, /* Above the bout box */
                          width: `${BOX_W}px`,
                          height: `${BOX_H}px`,
                        }}
                      >
                         <div className="flex flex-col w-full h-full justify-end items-center text-center">
                             <input
                               type="text"
                               className="w-full bg-transparent border-b-[1.5px] border-slate-900 pb-1 outline-none text-[16px] font-black text-slate-800 placeholder-slate-300 uppercase tracking-tight text-center"
                               placeholder="CHAMPION"
                               value={node.name || ''}
                               onChange={(e) => onTextChange(k, i, e.target.value)}
                             />
                         </div>
                      </div>
                  );
                }

                return (
                  <div
                    key={`${k}-${i}`}
                    className="absolute flex items-center gap-1.5 px-3 bg-amber-50/90 border-2 border-amber-500 rounded-lg shadow-md group animate-fade-in text-center"
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${BOX_W}px`,
                      height: '46px',
                    }}
                  >
                    {hasBout ? (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-slate-950 rounded text-[8px] font-black tracking-widest uppercase shadow-sm">
                        FINAL · {getFormattedBout(ring, node.bout)}
                      </span>
                    ) : (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-slate-950 rounded text-[8px] font-black tracking-widest uppercase shadow-sm">
                        CHAMPION
                      </span>
                    )}

                    <Trophy className="w-4.5 h-4.5 text-amber-500 flex-shrink-0" />
                    <input
                      type="text"
                      className="w-full bg-transparent border-none outline-none text-xs font-black text-amber-950 placeholder-amber-400 text-center"
                      placeholder="Grand Champion"
                      value={node.name || ''}
                      onChange={(e) => onTextChange(k, i, e.target.value)}
                    />
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>

      {/* Symmetrical Podium Podium table block as shown in the target print sheet */}
      <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col items-center">
        <div className="w-[320px] border border-slate-350 rounded-lg bg-white overflow-hidden text-xs shadow-sm select-none">
          <div className="bg-slate-50 border-b border-slate-350 px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
            Final Standings
          </div>
          <div className="divide-y divide-slate-200">
            <div className="px-3.5 py-2 flex items-center gap-2">
              <span className="font-extrabold w-4 text-amber-500">1.</span>
              <div className="flex-1 text-slate-400 font-medium italic">
                {nodes[numRounds]?.[0]?.name ? (
                  <strong className="text-slate-900 not-italic font-extrabold">{nodes[numRounds][0].name}</strong>
                ) : (
                  'TBD (Winner of Final)'
                )}
              </div>
            </div>
            <div className="px-3.5 py-2 flex items-center gap-2">
              <span className="font-extrabold w-4 text-slate-400">2.</span>
              <div className="flex-1 text-slate-400 font-medium italic">
                {/* Runner up from the final node */}
                {nodes[numRounds]?.[0]?.name && (nodes[numRounds - 1]?.[0]?.checked || nodes[numRounds - 1]?.[1]?.checked) ? (
                  <strong className="text-slate-800 not-italic font-bold">
                    {nodes[numRounds - 1][0].checked ? nodes[numRounds - 1][1].name : nodes[numRounds - 1][0].name}
                  </strong>
                ) : (
                  'TBD (Runner-up)'
                )}
              </div>
            </div>
            <div className="px-3.5 py-2 flex items-center gap-2">
              <span className="font-extrabold w-4 text-amber-700/60 font-mono">3.</span>
              <div className="flex-1 text-slate-400 font-medium italic">TBD</div>
            </div>
            <div className="px-3.5 py-2 flex items-center gap-2">
              <span className="font-extrabold w-4 text-amber-700/60 font-mono">3.</span>
              <div className="flex-1 text-slate-400 font-medium italic">TBD</div>
            </div>
          </div>
        </div>

        {/* Dynamic clean professional footer print line */}
        <p className="text-[9px] text-slate-400 font-medium italic mt-6 tracking-wide uppercase select-none text-center">
          Generated automatically via Bracket Builder · Printed on {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Edit Leaf Node Modal overlay */}
      {showModal && selectedLeafIndex !== null && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 font-sans no-print">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl relative">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <span className="text-amber-500 text-lg">🥋</span>
              <span>Edit Competitor — Slot {selectedLeafIndex + 1} (Seed {nodes[0][selectedLeafIndex].seed})</span>
            </h3>

            <div className="space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEditIsBye(false)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    !editIsBye ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Competitor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditIsBye(true);
                    setEditName('BYE');
                    setEditClub('');
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    editIsBye ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  BYE / Empty
                </button>
              </div>

              {!editIsBye && (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Competitor Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-extrabold focus:bg-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Club / Team
                    </label>
                    <input
                      type="text"
                      value={editClub}
                      onChange={(e) => setEditClub(e.target.value)}
                      placeholder="e.g. Phoenix Judo Club (or leave blank)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-extrabold focus:bg-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                    />
                  </div>
                </>
              )}

              {/* Swapping Dropdown */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  Swap Position with another Seed Slot
                </label>
                <select
                  value={swapTargetIndex}
                  onChange={(e) => setSwapTargetIndex(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-amber-500 transition-all cursor-pointer font-sans"
                >
                  <option value="">-- Choose target slot --</option>
                  {nodes[0].map((n, idx) => {
                    if (idx === selectedLeafIndex) return null;
                    const desc = n.isBye ? 'BYE' : `${n.name} (${n.club || 'Ind.'})`;
                    return (
                      <option key={idx} value={idx}>
                        Slot {idx + 1} (Seed {n.seed}): {desc}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-slate-400 font-bold mt-1 leading-normal">
                  💡 Swapping moves this player to the selected slot and brings the target player there. You can also drag & drop players directly on the bracket canvas to swap!
                </p>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex gap-2.5 justify-end mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 hover:bg-slate-100 text-slate-550 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // Apply actions!
                  if (swapTargetIndex !== '') {
                    const j = parseInt(swapTargetIndex, 10);
                    if (onSwapLeafNodes && !isNaN(j)) {
                      onSwapLeafNodes(selectedLeafIndex, j);
                    }
                  } else {
                    if (onUpdateLeafNode) {
                      onUpdateLeafNode(selectedLeafIndex, editName, editClub, editIsBye);
                    }
                  }
                  setShowModal(false);
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { BracketModel, BracketNode } from '../types';
import { Trophy, Shuffle, ZoomIn, ZoomOut, Trash2 } from 'lucide-react';
import { isRealBout, countRealBouts } from '../utils/bracketUtils';
import { CertificateModal } from './CertificateModal';

const BOX_W = 240;
const BOX_H = 40;
const PAD = 16;

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
  categoriesList?: string[];
  onMoveToCategory?: (i: number, targetCategoryKey: string) => void;
  boutLabelFormat?: 'alpha-2' | 'thousands-3';
  onUpdateStandings?: (standings: string[]) => void;
}

function getFormattedBout(
  ring: string | number,
  boutNumber: number | undefined,
  boutLabelFormat: string = 'alpha-2'
): string {
  if (boutNumber === undefined) return '';

  let ringNum = 1;
  if (typeof ring === 'number') {
    ringNum = ring;
  } else {
    const cleaned = String(ring).trim().toLowerCase();
    const numMatch = cleaned.match(/\d+$/);
    if (numMatch) {
      ringNum = parseInt(numMatch[0], 10);
    } else {
      const letterMatch = cleaned.match(/[a-z]$/);
      if (letterMatch) {
        ringNum = letterMatch[0].charCodeAt(0) - 96;
      }
    }
  }

  if (isNaN(ringNum) || ringNum < 1) ringNum = 1;

  if (boutLabelFormat === 'thousands-3') {
    const pad = String(boutNumber).padStart(3, '0');
    return `${ringNum}${pad}`;
  } else {
    const letter = String.fromCharCode(64 + ringNum);
    const pad = String(boutNumber).padStart(2, '0');
    return `${letter}${pad}`;
  }
}

export const BracketCanvas: React.FC<BracketCanvasProps> = ({
  bracket,
  ring,
  entrantCount,
  layout = 'classic',
  onReshuffle,
  onCheckboxToggle,
  onTextChange,
  tournamentName,
  onUpdateLeafNode,
  onSwapLeafNodes,
  categoriesList,
  onMoveToCategory,
  boutLabelFormat = 'alpha-2',
  onUpdateStandings,
}) => {
  const [scale, setScale] = useState(1);
  const [isAutoFit, setIsAutoFit] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedLeafIndex, setSelectedLeafIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editClub, setEditClub] = useState('');
  const [editIsBye, setEditIsBye] = useState(false);
  const [swapTargetIndex, setSwapTargetIndex] = useState<string>('');
  const [selectedTargetCategory, setSelectedTargetCategory] = useState<string>('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverStandingsIndex, setDragOverStandingsIndex] = useState<number | null>(null);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [certificateAthlete, setCertificateAthlete] = useState<{ name: string; club: string; category: string } | null>(null);

  if (!bracket || !bracket.nodes) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-center">
        <p className="text-sm text-slate-500">Invalid or uninitialized bracket configuration.</p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Keep it functional and secure
    e.dataTransfer.setData('text/plain', index.toString());
    const leafNode = nodes[0]?.[index];
    if (leafNode && leafNode.name && !leafNode.isBye) {
      e.dataTransfer.setData('athleteName', leafNode.name);
    }
    e.dataTransfer.effectAllowed = 'copyMove';
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

  const handleDropToStanding = (e: React.DragEvent, slotIdx: number) => {
    e.preventDefault();
    setDragOverStandingsIndex(null);
    const athleteName = e.dataTransfer.getData('athleteName') || e.dataTransfer.getData('text/plain');
    if (!athleteName) return;

    if (onUpdateStandings) {
      const nextStandings = [
        bracket.standings?.[0] || '',
        bracket.standings?.[1] || '',
        bracket.standings?.[2] || '',
        bracket.standings?.[3] || '',
      ];
      nextStandings[slotIdx] = athleteName;
      onUpdateStandings(nextStandings);
    }
  };

  const clearStandingSlot = (slotIdx: number) => {
    if (onUpdateStandings) {
      const nextStandings = [
        bracket.standings?.[0] || '',
        bracket.standings?.[1] || '',
        bracket.standings?.[2] || '',
        bracket.standings?.[3] || '',
      ];
      nextStandings[slotIdx] = '';
      onUpdateStandings(nextStandings);
    }
  };

  const { size, numRounds, nodes, categoryKey } = bracket;

  // Sizing adapters: scale gap and pitch dynamically based on bracket rounds
  let gap = 240;

  let ROW_PITCH = 46;
  if (size === 2) ROW_PITCH = 340;
  else if (size === 4) ROW_PITCH = 300;
  else if (size === 8) ROW_PITCH = 200;
  else if (size === 16) ROW_PITCH = 140;
  else if (size === 32) ROW_PITCH = 90;
  else if (size === 64) ROW_PITCH = 65;

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

  const isClassic = layout === 'classic';
  const canvasWidth = PAD * 2 + 2 * numRounds * gap + BOX_W;
  const baseCanvasHeight = PAD * 2 + Math.max(2, size / 2) * ROW_PITCH;
  const finalY = positions[numRounds]?.[0]?.y ?? (baseCanvasHeight / 2);
  const minRequiredHeight = finalY + (isClassic ? 75 : 95) + 180 + PAD;
  const canvasHeight = Math.max(baseCanvasHeight, minRequiredHeight);

  const MAX_PRINT_WIDTH = 1060; // landscape width inside margins
  const MAX_PRINT_HEIGHT = 630; // landscape height leaving room for headers
  const scaleWidth = MAX_PRINT_WIDTH / canvasWidth;
  const scaleHeight = MAX_PRINT_HEIGHT / canvasHeight;
  const printScale = Math.min(1, scaleWidth, scaleHeight);

  // Set up ResizeObserver to observe parent container size changes
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const rect = entries[0].contentRect;
      setContainerWidth(rect.width);
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Set the dynamic scale when auto-fit is active
  useEffect(() => {
    if (isAutoFit && containerWidth && canvasWidth) {
      // Scale to fit available container width minus some margins for aesthetics
      const horizontalPadding = 16;
      const fitScale = (containerWidth - horizontalPadding) / canvasWidth;
      // Clamp fitScale to reasonable bounds so it doesn't get unreadably tiny or huge
      setScale(Math.max(0.3, Math.min(2.5, fitScale)));
    }
  }, [isAutoFit, containerWidth, canvasWidth]);

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
        } else {
           // Final match: LHS and RHS meet perfectly horizontal at the center node - removed per user request: "remove 1 left/right connector lines"
           // connectorLines.push(`M ${c1.x + BOX_W} ${c1.y} L ${parent.x} ${parent.y}`);
           // connectorLines.push(`M ${c2.x} ${c2.y} L ${parent.x + BOX_W} ${parent.y}`);
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
    setIsAutoFit(false);
    setScale((prev) => Math.min(Math.max(0.3, prev * factor), 2.5));
  };

  const handleResetZoom = () => {
    setIsAutoFit((prev) => !prev);
  };

  return (
    <div
      id={`page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')}`}
      data-canvas-width={canvasWidth}
      data-canvas-height={canvasHeight}
      data-ring={ring}
      data-category={categoryKey}
      className="bracket-page-card bracket-page bg-white border border-slate-200 rounded-2xl p-6 md:p-8 mb-8 shadow-sm no-print-break-inside print:border-none print:shadow-none print:p-0 print:m-0"
    >
      <style>{`
        @media print {
          #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} .print-scale-wrapper {
             transform: scale(${printScale}) !important;
             transform-origin: top center !important;
          }
          #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} .bracket-canvas {
             width: ${canvasWidth * printScale}px !important;
             height: ${canvasHeight * printScale}px !important;
             margin: 0 auto !important;
          }
        }
      `}</style>
      {/* Centered Heading Layout precisely mimicking the PDF layout */}
      <div className="text-center border-b border-slate-100 max-w-2xl mx-auto -mt-2">
        <h1 className="text-[26px] md:text-[30px] font-black text-slate-900 tracking-tight uppercase">
          {tournamentName || 'TOURNAMENT CHAMPIONSHIP'}
        </h1>
        <p className="text-[22px] md:text-[24px] font-black text-slate-800 tracking-widest uppercase mt-1">
          RING {ring}
        </p>
        <p className="text-[24px] md:text-[26px] font-extrabold text-amber-600 tracking-normal mt-1.5 uppercase">
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
              className={`p-1 px-2 rounded text-[10px] font-extrabold transition-all cursor-pointer uppercase tracking-wider ${isAutoFit ? 'bg-amber-500 text-slate-950 font-black' : 'bg-transparent text-slate-600 hover:bg-white font-bold'}`}
              title={isAutoFit ? "Auto-Fit: Active. Click to lock zoom" : "Click to auto-fit to screen"}
            >
              {isAutoFit ? 'Auto-Fit' : `${(scale * 100).toFixed(0)}%`}
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
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden py-1 rounded-xl border border-slate-100/10 print:overflow-visible print:border-none print:flex print:justify-center">
        <div
          className="bracket-canvas relative origin-top-left transition-transform duration-100 print:transform-none"
          style={{
            width: `${canvasWidth * scale}px`,
            height: `${canvasHeight * scale}px`,
            '--export-width': `${canvasWidth}px`,
            '--export-height': `${canvasHeight}px`,
            margin: '0 auto',
          } as React.CSSProperties}
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
                const node = nodes[k]?.[m];
                if (!node) return null;
                const hasBout = typeof node.bout === 'number';
                if (!hasBout) return null;

                const BOUT_BOX_W = isClassic ? 110 : 100;
                const BOUT_BOX_H = isClassic ? 52 : 52;

                if (k === numRounds) {
                   const c1 = positions[k - 1][0];
                   const c2 = positions[k - 1][1];
                   const riserX = (c1.x + BOX_W + c2.x) / 2;
                   const riserY = pos.y;
                   return (
                     <div
                        key={`riser-bout-final`}
                        className={`absolute bg-white border border-slate-900 flex items-center justify-center font-sans tracking-tight text-slate-900 z-10 select-none print:border-black print:bg-white font-bold print:text-[40px] ${isClassic ? 'text-[25px]' : 'text-[18px]'}`}
                        style={{
                          left: `${riserX - BOUT_BOX_W / 2}px`,
                          top: `${riserY - BOUT_BOX_H / 2}px`,
                          width: `${BOUT_BOX_W}px`,
                          height: `${BOUT_BOX_H}px`,
                        }}
                      >
                        {getFormattedBout(ring, node.bout, boutLabelFormat)}
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
                    className={`absolute bg-white border border-slate-900 flex items-center justify-center tracking-tight text-slate-900 z-10 select-none print:border-black print:bg-white font-bold print:text-[40px] ${isClassic ? 'font-sans text-[25px]' : 'rounded-sm shadow-sm font-mono text-[18px]'}`}
                    style={{
                      left: `${riserX - BOUT_BOX_W / 2}px`,
                      top: `${riserY - BOUT_BOX_H / 2}px`,
                      width: `${BOUT_BOX_W}px`,
                      height: `${BOUT_BOX_H}px`,
                    }}
                  >
                    {getFormattedBout(ring, node.bout, boutLabelFormat)}
                  </div>
                );
              });
            })}

            {/* Symmetrical render matches list */}
            {positions.map((roundPositions, k) => {
              return roundPositions.map((pos, i) => {
                const node = nodes[k]?.[i];
                if (!node) return null;
                const hasBout = typeof node.bout === 'number';

                const x = pos.x;
                const y = pos.y - (k === numRounds ? 23 : BOX_H / 2);

                const countInRound = size / Math.pow(2, k);
                const isLeft = k < numRounds && (i < countInRound / 2);

                // Leaf Nodes: Round 0
                if (k === 0) {
                  const sibling = nodes[k]?.[i ^ 1];
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
                          top: `${y}px`,
                          width: `${BOX_W}px`,
                          height: `${BOX_H}px`,
                        }}
                      >
                        {isClassic ? (
                          <div className="flex flex-col w-full h-full justify-between min-w-0">
                            {/* BYE text ON TOP of the line */}
                            <div className={`h-[20px] flex items-end gap-1.5 w-full pb-[2.5px] min-w-0 ${isLeft ? 'justify-start text-left' : 'justify-end text-right'}`}>
                              <span className="text-[12.5px] font-mono font-black text-slate-500 shrink-0">{node.seed} -</span>
                              <span className="text-[14px] font-black tracking-tight text-slate-400 uppercase whitespace-nowrap min-w-0">BYE</span>
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
                        setSelectedTargetCategory('');
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
                        top: `${y}px`,
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
                        <div className={`classic-competitor-container absolute bottom-0 flex flex-col h-full justify-between pointer-events-none ${isLeft ? 'left-0 items-start text-left' : 'right-0 items-end text-right'}`} style={{ width: 'max-content', minWidth: '100%' }}>
                           {/* Player Name ON TOP of the line */}
                           <div className={`h-[20px] flex items-end gap-1.5 w-full pb-[2.5px] ${isLeft ? 'justify-start' : 'justify-end'}`}>
                              <span className="text-[17.5px] font-mono font-black text-slate-500 shrink-0">{node.seed} -</span>
                              <span className="text-[22.5px] print:text-[32.5px] font-black tracking-tight text-slate-900 uppercase whitespace-nowrap pointer-events-auto" title={node.name}>{node.name}</span>
                           </div>
                           {/* Club BELOW the line */}
                           <div className={`h-[20px] flex items-start pt-[2.5px] w-full text-[19.5px] print:text-[29.5px] font-extrabold text-slate-500 uppercase tracking-wide ${isLeft ? 'justify-start' : 'justify-end'}`}>
                              <span className="competitor-club whitespace-nowrap pointer-events-auto">{node.club || '(Ind.)'}</span>
                           </div>
                        </div>
                      ) : (
                        <>
                          <span className={`w-5 text-slate-400 font-mono text-[10px] font-bold group-hover:text-amber-500 transition-colors order-2 ${
                            isLeft ? 'text-left mr-0.5' : 'text-right ml-0.5'
                          }`}>
                            {node.seed}
                          </span>
                          <div className={`flex-1 min-w-0 leading-tight order-2 flex flex-col justify-center ${isLeft ? 'text-left pr-1' : 'text-right pl-1'}`}>
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] font-black text-slate-800 uppercase mt-0.5" title={node.name}>
                                {node.name}
                              </p>
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-amber-500 font-bold font-sans">
                                ✎
                              </span>
                            </div>
                            <p className="competitor-club text-[9px] text-slate-400 tracking-wide font-medium">
                              {node.club || 'Ind.'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  );
                }

                // Intermediate Rounds
                if (k < numRounds) {
                  const sibling = nodes[k]?.[i ^ 1];
                  const isWalkover = !!(sibling && sibling.isBye);

                  if (node.isBye) {
                    return (
                      <div
                        key={`${k}-${i}`}
                        className={`absolute flex items-center bg-transparent ${isClassic ? 'justify-center' : 'justify-center border border-slate-200 border-dashed rounded bg-slate-50'} text-[11px] text-slate-300 font-semibold`}
                        style={{
                          left: `${x}px`,
                          top: `${y}px`,
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
                      draggable={!!node.name && !node.isBye}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('athleteName', node.name || '');
                        e.dataTransfer.setData('text/plain', node.name || '');
                        e.dataTransfer.effectAllowed = 'copyMove';
                      }}
                      className={`absolute flex items-center px-2 cursor-grab active:cursor-grabbing transition-all group ${
                        isClassic 
                          ? `bg-transparent ${node.checked ? 'border-emerald-500 text-emerald-900' : ''}`
                          : `bg-white border border-slate-900 rounded shadow-sm hover:shadow-md hover:border-amber-500 transition-all ${
                              node.name ? 'bg-slate-50/50' : 'border-dashed border-slate-400'
                            } ${node.checked ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500/20' : ''}`
                      } ${
                        isLeft ? 'flex-row' : 'flex-row-reverse'
                      }`}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
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
                        <div className={`classic-competitor-container absolute bottom-0 flex flex-col h-full justify-between pointer-events-none ${isLeft ? 'left-0 items-start text-left' : 'right-0 items-end text-right'}`} style={{ width: 'max-content', minWidth: '100%' }}>
                           {/* Player Name ON TOP of the line */}
                           <div className={`h-[20px] flex items-end w-full pb-[2.5px] ${isLeft ? 'justify-start' : 'justify-end'}`}>
                              <input
                                type="text"
                                className={`w-full min-w-[240px] bg-transparent border-none outline-none text-[22.5px] print:text-[32.5px] font-black text-slate-900 placeholder-slate-350 uppercase tracking-tight pointer-events-auto ${
                                  isLeft ? 'text-left' : 'text-right'
                                }`}
                                placeholder=""
                                value={node.name || ''}
                                onChange={(e) => onTextChange(k, i, e.target.value)}
                              />
                           </div>
                           {/* Club BELOW the line */}
                           <div className={`h-[20px] flex items-start pt-[2.5px] w-full text-[19.5px] print:text-[29.5px] font-extrabold text-slate-500 uppercase tracking-wide ${isLeft ? 'justify-start' : 'justify-end'}`}>
                              <span className="competitor-club whitespace-nowrap pointer-events-auto">{node.club || ''}</span>
                           </div>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className={`w-full bg-transparent border-none outline-none text-[11px] font-black text-slate-800 placeholder-slate-300 tracking-tight uppercase mt-0.5 ${
                            isLeft ? 'text-left' : 'text-right'
                          }`}
                          placeholder=""
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
                        draggable={!!node.name}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('athleteName', node.name || '');
                          e.dataTransfer.setData('text/plain', node.name || '');
                          e.dataTransfer.effectAllowed = 'copyMove';
                        }}
                        className="absolute flex items-center justify-center px-1 cursor-grab active:cursor-grabbing"
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
                               className="w-[260px] max-w-none bg-transparent pb-1 outline-none text-[24.5px] font-black text-slate-800 placeholder-slate-300 uppercase tracking-tight text-center"
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
                    draggable={!!node.name}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('athleteName', node.name || '');
                      e.dataTransfer.setData('text/plain', node.name || '');
                      e.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    className="absolute flex items-center gap-1.5 px-3 bg-amber-50/90 hover:bg-amber-100/90 border-2 border-amber-500 rounded-lg shadow-md group animate-fade-in text-center cursor-grab active:cursor-grabbing"
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${BOX_W}px`,
                      height: '46px',
                    }}
                  >
                    {hasBout ? (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-slate-950 rounded text-[8px] font-black tracking-widest uppercase shadow-sm">
                        FINAL · {getFormattedBout(ring, node.bout, boutLabelFormat)}
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
            <div
              className="absolute border border-slate-350 rounded-lg bg-white overflow-hidden text-xs shadow-sm select-none z-30"
              style={{
                width: '325px',
                left: `${PAD + numRounds * gap + (BOX_W - 325) / 2}px`,
                top: `${(positions[numRounds]?.[0]?.y ?? (baseCanvasHeight / 2)) + (isClassic ? 75 : 95)}px`,
              }}
            >
              <div className="bg-slate-50 border-b border-slate-350 px-3 py-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                Final Standings
              </div>
              <div className="divide-y divide-slate-200">
                {(() => {
                  const currentStandings = [
                    bracket.standings?.[0] || '',
                    bracket.standings?.[1] || '',
                    bracket.standings?.[2] || '',
                    bracket.standings?.[3] || '',
                  ];
                  const default1 = nodes[numRounds]?.[0]?.name || '';
                  const default2 = (nodes[numRounds]?.[0]?.name && (nodes[numRounds - 1]?.[0]?.checked || nodes[numRounds - 1]?.[1]?.checked))
                    ? (nodes[numRounds - 1]?.[0]?.checked ? (nodes[numRounds - 1]?.[1]?.name || '') : (nodes[numRounds - 1]?.[0]?.name || ''))
                    : '';

                  const getSlotPlaceholder = (idx: number) => {
                    if (currentStandings[idx] === '_REMOVED_') {
                      if (idx === 0) return `❌ (Removed: ${default1 || 'Winner'} - Click restore or drop)`;
                      if (idx === 1) return `❌ (Removed: ${default2 || 'Runner-up'} - Click restore or drop)`;
                      return '❌ (Medalist Removed - Click restore or drop)';
                    }
                    if (idx === 0) return default1 ? `${default1} (Auto)` : 'TBD (Winner of Final)';
                    if (idx === 1) return default2 ? `${default2} (Auto)` : 'TBD (Runner-up)';
                    return 'Drag competitor here';
                  };

                  return [0, 1, 2, 3].map((slotIdx) => {
                    const isOver = dragOverStandingsIndex === slotIdx;
                    const val = currentStandings[slotIdx];
                    const isRemoved = val === '_REMOVED_';
                    let displayName = isRemoved ? '' : val;
                    let isComputed = false;

                    if (!displayName) {
                      if (slotIdx === 0 && !isRemoved) {
                        displayName = default1;
                        isComputed = !!default1;
                      } else if (slotIdx === 1 && !isRemoved) {
                        displayName = default2;
                        isComputed = !!default2;
                      }
                    }

                    const labelColor =
                      slotIdx === 0
                        ? 'text-amber-500'
                        : slotIdx === 1
                        ? 'text-slate-400'
                        : 'text-amber-700/60';

                    return (
                      <div
                        key={slotIdx}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverStandingsIndex !== slotIdx) {
                            setDragOverStandingsIndex(slotIdx);
                          }
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setDragOverStandingsIndex(slotIdx);
                        }}
                        onDragLeave={() => {
                          if (dragOverStandingsIndex === slotIdx) {
                            setDragOverStandingsIndex(null);
                          }
                        }}
                        onDrop={(e) => handleDropToStanding(e, slotIdx)}
                        className={`px-3.5 py-2.5 flex items-center gap-2 transition-all group/slot relative ${
                          isOver
                            ? 'bg-amber-50 border-y border-amber-300 scale-[1.02] shadow-sm z-10'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <span className={`font-black w-4 text-[13px] ${labelColor}`}>
                          {slotIdx + 1}.
                        </span>
                        <div className="flex-1 flex items-center min-w-0">
                          <input
                            type="text"
                            value={val === '_REMOVED_' ? '' : val}
                            onChange={(e) => {
                              const nextS = [...currentStandings];
                              nextS[slotIdx] = e.target.value;
                              if (onUpdateStandings) onUpdateStandings(nextS);
                            }}
                            className={`w-full bg-transparent border-none outline-none text-[13.5px] font-semibold p-0 placeholder-slate-400 truncate focus:ring-0 ${
                              val && val !== '_REMOVED_'
                                ? 'text-slate-950 font-black' 
                                : isComputed 
                                ? 'text-slate-700 font-extrabold italic' 
                                : 'text-slate-400 font-medium italic'
                            }`}
                            placeholder={getSlotPlaceholder(slotIdx)}
                          />
                        </div>

                        {/* Badges/Controls */}
                        <div className="flex items-center gap-1.5 shrink-0 select-none">
                          {!val && isComputed && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextS = [...currentStandings];
                                nextS[slotIdx] = '_REMOVED_';
                                if (onUpdateStandings) onUpdateStandings(nextS);
                              }}
                              className="bg-rose-50 hover:bg-rose-105 active:scale-95 text-rose-600 hover:text-white border border-transparent hover:border-rose-300 p-1 rounded-md cursor-pointer transition-all no-print flex items-center justify-center gap-0.5 text-[8px] font-semibold"
                              title="Exclude this competitor from final standings"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Remove</span>
                            </button>
                          )}

                          {val && val !== '_REMOVED_' && (
                            <button
                              onClick={() => clearStandingSlot(slotIdx)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full w-4 h-4 flex items-center justify-center text-[10px] cursor-pointer transition-all no-print"
                              title="Clear custom result"
                            >
                              ×
                            </button>
                          )}

                          {val === '_REMOVED_' && (
                            <button
                              onClick={() => clearStandingSlot(slotIdx)}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-700 hover:text-amber-900 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider cursor-pointer transition-all no-print"
                              title="Restore automatic medalist calculations"
                            >
                              Restore
                            </button>
                          )}
                          
                          {!displayName && !val && (
                            <span className="text-[8px] text-slate-350 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded font-black uppercase tracking-wider group-hover/slot:opacity-0 transition-opacity no-print">
                              Drop
                            </span>
                          )}

                          {val && val !== '_REMOVED_' && (
                            <span className="text-[8px] text-amber-600 bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 rounded font-black uppercase tracking-wider scale-90 no-print">
                              Custom
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Edit Leaf Node Modal overlay */}
      {showModal && selectedLeafIndex !== null && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 font-sans no-print">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl relative">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <span className="text-amber-500 text-lg">🥋</span>
              <span>Edit Competitor — Slot {selectedLeafIndex + 1} (Seed {nodes[0]?.[selectedLeafIndex]?.seed})</span>
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
                  {(nodes[0] || []).map((n, idx) => {
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

              {/* Move to another category dropdown */}
              {!editIsBye && categoriesList && categoriesList.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Move to another Category / Division
                  </label>
                  <select
                    value={selectedTargetCategory}
                    onChange={(e) => setSelectedTargetCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-amber-500 transition-all cursor-pointer font-sans"
                  >
                    <option value="">-- Choose target category --</option>
                    {categoriesList.map((catKey) => (
                      <option key={catKey} value={catKey}>
                        {catKey}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 font-bold mt-1 leading-normal font-sans">
                    💡 Moving category transfers this competitor and updates both brackets automatically.
                  </p>
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div className="flex gap-2.5 justify-end mt-6 pt-3 border-t border-slate-100">
              {!editIsBye && editName && (
                <button
                  type="button"
                  onClick={() => {
                    setCertificateAthlete({
                      name: editName,
                      club: editClub,
                      category: bracket.categoryName || '',
                    });
                    setShowCertificateModal(true);
                  }}
                  className="mr-auto px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-sm"
                  title="Print custom tournament certificate"
                >
                  <span>🥋</span>
                  <span>Print Certificate</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 hover:bg-slate-100 text-slate-555 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  // Apply actions!
                  if (selectedTargetCategory !== '') {
                    if (onMoveToCategory && selectedLeafIndex !== null) {
                      onMoveToCategory(selectedLeafIndex, selectedTargetCategory);
                    }
                  } else if (swapTargetIndex !== '') {
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

      {/* Certificate Modal Overlay */}
      {showCertificateModal && certificateAthlete && (
        <CertificateModal
          athleteName={certificateAthlete.name}
          club={certificateAthlete.club}
          category={certificateAthlete.category}
          tournamentName={tournamentName}
          onClose={() => {
            setShowCertificateModal(false);
            setCertificateAthlete(null);
          }}
        />
      )}
    </div>
  );
};

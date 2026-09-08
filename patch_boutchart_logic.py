import re

with open('src/components/ClubReportPanel.tsx', 'r') as f:
    content = f.read()

# Add import
if "import { BracketCanvas }" not in content:
    content = content.replace(
        "import { CertificateModal } from './CertificateModal';",
        "import { CertificateModal } from './CertificateModal';\nimport { BracketCanvas } from './BracketCanvas';"
    )

target = """            );
          })()}

        </div>
      )}
      {certificateData && ("""

replacement = """            );
          })()}

          {/* STYLE 5: BOUTCHART (BRACKETS) LAYOUT */}
          {activeReportStyle === 'boutchart' && (() => {
            const getRingLabel = (idx: string | number) => {
              if (ringLabelFormat === 'letter') {
                return String.fromCharCode(64 + parseInt(String(idx)));
              }
              return String(idx);
            };

            const bracketsToRenderKeys = Object.keys(brackets).filter(key => {
              const model = brackets[key];
              if (!model || !model.nodes || Object.keys(model.nodes).length === 0) return false;
              if (selectedClub !== 'all') {
                // Check if any node in the bracket belongs to the selected club
                return Object.values(model.nodes).some(n => n.club === selectedClub);
              }
              return true;
            }).sort((a, b) => {
              const catA = categories[a];
              const catB = categories[b];
              if (catA?.ring !== catB?.ring) {
                 return (catA?.ring || 1) - (catB?.ring || 1);
              }
              return a.localeCompare(b);
            });

            if (bracketsToRenderKeys.length === 0) {
              return (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 font-medium text-sm no-print">
                  No boutcharts found for the selected club.
                </div>
              );
            }

            return (
              <div className="space-y-6 print:space-y-0 pb-10">
                {bracketsToRenderKeys.map(key => {
                  const model = brackets[key];
                  const cat = categories[key];
                  return (
                    <BracketCanvas
                      key={`boutchart-${key}`}
                      bracket={model}
                      ring={getRingLabel(cat?.ring || 1)}
                      entrantCount={cat?.count || 0}
                      layout="classic"
                      tournamentName={tournamentName}
                      boutLabelFormat={boutLabelFormat}
                      isPublicView={true}
                      onReshuffle={() => {}}
                      onCheckboxToggle={() => {}}
                      onTextChange={() => {}}
                      onUpdateCutoffScores={() => {}}
                    />
                  );
                })}
              </div>
            );
          })()}

        </div>
      )}
      {certificateData && ("""

if target in content:
    content = content.replace(target, replacement)
else:
    print("Failed to find target rendering area in ClubReportPanel.tsx")

with open('src/components/ClubReportPanel.tsx', 'w') as f:
    f.write(content)

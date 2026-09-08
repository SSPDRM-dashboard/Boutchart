import re

with open('src/components/ClubReportPanel.tsx', 'r') as f:
    content = f.read()

target_props = """interface ClubReportPanelProps {
  categories: Record<string, WeightCategory>;
  brackets: Record<string, BracketModel>;
  roster: Athlete[];
  ringLabelFormat: 'number' | 'letter';
  boutLabelFormat?: 'alpha-2' | 'thousands-3';
  tournamentName?: string;
  isPublicView?: boolean;
  onUpdateStandings?: (catKey: string, nextStandings: string[]) => void;
}"""

replacement_props = """interface ClubReportPanelProps {
  categories: Record<string, WeightCategory>;
  brackets: Record<string, BracketModel>;
  roster: Athlete[];
  ringLabelFormat: 'number' | 'letter';
  boutLabelFormat?: 'alpha-2' | 'thousands-3';
  tournamentName?: string;
  leftLogo?: string;
  leftLogo2?: string;
  rightLogo?: string;
  rightLogo2?: string;
  isPublicView?: boolean;
  onUpdateStandings?: (catKey: string, nextStandings: string[]) => void;
}"""

if target_props in content:
    content = content.replace(target_props, replacement_props)
else:
    print("Failed to replace props interface")

target_destruct = """  ringLabelFormat,
  boutLabelFormat = 'alpha-2',
  tournamentName = '',
  isPublicView = false,
  onUpdateStandings,
}) => {"""

replacement_destruct = """  ringLabelFormat,
  boutLabelFormat = 'alpha-2',
  tournamentName = '',
  leftLogo,
  leftLogo2,
  rightLogo,
  rightLogo2,
  isPublicView = false,
  onUpdateStandings,
}) => {"""

if target_destruct in content:
    content = content.replace(target_destruct, replacement_destruct)
else:
    print("Failed to replace props destructuring")

target_payload_1 = """      const payload = {
        t: tournamentName || 'Tournament',
        r: roster,
        c: categories,
        b: brackets,
        rl: ringLabelFormat
      };"""

replacement_payload_1 = """      const payload = {
        t: tournamentName || 'Tournament',
        r: roster,
        c: categories,
        b: brackets,
        rl: ringLabelFormat,
        leftLogo, leftLogo2, rightLogo, rightLogo2
      };"""

if target_payload_1 in content:
    content = content.replace(target_payload_1, replacement_payload_1)
else:
    print("Failed to replace payload 1")

target_payload_2 = """                          const payload = {
                            t: tournamentName || 'Tournament',
                            r: roster,
                            c: categories,
                            b: brackets,
                            rl: ringLabelFormat
                          };"""

replacement_payload_2 = """                          const payload = {
                            t: tournamentName || 'Tournament',
                            r: roster,
                            c: categories,
                            b: brackets,
                            rl: ringLabelFormat,
                            leftLogo, leftLogo2, rightLogo, rightLogo2
                          };"""

if target_payload_2 in content:
    content = content.replace(target_payload_2, replacement_payload_2)
else:
    print("Failed to replace payload 2")

with open('src/components/ClubReportPanel.tsx', 'w') as f:
    f.write(content)

import re

with open('src/components/ClubReportPanel.tsx', 'r') as f:
    content = f.read()

target = """                return Object.values(model.nodes).some(n => n.club === selectedClub);"""
replacement = """                return model.nodes.some(round => round && round.some(n => n && n.club === selectedClub));"""

if target in content:
    content = content.replace(target, replacement)
else:
    print("Failed to replace club nodes filter")

with open('src/components/ClubReportPanel.tsx', 'w') as f:
    f.write(content)

import re
with open('src/components/ClubReportPanel.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "const [reportStyle, setReportStyle] = useState<'photo-matrix' | 'classic-cards' | 'medal-standings' | 'individual-lookup'>('photo-matrix');",
    "const [reportStyle, setReportStyle] = useState<'photo-matrix' | 'classic-cards' | 'medal-standings' | 'individual-lookup' | 'boutchart'>('photo-matrix');"
)

with open('src/components/ClubReportPanel.tsx', 'w') as f:
    f.write(content)

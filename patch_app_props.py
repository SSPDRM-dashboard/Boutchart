import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

target1 = """                <ClubReportPanel
                  categories={categories}
                  brackets={brackets}
                  roster={roster}
                  ringLabelFormat={ringLabelFormat}
                  boutLabelFormat={boutLabelFormat}
                  tournamentName={tournamentName}
                  isPublicView={true} // Force public view for previewing"""

replacement1 = """                <ClubReportPanel
                  categories={categories}
                  brackets={brackets}
                  roster={roster}
                  ringLabelFormat={ringLabelFormat}
                  boutLabelFormat={boutLabelFormat}
                  tournamentName={tournamentName}
                  leftLogo={leftLogo}
                  leftLogo2={leftLogo2}
                  rightLogo={rightLogo}
                  rightLogo2={rightLogo2}
                  isPublicView={true} // Force public view for previewing"""

if target1 in content:
    content = content.replace(target1, replacement1)
else:
    print("Failed target1")

with open('src/App.tsx', 'w') as f:
    f.write(content)

import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Pass to BracketCanvas
canvas_props_old = """                            leftLogo={leftLogo}
                            rightLogo={rightLogo}
                            onChangeLeftLogo={setLeftLogo}
                            onChangeRightLogo={setRightLogo}"""

canvas_props_new = """                            leftLogo={leftLogo}
                            leftLogo2={leftLogo2}
                            rightLogo={rightLogo}
                            rightLogo2={rightLogo2}
                            onChangeLeftLogo={setLeftLogo}
                            onChangeLeftLogo2={setLeftLogo2}
                            onChangeRightLogo={setRightLogo}
                            onChangeRightLogo2={setRightLogo2}"""

content = content.replace(canvas_props_old, canvas_props_new)

with open('src/App.tsx', 'w') as f:
    f.write(content)

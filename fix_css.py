with open("firebase/home/cyborg/quiz-cyborg.html", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "#answers button.incorrect-selection {" in line:
        new_lines.append("    #answers button.correct-selection {\n")
        new_lines.append("      background-color: #28a745 !important;\n")
        new_lines.append("      color: white !important;\n")
        new_lines.append("      border-color: #20c997 !important;\n")
        new_lines.append("      box-shadow: 0 0 20px #28a745;\n")
        new_lines.append("      transform: scale(1.05);\n")
        new_lines.append("      font-weight: bold;\n")
        new_lines.append("    }\n\n")
    new_lines.append(line)

with open("firebase/home/cyborg/quiz-cyborg.html", "w") as f:
    f.writelines(new_lines)

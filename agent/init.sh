
#!/bin/bash

# Ralph-style Task Initializer
# Creates a new task directory with prd.json, prompt.md, and progress.txt
# Usage: ./agent/init.sh "task-name" "Task description"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TASKS_DIR="$REPO_ROOT/.agent-tasks"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_usage() {
    echo "Usage: $0 <task-name> [task-description]"
    echo ""
    echo "Arguments:"
    echo "  task-name         Kebab-case name for the task (e.g., 'add-dark-mode')"
    echo "  task-description  Optional description of the task"
    echo ""
    echo "Examples:"
    echo "  $0 refactor-auth-flow"
    echo "  $0 add-user-settings 'Add user settings page with profile management'"
}

if [ -z "$1" ]; then
    echo -e "${RED}Error: Task name is required${NC}"
    print_usage
    exit 1
fi

TASK_NAME="$1"
TASK_DESCRIPTION="${2:-No description provided}"
TASK_DIR="$TASKS_DIR/$TASK_NAME"
CURRENT_DATE=$(date '+%Y-%m-%d')

# Validate task name (kebab-case)
if [[ ! "$TASK_NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
    echo -e "${RED}Error: Task name must be kebab-case (e.g., 'my-task-name')${NC}"
    exit 1
fi

# Check if task already exists
if [ -d "$TASK_DIR" ]; then
    echo -e "${YELLOW}Warning: Task '$TASK_NAME' already exists at $TASK_DIR${NC}"
    read -p "Do you want to overwrite it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    rm -rf "$TASK_DIR"
fi

# Create task directory
mkdir -p "$TASK_DIR"

echo -e "${BLUE}Creating Ralph-style task: $TASK_NAME${NC}"

# Create prd.json (user stories)
cat > "$TASK_DIR/prd.json" << EOF
{
  "branchName": "feature/$TASK_NAME",
  "description": "$TASK_DESCRIPTION",
  "userStories": [
    {
      "id": "US-001",
      "title": "Example story - replace with actual story",
      "acceptanceCriteria": [
        "Criterion 1: Specific testable requirement",
        "Criterion 2: Another testable requirement",
        "npm run validate passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
EOF

# Create prompt.md
cat > "$TASK_DIR/prompt.md" << EOF
# Ralph Agent Instructions

You are an autonomous coding agent. Complete ONE user story per iteration.

## Your Task

1. Read \`.agent-tasks/$TASK_NAME/prd.json\` for the story list
2. Read \`.agent-tasks/$TASK_NAME/progress.txt\` (check Codebase Patterns FIRST)
3. Pick the highest priority story where \`passes: false\`
4. Implement that ONE story completely
5. Run validation: \`npm run validate\`
6. Commit: \`git add -A && git commit -m "feat: [ID] - [Title]"\`
7. Update prd.json: change \`passes: false\` to \`passes: true\`
8. Append learnings to progress.txt

## Progress Format

APPEND to progress.txt after completing a story:

\`\`\`
---
## [Date] - [Story ID]
- What was implemented
- Files changed: [list]
- **Learnings:**
  - Patterns discovered
  - Gotchas encountered
\`\`\`

## Stop Condition

After updating prd.json, check if ALL stories have \`passes: true\`.

If ALL stories pass, output EXACTLY this (on its own line):
<promise>COMPLETE</promise>

Otherwise, end your response normally. The loop will call you again.

## Important Rules

1. ONE story per iteration - complete it fully before stopping
2. ALWAYS run validation before committing
3. ALWAYS update prd.json after completing a story
4. ALWAYS append learnings to progress.txt
5. Small, focused commits with clear messages
EOF

# Create progress.txt
cat > "$TASK_DIR/progress.txt" << EOF
# Ralph Progress Log - $TASK_NAME
Started: $CURRENT_DATE

## Codebase Patterns
(Add reusable patterns here as you discover them)

## Key Files
(List important files for this task)

---
## Session History
(Append new entries below)

EOF

# Create README.md
cat > "$TASK_DIR/README.md" << EOF
# Task: $TASK_NAME

**Created:** $CURRENT_DATE
**Description:** $TASK_DESCRIPTION

## Files

| File | Purpose |
|------|---------|
| \`prd.json\` | User stories with acceptance criteria |
| \`prompt.md\` | Instructions given to agent each iteration |
| \`progress.txt\` | Learnings that persist across iterations |

## Running

\`\`\`bash
./agent/ralph.sh 10 $TASK_NAME
\`\`\`

## How It Works

1. Bash script reads \`prompt.md\` and passes to cursor-agent
2. Agent picks first story where \`passes: false\`
3. Agent implements, validates, commits
4. Agent updates \`prd.json\` and \`progress.txt\`
5. If all done: outputs \`<promise>COMPLETE</promise>\`
6. Script loops until complete or max iterations
EOF

# Create .gitkeep
touch "$TASK_DIR/.gitkeep"

echo -e "${GREEN}✓ Task '$TASK_NAME' created successfully!${NC}"
echo ""
echo -e "${BLUE}Task directory:${NC} $TASK_DIR"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit $TASK_DIR/prd.json"
echo "   - Add your user stories with acceptance criteria"
echo "   - Keep stories SMALL (fit in one context window)"
echo "   - Include 'npm run validate passes' in criteria"
echo ""
echo "2. Run Ralph:"
echo "   ./agent/ralph.sh 10 $TASK_NAME"
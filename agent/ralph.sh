#!/bin/bash
# Ralph-style autonomous coding loop for Cursor
# Based on: https://ghuntley.com/ralph and https://x.com/ryancarson/status/2008548371712135632

set -e

# Configuration
MAX_ITERATIONS=${1:-10}
TASK_NAME=${2:-""}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_usage() {
    echo "Usage: $0 [max_iterations] [task_name]"
    echo ""
    echo "Arguments:"
    echo "  max_iterations  Maximum loop iterations (default: 10)"
    echo "  task_name       Name of task in .agent-tasks/ directory"
    echo ""
    echo "Examples:"
    echo "  $0 25 localize"
    echo "  $0 10 add-dark-mode"
}

if [ -z "$TASK_NAME" ]; then
    echo -e "${RED}Error: Task name is required${NC}"
    print_usage
    exit 1
fi

TASK_DIR="$REPO_ROOT/.agent-tasks/$TASK_NAME"
PROMPT_FILE="$TASK_DIR/prompt.md"
PRD_FILE="$TASK_DIR/feature-list.json"
PROGRESS_FILE="$TASK_DIR/progress.txt"

# Verify task exists
if [ ! -d "$TASK_DIR" ]; then
    echo -e "${RED}Error: Task '$TASK_NAME' not found at $TASK_DIR${NC}"
    echo "Create it with: ./agent/init.sh $TASK_NAME"
    exit 1
fi

# Verify required files exist
if [ ! -f "$PRD_FILE" ]; then
    echo -e "${RED}Error: feature-list.json not found at $PRD_FILE${NC}"
    exit 1
fi

# Create prompt.md if it doesn't exist
if [ ! -f "$PROMPT_FILE" ]; then
    echo -e "${YELLOW}Creating default prompt.md...${NC}"
    cat > "$PROMPT_FILE" << 'PROMPT_EOF'
# Ralph Agent Instructions

You are an autonomous coding agent working on a feature branch.

## Your Task

1. Read `.agent-tasks/TASK_NAME/feature-list.json` for the story list
2. Read `.agent-tasks/TASK_NAME/progress.txt` for learnings (check Codebase Patterns first)
3. Pick the highest priority story where `passes: false`
4. Implement that ONE story completely
5. Run validation: `npm run validate` (or appropriate checks)
6. Commit your changes: `git commit -m "feat: [ID] - [Title]"`
7. Update feature-list.json: change `passes: false` to `passes: true` for the completed story
8. Append learnings to progress.txt

## Progress Format

APPEND to progress.txt after completing a story:

```
---
## [Date] - [Story ID]
- What was implemented
- Files changed
- **Learnings:**
  - Patterns discovered
  - Gotchas encountered
```

## Codebase Patterns

Add reusable patterns to the TOP of progress.txt under "## Codebase Patterns":
- Only add genuinely reusable insights
- Don't add story-specific details

## Stop Condition

After updating feature-list.json, check if ALL stories have `passes: true`.

If ALL stories pass, output EXACTLY:
<promise>COMPLETE</promise>

Otherwise, end normally (the loop will call you again for the next story).

## Important Rules

1. ONE story per iteration - don't try to do multiple
2. ALWAYS run validation before committing
3. ALWAYS update feature-list.json after completing a story
4. ALWAYS append to progress.txt with learnings
5. Small, focused commits with clear messages
PROMPT_EOF
    # Replace TASK_NAME placeholder
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/TASK_NAME/$TASK_NAME/g" "$PROMPT_FILE"
    else
        sed -i "s/TASK_NAME/$TASK_NAME/g" "$PROMPT_FILE"
    fi
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 Starting Ralph - Autonomous Coding Loop${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Task:           ${GREEN}$TASK_NAME${NC}"
echo -e "Max iterations: ${GREEN}$MAX_ITERATIONS${NC}"
echo -e "Task directory: ${GREEN}$TASK_DIR${NC}"
echo ""

# Show current story status
echo -e "${YELLOW}Current story status:${NC}"
cat "$PRD_FILE" | grep -E '"id"|"passes"' | paste - - | head -20
echo ""

# Main loop
for i in $(seq 1 $MAX_ITERATIONS); do
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}═══ Iteration $i of $MAX_ITERATIONS ═══${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Read prompt file and pass to cursor-agent
    PROMPT_CONTENT=$(cat "$PROMPT_FILE")

    # Run cursor-agent with prompt
    # --print: non-interactive mode
    # --force: allow commands without prompting
    OUTPUT=$(cursor-agent --print --force "$PROMPT_CONTENT" 2>&1 | tee /dev/stderr) || true

    # Check for completion signal
    if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
        echo ""
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}✅ ALL STORIES COMPLETE!${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"

        # Show final status
        echo ""
        echo -e "${YELLOW}Final story status:${NC}"
        cat "$PRD_FILE" | grep -E '"id"|"passes"' | paste - -

        exit 0
    fi

    # Brief pause between iterations
    echo ""
    echo -e "${YELLOW}Iteration $i complete. Pausing before next iteration...${NC}"
    sleep 3
done

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}⚠️  Max iterations ($MAX_ITERATIONS) reached${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Current story status:${NC}"
cat "$PRD_FILE" | grep -E '"id"|"passes"' | paste - -
echo ""
echo "Run again with more iterations: $0 $((MAX_ITERATIONS + 10)) $TASK_NAME"

exit 1

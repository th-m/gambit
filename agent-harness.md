Long-Running Agent Task Harness
A development harness for working effectively with AI agents on complex, multi-session tasks. Inspired by Anthropic's guidance on effective harnesses for long-running agents.

Overview
This harness solves common problems when AI agents work on tasks that span multiple context windows:

Problem	Solution
Agent tries to do too much at once	Feature list breaks work into discrete items
Agent declares victory too early	Feature list shows what's truly done vs pending
Agent leaves code in broken state	Progress file tracks clean handoff points
Agent doesn't know where to start	Progress file provides session context
Quick Start
1. Initialize a New Task
./scripts/agent-harness/init-task.sh "my-feature-name" "Description of what you're building"
This creates:

.agent-tasks/my-feature-name/
├── feature-list.json    # All features to implement
├── agent-progress.txt   # Session-by-session log
└── README.md           # Task-specific docs
2. Define Features
Edit .agent-tasks/my-feature-name/feature-list.json to add all features:

{
  "features": [
    {
      "id": "user-login",
      "category": "functional",
      "priority": 1,
      "description": "User can log in with credentials",
      "acceptance_criteria": [
        "Login form accepts email and password",
        "Invalid credentials show error",
        "Successful login redirects to dashboard"
      ],
      "passes": false
    }
  ]
}
See feature-list.template.json for a comprehensive example.

3. Start Working
Tell your AI agent:

Work on the long-running task: my-feature-name
The agent will automatically:

Read progress and feature files
Pick the next incomplete feature
Implement and test it
Update progress before ending
How It Works
For Each Session
At the start, the agent:

Reads agent-progress.txt to understand what happened before
Reviews feature-list.json to see what's done and pending
Checks recent git history for context
Runs a health check if there's a dev server
Picks ONE feature to work on
At the end, the agent:

Ensures code compiles and tests pass
Commits changes with descriptive message
Updates feature-list.json (only passes field)
Appends session summary to agent-progress.txt
Feature Categories
Category	Description
functional	Core business logic and features
visual	UI/UX, styling, responsive design
performance	Speed, efficiency, optimization
security	Auth, data protection, validation
accessibility	Screen readers, keyboard nav, ARIA
Priority Levels
1: Critical - must be done first
2: Important - core functionality
3: Standard - expected features
4: Nice to have - enhancements
5: Optional - polish items
Best Practices
Writing Good Features
✅ Do:

Keep features small and testable
Write specific acceptance criteria
Group related functionality logically
Use clear, action-oriented descriptions
❌ Don't:

Create vague or huge features
Write untestable criteria ("make it better")
Mix unrelated functionality
Leave criteria ambiguous
Good Example
{
  "id": "search-results-pagination",
  "description": "Search results paginate when exceeding page limit",
  "acceptance_criteria": [
    "Results show 20 items per page",
    "Next/Previous buttons appear when applicable",
    "Current page indicator shows position",
    "Keyboard accessible pagination controls"
  ]
}
Bad Example
{
  "id": "search",
  "description": "Implement search",
  "acceptance_criteria": ["Search works", "Results look good"]
}
File Locations
File	Purpose
.cursor/rules/long-running-tasks.mdc	Cursor rule that guides the agent
scripts/agent-harness/init-task.sh	Creates new task directories
scripts/agent-harness/feature-list.template.json	Example feature list
.agent-tasks/<name>/	Individual task working directories
Customization
Adding to .gitignore
If you don't want to track task progress in git:

# .gitignore
.agent-tasks/
Tracking Tasks in Git
If you want to track progress (recommended for team visibility):

git add .agent-tasks/my-feature-name/
git commit -m "chore: initialize my-feature-name task tracking"
Integration with Existing Workflow
This harness complements your existing CLAUDE.md and development practices:

Task initialization - Use when starting complex work
Daily development - Continue using normal Cursor workflows for simple tasks
Handoffs - Use when multiple people (or sessions) will work on something
Documentation - Progress files serve as implementation history
Troubleshooting
Agent ignores the harness
Make sure .cursor/rules/long-running-tasks.mdc exists and mentions the task name.

Features keep getting modified
The JSON format is intentionally used to discourage edits. Reinforce in your prompt:

Only change the passes field, never modify descriptions or criteria.

Progress file gets messy
Periodically archive old sessions:

mv .agent-tasks/my-task/agent-progress.txt .agent-tasks/my-task/progress-archive-$(date +%Y%m%d).txt
Credits
Based on research from Anthropic Engineering on enabling AI agents to work effectively across multiple context windows.
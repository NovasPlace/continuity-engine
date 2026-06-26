---
description: Set, update, or view the current active goal
argument-hint: "[set|status|clear|list] <description>"
---

## Goal Command

You have access to the goal tracking system. Use these tools:
- **goal_set**: Set a new active goal for the current session (archives the previous one)
- **goal_update**: Update the current goal's description or status (achieved/abandoned)
- **goal_list**: List recent goals with optional status filter

### Instructions

Parse the user's intent from $ARGUMENTS and take the appropriate action:

1. **No arguments or "status"**: Call `goal_list` with `status: "active"` to show the current goal. If no active goal, say so.

2. **"list"**: Call `goal_list` to show all recent goals.

3. **"clear" or "done"**: Find the active goal via `goal_list`, then call `goal_update` with `status: "achieved"`.

4. **"abandon"**: Find the active goal via `goal_list`, then call `goal_update` with `status: "abandoned"`.

5. **Any other text**: Treat it as a new goal description. Call `goal_set` with the description. Confirm what was set.

Always report the result back to the user after taking action.

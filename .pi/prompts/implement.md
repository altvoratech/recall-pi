---
description: Full implementation — scout finds code, planner designs, executor implements, debugger verifies
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create an implementation plan for "$@" using the context from step 1 (use {previous} placeholder)
3. Then, use the "executor" agent to implement the plan from step 2 (use {previous} placeholder)
4. Finally, use the "debugger" agent to verify the implementation from step 3 builds and passes tests (use {previous} placeholder)

Execute this as a chain, passing output between steps via {previous}.
